// Forge - Conversational WebComponent Platform
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, CreateRequest, UpdateRequest, SearchRequest, CreateImageRequest, CreateSpeechRequest } from './types';
import { Registry } from './lib/registry';
import { Compiler } from './lib/compiler';
import { handleStorageRequest } from './lib/storage';
import { AssetRegistry } from './lib/asset-registry';

// Export Durable Object classes
export { ForgeGenerator } from './lib/container';
export { ForgeJob } from './lib/job';

const app = new Hono<{ Bindings: Env }>();

// HTML escape helper for server-side templates
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ================================
// CORS Configuration
// ================================

app.use('/api/*', cors({
  origin: (origin) => {
    if (!origin) return 'https://forge.entrained.ai';
    if (origin.endsWith('.entrained.ai') || origin === 'https://entrained.ai') {
      return origin;
    }
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }
    return null;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// ================================
// Health Check
// ================================

app.get('/health', (c) => c.json({
  status: 'ok',
  service: 'forge',
  version: '0.1.0',
  model: c.env.GEMINI_MODEL || 'gemini-3-flash-preview',
}));

// ================================
// Favicon (simple SVG)
// ================================

app.get('/favicon.ico', (c) => {
  // Simple green anvil/forge icon as SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="#0a0a0a"/>
    <text x="16" y="24" font-size="20" text-anchor="middle" fill="#0f0">⚒</text>
  </svg>`;
  return c.body(svg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=86400',
  });
});

// ================================
// Container Status
// ================================

app.get('/api/container/status', async (c) => {
  const start = Date.now();
  try {
    const generatorId = c.env.GENERATOR.idFromName('generator');
    const generator = c.env.GENERATOR.get(generatorId);

    const response = await generator.fetch('http://container/health', {
      method: 'GET',
    });
    const data = await response.json();
    const elapsed = Date.now() - start;

    return c.json({
      status: response.ok ? 'warm' : 'error',
      container: data,
      latency_ms: elapsed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const elapsed = Date.now() - start;
    return c.json({
      status: 'cold',
      error: (error as Error).message,
      latency_ms: elapsed,
      timestamp: new Date().toISOString(),
    });
  }
});

// ================================
// Component API
// ================================

// Create a new component from description
app.post('/api/forge/create', async (c) => {
  const body = await c.req.json<CreateRequest>();

  if (!body.description) {
    return c.json({ error: 'Missing description' }, 400);
  }

  const compiler = new Compiler(c.env);
  const start = Date.now();

  try {
    const result = await compiler.generate(body.description);
    const timing_ms = Date.now() - start;

    return c.json({
      ...result,
      timing_ms,
    });
  } catch (error) {
    return c.json({
      error: `Generation failed: ${(error as Error).message}`,
    }, 500);
  }
});

// NOTE: Specific /api/forge/* routes (search, stats, global) are defined below
// This wildcard route must come AFTER them in the file

// Get component source (TSX)
app.get('/api/forge/:id/source', async (c) => {
  const id = c.req.param('id');
  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);

  const source = await registry.getSource(id);
  if (!source) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.text(source, 200, {
    'Content-Type': 'text/typescript',
  });
});

// Update source manually (creates new version)
app.put('/api/forge/:id/source', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ source: string }>();

  if (!body.source) {
    return c.json({ error: 'Missing source' }, 400);
  }

  const compiler = new Compiler(c.env);
  const start = Date.now();

  try {
    const result = await compiler.updateSource(id, body.source);
    const timing_ms = Date.now() - start;

    return c.json({
      ...result,
      previous_version: id,
      timing_ms,
    });
  } catch (error) {
    return c.json({
      error: `Source update failed: ${(error as Error).message}`,
    }, 500);
  }
});

// Re-transpile existing source (fixes broken builds in-place)
app.post('/api/forge/:id/retranspile', async (c) => {
  const id = c.req.param('id');
  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);

  // Get existing source
  const source = await registry.getSource(id);
  if (!source) {
    return c.json({ error: 'Component not found' }, 404);
  }

  // Re-transpile via container
  const start = Date.now();

  try {
    // Call container for transpilation
    const generatorId = c.env.GENERATOR.idFromName('generator');
    const generator = c.env.GENERATOR.get(generatorId);

    const response = await generator.fetch('http://container/transpile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string };
      throw new Error(error.error || 'Transpilation failed');
    }

    const result = await response.json() as { component_js: string };

    // Update R2 with new JS (in-place, no new version)
    await c.env.ARTIFACTS.put(`${id}/component.js`, result.component_js);

    const timing_ms = Date.now() - start;
    return c.json({
      id,
      success: true,
      js_size: result.component_js.length,
      timing_ms,
    });
  } catch (error) {
    return c.json({
      error: `Retranspile failed: ${(error as Error).message}`,
    }, 500);
  }
});

// Update component via AI (creates new version)
app.post('/api/forge/:id/update', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<UpdateRequest>();

  if (!body.changes) {
    return c.json({ error: 'Missing changes' }, 400);
  }

  const compiler = new Compiler(c.env);
  const start = Date.now();

  try {
    const result = await compiler.update(id, body.changes);
    const timing_ms = Date.now() - start;

    return c.json({
      ...result,
      previous_version: id,
      timing_ms,
    });
  } catch (error) {
    return c.json({
      error: `Update failed: ${(error as Error).message}`,
    }, 500);
  }
});

// Search components semantically via Vectorize
app.get('/api/forge/search', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '10');

  if (!query) {
    return c.json({ error: 'Missing query parameter q' }, 400);
  }

  // Generate embedding for query
  const queryEmbedding = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: query,
  });

  const queryVec = (queryEmbedding as { data?: number[][] }).data?.[0];
  if (!queryVec) {
    return c.json({ error: 'Failed to generate query embedding' }, 500);
  }

  // Query Vectorize for similar components
  const vectorResults = await c.env.VECTORIZE.query(queryVec, {
    topK: limit,
    returnMetadata: 'all',
  });

  // Map results with metadata from Vectorize
  const results = vectorResults.matches.map((match) => ({
    id: match.id,
    description: (match.metadata?.description as string) || '',
    type: (match.metadata?.type as 'app' | 'library') || 'app',
    tag: (match.metadata?.tag as string) || '',
    similarity: match.score,
    version: (match.metadata?.version as number) || 1,
  }));

  return c.json({
    query,
    results,
    total: results.length,
  });
});

// Registry stats
app.get('/api/forge/stats', async (c) => {
  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);
  const stats = await registry.stats();
  return c.json(stats);
});

// Debug/diagnose a component
app.get('/api/forge/:id/debug', async (c) => {
  const id = c.req.param('id');
  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);

  const entry = await registry.get(id);
  if (!entry) {
    return c.json({ error: 'Component not found' }, 404);
  }

  const source = await registry.getSource(id);
  const js = await registry.getComponentJS(id);

  // Analyze source for custom element references
  const tagPattern = /<([a-z][a-z0-9]*(?:-[a-z0-9]+)+)/g;
  const referencedTags = new Set<string>();
  let match;
  while (source && (match = tagPattern.exec(source)) !== null) {
    const tag = match[1];
    if (tag !== entry.manifest.components[0]?.tag) {
      referencedTags.add(tag);
    }
  }

  // Check if referenced components exist
  const dependencies: Array<{
    tag: string;
    status: 'resolved' | 'missing' | 'not-in-imports';
    component_id?: string;
  }> = [];

  // Build a set of imported component IDs for quick lookup
  const importedIds = new Set(entry.manifest.imports?.map(i => i.component_id) || []);

  for (const tag of referencedTags) {
    const depId = await registry.getByTag(tag);

    if (depId) {
      dependencies.push({
        tag,
        status: importedIds.has(depId) ? 'resolved' : 'not-in-imports',
        component_id: depId,
      });
    } else {
      dependencies.push({ tag, status: 'missing' });
    }
  }

  // Analyze for common issues
  const issues: Array<{ severity: 'error' | 'warning' | 'info'; message: string; suggestion?: string }> = [];

  // Check for missing dependencies
  const missingDeps = dependencies.filter(d => d.status === 'missing');
  if (missingDeps.length > 0) {
    issues.push({
      severity: 'error',
      message: `Missing dependencies: ${missingDeps.map(d => d.tag).join(', ')}`,
      suggestion: 'These custom elements are referenced but not found in the registry. Create them first or check the tag names.',
    });
  }

  // Check for deps not in imports
  const notInImports = dependencies.filter(d => d.status === 'not-in-imports');
  if (notInImports.length > 0) {
    issues.push({
      severity: 'warning',
      message: `Dependencies not in manifest imports: ${notInImports.map(d => d.tag).join(', ')}`,
      suggestion: 'Use forge_update to regenerate the component, which will auto-detect and add these dependencies.',
    });
  }

  // Check for "controlled component" pattern (emits events but doesn't update internally)
  if (source) {
    const emitsEvents = source.includes('this.emit(');
    const hasInternalState = source.includes('this.update()') || source.includes('private ') && source.includes(' = ');
    const readsProps = source.includes('this.props.');

    if (emitsEvents && readsProps && !source.includes('this.update()')) {
      issues.push({
        severity: 'info',
        message: 'Component appears to be a "controlled component" that relies on parent to update props',
        suggestion: 'When viewed standalone, UI may not update on interaction. Consider adding internal state management or always use within a parent component.',
      });
    }
  }

  // Check for onclick vs onClick
  if (source && source.includes('onclick=')) {
    issues.push({
      severity: 'warning',
      message: 'Source uses lowercase "onclick" instead of "onClick"',
      suggestion: 'In JSX, event handlers should use camelCase (onClick, onChange, etc.)',
    });
  }

  // Check compiled JS size
  if (js && js.length > 100000) {
    issues.push({
      severity: 'warning',
      message: `Large compiled JS size: ${Math.round(js.length / 1024)}KB`,
      suggestion: 'Consider breaking into smaller components for better load times.',
    });
  }

  return c.json({
    id,
    tag: entry.manifest.components[0]?.tag,
    version: entry.manifest.version,
    type: entry.manifest.type,
    description: entry.manifest.description,

    dependencies: {
      declared: entry.manifest.imports || [],
      detected: dependencies,
      all_resolved: dependencies.every(d => d.status === 'resolved'),
    },

    analysis: {
      source_size: source?.length || 0,
      compiled_size: js?.length || 0,
      props_count: entry.manifest.components[0]?.props?.length || 0,
      events_count: entry.manifest.components[0]?.events?.length || 0,
      css_vars_count: entry.manifest.css_variables?.length || 0,
    },

    issues,

    urls: {
      view: `https://forge.entrained.ai/${id}`,
      source: `https://forge.entrained.ai/api/forge/${id}/source`,
      manifest: `https://forge.entrained.ai/api/forge/${id}`,
      js: `https://forge.entrained.ai/api/forge/${id}/component.js`,
    },
  });
});

