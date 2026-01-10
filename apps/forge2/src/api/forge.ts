/**
 * Forge-Compatible MCP API Routes
 *
 * Provides backwards-compatible API endpoints matching the original Forge API.
 * This allows mcp.entrained.ai to work with Forge 2.0 without changes.
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { ComponentService } from '../services/components';
import { BundlerService } from '../services/bundler';
import type { GenerationReference } from '../types';
import {
  generateFile,
  updateFile,
  generateImage,
  imageRequestToOptions,
  generateSpeech,
  speechRequestToOptions,
  generateCssForComponent,
  parseSource,
  getMimeType,
  generateCompletion,
  resolveReferences,
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
        forge_create: 'Create new component DRAFT (AI generates code) → returns preview_url, NOT searchable yet',
        forge_upload: 'Upload YOUR code directly (no AI) → creates DRAFT with preview_url',
        forge_update: 'Modify draft via natural language (AI) → overwrites draft, returns preview_url',
        forge_update_source: 'Replace/patch draft source directly → returns preview_url (supports edits array!)',
        forge_upload_update: 'Update draft with your code (no AI) → returns preview_url',
        forge_publish: 'Publish draft → creates immutable version, NOW searchable via forge_search',
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

    workflow: {
      description: 'Draft/Publish workflow for components',
      steps: [
        '1. forge_create → Creates draft (not searchable, has preview_url)',
        '2. forge_update → Updates draft (overwrites, still not searchable)',
        '3. forge_publish → Publishes draft → version 1 (NOW searchable)',
        '4. forge_update on published → Creates draft for next version',
        '5. forge_publish → Publishes as version 2, 3, etc.',
      ],
      key_points: [
        'Drafts are NOT searchable - iterate freely without polluting search',
        'preview_url works immediately for live testing',
        'Publish when ready to make component discoverable',
        'Each publish creates immutable version (v1, v2, ...)',
      ],
    },

    versioning: {
      description: 'Components use draft/publish versioning with semantic versioning',
      format: {
        component_id: 'Short UUID like "ebc7-4f2a"',
        version_id: '"ebc7-4f2a-v1", "ebc7-4f2a-v2", etc.',
        semver: '"1.0.0", "1.1.0", "2.0.0" - controlled via bump parameter',
      },
      states: {
        draft: 'Mutable, not searchable, has preview_url',
        published: 'Immutable versions, searchable via forge_search',
      },
      publish_options: {
        changelog: 'Optional description of changes in this version',
        bump: '"major" | "minor" | "patch" (default: patch) - controls semver increment',
      },
      example: 'forge_publish({ id: "abc-1234", changelog: "Added dark mode", bump: "minor" }) → v2, semver 1.1.0',
    },

    generation: {
      files: 'AI generates TSX/CSS with rich metadata (props, css_classes, demo_props)',
      images: 'Gemini generates images with style presets (illustration, photo, 3d, pixel-art)',
      speech: 'OpenAI TTS with 13 voices and custom instructions',
      apps: 'Full orchestration: Plan → Generate Components → Generate CSS → Generate Media → Compose → Deploy',
    },

    references: {
      description: 'Provide context to AI during generation (forge_create, forge_update)',
      purpose: 'Match existing design systems, follow guidelines, or use components as style references',
      types: {
        component: 'Reference another component for style/behavior matching',
        css: 'Provide CSS/design system variables to follow',
        guidelines: 'Text guidelines (brand rules, design principles)',
        image: 'Visual reference (mockup, screenshot)',
      },
      usage: {
        component_ref: '{ type: "component", id: "abc-1234", use: "style" | "behavior" | "both" }',
        css_inline: '{ type: "css", content: ":root { --primary: blue; }" }',
        css_by_id: '{ type: "css", id: "design-system-css-abc" }',
        guidelines: '{ type: "guidelines", content: "Use rounded corners, avoid shadows" }',
        image: '{ type: "image", url: "https://...", description: "Match this layout" }',
      },
      example: 'forge_create({ description: "A card component", references: [{ type: "component", id: "existing-card", use: "style" }] })',
      stored_in: 'References are stored in version provenance for debugging/reproducibility',
    },

    externalLibraries: {
      description: 'Components can import external libraries - they are automatically loaded from CDN',
      howToUse: 'Just import normally: import * as THREE from "three" or import { gsap } from "gsap"',
      supported: {
        '3D Graphics': ['three (Three.js)'],
        'Data Visualization': ['d3', 'chart.js', 'plotly.js', 'plotly.js-dist'],
        'Animation': ['gsap', 'animejs', 'anime', 'framer-motion'],
        'Audio': ['tone (Tone.js)'],
        'Canvas/Graphics': ['p5', 'fabric', 'konva', 'react-konva'],
        'Maps': ['leaflet', 'mapbox-gl'],
        'Physics': ['matter-js'],
        'Math': ['mathjs'],
        'Utilities': ['lodash', 'axios', 'dayjs', 'moment', 'uuid'],
        'Rich Text': ['marked', 'highlight.js'],
        'Other': ['qrcode'],
      },
    },

    editMode: {
      description: 'forge_update_source supports efficient patch editing (like Claude Code\'s Edit tool)',
      fullReplacement: '{ source: "entire new code" }',
      patchMode: '{ edits: [{ old: "find this", new: "replace with" }, ...] }',
      rules: [
        'Each "old" string must be unique (found exactly once)',
        'Multiple edits can be batched in one call',
        'Failed edits return helpful error messages',
      ],
      example: {
        id: 'my-component-v1-abc',
        edits: [
          { old: 'const count = 0;', new: 'const count = 10;' },
          { old: 'color: blue', new: 'color: red' },
        ],
      },
    },

    previewUrls: {
      description: 'All create/update tools now return preview_url automatically!',
      noComposeNeeded: 'For single components, use the preview_url directly - no need to forge_compose',
      includes: ['forge_create', 'forge_upload', 'forge_update', 'forge_update_source', 'forge_upload_update'],
    },

    bestPractices: [
      'Search for existing components before creating new ones (forge_search only returns PUBLISHED)',
      'Use forge_get_manifest to understand component interfaces',
      'Use edits array in forge_update_source for small changes (more efficient than full source)',
      'All create/update tools return preview_url - test before publishing!',
      'Use forge_upload when YOU write the code, forge_create when you want AI to generate it',
      'Iterate on drafts freely - they dont pollute search results',
      'Call forge_publish when component is ready to be discoverable',
      'Use references to maintain consistent style across components (pass your design system CSS)',
      'Use bump parameter in forge_publish: patch for fixes, minor for features, major for breaking changes',
      'Asset generation is cached - same inputs return cached results',
      'External libraries (Three.js, D3, GSAP, etc.) are auto-loaded from CDN - just import them!',
    ],
  });
});

// =============================================================================
// Raw Source Upload (No AI)
// =============================================================================

/**
 * POST /api/forge/upload
 * Upload raw source code and automatically extract metadata.
 * This is for Claude Chat to hand off source without using our AI for generation.
 *
 * The metadata (props, css_classes, exports, demo_props) is extracted from
 * the source code itself, not generated by AI.
 */
