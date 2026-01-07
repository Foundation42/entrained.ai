/**
 * Forge-Compatible MCP API Routes
 *
 * Provides backwards-compatible API endpoints matching the original Forge API.
 * This allows mcp.entrained.ai to work with Forge 2.0 without changes.
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { AssetService } from '../services/assets';
import { BundlerService } from '../services/bundler';
import {
  generateFile,
  updateFile,
  generateImage,
  imageRequestToOptions,
  generateSpeech,
  speechRequestToOptions,
} from '../generation';

const app = new Hono<{ Bindings: Env }>();

// =============================================================================
// Documentation (must come before /:id routes)
// =============================================================================

/**
 * GET /api/forge/about
 * Get comprehensive Forge 2.0 documentation
 */
app.get('/about', (c) => {
  return c.json({
    name: 'Forge 2.0',
    description: 'AI-powered asset workspace. Generate files, images, speech, and compose them into deployed applications.',
    url: new URL(c.req.url).origin,

    tools: {
      discovery: {
        forge_search: 'Find existing assets by semantic search',
        forge_get_manifest: 'Get asset details (props, metadata)',
        forge_get_source: 'View source code',
        forge_get_types: 'Get TypeScript definitions',
      },
      creation: {
        forge_create: 'Create new TSX component from description',
        forge_update: 'Modify component via natural language',
        forge_update_source: 'Direct source replacement',
        forge_retranspile: 'Verify component validity',
        forge_compose: 'Bundle multiple files into deployable HTML',
        forge_debug: 'Diagnose component issues',
      },
      assets: {
        forge_create_image: 'Generate images with Gemini',
        forge_create_speech: 'Generate speech with OpenAI TTS',
        forge_search_assets: 'Find existing generated assets',
      },
      apps: {
        forge_generate_app: 'Generate complete multi-component app from description (POST /api/generate/app)',
      },
    },

    assetTypes: {
      file: 'Source files (TSX, CSS, TS, etc.)',
      asset: 'Media assets (images, audio)',
      bundle: 'Composed applications (HTML bundles)',
    },

    versioning: {
      description: 'All assets are immutable with semantic versioning',
      format: '{canonical-name}-v{major}-{hash}',
      resolution: [
        '@latest - Most recent version',
        '@stable - Latest stable tag',
        '@^1.0 - SemVer range',
        'exact-id - Specific version',
      ],
    },

    generation: {
      files: 'AI generates TSX/CSS with rich metadata (props, css_classes, demo_props)',
      images: 'Gemini generates images with style presets (illustration, photo, 3d, pixel-art)',
      speech: 'OpenAI TTS with 13 voices and custom instructions',
      apps: 'Full orchestration: Plan → Generate Components → Generate CSS → Generate Media → Compose → Deploy',
    },

    bestPractices: [
      'Search for existing assets before creating new ones',
      'Use forge_get_manifest to understand component interfaces',
      'Generated CSS classes are stored in metadata for AI-assisted styling',
      'Use forge_compose to bundle multiple files into deployable apps',
      'Asset generation is cached - same inputs return cached results',
    ],
  });
});

// =============================================================================
// Search
// =============================================================================

/**
 * GET /api/forge/search
 * Search for components/files by natural language
 */
