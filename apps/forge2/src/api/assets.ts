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

/**
 * DELETE /api/assets/:id
 * Delete an asset from all stores (R2, D1, Vectorize)
 *
 * Note: Assets are immutable, so deletion is typically only used for:
 * - Cleanup of broken/invalid assets
 * - Admin operations
 */
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    const result = await service.delete(id);

    if (!result.deleted && result.errors.includes('Asset not found')) {
      return c.json({ error: 'Asset not found' }, 404);
    }

    if (!result.deleted) {
      return c.json({
        error: 'Deletion partially failed',
        errors: result.errors,
      }, 500);
    }

    return c.json({ success: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Assets] Delete error:', message);
    return c.json({ error: message }, 500);
  }
});

// =============================================================================
// Admin Operations
// =============================================================================

/**
 * POST /api/assets/admin/clear-vectorize
 * DANGER: Deletes ALL vectors from the Vectorize index.
 * Note: This may need to be called multiple times due to eventual consistency.
 */
app.post('/admin/clear-vectorize', async (c) => {
  console.log('[Admin] Starting Vectorize index clear...');

  try {
    let deleted = 0;
    const dummyVector = new Array(768).fill(0); // Match embedding dimensions

    for (let i = 0; i < 20; i++) { // Max 20 iterations
      // Query vectors (max topK is 100)
      const result = await c.env.VECTORIZE.query(dummyVector, {
        topK: 100,
        returnValues: false,
        returnMetadata: 'none',
      });

      if (!result.matches || result.matches.length === 0) {
        break;
      }

      // Delete the vectors by ID
      const ids = result.matches.map(m => m.id);
      await c.env.VECTORIZE.deleteByIds(ids);
      deleted += ids.length;
      console.log(`[Admin] Deleted ${deleted} vectors...`);
    }

    console.log(`[Admin] Vectorize index cleared: ${deleted} vectors deleted`);

    return c.json({
      success: true,
      deleted,
      note: deleted >= 2000 ? 'May need to run again - hit iteration limit' : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Admin] Vectorize clear failed:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/assets/admin/clear-r2
 * DANGER: Deletes ALL objects from the R2 bucket.
 * This is a destructive operation - use with caution!
 * Call multiple times until deleted returns 0.
 */
app.post('/admin/clear-r2', async (c) => {
  console.log('[Admin] Starting R2 bucket clear...');

  try {
    let deleted = 0;

    // List a small batch of objects (to avoid rate limits)
    const listed = await c.env.ASSETS.list({ limit: 100 });

    if (listed.objects.length === 0) {
      return c.json({
        success: true,
        deleted: 0,
        message: 'Bucket is empty',
      });
    }

    // Delete each object in this batch
    for (const obj of listed.objects) {
      await c.env.ASSETS.delete(obj.key);
      deleted++;
    }

    console.log(`[Admin] R2 batch cleared: ${deleted} objects deleted`);

    return c.json({
      success: true,
      deleted,
      hasMore: listed.truncated,
      message: listed.truncated ? 'Call again to delete more' : 'Batch complete',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Admin] R2 clear failed:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/assets/admin/reindex-dependencies
 * Reindex dependencies for all existing TSX/JSX components.
 *
 * This is a migration endpoint to backfill dependency information
 * for components created before dependency tracking was implemented.
 *
 * Returns a summary of the operation:
 * - scanned: Total assets examined
 * - updated: Assets with newly extracted dependencies
 * - skipped: Non-TSX/JSX assets or unchanged dependencies
 * - errors: Any errors encountered
 */
app.post('/admin/reindex-dependencies', async (c) => {
  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  console.log('[Admin] Starting dependency reindex...');

  try {
    const result = await service.reindexDependencies();

    console.log(`[Admin] Dependency reindex complete:`, result);

    return c.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Admin] Dependency reindex failed:', message);
    return c.json({ error: message }, 500);
  }
});

export default app;