app.post('/upload', async (c) => {
  const body = await c.req.json() as {
    /** Raw source code */
    source: string;
    /** File type (tsx, ts, css, jsx, js, etc.) */
    file_type: string;
    /** Optional name for the component */
    name?: string;
    /** Optional description */
    description?: string;
    /** Optional: generate CSS automatically for TSX components */
    generate_css?: boolean;
    /** Optional: generate preview bundle */
    generate_preview?: boolean;
    /** Optional style hints for CSS generation */
    style?: string;
  };

  const { source, file_type, name, description, generate_css = true, generate_preview = true, style } = body;

  if (!source) {
    return c.json({ error: 'source is required' }, 400);
  }

  if (!file_type) {
    return c.json({ error: 'file_type is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    // Parse source to extract metadata
    const parsed = parseSource(source, file_type);
    console.log(`[ForgeAPI] Parsed source: ${parsed.lines} lines, ${parsed.characters} chars`);

    // Build metadata from parsed source
    const metadata: Record<string, unknown> = {
      lines: parsed.lines,
      characters: parsed.characters,
    };

    // Add TSX-specific metadata
    if (parsed.tsx) {
      metadata.props = parsed.tsx.props;
      metadata.css_classes = parsed.tsx.css_classes;
      metadata.exports = parsed.tsx.exports;
      metadata.demo_props = parsed.tsx.demo_props;
      console.log(`[ForgeAPI] TSX metadata: ${parsed.tsx.props.length} props, ${parsed.tsx.css_classes.length} css_classes, ${parsed.tsx.dependencies.length} dependencies`);
    }

    // Add CSS-specific metadata
    if (parsed.css) {
      metadata.classes_defined = parsed.css.classes_defined;
      metadata.variables_defined = parsed.css.variables_defined;
      metadata.keyframes_defined = parsed.css.keyframes_defined;
    }

    // Create component draft using ComponentService
    const result = await componentService.create({
      name,
      type: 'file',
      file_type,
      description: description || `Uploaded ${file_type} file`,
      content: source,
      mime_type: getMimeType(file_type),
      provenance: {
        source_type: 'manual',
        generation_params: {
          upload_method: 'raw_source',
          generate_css,
          generate_preview,
        },
      },
      metadata,
      dependencies: parsed.tsx?.dependencies ?? [],
    });

    console.log(`[ForgeAPI] Created component draft: ${result.component.id}`);

    // Auto-generate CSS for TSX components if requested
    let cssContent: string | undefined;
    let cssUrl: string | undefined;
    const css_classes = parsed.tsx?.css_classes;

    if (generate_css && (file_type === 'tsx' || file_type === 'jsx') && css_classes && css_classes.length > 0) {
      console.log(`[ForgeAPI] Auto-generating CSS for ${css_classes.length} classes`);
      try {
        const cssResult = await generateCssForComponent(
          css_classes,
          description || result.component.canonical_name,
          style,
          c.env,
          source  // Pass source code for accurate CSS generation
        );

        // Store CSS in draft location
        cssUrl = await componentService.storeDraftCss(result.component.id, cssResult.content);
        cssContent = cssResult.content;
        console.log(`[ForgeAPI] Created CSS for: ${result.component.id}`);
      } catch (cssError) {
        const errMsg = cssError instanceof Error ? cssError.message : String(cssError);
        console.error('[ForgeAPI] CSS generation failed:', errMsg);
      }
    }

    // Auto-generate preview bundle if requested
    let previewUrl: string | undefined;
    if (generate_preview && (file_type === 'tsx' || file_type === 'jsx')) {
      try {
        console.log('[ForgeAPI] Generating preview bundle...');
        const bundler = new BundlerService(c.env, baseUrl);

        const bundleResult = await bundler.bundleFromSource({
          name: result.component.canonical_name,
          description: description || result.component.canonical_name,
          source: source,
          fileType: file_type,
          inlineCss: cssContent,
          demoProps: parsed.tsx?.demo_props,
        });

        // Store preview in draft location
        previewUrl = await componentService.storeDraftPreview(result.component.id, bundleResult.html);
        console.log(`[ForgeAPI] Preview created for: ${result.component.id}`);
      } catch (previewError) {
        const errMsg = previewError instanceof Error ? previewError.message : String(previewError);
        console.error('[ForgeAPI] Preview generation failed:', errMsg);
      }
    }

    return c.json({
      // New component model fields
      component_id: result.component.id,
      id: result.component.id, // Backwards compatibility
      name: result.component.canonical_name,
      status: result.component.status,
      has_draft: result.component.has_draft,
      description: result.component.description,
      file_type,
      source_url: `${baseUrl}/api/forge/${result.component.id}/source`,
      content_url: result.draft?.content_url,
      preview_url: previewUrl || result.preview_url,
      // Extracted metadata
      props: parsed.tsx?.props,
      css_classes: parsed.tsx?.css_classes,
      exports: parsed.tsx?.exports,
      demo_props: parsed.tsx?.demo_props,
      dependencies: parsed.tsx?.dependencies ?? [],
      // CSS info if generated
      css: cssUrl ? {
        id: `${result.component.id}-css`,
        content_url: cssUrl,
      } : undefined,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ForgeAPI] Upload error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * PUT /api/forge/upload/:id
 * Update an existing component with new raw source.
 * Updates the draft (no new version until publish).
 */
app.put('/upload/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as {
    source: string;
    description?: string;
    generate_css?: boolean;
    generate_preview?: boolean;
    style?: string;
  };

  const { source, description, generate_css = true, generate_preview = true, style } = body;

  if (!source) {
    return c.json({ error: 'source is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    // Get the existing component
    const result = await componentService.get(id);
    if (!result) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    const { component } = result;
    const file_type = component.file_type || 'tsx';

    // Parse new source to extract metadata
    const parsed = parseSource(source, file_type);
    console.log(`[ForgeAPI] Parsed updated source: ${parsed.lines} lines`);

    // Build metadata
    const metadata: Record<string, unknown> = {
      lines: parsed.lines,
      characters: parsed.characters,
    };

    if (parsed.tsx) {
      metadata.props = parsed.tsx.props;
      metadata.css_classes = parsed.tsx.css_classes;
      metadata.exports = parsed.tsx.exports;
      metadata.demo_props = parsed.tsx.demo_props;
      if (parsed.tsx.dependencies.length > 0) {
        console.log(`[ForgeAPI] Dependencies: ${parsed.tsx.dependencies.join(', ')}`);
      }
    }

    if (parsed.css) {
      metadata.classes_defined = parsed.css.classes_defined;
      metadata.variables_defined = parsed.css.variables_defined;
      metadata.keyframes_defined = parsed.css.keyframes_defined;
    }

    // Update draft with new source
    const updateResult = await componentService.updateDraft({
      component_id: id,
      description,
      content: source,
      metadata,
      provenance: {
        source_type: 'manual',
        generation_params: {
          upload_method: 'raw_source_update',
        },
      },
      dependencies: parsed.tsx?.dependencies ?? [],
    });

    console.log(`[ForgeAPI] Updated draft for: ${id}`);

    // Auto-generate CSS if requested
    let cssContent: string | undefined;
    let cssUrl: string | undefined;
    const css_classes = parsed.tsx?.css_classes;

    if (generate_css && (file_type === 'tsx' || file_type === 'jsx') && css_classes && css_classes.length > 0) {
      try {
        const cssResult = await generateCssForComponent(
          css_classes,
          description || component.description,
          style,
          c.env,
          source  // Pass source code for accurate CSS generation
        );

        // Store CSS in draft location
        cssUrl = await componentService.storeDraftCss(id, cssResult.content);
        cssContent = cssResult.content;
        console.log(`[ForgeAPI] Created CSS for: ${id}`);
      } catch (cssError) {
        console.error('[ForgeAPI] CSS generation failed:', cssError);
      }
    }

    // Auto-generate preview if requested
    let previewUrl: string | undefined;
    if (generate_preview && (file_type === 'tsx' || file_type === 'jsx')) {
      try {
        const bundler = new BundlerService(c.env, baseUrl);

        const bundleResult = await bundler.bundleFromSource({
          name: component.canonical_name,
          description: description || component.description,
          source: source,
          fileType: file_type,
          inlineCss: cssContent,
          demoProps: parsed.tsx?.demo_props,
        });

        // Store preview in draft location
        previewUrl = await componentService.storeDraftPreview(id, bundleResult.html);
        console.log(`[ForgeAPI] Preview created for: ${id}`);
      } catch (previewError) {
        console.error('[ForgeAPI] Preview generation failed:', previewError);
      }
    }

    return c.json({
      id: component.id,
      name: component.canonical_name,
      status: component.status,
      has_draft: true,
      source_url: `${baseUrl}/api/forge/${component.id}/source`,
      content_url: updateResult.draft.content_url,
      preview_url: previewUrl,
      props: parsed.tsx?.props,
      css_classes: parsed.tsx?.css_classes,
      exports: parsed.tsx?.exports,
      demo_props: parsed.tsx?.demo_props,
      dependencies: parsed.tsx?.dependencies ?? [],
      css: cssUrl ? {
        id: `${component.id}-css`,
        content_url: cssUrl,
      } : undefined,
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ForgeAPI] Upload update error:', message);
    return c.json({ error: message }, 500);
  }
});

// =============================================================================
// Search
// =============================================================================

/**
 * GET /api/forge/search
 * Search for PUBLISHED components by natural language
 * Note: Drafts are NOT searchable - only published components appear here
 */
app.get('/search', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '10');
  const type = c.req.query('type') as 'file' | 'bundle' | 'asset' | undefined;
  const file_type = c.req.query('file_type');

  if (!query) {
    return c.json({ error: 'Query parameter q is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    // Search only published components (drafts not included)
    const results = await componentService.search({
      query,
      limit,
      type,
      file_type,
    });

    // Map to forge-style response
    const components = results.map(r => ({
      component_id: r.component_id,
      id: r.component_id, // Backwards compatibility
      name: r.metadata.canonical_name,
      description: r.metadata.description,
      type: r.metadata.type,
      file_type: r.metadata.file_type,
      latest_version: r.metadata.latest_version,
      score: r.score,
      url: `${baseUrl}/api/components/${r.component_id}`,
    }));

    return c.json({
      components,
      query,
      count: components.length,
      note: 'Only published components are searchable. Use forge_publish to make a draft discoverable.',
    });
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
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    const result = await componentService.get(id);
    if (!result) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    const { component } = result;

    // Get metadata from draft or version
    let metadata: Record<string, unknown> = {};
    let contentUrl: string;

    if ('draft' in result && result.draft) {
      metadata = result.draft.metadata ?? {};
      contentUrl = result.draft.content_url;
    } else if ('version' in result && result.version) {
      metadata = result.version.metadata ?? {};
      contentUrl = result.version.content_url;
    } else {
      contentUrl = `${baseUrl}/api/forge/${id}/source`;
    }

    // Map to forge-style manifest
    return c.json({
      id: component.id,
      name: component.canonical_name,
      description: component.description,
      version: component.latest_version,
      file_type: component.file_type,
      status: component.status,
      has_draft: component.has_draft,
      created_at: component.created_at,
      // Component-specific fields from metadata
      props: metadata.props,
      demo_props: metadata.demo_props,
      css_classes: metadata.css_classes,
      exports: metadata.exports,
      // URLs
      source_url: `${baseUrl}/api/forge/${component.id}/source`,
      content_url: contentUrl,
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
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    // First check if component exists and has draft
    const result = await componentService.get(id);
    if (!result) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    // Get content - prefer draft, fall back to latest version
    let content: string | null = null;

    if ('draft' in result && result.draft) {
      content = await componentService.getDraftContent(id);
    }

    if (!content && result.component.latest_version > 0) {
      content = await componentService.getVersionContent(id, result.component.latest_version);
    }

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
 * GET /api/forge/:id/preview
 * Get component preview HTML (serves the draft preview)
 */
app.get('/:id/preview', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    const preview = await componentService.getDraftPreview(id);
    if (!preview) {
      return c.json({ error: `Preview not found: ${id}` }, 404);
    }

    return c.html(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/forge/:id/styles.css
 * Get component CSS (serves the draft CSS)
 */
app.get('/:id/styles.css', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    const css = await componentService.getDraftCss(id);
    if (!css) {
      return c.json({ error: `CSS not found: ${id}` }, 404);
    }

    return c.text(css, 200, { 'Content-Type': 'text/css' });
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
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    const result = await componentService.get(id);
    if (!result) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    const { component } = result;

    // Get metadata from draft or version
    let metadata: Record<string, unknown> = {};
    if ('draft' in result && result.draft) {
      metadata = result.draft.metadata ?? {};
    } else if ('version' in result && result.version) {
      metadata = result.version.metadata ?? {};
    }

    // Generate basic type definitions from metadata
    const props = metadata.props as Array<{ name: string; type: string; required?: boolean }> | undefined;

    if (!props || props.length === 0) {
      return c.text(`// No props defined for ${component.canonical_name}\nexport default {};`);
    }

    // Generate interface from props
    const propsInterface = props.map(p => {
      const optional = p.required ? '' : '?';
      return `  ${p.name}${optional}: ${p.type || 'unknown'};`;
    }).join('\n');

    const types = `// Auto-generated types for ${component.canonical_name}
export interface Props {
${propsInterface}
}

export default function ${component.canonical_name.replace(/-/g, '')}(props: Props): JSX.Element;
`;

    return c.text(types);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/forge/create
 * Create a new component DRAFT from description
 * The component is NOT searchable until forge_publish is called
 * Automatically generates matching CSS for the component's css_classes
 *
 * Options:
 * - hints.style: Style hints (e.g., "modern", "minimal", "dark")
 * - references: Array of reference material (components, CSS, guidelines, images)
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
    /** Reference material for AI context */
    references?: GenerationReference[];
  };

  const { description, hints, references } = body;

  if (!description) {
    return c.json({ error: 'description is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    // Resolve references (fetch component sources, CSS, etc.)
    let resolvedRefs: GenerationReference[] | undefined;
    if (references?.length) {
      console.log(`[ForgeAPI] Resolving ${references.length} references...`);
      resolvedRefs = await resolveReferences(references, c.env, baseUrl);
      console.log(`[ForgeAPI] Resolved ${resolvedRefs.length} references`);
    }

    // Generate TSX file using AI with resolved references
    const generated = await generateFile(description, 'tsx', {
      style: hints?.style,
      typedReferences: resolvedRefs,
    }, c.env);

    // Create component draft using ComponentService
    const createResult = await componentService.create({
      name: generated.canonical_name,
      type: 'file',
      file_type: 'tsx',
      description,
      content: generated.content,
      mime_type: 'text/typescript',
      provenance: {
        ai_model: generated.model,
        ai_provider: generated.provider,
        source_type: 'ai_generated',
        generation_params: { description, hints },
        references: resolvedRefs,
      },
      metadata: {
        demo_props: generated.demo_props,
        props: generated.props,
        css_classes: generated.css_classes,
        exports: generated.exports,
      },
    });

    console.log(`[ForgeAPI] Created component draft: ${createResult.component.id}`);

    // Auto-generate CSS if component has css_classes
    let cssUrl: string | undefined;
    if (generated.css_classes && generated.css_classes.length > 0) {
      console.log(`[ForgeAPI] Auto-generating CSS for ${generated.css_classes.length} classes`);
      try {
        const cssResult = await generateCssForComponent(
          generated.css_classes,
          description,
          hints?.style,
          c.env,
          generated.content  // Pass source code for accurate CSS generation
        );

        // Store CSS directly in R2 under the component's draft folder
        cssUrl = await componentService.storeDraftCss(createResult.component.id, cssResult.content);
        console.log(`[ForgeAPI] Created CSS: ${cssUrl}`);
      } catch (cssError) {
        const errMsg = cssError instanceof Error ? cssError.message : String(cssError);
        console.error('[ForgeAPI] CSS generation failed:', errMsg);
      }
    }

    // Auto-generate preview bundle
    let previewUrl: string | undefined;
    try {
      console.log(`[ForgeAPI] Generating preview bundle...`);
      const bundler = new BundlerService(c.env, baseUrl);

      // Get CSS content if we generated it
      const cssContent = cssUrl ? await componentService.getDraftCss(createResult.component.id) : undefined;

      const bundleResult = await bundler.bundleFromSource({
        name: `${createResult.component.canonical_name.slice(0, 40)}-demo`,
        source: generated.content,
        fileType: 'tsx',
        demoProps: generated.demo_props as Record<string, unknown>,
        // Pass CSS content directly instead of ID
        ...(cssContent && { inlineCss: cssContent }),
      });

      // Store preview directly in R2 under the component's draft folder
      previewUrl = await componentService.storeDraftPreview(createResult.component.id, bundleResult.html);
      console.log(`[ForgeAPI] Preview created: ${previewUrl}`);
    } catch (previewError) {
      const errMsg = previewError instanceof Error ? previewError.message : String(previewError);
      console.error('[ForgeAPI] Preview generation failed:', errMsg);
    }

    return c.json({
      // New component model fields
      component_id: createResult.component.id,
      id: createResult.component.id, // Backwards compatibility
      name: createResult.component.canonical_name,
      status: createResult.component.status,
      has_draft: createResult.component.has_draft,
      description,
      source_url: `${baseUrl}/api/forge/${createResult.component.id}/source`,
      content_url: createResult.draft?.content_url,
      preview_url: previewUrl || createResult.preview_url,
      props: generated.props,
      css_classes: generated.css_classes,
      css_url: cssUrl,
      // Hint about draft/publish workflow
      note: 'Component created as DRAFT. Call forge_publish to make it searchable.',
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ForgeAPI] Create error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/forge/:id/update
 * Update component draft with AI-generated changes
 * Uses ComponentService for proper draft/publish workflow
 */
app.post('/:id/update', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as {
    changes: string;
    style?: string;
    /** Reference material for AI context */
    references?: GenerationReference[];
  };

  if (!body.changes) {
    return c.json({ error: 'changes is required' }, 400);
  }

  const { references } = body;

  const baseUrl = new URL(c.req.url).origin;
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    // Get component and its current content (draft or latest version)
    const component = await componentService.get(id);
    if (!component) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    // Get current source from draft or latest version
    let currentSource: string | null = null;
    if ('draft' in component && component.draft) {
      currentSource = await componentService.getDraftContent(id);
    } else if ('version' in component && component.version) {
      currentSource = await componentService.getVersionContent(id, component.version.version);
    }

    if (!currentSource) {
      return c.json({ error: `Source not found: ${id}` }, 404);
    }

    // Resolve references (fetch component sources, CSS, etc.)
    let resolvedRefs: GenerationReference[] | undefined;
    if (references?.length) {
      console.log(`[ForgeAPI] Resolving ${references.length} references for update...`);
      resolvedRefs = await resolveReferences(references, c.env, baseUrl);
      console.log(`[ForgeAPI] Resolved ${resolvedRefs.length} references`);
    }

    // Generate updated source with references
    const result = await updateFile(currentSource, body.changes, 'tsx', c.env, {
      typedReferences: resolvedRefs,
    });

    // Update the component's draft
    const updateResult = await componentService.updateDraft({
      component_id: id,
      content: result.content,
      provenance: {
        ai_model: result.model,
        ai_provider: result.provider,
        source_type: 'ai_generated',
        generation_params: {
          changes: body.changes,
          references: resolvedRefs,
        },
        references: resolvedRefs,
      },
      metadata: {
        demo_props: result.demo_props,
        props: result.props,
        css_classes: result.css_classes,
        exports: result.exports,
      },
    });

    console.log(`[ForgeAPI] Updated component draft: ${id}`);

    // Auto-generate CSS if component has css_classes
    let cssUrl: string | undefined;
    if (result.css_classes && result.css_classes.length > 0) {
      console.log(`[ForgeAPI] Auto-generating CSS for updated component: ${result.css_classes.length} classes`);
      try {
        // Pass the NEW source code so CSS generator sees current URLs/content
        const cssResult = await generateCssForComponent(
          result.css_classes,
          component.component.description,
          body.style,
          c.env,
          result.content  // Pass source code for accurate CSS generation
        );

        // Store CSS directly in R2 under the component's draft folder
        cssUrl = await componentService.storeDraftCss(id, cssResult.content);
        console.log(`[ForgeAPI] Created CSS: ${cssUrl}`);
      } catch (cssError) {
        const errMsg = cssError instanceof Error ? cssError.message : String(cssError);
        console.error('[ForgeAPI] CSS generation failed:', errMsg);
      }
    }

    // Auto-generate preview bundle
    let previewUrl: string | undefined;
    try {
      console.log('[ForgeAPI] Generating preview bundle for updated component...');
      const bundler = new BundlerService(c.env, baseUrl);

      // Get CSS content if we generated it
      const cssContent = cssUrl ? await componentService.getDraftCss(id) : undefined;

      const bundleResult = await bundler.bundleFromSource({
        name: `${component.component.canonical_name.slice(0, 40)}-demo`,
        description: `Preview: ${component.component.description}`,
        source: result.content,
        fileType: 'tsx',
        demoProps: result.demo_props as Record<string, unknown>,
        // Pass CSS content directly instead of ID
        ...(cssContent && { inlineCss: cssContent }),
      });

      // Store preview directly in R2 under the component's draft folder
      previewUrl = await componentService.storeDraftPreview(id, bundleResult.html);
      console.log(`[ForgeAPI] Preview created: ${previewUrl}`);
    } catch (previewError) {
      const errMsg = previewError instanceof Error ? previewError.message : String(previewError);
      console.error('[ForgeAPI] Preview generation failed:', errMsg);
    }

    return c.json({
      // New component model fields
      component_id: id,
      id: id, // Backwards compatibility
      name: updateResult.component.canonical_name,
      status: updateResult.component.status,
      has_draft: updateResult.component.has_draft,
      description: updateResult.component.description,
      source_url: `${baseUrl}/api/forge/${id}/source`,
      content_url: updateResult.draft?.content_url,
      preview_url: previewUrl || updateResult.preview_url,
      props: result.props,
      css_classes: result.css_classes,
      css_url: cssUrl,
      // Hint about draft/publish workflow
      note: 'Draft updated. Call forge_publish to create a new version.',
    }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ForgeAPI] Update error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/forge/:id/publish
 * Publish a component's draft to create a new version
 * After publishing, the component is searchable via forge_search
 *
 * Options:
 * - changelog: Description of changes in this version
 * - bump: 'major' | 'minor' | 'patch' (default: 'patch') - semantic version bump
 */
app.post('/:id/publish', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as {
    changelog?: string;
    bump?: 'major' | 'minor' | 'patch';
  };

  const baseUrl = new URL(c.req.url).origin;
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    const result = await componentService.publish({
      component_id: id,
      changelog: body.changelog,
      bump: body.bump,
    });

    return c.json({
      component_id: result.component.id,
      id: result.component.id, // Backwards compatibility
      name: result.component.canonical_name,
      status: result.component.status,
      version: result.version.version,
      semver: result.version.semver,
      changelog: result.version.description,
      description: result.component.description,
      content_url: result.version.content_url,
      manifest_url: result.version.manifest_url,
      created_at: result.version.created_at,
      message: `Published v${result.version.semver} (version ${result.version.version}) - component is now searchable`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return c.json({ error: message }, 404);
    }
    if (message.includes('no draft')) {
      return c.json({ error: message }, 400);
    }
    console.error('[ForgeAPI] Publish error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * PUT /api/forge/:id/source
 * Replace component source directly OR apply patch edits
 * Updates the component's draft (overwrites, no new versions until publish)
 * Also generates CSS and preview automatically!
 *
 * Two modes:
 * 1. Full replacement: { source: "full new source code" }
 * 2. Patch mode: { edits: [{ old: "find this", new: "replace with" }, ...] }
 */
app.put('/:id/source', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as {
    source?: string;
    edits?: Array<{ old: string; new: string }>;
    style?: string;
  };

  if (!body.source && !body.edits) {
    return c.json({ error: 'Either source or edits is required' }, 400);
  }

  if (body.source && body.edits) {
    return c.json({ error: 'Provide either source or edits, not both' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    const result = await componentService.get(id);
    if (!result) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    const { component } = result;
    const file_type = component.file_type || 'tsx';

    // Get current source - prefer draft, fall back to latest version
    let currentSource: string | null = null;
    if ('draft' in result && result.draft) {
      currentSource = await componentService.getDraftContent(id);
    }
    if (!currentSource && component.latest_version > 0) {
      currentSource = await componentService.getVersionContent(id, component.latest_version);
    }

    // Determine the new source - either direct replacement or apply edits
    let newSource: string;

    if (body.source) {
      // Full replacement mode
      newSource = body.source;
    } else {
      // Patch/edit mode - get current source and apply edits
      if (!currentSource) {
        return c.json({ error: `Source not found: ${id}` }, 404);
      }

      newSource = currentSource;
      const failedEdits: Array<{ old: string; reason: string }> = [];

      for (const edit of body.edits!) {
        if (!edit.old) {
          failedEdits.push({ old: '(empty)', reason: 'old string is empty' });
          continue;
        }

        // Check if the old string exists in source
        const occurrences = newSource.split(edit.old).length - 1;

        if (occurrences === 0) {
          failedEdits.push({ old: edit.old.slice(0, 50), reason: 'not found in source' });
          continue;
        }

        if (occurrences > 1) {
          failedEdits.push({ old: edit.old.slice(0, 50), reason: `found ${occurrences} times, must be unique` });
          continue;
        }

        // Apply the edit
        newSource = newSource.replace(edit.old, edit.new);
      }

      if (failedEdits.length > 0) {
        return c.json({
          error: 'Some edits failed to apply',
          failed_edits: failedEdits,
          hint: 'Each "old" string must be unique and exist exactly once in the source',
        }, 400);
      }

      console.log(`[ForgeAPI] Applied ${body.edits!.length} edits to ${component.canonical_name}`);
    }

    // Parse source to extract metadata
    const parsed = parseSource(newSource, file_type);

    // Build metadata
    const metadata: Record<string, unknown> = {
      lines: parsed.lines,
      characters: parsed.characters,
    };

    if (parsed.tsx) {
      metadata.props = parsed.tsx.props;
      metadata.css_classes = parsed.tsx.css_classes;
      metadata.exports = parsed.tsx.exports;
      metadata.demo_props = parsed.tsx.demo_props;
    }

    // Update draft with new source
    const updateResult = await componentService.updateDraft({
      component_id: id,
      content: newSource,
      metadata,
      provenance: {
        source_type: 'manual',
      },
    });

    // Auto-generate CSS if component has css_classes
    let cssContent: string | undefined;
    let cssUrl: string | undefined;
    const css_classes = parsed.tsx?.css_classes;

    if ((file_type === 'tsx' || file_type === 'jsx') && css_classes && css_classes.length > 0) {
      console.log(`[ForgeAPI] Auto-generating CSS for source update: ${css_classes.length} classes`);
      try {
        // Pass the NEW source code so CSS generator sees current URLs/content
        const cssResult = await generateCssForComponent(
          css_classes,
          component.description,
          body.style,
          c.env,
          newSource  // Pass source code for accurate CSS generation
        );

        // Store CSS in draft location
        cssUrl = await componentService.storeDraftCss(id, cssResult.content);
        cssContent = cssResult.content;
        console.log(`[ForgeAPI] Created CSS for: ${id}`);
      } catch (cssError) {
        const errMsg = cssError instanceof Error ? cssError.message : String(cssError);
        console.error('[ForgeAPI] CSS generation failed:', errMsg);
      }
    }

    // Auto-generate preview bundle
    let previewUrl: string | undefined;
    if (file_type === 'tsx' || file_type === 'jsx') {
      try {
        console.log('[ForgeAPI] Generating preview bundle for source update...');
        const bundler = new BundlerService(c.env, baseUrl);

        const bundleResult = await bundler.bundleFromSource({
          name: component.canonical_name,
          description: component.description,
          source: newSource,
          fileType: file_type,
          inlineCss: cssContent,
          demoProps: parsed.tsx?.demo_props,
        });

        // Store preview in draft location
        previewUrl = await componentService.storeDraftPreview(id, bundleResult.html);
        console.log(`[ForgeAPI] Preview created for: ${id}`);
      } catch (previewError) {
        const errMsg = previewError instanceof Error ? previewError.message : String(previewError);
        console.error('[ForgeAPI] Preview generation failed:', errMsg);
      }
    }

    return c.json({
      id: component.id,
      name: component.canonical_name,
      status: component.status,
      has_draft: true,
      source_url: `${baseUrl}/api/forge/${component.id}/source`,
      content_url: updateResult.draft.content_url,
      preview_url: previewUrl,
      props: parsed.tsx?.props,
      css_classes: parsed.tsx?.css_classes,
      css: cssUrl ? {
        id: `${component.id}-css`,
        content_url: cssUrl,
      } : undefined,
    }, 200);
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
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    const result = await componentService.get(id);
    if (!result) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    // In forge2, components are bundled on-demand via esbuild
    // This endpoint just verifies the component is valid
    return c.json({
      id: result.component.id,
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
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    const result = await componentService.get(id);
    if (!result) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    const { component } = result;

    // Get metadata from draft or version
    let metadata: Record<string, unknown> = {};
    if ('draft' in result && result.draft) {
      metadata = result.draft.metadata ?? {};
    } else if ('version' in result && result.version) {
      metadata = result.version.metadata ?? {};
    }

    // Get source - prefer draft, fall back to latest version
    let source: string | null = null;
    if ('draft' in result && result.draft) {
      source = await componentService.getDraftContent(id);
    }
    if (!source && component.latest_version > 0) {
      source = await componentService.getVersionContent(id, component.latest_version);
    }

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
      const cssClasses = metadata.css_classes as string[] | undefined;
      if (!cssClasses || cssClasses.length === 0) {
        suggestions.push('Component uses no CSS classes - consider adding styling');
      }
    }

    return c.json({
      id: component.id,
      name: component.canonical_name,
      version: component.latest_version,
      status: component.status,
      has_draft: component.has_draft,
      file_type: component.file_type,
      metadata: metadata,
      analysis: {
        issues,
        suggestions,
        has_props: !!(metadata.props as unknown[])?.length,
        has_css_classes: !!(metadata.css_classes as unknown[])?.length,
        source_lines: source?.split('\n').length || 0,
        source_bytes: source?.length || 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/forge/:id/review
 * Get AI code review/analysis of a component
 */
app.post('/:id/review', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as { question: string };

  if (!body.question) {
    return c.json({ error: 'question is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    const result = await componentService.get(id);
    if (!result) {
      return c.json({ error: `Component not found: ${id}` }, 404);
    }

    const { component } = result;

    // Get source - prefer draft, fall back to latest version
    let source: string | null = null;
    if ('draft' in result && result.draft) {
      source = await componentService.getDraftContent(id);
    }
    if (!source && component.latest_version > 0) {
      source = await componentService.getVersionContent(id, component.latest_version);
    }

    if (!source) {
      return c.json({ error: `Source not found: ${id}` }, 404);
    }

    // Call LLM for code review
    const systemPrompt = `You are an expert code reviewer specializing in React, TypeScript, and frontend development.
You're reviewing a component and will provide helpful, actionable feedback.

Guidelines:
- Be specific and reference line numbers or code sections when relevant
- Suggest concrete improvements with code examples when appropriate
- Consider performance, accessibility, best practices, and potential bugs
- Be constructive and educational in your feedback
- If the question asks about something specific (like back-face culling), focus on that`;

    const userPrompt = `Here is the component source code for "${component.canonical_name}":

\`\`\`${component.file_type || 'tsx'}
${source}
\`\`\`

${body.question}`;

    const reviewResult = await generateCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { max_tokens: 65536 },
      c.env
    );

    return c.json({
      id: component.id,
      name: component.canonical_name,
      question: body.question,
      review: reviewResult.content,
      model: reviewResult.model,
      provider: reviewResult.provider,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ForgeAPI] Review error:', message);
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
    layout?: string;
    wiring?: Array<{
      source: { component: string; event: string };
      target: { component: string; action: string };
      transform?: string;
    }>;
    styles?: string;
  };

  const { name, description, components, layout, styles } = body;

  if (!name || !description || !components) {
    return c.json({ error: 'name, description, and components are required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const componentService = new ComponentService(c.env, baseUrl);
  const bundler = new BundlerService(c.env, baseUrl);

  try {
    // Get all component IDs
    const fileIds = components.map(comp => comp.id);

    // Bundle them with optional custom layout
    const bundleResult = await bundler.bundle({
      name,
      description,
      files: fileIds,
      template: {
        styles,
        body: layout, // Use layout as custom body HTML if provided
      },
    });

    // Store the bundle as a component draft
    const result = await componentService.create({
      name,
      type: 'bundle',
      description,
      content: bundleResult.html,
      mime_type: 'text/html',
      provenance: {
        source_type: 'ai_generated',
        generation_params: { components: fileIds, composed: true },
      },
      metadata: {
        component_count: components.length,
        js_size: bundleResult.js.length,
        css_size: bundleResult.css.length,
        build_time_ms: bundleResult.buildTimeMs,
      },
    });

    // Store the HTML as a preview
    const previewUrl = await componentService.storeDraftPreview(result.component.id, bundleResult.html);

    return c.json({
      id: result.component.id,
      name: result.component.canonical_name,
      status: result.component.status,
      content_url: previewUrl,
      preview_url: previewUrl,
      components: bundleResult.resolvedFiles.map(f => f.id),
      build_time_ms: bundleResult.buildTimeMs,
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
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    const imageOptions = imageRequestToOptions({ prompt, options });
    const result = await generateImage(prompt, imageOptions, c.env);

    // Store as asset component
    const createResult = await componentService.create({
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
      id: createResult.component.id,
      url: createResult.draft?.content_url ?? `${baseUrl}/api/forge/${createResult.component.id}/source`,
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
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    const speechOptions = speechRequestToOptions({ text, options: options as { voice?: string; speed?: number; format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'; instructions?: string } });
    const result = await generateSpeech(text, speechOptions, c.env);

    // Store as asset component
    const createResult = await componentService.create({
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
      id: createResult.component.id,
      url: createResult.draft?.content_url ?? `${baseUrl}/api/forge/${createResult.component.id}/source`,
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
 * Search for media assets (images, speech)
 * Note: Only searches published assets
 */
app.get('/assets/search', async (c) => {
  const query = c.req.query('q');
  const limit = parseInt(c.req.query('limit') || '10');

  if (!query) {
    return c.json({ error: 'Query parameter q is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const componentService = new ComponentService(c.env, baseUrl);

  try {
    // Search for asset-type components
    const results = await componentService.search({
      query,
      limit,
      type: 'asset',
    });

    const assets = results.map(r => ({
      id: r.component_id,
      type: r.metadata.media_type || 'asset',
      description: r.metadata.description,
      url: `${baseUrl}/api/forge/${r.component_id}/source`,
      score: r.score,
    }));

    return c.json({ assets, query, count: assets.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

export default app;