// ================================
// Component Bundling
// ================================

// Bundle multiple components into a single JS file
app.get('/api/forge/bundle', async (c) => {
  const idsParam = c.req.query('ids');
  if (!idsParam) {
    return c.json({ error: 'Missing ids parameter' }, 400);
  }

  const ids = idsParam.split(',').map(id => id.trim());
  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);

  // Collect all component JS
  const components: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const id of ids) {
    const js = await registry.getComponentJS(id);
    if (js) {
      components.push(`// Component: ${id}\n${js}`);
    } else {
      errors.push({ id, error: 'Not found' });
    }
  }

  if (errors.length > 0 && components.length === 0) {
    return c.json({ error: 'No components found', details: errors }, 404);
  }

  // Concatenate all components
  const bundle = components.join('\n\n');

  return c.text(bundle, 200, {
    'Content-Type': 'application/javascript',
    'Cache-Control': 'public, max-age=3600', // 1 hour cache for bundles
  });
});

// ================================
// Component Composition
// ================================

interface ComposeRequest {
  name: string;
  description: string;
  components: Array<{ id: string; as?: string }>;
  layout: string;
  wiring: Array<{
    source: { component: string; event: string };
    target: { component: string; action: string };
    transform?: string;
  }>;
  styles?: string;
}

// Compose multiple components into a new solution
app.post('/api/forge/compose', async (c) => {
  const body = await c.req.json<ComposeRequest>();

  if (!body.name || !body.description || !body.components?.length || !body.layout) {
    return c.json({ error: 'Missing required fields: name, description, components, layout' }, 400);
  }

  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);

  // Verify all components exist and collect their manifests
  const componentManifests: Array<{
    id: string;
    as: string;
    manifest: import('./types').ForgeManifest;
  }> = [];

  for (const comp of body.components) {
    const entry = await registry.get(comp.id);
    if (!entry) {
      return c.json({ error: `Component not found: ${comp.id}` }, 404);
    }
    componentManifests.push({
      id: comp.id,
      as: comp.as || entry.manifest.components[0]?.tag || comp.id,
      manifest: entry.manifest,
    });
  }

  // Generate wiring code
  const wiringCode = body.wiring.map(wire => {
    const transform = wire.transform || '(detail) => detail';
    return `
    // Wire: ${wire.source.component}.${wire.source.event} -> ${wire.target.component}.${wire.target.action}
    document.getElementById('${wire.source.component}')?.addEventListener('${wire.source.event}', (e) => {
      const detail = (${transform})(e.detail);
      const target = document.getElementById('${wire.target.component}');
      if (target && typeof target.${wire.target.action} === 'function') {
        target.${wire.target.action}(detail);
      }
    });`;
  }).join('\n');

  // Generate the composed component TSX
  const componentIds = body.components.map(c => c.id).join(',');
  const bundleUrl = `/api/forge/bundle?ids=${componentIds}`;

  // Create a tag name from the composition name
  const tag = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const composedSource = `import { ForgeComponent, Component } from 'forge';

@Component({
  tag: '${tag}',
  props: {},
  cssVariables: [],
  parts: ['container']
})
class ${body.name.replace(/[^a-zA-Z0-9]/g, '')} extends ForgeComponent<{}> {
  async onMount() {
    // Setup event wiring
    ${wiringCode || '// No wiring defined'}
  }

  render() {
    return (
      <div part="container" style={{ width: '100%', height: '100%' }}>
        <style>
          ${body.styles ? `{\`${body.styles.replace(/`/g, '\\`')}\`}` : ''}
        </style>
        ${body.layout}
      </div>
    );
  }
}

export { ${body.name.replace(/[^a-zA-Z0-9]/g, '')} };
`;

  // Create the composed component using the generator
  const generatorId = c.env.GENERATOR.idFromName('generator');
  const generator = c.env.GENERATOR.get(generatorId);

  const compileResponse = await generator.fetch('http://container/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: composedSource }),
  });

  if (!compileResponse.ok) {
    const error = await compileResponse.text();
    return c.json({ error: 'Failed to compile composition', details: error }, 500);
  }

  const compiled = await compileResponse.json() as { js: string; dts?: string };

  // Generate ID and store
  const id = registry.generateId(tag, 1);

  const manifest: import('./types').ForgeManifest = {
    id,
    version: 1,
    created_at: new Date().toISOString(),
    provenance: {
      source_type: 'manual',
    },
    description: body.description,
    type: 'app',
    components: [{
      name: body.name.replace(/[^a-zA-Z0-9]/g, ''),
      tag,
      exported: true,
      props: [],
      events: [],
    }],
    imports: body.components.map(comp => ({
      component_id: comp.id,
      components: [componentManifests.find(m => m.id === comp.id)?.manifest.components[0]?.name || ''],
    })),
    artifacts: {
      source_tsx: `${id}/source.tsx`,
      component_js: `${id}/component.js`,
    },
  };

  // Generate embedding
  const embedResult = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: body.description,
  });
  const embedding = (embedResult as { data?: number[][] }).data?.[0];

  // Store the composition
  await registry.put({
    id,
    manifest,
    tsx_source: composedSource,
    component_js: compiled.js,
    type_defs: compiled.dts,
    embedding,
  });

  // Index in Vectorize
  if (embedding) {
    await c.env.VECTORIZE.upsert([{
      id,
      values: embedding,
      metadata: {
        description: body.description,
        type: 'app',
        tag,
        version: 1,
      },
    }]);
  }

  return c.json({
    id,
    url: `https://forge.entrained.ai/${id}`,
    bundle_url: `https://forge.entrained.ai${bundleUrl}`,
    manifest,
  });
});

