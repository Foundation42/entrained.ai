/**
 * Assets API Routes
 *
 * CRUD operations for all asset types (files, bundles, media assets)
 */

import { Hono } from 'hono';
import type { Env, AssetType } from '../types';
import { AssetService } from '../services/assets';

const app = new Hono<{ Bindings: Env }>();

/**
 * GET /api/assets
 * List assets with optional filtering
 */
app.get('/', async (c) => {
  const type = c.req.query('type') as AssetType | undefined;
  const file_type = c.req.query('file_type');
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  const assets = await service.list({
    type,
    file_type,
    limit: Math.min(limit, 100),
    offset,
  });

  return c.json({ assets });
});

/**
 * POST /api/assets
 * Create a new asset
 */
app.post('/', async (c) => {
  const body = await c.req.json();

  const {
    name,
    type,
    file_type,
    media_type,
    description,
    content,
    mime_type,
    parent_id,
    version,
    bump,
    provenance,
    metadata,
  } = body;

  // Validate required fields
  if (!name || !type || !description || content === undefined) {
    return c.json({
      error: 'Required fields: name, type, description, content',
    }, 400);
  }

  if (!['file', 'bundle', 'asset'].includes(type)) {
    return c.json({
      error: 'type must be one of: file, bundle, asset',
    }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    const manifest = await service.create({
      name,
      type,
      file_type,
      media_type,
      description,
      content,
      mime_type,
      parent_id,
      version,
      bump,
      provenance: provenance ?? {
        source_type: 'manual',
      },
      metadata,
    });

    return c.json(manifest, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/assets/:id
 * Get asset manifest by ID or reference
 */
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  // Try to resolve as reference first (handles @latest, @stable, semver)
  const manifest = await service.resolve(id);

  if (!manifest) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  return c.json(manifest);
});

/**
 * GET /api/assets/:id/content
 * Get asset content (file/binary data)
 */
app.get('/:id/content', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  // Get manifest for metadata
  const manifest = await service.get(id);
  if (!manifest) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  // Get content
  const content = await service.getContent(id);
  if (!content) {
    return c.json({ error: 'Content not found' }, 404);
  }

  return new Response(content, {
    headers: {
      'Content-Type': manifest.mime_type ?? 'application/octet-stream',
      'Content-Length': content.byteLength.toString(),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

/**
 * GET /api/assets/:id/source
 * Get asset content as text (for code files)
 */
app.get('/:id/source', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  const content = await service.getContentAsText(id);
  if (!content) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  return c.json({ source: content });
});

/**
 * PUT /api/assets/:id
 * Update an asset (creates new version)
 */
app.put('/:id', async (c) => {
  const parent_id = c.req.param('id');
  const body = await c.req.json();

  const {
    description,
    content,
    bump,
    version,
    provenance,
    metadata,
  } = body;

  if (content === undefined) {
    return c.json({ error: 'content is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    const manifest = await service.update({
      parent_id,
      description,
      content,
      bump,
      version,
      provenance,
      metadata,
    });

    return c.json(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/assets/:name/versions
 * Get all versions of an asset
 */
app.get('/:name/versions', async (c) => {
  const canonical_name = c.req.param('name');
  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  const versions = await service.getVersions(canonical_name);

  return c.json({ versions });
});

/**
 * GET /api/assets/:name/chain
 * Get the full version chain for an asset
 */
app.get('/:name/chain', async (c) => {
  const canonical_name = c.req.param('name');
  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  const chain = await service.getVersionChain(canonical_name);

  return c.json(chain);
});

/**
 * POST /api/assets/:name/refs
 * Set a named ref (stable, dev, etc.)
 */
app.post('/:name/refs', async (c) => {
  const canonical_name = c.req.param('name');
  const body = await c.req.json();

  const { ref_name, asset_id } = body;

  if (!ref_name || !asset_id) {
    return c.json({ error: 'ref_name and asset_id are required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  await service.setRef(canonical_name, ref_name, asset_id);

  return c.json({ success: true });
});

export default app;
