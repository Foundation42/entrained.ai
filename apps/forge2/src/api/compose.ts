/**
 * Compose API Routes
 *
 * Endpoints for composing and bundling multiple files into runnable applications.
 */

import { Hono } from 'hono';
import type { Env, ComposeBundleRequest } from '../types';
import { AssetService, BundlerService, bundleToArtifacts } from '../services';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/compose
 * Compose multiple files into a bundle
 */
app.post('/', async (c) => {
  const body = await c.req.json() as ComposeBundleRequest;
  const { name, description, files, assets, entry } = body;

  if (!name) {
    return c.json({ error: 'name is required' }, 400);
  }

  if (!description) {
    return c.json({ error: 'description is required' }, 400);
  }

  if (!files || files.length === 0) {
    return c.json({ error: 'files array is required and must not be empty' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const bundler = new BundlerService(c.env, baseUrl);
  const assetService = new AssetService(c.env, baseUrl);

  try {
    console.log(`[Compose] Starting bundle: ${name} with ${files.length} files`);

    // Create the bundle
    const bundleOutput = await bundler.bundle({
      name,
      description,
      files,
      assets,
      entry,
      template: {
        title: name,
      },
    });

    // Store the bundle as an asset
    const manifest = await assetService.create({
      name,
      type: 'bundle',
      description,
      content: bundleOutput.html,
      mime_type: 'text/html',
      provenance: {
        source_type: 'ai_generated',
        generation_params: {
          files,
          assets,
          entry,
        },
      },
      metadata: {
        file_count: bundleOutput.resolvedFiles.length,
        asset_count: bundleOutput.resolvedAssets.length,
        js_size: bundleOutput.js.length,
        css_size: bundleOutput.css.length,
        html_size: bundleOutput.html.length,
        resolved_files: bundleOutput.resolvedFiles.map((f) => ({
          ref: f.ref,
          id: f.id,
          fileType: f.fileType,
        })),
        resolved_assets: bundleOutput.resolvedAssets.map((a) => ({
          id: a.id,
          canonical_name: a.canonical_name,
        })),
      },
    });

    console.log(`[Compose] Bundle created: ${manifest.id}`);

    // Generate artifact URLs
    const artifacts = bundleToArtifacts(bundleOutput, manifest.content_url);

    return c.json({
      id: manifest.id,
      url: manifest.content_url,
      version: manifest.version,
      artifacts,
      metadata: manifest.metadata,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Compose] Error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/compose/preview
 * Preview a bundle without saving it
 */
app.post('/preview', async (c) => {
  const body = await c.req.json() as ComposeBundleRequest;
  const { name, description, files, assets, entry } = body;

  if (!files || files.length === 0) {
    return c.json({ error: 'files array is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const bundler = new BundlerService(c.env, baseUrl);

  try {
    const bundleOutput = await bundler.bundle({
      name: name ?? 'Preview',
      description: description ?? 'Preview bundle',
      files,
      assets,
      entry,
    });

    // Return the bundle content directly (useful for previewing)
    return c.html(bundleOutput.html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Compose] Preview error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/compose/:id
 * Get bundle details
 */
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const assetService = new AssetService(c.env, baseUrl);

  const manifest = await assetService.get(id);

  if (!manifest) {
    return c.json({ error: 'Bundle not found' }, 404);
  }

  if (manifest.type !== 'bundle') {
    return c.json({ error: 'Asset is not a bundle' }, 400);
  }

  return c.json({
    id: manifest.id,
    canonical_name: manifest.canonical_name,
    version: manifest.version,
    description: manifest.description,
    url: manifest.content_url,
    created_at: manifest.created_at,
    metadata: manifest.metadata,
  });
});

/**
 * GET /api/compose/:id/run
 * Serve the bundle HTML directly
 */
app.get('/:id/run', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const assetService = new AssetService(c.env, baseUrl);

  const content = await assetService.getContentAsText(id);

  if (!content) {
    return c.json({ error: 'Bundle not found' }, 404);
  }

  return c.html(content);
});

export default app;