// Get bundle for a specific composition
app.get('/api/forge/bundle/:id', async (c) => {
  const id = c.req.param('id');
  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);

  const entry = await registry.get(id);
  if (!entry) {
    return c.json({ error: 'Composition not found' }, 404);
  }

  // Get the composition's dependencies
  const imports = entry.manifest.imports || [];
  if (imports.length === 0) {
    // Just return the component itself
    const js = await registry.getComponentJS(id);
    if (!js) {
      return c.json({ error: 'Component JS not found' }, 404);
    }
    return c.text(js, 200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=3600',
    });
  }

  // Bundle all dependencies plus the composition itself
  const allIds = [...imports.map(i => i.component_id), id];
  const components: string[] = [];

  for (const compId of allIds) {
    const js = await registry.getComponentJS(compId);
    if (js) {
      components.push(`// Component: ${compId}\n${js}`);
    }
  }

  const bundle = components.join('\n\n');

  return c.text(bundle, 200, {
    'Content-Type': 'application/javascript',
    'Cache-Control': 'public, max-age=3600',
  });
});

// Reindex all components into Vectorize
app.post('/api/admin/reindex', async (c) => {
  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);
  const { entries } = await registry.list({ limit: 1000 });

  const results: Array<{ id: string; status: string; error?: string }> = [];
  let indexed = 0;
  let skipped = 0;
  let errors = 0;

  for (const entry of entries) {
    try {
      const full = await registry.get(entry.id);
      if (!full) {
        results.push({ id: entry.id, status: 'not_found' });
        skipped++;
        continue;
      }

      // Get or regenerate embedding
      let embedding = full.embedding;
      if (!embedding) {
        // Generate new embedding
        const searchText = [
          full.manifest.description,
          full.manifest.components[0]?.name,
        ].filter(Boolean).join(' - ');

        const embedResult = await c.env.AI.run('@cf/baai/bge-base-en-v1.5', {
          text: searchText,
        });
        embedding = (embedResult as { data?: number[][] }).data?.[0];

        if (!embedding) {
          results.push({ id: entry.id, status: 'embed_failed' });
          errors++;
          continue;
        }
      }

      // Upsert into Vectorize
      await c.env.VECTORIZE.upsert([{
        id: entry.id,
        values: embedding,
        metadata: {
          description: full.manifest.description,
          type: full.manifest.type,
          tag: full.manifest.components[0]?.tag,
          version: full.manifest.version,
        },
      }]);

      results.push({ id: entry.id, status: 'indexed' });
      indexed++;
    } catch (err) {
      results.push({ id: entry.id, status: 'error', error: (err as Error).message });
      errors++;
    }
  }

  return c.json({
    total: entries.length,
    indexed,
    skipped,
    errors,
    results,
  });
});

// ================================
// Asset Generation API
// ================================

// Create image
app.post('/api/forge/assets/image', async (c) => {
  const body = await c.req.json<CreateImageRequest>();

  if (!body.prompt) {
    return c.json({ error: 'Missing prompt' }, 400);
  }

  const assetRegistry = new AssetRegistry(
    c.env.ASSETS,
    c.env.REGISTRY,
    c.env.AI,
    c.env.VECTORIZE
  );

  const start = Date.now();

  try {
    const { metadata, cached } = await assetRegistry.createImage(
      body.prompt,
      body.options || {},
      c.env
    );

    return c.json({
      id: metadata.id,
      url: metadata.url,
      type: 'image',
      cached,
      width: metadata.width,
      height: metadata.height,
      created_at: metadata.created_at,
      timing_ms: Date.now() - start,
    });
  } catch (error) {
    console.error('[Assets] Image generation failed:', error);
    return c.json({
      error: `Image generation failed: ${(error as Error).message}`,
    }, 500);
  }
});

// Create speech
app.post('/api/forge/assets/speech', async (c) => {
  const body = await c.req.json<CreateSpeechRequest>();

  if (!body.text) {
    return c.json({ error: 'Missing text' }, 400);
  }

  const assetRegistry = new AssetRegistry(
    c.env.ASSETS,
    c.env.REGISTRY,
    c.env.AI,
    c.env.VECTORIZE
  );

  const start = Date.now();

  try {
    const { metadata, cached } = await assetRegistry.createSpeech(
      body.text,
      body.options || {},
      c.env
    );

    return c.json({
      id: metadata.id,
      url: metadata.url,
      type: 'speech',
      cached,
      created_at: metadata.created_at,
      timing_ms: Date.now() - start,
    });
  } catch (error) {
    console.error('[Assets] Speech generation failed:', error);
    return c.json({
      error: `Speech generation failed: ${(error as Error).message}`,
    }, 500);
  }
});

// Search assets
app.get('/api/forge/assets/search', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '10');
  const type = c.req.query('type') as 'image' | 'speech' | undefined;

  if (!query) {
    return c.json({ error: 'Missing query parameter q' }, 400);
  }

  const assetRegistry = new AssetRegistry(
    c.env.ASSETS,
    c.env.REGISTRY,
    c.env.AI,
    c.env.VECTORIZE
  );

  const results = await assetRegistry.search(query, limit);

  // Filter by type if specified
  const filtered = type ? results.filter(r => r.type === type) : results;

  return c.json({
    query,
    results: filtered.map(r => ({
      id: r.id,
      type: r.type,
      prompt: r.prompt,
      url: r.url,
      created_at: r.created_at,
    })),
    total: filtered.length,
  });
});

// Get asset metadata
app.get('/api/forge/assets/:id', async (c) => {
  const id = c.req.param('id');

  const assetRegistry = new AssetRegistry(
    c.env.ASSETS,
    c.env.REGISTRY,
    c.env.AI,
    c.env.VECTORIZE
  );

  const metadata = await assetRegistry.get(id);
  if (!metadata) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  return c.json(metadata);
});

// Serve asset file
app.get('/api/forge/assets/:id/file', async (c) => {
  const id = c.req.param('id');

  const assetRegistry = new AssetRegistry(
    c.env.ASSETS,
    c.env.REGISTRY,
    c.env.AI,
    c.env.VECTORIZE
  );

  const file = await assetRegistry.getFile(id);
  if (!file) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  return c.body(file.body, 200, {
    'Content-Type': file.httpMetadata?.contentType || 'application/octet-stream',
    'Cache-Control': 'public, max-age=31536000',
  });
});

// Delete asset
app.delete('/api/forge/assets/:id', async (c) => {
  const id = c.req.param('id');

  const assetRegistry = new AssetRegistry(
    c.env.ASSETS,
    c.env.REGISTRY,
    c.env.AI,
    c.env.VECTORIZE
  );

  const deleted = await assetRegistry.delete(id);
  if (!deleted) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  return c.json({ success: true, id });
});

// ================================
// Component Storage API (RESTful)
// ================================

// Instance storage
app.get('/api/forge/:id/instance/:instanceId/data', async (c) => {
  const { id, instanceId } = c.req.param();
  return handleStorageRequest(c.env.STORAGE, id, 'instance', instanceId, null, 'GET');
});

app.get('/api/forge/:id/instance/:instanceId/data/:key', async (c) => {
  const { id, instanceId, key } = c.req.param();
  return handleStorageRequest(c.env.STORAGE, id, 'instance', instanceId, key, 'GET');
});

app.post('/api/forge/:id/instance/:instanceId/data/:key', async (c) => {
  const { id, instanceId, key } = c.req.param();
  const body = await c.req.json();
  return handleStorageRequest(c.env.STORAGE, id, 'instance', instanceId, key, 'POST', body);
});

app.delete('/api/forge/:id/instance/:instanceId/data/:key', async (c) => {
  const { id, instanceId, key } = c.req.param();
  return handleStorageRequest(c.env.STORAGE, id, 'instance', instanceId, key, 'DELETE');
});

// Class storage
app.get('/api/forge/:id/class/data', async (c) => {
  const id = c.req.param('id');
  return handleStorageRequest(c.env.STORAGE, id, 'class', null, null, 'GET');
});

app.get('/api/forge/:id/class/data/:key', async (c) => {
  const { id, key } = c.req.param();
  return handleStorageRequest(c.env.STORAGE, id, 'class', null, key, 'GET');
});

app.post('/api/forge/:id/class/data/:key', async (c) => {
  const { id, key } = c.req.param();
  const body = await c.req.json();
  return handleStorageRequest(c.env.STORAGE, id, 'class', null, key, 'POST', body);
});

app.delete('/api/forge/:id/class/data/:key', async (c) => {
  const { id, key } = c.req.param();
  return handleStorageRequest(c.env.STORAGE, id, 'class', null, key, 'DELETE');
});

// Global storage
app.get('/api/forge/global/data', async (c) => {
  return handleStorageRequest(c.env.STORAGE, 'global', 'global', null, null, 'GET');
});

app.get('/api/forge/global/data/:key', async (c) => {
  const key = c.req.param('key');
  return handleStorageRequest(c.env.STORAGE, 'global', 'global', null, key, 'GET');
});