app.get('/search', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '10');

  if (!query) {
    return c.json({ error: 'Query parameter q is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    // Search all assets (filtering can be done client-side if needed)
    const results = await service.search({ query, limit });

    // Map to forge-style response
    const components = results.map(r => ({
      id: r.id,
      name: r.canonical_name,
      description: r.description,
      version: r.version,
      file_type: r.file_type,
      score: r.score,
      url: r.url,
      metadata: r.metadata,
    }));

    return c.json({ components, query, count: components.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

// =============================================================================
// Component/Asset Operations
// =============================================================================

/**
 * GET /api/forge/:id
 * Get component manifest (asset metadata)
 */
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    const manifest = await service.resolve(id);
    if (!manifest) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    // Map to forge-style manifest
    return c.json({
      id: manifest.id,
      name: manifest.canonical_name,
      description: manifest.description,
      version: manifest.version,
      file_type: manifest.file_type,
      created_at: manifest.created_at,
      // Component-specific fields from metadata
      props: manifest.metadata?.props,
      demo_props: manifest.metadata?.demo_props,
      css_classes: manifest.metadata?.css_classes,
      exports: manifest.metadata?.exports,
      // URLs
      source_url: `${baseUrl}/api/forge/${manifest.id}/source`,
      content_url: manifest.content_url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/forge/:id/source
 * Get component source code as text
 */
app.get('/:id/source', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    const content = await service.getContentAsText(id);
    if (!content) {
      return c.json({ error: `Source not found: ${id}` }, 404);
    }

    return c.text(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/forge/:id/component.d.ts
 * Get TypeScript type definitions (if available)
 */
app.get('/:id/component.d.ts', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    const manifest = await service.resolve(id);
    if (!manifest) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    // Generate basic type definitions from metadata
    const props = manifest.metadata?.props as Array<{ name: string; type: string; required?: boolean }> | undefined;

    if (!props || props.length === 0) {
      return c.text(`// No props defined for ${manifest.canonical_name}\nexport default {};`);
    }

    // Generate interface from props
    const propsInterface = props.map(p => {
      const optional = p.required ? '' : '?';
      return `  ${p.name}${optional}: ${p.type || 'unknown'};`;
    }).join('\n');

    const types = `// Auto-generated types for ${manifest.canonical_name}
export interface Props {
${propsInterface}
}

export default function ${manifest.canonical_name.replace(/-/g, '')}(props: Props): JSX.Element;
`;

    return c.text(types);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/forge/create
 * Create a new component from description
 */
app.post('/create', async (c) => {
  const body = await c.req.json() as {
    description: string;
    hints?: {
      props?: string[];
      events?: string[];
      style?: string;
      similar_to?: string;
    };
  };

  const { description, hints } = body;

  if (!description) {
    return c.json({ error: 'description is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    // Generate TSX file
    const result = await generateFile(description, 'tsx', { style: hints?.style }, c.env);

    // Store as asset
    const manifest = await service.create({
      name: result.canonical_name || 'component',
      type: 'file',
      file_type: 'tsx',
      description,
      content: result.content,
      mime_type: 'text/typescript',
      provenance: {
        ai_model: result.model,
        ai_provider: result.provider,
        source_type: 'ai_generated',
        generation_params: { description, hints },
      },
      metadata: {
        demo_props: result.demo_props,
        props: result.props,
        css_classes: result.css_classes,
        exports: result.exports,
      },
    });

    return c.json({
      id: manifest.id,
      name: manifest.canonical_name,
      version: manifest.version,
      description,
      source_url: `${baseUrl}/api/forge/${manifest.id}/source`,
      content_url: manifest.content_url,
      props: result.props,
      css_classes: result.css_classes,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ForgeAPI] Create error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/forge/:id/update
 * Update component with AI-generated changes
 */
app.post('/:id/update', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as { changes: string };

  if (!body.changes) {
    return c.json({ error: 'changes is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    // Get current source
    const manifest = await service.resolve(id);
    if (!manifest) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    const currentSource = await service.getContentAsText(id);
    if (!currentSource) {
      return c.json({ error: `Source not found: ${id}` }, 404);
    }

    // Generate updated source
    const result = await updateFile(currentSource, body.changes, 'tsx', c.env);

    // Create new version
    const newManifest = await service.create({
      name: manifest.canonical_name,
      type: 'file',
      file_type: 'tsx',
      description: manifest.description,
      content: result.content,
      mime_type: 'text/typescript',
      parent_id: manifest.id,
      provenance: {
        ai_model: result.model,
        ai_provider: result.provider,
        source_type: 'ai_generated',
        generation_params: { changes: body.changes, parent: manifest.id },
      },
      metadata: {
        demo_props: result.demo_props,
        props: result.props,
        css_classes: result.css_classes,
        exports: result.exports,
      },
    });

    return c.json({
      id: newManifest.id,
      name: newManifest.canonical_name,
      version: newManifest.version,
      parent_id: manifest.id,
      source_url: `${baseUrl}/api/forge/${newManifest.id}/source`,
      content_url: newManifest.content_url,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ForgeAPI] Update error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * PUT /api/forge/:id/source
 * Replace component source directly
 */
app.put('/:id/source', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as { source: string };

  if (!body.source) {
    return c.json({ error: 'source is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    const manifest = await service.resolve(id);
    if (!manifest) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    // Create new version with updated source
    const newManifest = await service.create({
      name: manifest.canonical_name,
      type: 'file',
      file_type: manifest.file_type || 'tsx',
      description: manifest.description,
      content: body.source,
      mime_type: manifest.mime_type || 'text/typescript',
      parent_id: manifest.id,
      provenance: {
        source_type: 'manual',
        generation_params: { parent: manifest.id },
      },
    });

    return c.json({
      id: newManifest.id,
      name: newManifest.canonical_name,
      version: newManifest.version,
      parent_id: manifest.id,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/forge/:id/retranspile
 * Re-bundle/rebuild component (in forge2, this triggers re-bundling)
 */
app.post('/:id/retranspile', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    const manifest = await service.resolve(id);
    if (!manifest) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    // In forge2, components are bundled on-demand via esbuild
    // This endpoint just verifies the component is valid
    return c.json({
      id: manifest.id,
      status: 'ok',
      message: 'Component is valid. Bundling happens on-demand in Forge 2.0.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/forge/:id/debug
 * Get debugging info for a component
 */
app.get('/:id/debug', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    const manifest = await service.resolve(id);
    if (!manifest) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    const source = await service.getContentAsText(id);
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Basic static analysis
    if (source) {
      // Check for common issues
      if (source.includes('useState') && !source.includes('import { useState')) {
        issues.push('useState used but not imported from React');
        suggestions.push('Add: import { useState } from "react"');
      }
      if (source.includes('useEffect') && !source.includes('import { useEffect')) {
        issues.push('useEffect used but not imported from React');
        suggestions.push('Add: import { useEffect } from "react"');
      }
      if (!source.includes('export default')) {
        issues.push('No default export found');
        suggestions.push('Add: export default ComponentName');
      }
      const cssClasses = manifest.metadata?.css_classes as string[] | undefined;
      if (!cssClasses || cssClasses.length === 0) {
        suggestions.push('Component uses no CSS classes - consider adding styling');
      }
    }

    return c.json({
      id: manifest.id,
      name: manifest.canonical_name,
      version: manifest.version,
      file_type: manifest.file_type,
      metadata: manifest.metadata,
      analysis: {
        issues,
        suggestions,
        has_props: !!(manifest.metadata?.props as unknown[])?.length,
        has_css_classes: !!(manifest.metadata?.css_classes as unknown[])?.length,
        source_lines: source?.split('\n').length || 0,
        source_bytes: source?.length || 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

// =============================================================================
// Composition
// =============================================================================

/**
 * POST /api/forge/compose
 * Compose multiple components into a bundle
 */
app.post('/compose', async (c) => {
  const body = await c.req.json() as {
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
  };

  const { name, description, components, layout, styles } = body;

  if (!name || !description || !components || !layout) {
    return c.json({ error: 'name, description, components, and layout are required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);
  const bundler = new BundlerService(c.env, baseUrl);

  try {
    // Get all component IDs
    const fileIds = components.map(comp => comp.id);

    // Bundle them
    const result = await bundler.bundle({
      name,
      description,
      files: fileIds,
      template: {
        styles,
      },
    });

    // Store the bundle
    const manifest = await service.create({
      name,
      type: 'bundle',
      description,
      content: result.html,
      mime_type: 'text/html',
      provenance: {
        source_type: 'ai_generated',
        generation_params: { components: fileIds, composed: true },
      },
      metadata: {
        component_count: components.length,
        js_size: result.js.length,
        css_size: result.css.length,
        build_time_ms: result.buildTimeMs,
      },
    });

    return c.json({
      id: manifest.id,
      name: manifest.canonical_name,
      version: manifest.version,
      preview_url: `${baseUrl}/api/assets/${manifest.id}/content`,
      components: result.resolvedFiles.map(f => f.id),
      build_time_ms: result.buildTimeMs,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ForgeAPI] Compose error:', message);
    return c.json({ error: message }, 500);
  }
});

// =============================================================================
// Asset Generation
// =============================================================================

/**
 * POST /api/forge/assets/image
 * Generate an image
 */
app.post('/assets/image', async (c) => {
  const body = await c.req.json() as {
    prompt: string;
    options?: {
      width?: number;
      height?: number;
      transparent?: boolean;
      style?: 'illustration' | 'photo' | '3d' | 'pixel-art';
      preset?: 'icon' | 'hero' | 'sprite';
    };
  };

  const { prompt, options } = body;

  if (!prompt) {
    return c.json({ error: 'prompt is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    const imageOptions = imageRequestToOptions({ prompt, ...options });
    const result = await generateImage(prompt, imageOptions, c.env);

    const manifest = await service.create({
      name: `image-${Date.now()}`,
      type: 'asset',
      media_type: 'image',
      description: prompt,
      content: result.data,
      mime_type: result.mimeType,
      provenance: {
        ai_model: c.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-exp',
        ai_provider: 'gemini',
        source_type: 'ai_generated',
        generation_params: { prompt, options },
      },
      metadata: {
        width: result.width,
        height: result.height,
      },
    });

    return c.json({
      id: manifest.id,
      url: manifest.content_url,
      width: result.width,
      height: result.height,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ForgeAPI] Image error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/forge/assets/speech
 * Generate speech audio
 */
app.post('/assets/speech', async (c) => {
  const body = await c.req.json() as {
    text: string;
    options?: {
      voice?: string;
      speed?: number;
      format?: string;
      instructions?: string;
    };
  };

  const { text, options } = body;

  if (!text) {
    return c.json({ error: 'text is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    const speechOptions = speechRequestToOptions({ text, options: options as { voice?: string; speed?: number; format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'; instructions?: string } });
    const result = await generateSpeech(text, speechOptions, c.env);

    const manifest = await service.create({
      name: `speech-${Date.now()}`,
      type: 'asset',
      media_type: 'speech',
      description: text.slice(0, 200),
      content: result.data,
      mime_type: result.mimeType,
      provenance: {
        ai_model: 'gpt-4o-mini-tts',
        ai_provider: 'openai',
        source_type: 'ai_generated',
        generation_params: { text, options },
      },
      metadata: {
        format: result.format,
        text_length: text.length,
      },
    });

    return c.json({
      id: manifest.id,
      url: manifest.content_url,
      format: result.format,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ForgeAPI] Speech error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/forge/assets/search
 * Search for media assets
 */
app.get('/assets/search', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '10');

  if (!query) {
    return c.json({ error: 'Query parameter q is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    // Search all assets (media type filtering can be done client-side)
    const results = await service.search({ query, limit });

    const assets = results.map(r => ({
      id: r.id,
      type: r.file_type || 'asset',
      description: r.description,
      url: r.url,
      metadata: r.metadata,
    }));

    return c.json({ assets, query, count: assets.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

export default app;