app.post('/api/forge/global/data/:key', async (c) => {
  const key = c.req.param('key');
  const body = await c.req.json();
  return handleStorageRequest(c.env.STORAGE, 'global', 'global', null, key, 'POST', body);
});

app.delete('/api/forge/global/data/:key', async (c) => {
  const key = c.req.param('key');
  return handleStorageRequest(c.env.STORAGE, 'global', 'global', null, key, 'DELETE');
});

// Get component manifest (must come AFTER specific routes like /search, /stats, /global)
app.get('/api/forge/:id', async (c) => {
  const id = c.req.param('id');
  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);

  const entry = await registry.get(id);
  if (!entry) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json(entry);
});

// ================================
// Component Runner / Viewer
// ================================

// Serve compiled component JS
app.get('/api/forge/:id/component.js', async (c) => {
  const id = c.req.param('id');
  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);

  const js = await registry.getComponentJS(id);
  if (!js) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.text(js, 200, {
    'Content-Type': 'application/javascript',
    'Cache-Control': 'public, max-age=31536000',
  });
});

// Serve TypeScript type definitions
app.get('/api/forge/:id/component.d.ts', async (c) => {
  const id = c.req.param('id');
  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);

  const dts = await registry.getTypeDefs(id);
  if (!dts) {
    return c.json({ error: 'Type definitions not found' }, 404);
  }

  return c.text(dts, 200, {
    'Content-Type': 'application/typescript',
    'Cache-Control': 'public, max-age=31536000',
  });
});

// ================================
// Runtime JS (client-side library)
// ================================

// Pre-bundled runtime for browser
const RUNTIME_JS = `
// Forge Runtime - Client-side WebComponent Library

class StorageAPI {
  constructor(baseUrl, componentId, scope, instanceId) {
    this.baseUrl = baseUrl;
    this.componentId = componentId;
    this.scope = scope;
    this.instanceId = instanceId;
    this._pending = new Map();
    this._timers = new Map();
  }

  url(key) {
    const base = this.baseUrl + '/api/forge/' + this.componentId;
    if (this.scope === 'instance') {
      return key ? base + '/instance/' + this.instanceId + '/data/' + key : base + '/instance/' + this.instanceId + '/data';
    } else if (this.scope === 'class') {
      return key ? base + '/class/data/' + key : base + '/class/data';
    } else {
      return key ? this.baseUrl + '/api/forge/global/data/' + key : this.baseUrl + '/api/forge/global/data';
    }
  }

  async get(key) {
    // Return pending write for read-your-writes consistency
    if (this._pending.has(key)) return this._pending.get(key);
    try {
      const response = await fetch(this.url(key));
      if (!response.ok) return null;
      const data = await response.json();
      return data.value;
    } catch { return null; }
  }

  async set(key, value) {
    // Store pending value for read-your-writes
    this._pending.set(key, value);
    // Debounce writes (300ms) to avoid KV rate limiting
    if (this._timers.has(key)) clearTimeout(this._timers.get(key));
    this._timers.set(key, setTimeout(async () => {
      this._timers.delete(key);
      try {
        await fetch(this.url(key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        });
      } finally {
        if (this._pending.get(key) === value) this._pending.delete(key);
      }
    }, 300));
  }

  async delete(key) {
    this._pending.delete(key);
    await fetch(this.url(key), { method: 'DELETE' });
  }

  async list() {
    try {
      const response = await fetch(this.url());
      if (!response.ok) return [];
      const data = await response.json();
      return data.keys || [];
    } catch { return []; }
  }
}

// DOM morphing - updates existing DOM to match new structure while preserving focus
function morph(fromNode, toNode) {
  // Different node types - replace entirely (use actual node, not clone, to preserve handlers)
  if (fromNode.nodeType !== toNode.nodeType || fromNode.nodeName !== toNode.nodeName) {
    fromNode.parentNode?.replaceChild(toNode, fromNode);
    return;
  }

  // Text nodes - update content
  if (fromNode.nodeType === 3) {
    if (fromNode.textContent !== toNode.textContent) {
      fromNode.textContent = toNode.textContent;
    }
    return;
  }

  // Element nodes
  if (fromNode.nodeType === 1) {
    // Skip morphing focused inputs to preserve cursor position
    // Use :focus pseudo-class which works correctly in Shadow DOM
    const isFocused = fromNode.matches && fromNode.matches(':focus');
    const isFocusedInput = isFocused &&
      (fromNode.tagName === 'INPUT' || fromNode.tagName === 'TEXTAREA' || fromNode.tagName === 'SELECT');

    // Update attributes (but preserve value on focused inputs)
    const fromAttrs = new Set(Array.from(fromNode.attributes).map(a => a.name));
    const toAttrs = new Set(Array.from(toNode.attributes).map(a => a.name));

    // Remove old attributes
    for (const name of fromAttrs) {
      if (!toAttrs.has(name)) fromNode.removeAttribute(name);
    }

    // Add/update attributes
    for (const attr of toNode.attributes) {
      // Skip value on focused inputs
      if (isFocusedInput && attr.name === 'value') continue;
      if (fromNode.getAttribute(attr.name) !== attr.value) {
        fromNode.setAttribute(attr.name, attr.value);
      }
    }

    // Sync special properties (but not on focused inputs)
    if (!isFocusedInput) {
      if ('value' in toNode && fromNode.value !== toNode.value) fromNode.value = toNode.value;
      if ('checked' in toNode && fromNode.checked !== toNode.checked) fromNode.checked = toNode.checked;
      if ('selected' in toNode && fromNode.selected !== toNode.selected) fromNode.selected = toNode.selected;
    }

    // Transfer event handlers from new node to existing node
    if (toNode._forgeHandlers) {
      // Remove old handlers first
      if (fromNode._forgeHandlers) {
        for (const [event, handler] of Object.entries(fromNode._forgeHandlers)) {
          fromNode.removeEventListener(event, handler);
        }
      }
      // Add new handlers
      fromNode._forgeHandlers = {};
      for (const [event, handler] of Object.entries(toNode._forgeHandlers)) {
        fromNode.addEventListener(event, handler);
        fromNode._forgeHandlers[event] = handler;
      }
    }

    // Morph children
    const fromChildren = Array.from(fromNode.childNodes);
    const toChildren = Array.from(toNode.childNodes);

    // Build key map for efficient matching
    const fromKeyMap = new Map();
    fromChildren.forEach((child, i) => {
      const key = child.nodeType === 1 ? child.getAttribute('key') || child.getAttribute('id') : null;
      if (key) fromKeyMap.set(key, { node: child, index: i });
    });

    let fromIndex = 0;
    for (let toIndex = 0; toIndex < toChildren.length; toIndex++) {
      const toChild = toChildren[toIndex];
      const toKey = toChild.nodeType === 1 ? toChild.getAttribute('key') || toChild.getAttribute('id') : null;

      // Try to find matching node by key
      if (toKey && fromKeyMap.has(toKey)) {
        const match = fromKeyMap.get(toKey);
        if (match.index !== fromIndex) {
          // Move node to correct position
          fromNode.insertBefore(match.node, fromChildren[fromIndex] || null);
        }
        morph(match.node, toChild);
        fromIndex++;
        continue;
      }

      // Match by position
      if (fromIndex < fromChildren.length) {
        const fromChild = fromChildren[fromIndex];
        // If types match, morph; otherwise replace (use actual node to preserve handlers)
        if (fromChild.nodeType === toChild.nodeType && fromChild.nodeName === toChild.nodeName) {
          morph(fromChild, toChild);
        } else {
          fromNode.replaceChild(toChild, fromChild);
        }
        fromIndex++;
      } else {
        // No more from children - append (use actual node to preserve handlers)
        fromNode.appendChild(toChild);
      }
    }

    // Remove extra from children
    while (fromIndex < fromChildren.length) {
      fromNode.removeChild(fromChildren[fromIndex]);
      fromIndex++;
    }
  }
}

export function Component(options) {
  return function(target) {
    // Store metadata directly on class (more robust than WeakMap with decorators)
    target.__forgeMetadata__ = options;
    if (!customElements.get(options.tag)) {
      customElements.define(options.tag, target);
    }
    return target;
  };
}

export class ForgeComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._instanceId = crypto.randomUUID();
    this._baseUrl = this.getAttribute('data-forge-url') || 'https://forge.entrained.ai';
    this._componentId = this.getAttribute('data-forge-id') || this.tagName.toLowerCase();
    this._props = {};

    this.instance = new StorageAPI(this._baseUrl, this._componentId, 'instance', this._instanceId);
    this.class = new StorageAPI(this._baseUrl, this._componentId, 'class');
    this.global = new StorageAPI(this._baseUrl, this._componentId, 'global');
  }

  get props() { return this._props; }

  initProps() {
    const metadata = this.constructor.__forgeMetadata__;
    if (!metadata?.props) return;
    for (const [name, config] of Object.entries(metadata.props)) {
      const attrValue = this.getAttribute(name);
      if (attrValue !== null) {
        if (config.type === Number) this._props[name] = parseFloat(attrValue);
        else if (config.type === Boolean) this._props[name] = attrValue !== 'false';
        else this._props[name] = attrValue;
      } else if (config.default !== undefined) {
        this._props[name] = config.default;
      }
    }
  }

  static get observedAttributes() {
    const metadata = this.__forgeMetadata__;
    return metadata?.props ? Object.keys(metadata.props) : [];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    const metadata = this.constructor.__forgeMetadata__;
    const propConfig = metadata?.props?.[name];
    if (propConfig) {
      if (newValue === null) this._props[name] = propConfig.default;
      else if (propConfig.type === Number) this._props[name] = parseFloat(newValue);
      else if (propConfig.type === Boolean) this._props[name] = newValue !== 'false';
      else this._props[name] = newValue;
      this.onUpdate([name]);
    }
  }

  connectedCallback() {
    this.initProps();
    this.update();
    requestAnimationFrame(() => Promise.resolve(this.onMount()));
  }

  disconnectedCallback() { this.onUnmount(); }
  async onMount() {}
  onUpdate(changedProps) {}
  onUnmount() {}

  update() {
    if (!this.shadowRoot) return;
    const rendered = this.render();
    if (typeof rendered === 'string') {
      this.shadowRoot.innerHTML = rendered;
    } else if (rendered instanceof Node) {
      // Use DOM morphing to preserve focus and input state
      if (this.shadowRoot.firstChild) {
        morph(this.shadowRoot.firstChild, rendered);
      } else {
        this.shadowRoot.appendChild(rendered);
      }
    }
  }

  emit(eventName, detail) {
    this.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: true, composed: true }));
  }

  query(selector) { return this.shadowRoot?.querySelector(selector) ?? null; }
  queryAll(selector) { return Array.from(this.shadowRoot?.querySelectorAll(selector) ?? []); }

  // Asset generation methods
  async createImage(prompt, options = {}) {
    const response = await fetch(this._baseUrl + '/api/forge/assets/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, options }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Image generation failed');
    }
    const result = await response.json();
    return result.url;
  }

  async createSpeech(text, options = {}) {
    const response = await fetch(this._baseUrl + '/api/forge/assets/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, options }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Speech generation failed');
    }
    const result = await response.json();
    return result.url;
  }
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  let deferredValue = undefined;  // For select elements, set value after children
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key.startsWith('on') && typeof value === 'function') {
        const eventName = key.slice(2).toLowerCase();
        el.addEventListener(eventName, value);
        // Store handlers for morph to transfer
        if (!el._forgeHandlers) el._forgeHandlers = {};
        el._forgeHandlers[eventName] = value;
      }
      else if (key === 'className') el.className = String(value);
      // Handle form element properties that need to be set as properties, not attributes
      else if (key === 'value' && (tag === 'input' || tag === 'textarea')) {
        el.value = String(value ?? '');
      }
      else if (key === 'value' && tag === 'select') {
        // Defer setting select value until after options are appended
        deferredValue = String(value ?? '');
      }
      else if (key === 'checked' && tag === 'input') el.checked = Boolean(value);
      else if (key === 'selected' && tag === 'option') el.selected = Boolean(value);
      else if (typeof value === 'boolean') { if (value) el.setAttribute(key, ''); }
      else el.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') el.appendChild(document.createTextNode(String(child)));
    else if (child instanceof Node) el.appendChild(child);
  }
  // Set select value after options are appended
  if (deferredValue !== undefined) {
    el.value = deferredValue;
  }
  return el;
}

export const Fragment = 'fragment';

export class ForgeRuntime {
  constructor(componentId, baseUrl = 'https://forge.entrained.ai') {
    this.componentId = componentId;
    this.baseUrl = baseUrl;
  }
}
`;

app.get('/runtime.js', (c) => {
  // TODO: Change to 'public, max-age=3600' for production
  return c.text(RUNTIME_JS, 200, {
    'Content-Type': 'application/javascript',
    'Cache-Control': 'no-cache',
  });
});

// ================================
// Static Pages (must come before /:id wildcard)
// ================================

// Component discovery page
app.get('/discover', async (c) => {
  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);
  const { entries } = await registry.list({ limit: 50 });

  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Forge - Discover Components</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; }
        .container { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
        header { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
        header h1 { margin: 0; font-size: 1.5rem; }
        header a { color: #888; text-decoration: none; }
        header a:hover { color: #fff; }
        .search-box { position: relative; margin-bottom: 2rem; }
        .search-box input { width: 100%; padding: 1rem 1rem 1rem 3rem; font-size: 1rem; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; outline: none; }
        .search-box input:focus { border-color: #0f0; }
        .search-box::before { content: "\\2315"; position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #666; font-size: 1.2rem; }
        .results-info { color: #888; font-size: 0.9rem; margin-bottom: 1rem; }
        .component-list { display: flex; flex-direction: column; gap: 1rem; }
        .component-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 1rem 1.25rem; transition: border-color 0.2s; }
        .component-card:hover { border-color: #444; }
        .component-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
        .component-tag { font-family: monospace; font-size: 1rem; color: #0f0; }
        .component-meta { display: flex; gap: 0.75rem; font-size: 0.8rem; color: #666; }
        .component-type { padding: 0.2rem 0.5rem; background: #2a2a2a; border-radius: 4px; font-size: 0.75rem; text-transform: uppercase; }
        .component-type.app { color: #0af; }
        .component-type.library { color: #fa0; }
        .component-desc { color: #aaa; font-size: 0.9rem; line-height: 1.4; margin-bottom: 0.75rem; }
        .component-actions { display: flex; gap: 1rem; }
        .component-actions a { color: #888; text-decoration: none; font-size: 0.85rem; }
        .component-actions a:hover { color: #fff; }
        .similarity { color: #0f0; font-size: 0.8rem; }
        .empty-state { text-align: center; padding: 3rem; color: #666; }
        .loading { text-align: center; padding: 2rem; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <header><h1>Forge</h1><a href="/">← Back</a></header>
        <div class="search-box"><input type="text" id="search" placeholder="Search components..." autofocus></div>
        <div id="results-info" class="results-info"></div>
        <div id="results" class="component-list">
          ${entries.length === 0 ? '<div class="empty-state">No components yet.</div>' : entries.map(entry => `
            <div class="component-card">
              <div class="component-header">
                <span class="component-tag">&lt;${entry.manifest.components[0]?.tag || 'unknown'}&gt;</span>
                <div class="component-meta">
                  <span class="component-type ${entry.manifest.type}">${entry.manifest.type}</span>
                  <span>v${entry.manifest.version}</span>
                </div>
              </div>
              <div class="component-desc">${escapeHtml(entry.manifest.description)}</div>
              <div class="component-actions">
                <a href="/${entry.id}">View</a>
                <a href="/api/forge/${entry.id}/source">Source</a>
                <a href="/api/forge/${entry.id}">Manifest</a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <script>
        const searchInput = document.getElementById('search');
        const resultsDiv = document.getElementById('results');
        const resultsInfo = document.getElementById('results-info');
        let debounceTimer;
        searchInput.addEventListener('input', (e) => {
          clearTimeout(debounceTimer);
          const query = e.target.value.trim();
          if (!query) { location.reload(); return; }
          debounceTimer = setTimeout(() => search(query), 300);
        });
        async function search(query) {
          resultsDiv.innerHTML = '<div class="loading">Searching...</div>';
          try {
            const res = await fetch('/api/forge/search?q=' + encodeURIComponent(query) + '&limit=20');
            const data = await res.json();
            if (data.results.length === 0) {
              resultsInfo.textContent = 'No matches found';
              resultsDiv.innerHTML = '<div class="empty-state">No components match your search.</div>';
              return;
            }
            resultsInfo.textContent = data.results.length + ' result' + (data.results.length === 1 ? '' : 's');
            resultsDiv.innerHTML = data.results.map(r => \`
              <div class="component-card">
                <div class="component-header">
                  <span class="component-tag">&lt;\${r.tag || 'unknown'}&gt;</span>
                  <div class="component-meta">
                    <span class="component-type \${r.type}">\${r.type}</span>
                    <span>v\${r.version}</span>
                    <span class="similarity">\${Math.round(r.similarity * 100)}% match</span>
                  </div>
                </div>
                <div class="component-desc">\${escapeHtml(r.description)}</div>
                <div class="component-actions">
                  <a href="/\${r.id}">View</a>
                  <a href="/api/forge/\${r.id}/source">Source</a>
                  <a href="/api/forge/\${r.id}">Manifest</a>
                </div>
              </div>
            \`).join('');
          } catch (err) {
            resultsDiv.innerHTML = '<div class="empty-state">Search failed: ' + err.message + '</div>';
          }
        }
        function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
      </script>
    </body>
    </html>
  `);
});

// Voice avatar images (generated with Forge!)
const VOICE_AVATARS: Record<string, string> = {
  alloy: 'https://forge.entrained.ai/api/forge/assets/0004c0b855ad-mk1anf7y/file',
  ash: 'https://forge.entrained.ai/api/forge/assets/0003a8bb6e45-mk1ao11s/file',
  ballad: 'https://forge.entrained.ai/api/forge/assets/0003ac110b59-mk1ao1nx/file',
  coral: 'https://forge.entrained.ai/api/forge/assets/0003a82f2033-mk1ao2pd/file',
  echo: 'https://forge.entrained.ai/api/forge/assets/0008b7d977d3-mk1ao3vz/file',
  fable: 'https://forge.entrained.ai/api/forge/assets/000d3727ca92-mk1aoqqv/file',
  onyx: 'https://forge.entrained.ai/api/forge/assets/000779c8c67c-mk1aos3k/file',
  nova: 'https://forge.entrained.ai/api/forge/assets/0000c7515280-mk1aospo/file',
  sage: 'https://forge.entrained.ai/api/forge/assets/00077280a0a4-mk1aqnu4/file',
  shimmer: 'https://forge.entrained.ai/api/forge/assets/000120ac50a1-mk1ardps/file',
  verse: 'https://forge.entrained.ai/api/forge/assets/00000e9aaa83-mk1areo6/file',
  marin: 'https://forge.entrained.ai/api/forge/assets/0002edfc0d6e-mk1arflz/file',
  cedar: 'https://forge.entrained.ai/api/forge/assets/0002a3104dff-mk1ari1i/file',
};

// Assets discovery page (images & TTS)
app.get('/assets', async (c) => {
  const assetRegistry = new AssetRegistry(
    c.env.ASSETS,
    c.env.REGISTRY,
    c.env.AI,
    c.env.VECTORIZE
  );
  const recentAssets = await assetRegistry.list({ limit: 30 });

  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Forge - Assets</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; }
        .container { max-width: 900px; margin: 0 auto; padding: 2rem 1rem; }
        header { display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; }
        header h1 { margin: 0; font-size: 1.5rem; }
        header a { color: #888; text-decoration: none; }
        header a:hover { color: #fff; }
        .tabs { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
        .tab { padding: 0.5rem 1rem; background: #1a1a1a; border: 1px solid #333; border-radius: 6px; cursor: pointer; color: #888; }
        .tab:hover { border-color: #555; color: #fff; }
        .tab.active { border-color: #0f0; color: #0f0; }
        .search-box { position: relative; margin-bottom: 2rem; }
        .search-box input { width: 100%; padding: 1rem 1rem 1rem 3rem; font-size: 1rem; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; outline: none; }
        .search-box input:focus { border-color: #0f0; }
        .search-box::before { content: "\\2315"; position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #666; font-size: 1.2rem; }
        .results-info { color: #888; font-size: 0.9rem; margin-bottom: 1rem; }
        .asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
        .asset-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; overflow: hidden; transition: border-color 0.2s; position: relative; }
        .asset-card:hover { border-color: #444; }
        .asset-preview { aspect-ratio: 1; background: #111; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; }
        .asset-preview img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .asset-preview.audio { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); background-size: cover; background-position: center; }
        .asset-preview audio { width: 90%; }
        /* Background options for transparent images */
        .asset-preview.bg-dark { background: #111; }
        .asset-preview.bg-light { background: #f0f0f0; }
        .asset-preview.bg-checker { background: repeating-conic-gradient(#808080 0% 25%, #c0c0c0 0% 50%) 50% / 20px 20px; }
        /* Background toggle button */
        .bg-toggle { position: absolute; top: 6px; right: 6px; width: 24px; height: 24px; border-radius: 4px; border: 1px solid #555; background: linear-gradient(135deg, #333 50%, #666 50%); cursor: pointer; opacity: 0; transition: opacity 0.2s; z-index: 2; }
        .asset-card:hover .bg-toggle { opacity: 1; }
        .bg-toggle:hover { border-color: #0f0; }
        /* Info button */
        .info-btn { position: absolute; top: 6px; left: 6px; width: 24px; height: 24px; border-radius: 50%; border: 1px solid #555; background: #333; color: #aaa; font-size: 14px; font-weight: bold; cursor: pointer; opacity: 0; transition: opacity 0.2s; z-index: 2; display: flex; align-items: center; justify-content: center; }
        .asset-card:hover .info-btn { opacity: 1; }
        .info-btn:hover { border-color: #0f0; color: #0f0; }
        .play-btn { width: 60px; height: 60px; border-radius: 50%; background: #0f0; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .play-btn:hover { background: #0c0; transform: scale(1.05); }
        .play-btn::after { content: ""; border-left: 20px solid #000; border-top: 12px solid transparent; border-bottom: 12px solid transparent; margin-left: 4px; }
        .asset-info { padding: 0.75rem; }
        .asset-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
        .asset-type { font-size: 0.7rem; text-transform: uppercase; padding: 0.2rem 0.4rem; border-radius: 3px; display: inline-block; }
        .asset-type.image { background: #2a1a4a; color: #a78bfa; }
        .asset-type.speech { background: #1a3a2a; color: #6ee7b7; }
        .asset-badge { font-size: 0.65rem; padding: 0.15rem 0.35rem; border-radius: 3px; background: #333; color: #888; }
        .asset-badge.transparent { background: #1a2a3a; color: #7dd3fc; }
        .asset-prompt { font-size: 0.85rem; color: #aaa; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .empty-state { text-align: center; padding: 3rem; color: #666; grid-column: 1 / -1; }
        .loading { text-align: center; padding: 2rem; color: #666; grid-column: 1 / -1; }
        /* Metadata modal */
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: none; align-items: center; justify-content: center; z-index: 100; }
        .modal-overlay.active { display: flex; }
        .modal { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; max-width: 500px; width: 90%; max-height: 80vh; overflow: auto; }
        .modal-header { padding: 1rem; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center; }
        .modal-header h3 { margin: 0; font-size: 1rem; }
        .modal-close { background: none; border: none; color: #888; font-size: 1.5rem; cursor: pointer; padding: 0; line-height: 1; }
        .modal-close:hover { color: #fff; }
        .modal-body { padding: 1rem; }
        .meta-row { display: flex; padding: 0.5rem 0; border-bottom: 1px solid #222; }
        .meta-row:last-child { border-bottom: none; }
        .meta-label { color: #666; width: 100px; flex-shrink: 0; font-size: 0.85rem; }
        .meta-value { color: #ddd; font-size: 0.85rem; word-break: break-all; }
        .meta-value a { color: #0f0; }
      </style>
    </head>
    <body>
      <div class="container">
        <header><h1>Forge Assets</h1><a href="/">← Back</a></header>
        <div class="tabs">
          <div class="tab active" data-type="all">All</div>
          <div class="tab" data-type="image">Images</div>
          <div class="tab" data-type="speech">Speech</div>
        </div>
        <div class="search-box"><input type="text" id="search" placeholder="Search assets..." autofocus></div>
        <div id="results-info" class="results-info">${recentAssets.length} recent assets</div>
        <div id="results" class="asset-grid">
          ${recentAssets.length === 0 ? '<div class="empty-state">No assets yet. Generate some images or speech!</div>' : recentAssets.map(asset => {
            const params = asset.params as { transparent?: boolean; preset?: string; voice?: string };
            const isTransparent = asset.type === 'image' && (params.transparent || params.preset === 'icon' || params.preset === 'sprite');
            const voice = asset.type === 'speech' ? (params.voice || 'alloy') : null;
            const voiceAvatar = voice ? VOICE_AVATARS[voice] : null;
            const bgStyle = voiceAvatar ? `background-image: url('${voiceAvatar}')` : '';
            return `
            <div class="asset-card" data-type="${asset.type}" data-id="${asset.id}" data-meta='${escapeHtml(JSON.stringify(asset))}'>
              <div class="asset-preview ${asset.type === 'speech' ? 'audio' : ''} ${isTransparent ? 'bg-dark' : ''}" ${bgStyle ? `style="${bgStyle}"` : ''}>
                <button class="info-btn" onclick="showMeta(this.closest('.asset-card'))">i</button>
                ${isTransparent ? '<button class="bg-toggle" onclick="toggleBg(this)" title="Toggle background"></button>' : ''}
                ${asset.type === 'image'
                  ? `<img src="${asset.url}" alt="${escapeHtml(asset.prompt)}" loading="lazy">`
                  : `<button class="play-btn" onclick="playAudio('${asset.url}', this)"></button>`
                }
              </div>
              <div class="asset-info">
                <div class="asset-header">
                  <span class="asset-type ${asset.type}">${asset.type}</span>
                  ${isTransparent ? '<span class="asset-badge transparent">transparent</span>' : ''}
                  ${voice ? `<span class="asset-badge">${voice}</span>` : ''}
                </div>
                <div class="asset-prompt" title="${escapeHtml(asset.prompt)}">${escapeHtml(asset.prompt)}</div>
              </div>
            </div>
          `}).join('')}
        </div>
      </div>
      <!-- Metadata Modal -->
      <div class="modal-overlay" id="modal" onclick="if(event.target===this)closeMeta()">
        <div class="modal">
          <div class="modal-header">
            <h3>Asset Details</h3>
            <button class="modal-close" onclick="closeMeta()">&times;</button>
          </div>
          <div class="modal-body" id="modal-content"></div>
        </div>
      </div>
      <script>
        let currentType = 'all';
        let currentAudio = null;
        const bgCycle = ['bg-dark', 'bg-checker', 'bg-light'];

        // Voice avatar images (generated with Forge!)
        const voiceAvatars = {
          alloy: 'https://forge.entrained.ai/api/forge/assets/0004c0b855ad-mk1anf7y/file',
          ash: 'https://forge.entrained.ai/api/forge/assets/0003a8bb6e45-mk1ao11s/file',
          ballad: 'https://forge.entrained.ai/api/forge/assets/0003ac110b59-mk1ao1nx/file',
          coral: 'https://forge.entrained.ai/api/forge/assets/0003a82f2033-mk1ao2pd/file',
          echo: 'https://forge.entrained.ai/api/forge/assets/0008b7d977d3-mk1ao3vz/file',
          fable: 'https://forge.entrained.ai/api/forge/assets/000d3727ca92-mk1aoqqv/file',
          onyx: 'https://forge.entrained.ai/api/forge/assets/000779c8c67c-mk1aos3k/file',
          nova: 'https://forge.entrained.ai/api/forge/assets/0000c7515280-mk1aospo/file',
          sage: 'https://forge.entrained.ai/api/forge/assets/00077280a0a4-mk1aqnu4/file',
          shimmer: 'https://forge.entrained.ai/api/forge/assets/000120ac50a1-mk1ardps/file',
          verse: 'https://forge.entrained.ai/api/forge/assets/00000e9aaa83-mk1areo6/file',
          marin: 'https://forge.entrained.ai/api/forge/assets/0002edfc0d6e-mk1arflz/file',
          cedar: 'https://forge.entrained.ai/api/forge/assets/0002a3104dff-mk1ari1i/file',
        };

        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
          tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentType = tab.dataset.type;
            filterResults();
          });
        });

        function filterResults() {
          document.querySelectorAll('.asset-card').forEach(card => {
            if (currentType === 'all' || card.dataset.type === currentType) {
              card.style.display = '';
            } else {
              card.style.display = 'none';
            }
          });
        }

        function playAudio(url, btn) {
          if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
          }
          currentAudio = new Audio(url);
          currentAudio.play();
          currentAudio.onended = () => { currentAudio = null; };
        }

        function toggleBg(btn) {
          const preview = btn.closest('.asset-preview');
          const current = bgCycle.find(c => preview.classList.contains(c)) || 'bg-dark';
          const idx = bgCycle.indexOf(current);
          const next = bgCycle[(idx + 1) % bgCycle.length];
          bgCycle.forEach(c => preview.classList.remove(c));
          preview.classList.add(next);
        }

        function showMeta(card) {
          const meta = JSON.parse(card.dataset.meta);
          const modal = document.getElementById('modal');
          const content = document.getElementById('modal-content');

          let html = '';
          html += '<div class="meta-row"><div class="meta-label">ID</div><div class="meta-value">' + meta.id + '</div></div>';
          html += '<div class="meta-row"><div class="meta-label">Type</div><div class="meta-value">' + meta.type + '</div></div>';
          html += '<div class="meta-row"><div class="meta-label">Prompt</div><div class="meta-value">' + escapeHtml(meta.prompt) + '</div></div>';
          if (meta.model) {
            html += '<div class="meta-row"><div class="meta-label">Model</div><div class="meta-value">' + meta.model + '</div></div>';
          }
          if (meta.type === 'image') {
            if (meta.width && meta.height) {
              html += '<div class="meta-row"><div class="meta-label">Size</div><div class="meta-value">' + meta.width + 'x' + meta.height + '</div></div>';
            }
            if (meta.params?.transparent) {
              html += '<div class="meta-row"><div class="meta-label">Transparent</div><div class="meta-value">Yes</div></div>';
            }
            if (meta.params?.style) {
              html += '<div class="meta-row"><div class="meta-label">Style</div><div class="meta-value">' + meta.params.style + '</div></div>';
            }
          }
          if (meta.type === 'speech') {
            if (meta.params?.voice) {
              html += '<div class="meta-row"><div class="meta-label">Voice</div><div class="meta-value">' + meta.params.voice + '</div></div>';
            }
            if (meta.params?.instructions) {
              html += '<div class="meta-row"><div class="meta-label">Instructions</div><div class="meta-value">' + escapeHtml(meta.params.instructions) + '</div></div>';
            }
          }
          html += '<div class="meta-row"><div class="meta-label">Size</div><div class="meta-value">' + (meta.size_bytes / 1024).toFixed(1) + ' KB</div></div>';
          html += '<div class="meta-row"><div class="meta-label">Created</div><div class="meta-value">' + new Date(meta.created_at).toLocaleString() + '</div></div>';
          html += '<div class="meta-row"><div class="meta-label">URL</div><div class="meta-value"><a href="' + meta.url + '" target="_blank">Open file</a></div></div>';

          content.innerHTML = html;
          modal.classList.add('active');
        }

        function closeMeta() {
          document.getElementById('modal').classList.remove('active');
        }

        // Search
        const searchInput = document.getElementById('search');
        const resultsDiv = document.getElementById('results');
        const resultsInfo = document.getElementById('results-info');
        let debounceTimer;

        searchInput.addEventListener('input', (e) => {
          clearTimeout(debounceTimer);
          const query = e.target.value.trim();
          if (!query) { location.reload(); return; }
          debounceTimer = setTimeout(() => search(query), 300);
        });

        async function search(query) {
          resultsDiv.innerHTML = '<div class="loading">Searching...</div>';
          const typeParam = currentType !== 'all' ? '&type=' + currentType : '';
          try {
            const res = await fetch('/api/forge/assets/search?q=' + encodeURIComponent(query) + '&limit=30' + typeParam);
            const data = await res.json();
            if (data.results.length === 0) {
              resultsInfo.textContent = 'No matches found';
              resultsDiv.innerHTML = '<div class="empty-state">No assets match your search.</div>';
              return;
            }
            resultsInfo.textContent = data.results.length + ' result' + (data.results.length === 1 ? '' : 's');
            resultsDiv.innerHTML = data.results.map(r => {
              const isTransparent = r.type === 'image' && (r.params?.transparent || r.params?.preset === 'icon' || r.params?.preset === 'sprite');
              const voice = r.type === 'speech' ? (r.params?.voice || 'alloy') : null;
              const avatarUrl = voice ? voiceAvatars[voice] : null;
              const bgStyle = avatarUrl ? 'background-image: url(' + avatarUrl + ')' : '';
              return \`
              <div class="asset-card" data-type="\${r.type}" data-id="\${r.id}" data-meta='\${escapeHtml(JSON.stringify(r))}'>
                <div class="asset-preview \${r.type === 'speech' ? 'audio' : ''} \${isTransparent ? 'bg-dark' : ''}" \${bgStyle ? 'style="' + bgStyle + '"' : ''}>
                  <button class="info-btn" onclick="showMeta(this.closest('.asset-card'))">i</button>
                  \${isTransparent ? '<button class="bg-toggle" onclick="toggleBg(this)" title="Toggle background"></button>' : ''}
                  \${r.type === 'image'
                    ? '<img src="' + r.url + '" alt="' + escapeHtml(r.prompt) + '" loading="lazy">'
                    : '<button class="play-btn" onclick="playAudio(\\'' + r.url + '\\', this)"></button>'
                  }
                </div>
                <div class="asset-info">
                  <div class="asset-header">
                    <span class="asset-type \${r.type}">\${r.type}</span>
                    \${isTransparent ? '<span class="asset-badge transparent">transparent</span>' : ''}
                    \${voice ? '<span class="asset-badge">' + voice + '</span>' : ''}
                  </div>
                  <div class="asset-prompt" title="\${escapeHtml(r.prompt)}">\${escapeHtml(r.prompt)}</div>
                </div>
              </div>
            \`}).join('');
          } catch (err) {
            resultsDiv.innerHTML = '<div class="empty-state">Search failed: ' + err.message + '</div>';
          }
        }

        function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
      </script>
    </body>
    </html>
  `);
});

// Home page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Forge - Conversational WebComponents</title>
      <style>
        body { margin: 0; font-family: system-ui, sans-serif; background: #0a0a0a; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .container { text-align: center; padding: 2rem; }
        h1 { font-size: 3rem; margin-bottom: 0.5rem; }
        p { color: #888; font-size: 1.25rem; }
        .status { margin-top: 2rem; padding: 1rem 2rem; background: #1a1a1a; border-radius: 8px; font-family: monospace; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Forge</h1>
        <p>Conversational WebComponent Platform</p>
        <div class="status"><span style="color: #0f0;">●</span> Service running</div>
        <div style="margin-top: 1.5rem; display: flex; gap: 2rem; justify-content: center;">
          <a href="/discover" style="color: #0f0; text-decoration: none; font-size: 1.1rem;">→ Browse Components</a>
          <a href="/assets" style="color: #0ff; text-decoration: none; font-size: 1.1rem;">→ Browse Assets</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// View/run component (HTML page) - must come AFTER /discover and /
app.get('/:id', async (c) => {
  const id = c.req.param('id');

  // Skip file requests
  if (id.includes('.')) {
    return c.notFound();
  }

  const registry = new Registry(c.env.REGISTRY, c.env.ARTIFACTS);
  const entry = await registry.get(id);

  if (!entry) {
    return c.html(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Forge - Not Found</title>
        <style>
          body { margin: 0; font-family: system-ui, sans-serif; background: #0a0a0a; color: #fff;
                 display: flex; align-items: center; justify-content: center; height: 100vh; }
          .error { text-align: center; }
          h1 { font-size: 2rem; color: #f44; }
        </style>
      </head>
      <body>
        <div class="error">
          <h1>Component Not Found</h1>
          <p>No component with ID "${id}" exists.</p>
        </div>
      </body>
      </html>
    `, 404);
  }

  const tag = entry.manifest.components[0]?.tag || 'forge-component';

  // Collect all component IDs to load (dependencies first, then main component)
  const componentIds: string[] = [];
  if (entry.manifest.imports?.length) {
    for (const imp of entry.manifest.imports) {
      componentIds.push(imp.component_id);
    }
  }
  componentIds.push(id); // Main component last

  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Forge - ${escapeHtml(entry.manifest.description)}</title>
      <style>
        body { margin: 0; font-family: system-ui, sans-serif; }
        .loading { display: flex; align-items: center; justify-content: center; height: 100vh;
                   background: #0a0a0a; color: #fff; flex-direction: column; gap: 1rem; }
        .loading-status { font-size: 0.8rem; color: #666; }
        .error { display: flex; flex-direction: column; align-items: center; justify-content: center;
                 height: 100vh; background: #0a0a0a; color: #f44; text-align: center; padding: 2rem; }
        .error pre { background: #1a1a1a; padding: 1rem; border-radius: 8px; color: #888;
                     max-width: 80%; overflow-x: auto; font-size: 0.85rem; text-align: left; }
      </style>
      <script type="importmap">
        {
          "imports": {
            "forge": "/runtime.js"
          }
        }
      </script>
    </head>
    <body>
      <div class="loading" id="loading">
        <div>Loading ${escapeHtml(tag)}...</div>
        <div class="loading-status" id="loading-status"></div>
      </div>
      <${tag} id="component" data-forge-id="${id}" data-forge-url="https://forge.entrained.ai"></${tag}>
      <script type="module">
        const componentIds = ${JSON.stringify(componentIds)};
        const statusEl = document.getElementById('loading-status');
        const errors = [];

        async function loadComponent(compId, index, total) {
          statusEl.textContent = 'Loading ' + (index + 1) + '/' + total + ': ' + compId;

          let componentJS = await fetch('/api/forge/' + compId + '/component.js').then(r => {
            if (!r.ok) throw new Error('Failed to load ' + compId + ': ' + r.status);
            return r.text();
          });

          // Rewrite imports from "forge" to use the actual runtime URL
          componentJS = componentJS.replace(
            /from\\s*["']forge["']/g,
            'from "https://forge.entrained.ai/runtime.js"'
          );

          const blob = new Blob([componentJS], { type: 'application/javascript' });
          const blobUrl = URL.createObjectURL(blob);

          try {
            await import(blobUrl);
          } finally {
            URL.revokeObjectURL(blobUrl);
          }
        }

        try {
          // Load all components in order (dependencies first)
          for (let i = 0; i < componentIds.length; i++) {
            await loadComponent(componentIds[i], i, componentIds.length);
          }

          document.getElementById('loading').style.display = 'none';
        } catch (err) {
          console.error('Component load error:', err);
          document.getElementById('loading').innerHTML = \`
            <div class="error">
              <h2>Failed to load component</h2>
              <p>\${err.message}</p>
              <pre>\${err.stack || ''}</pre>
            </div>
          \`;
        }
      </script>
    </body>
    </html>
  `);
});

// ================================
// Queue Consumer
// ================================

export default {
  fetch: app.fetch,

  // Cron trigger to keep container warm
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(warmContainer(env));
  },

  // Queue consumer for async generation
  async queue(batch: MessageBatch, env: Env) {
    console.log(`[Queue] Received batch with ${batch.messages.length} messages`);

    const compiler = new Compiler(env);

    for (const message of batch.messages) {
      const { jobId, description } = message.body as { jobId: string; description: string };
      console.log(`[Queue] Processing job ${jobId}: ${description.slice(0, 50)}...`);

      const jobDoId = env.FORGE_JOBS.idFromName('jobs');
      const jobDo = env.FORGE_JOBS.get(jobDoId);

      try {
        // Mark as processing
        await jobDo.fetch('http://job/update', {
          method: 'POST',
          body: JSON.stringify({ id: jobId, status: 'processing' }),
        });

        // Do the generation
        const start = Date.now();
        const result = await compiler.generate(description);
        const elapsed = Date.now() - start;

        // Mark as completed
        await jobDo.fetch('http://job/update', {
          method: 'POST',
          body: JSON.stringify({
            id: jobId,
            status: 'completed',
            component_id: result.id,
          }),
        });

        console.log(`[Queue] Job ${jobId} completed in ${elapsed}ms`);
        message.ack();
      } catch (error) {
        console.error(`[Queue] Job ${jobId} failed:`, (error as Error).message);

        await jobDo.fetch('http://job/update', {
          method: 'POST',
          body: JSON.stringify({
            id: jobId,
            status: 'failed',
            error: (error as Error).message,
          }),
        });

        message.retry();
      }
    }
  },
};

async function warmContainer(env: Env) {
  const start = Date.now();
  try {
    const generatorId = env.GENERATOR.idFromName('generator');
    const generator = env.GENERATOR.get(generatorId);

    const response = await generator.fetch('http://container/health', {
      method: 'GET',
      headers: { 'user-agent': 'forge-warmer/1.0' },
    });

    const elapsed = Date.now() - start;
    const status = response.ok ? 'ok' : 'error';
    console.log(`[Warmer] Container health check: ${status} (${elapsed}ms)`);
  } catch (error) {
    const elapsed = Date.now() - start;
    console.error(`[Warmer] Container health check failed (${elapsed}ms):`, (error as Error).message);
  }
}
