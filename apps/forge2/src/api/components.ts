/**
 * Components API Routes
 *
 * REST API for the new Component model with draft/publish workflow.
 */

import { Hono } from 'hono';
import type { Env, ComponentType } from '../types';
import { ComponentService } from '../services/components';

const app = new Hono<{ Bindings: Env }>();

// ===========================================================================
// List & Search
// ===========================================================================

/**
 * GET /api/components
 * List components with optional filtering
 */
app.get('/', async (c) => {
  const status = c.req.query('status') as 'draft' | 'published' | undefined;
  const type = c.req.query('type') as ComponentType | undefined;
  const file_type = c.req.query('file_type');
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  const components = await service.list({
    status,
    type,
    file_type,
    limit: Math.min(limit, 100),
    offset,
  });

  return c.json({ components });
});

/**
 * GET /api/components/search
 * Search for published components by semantic similarity
 */
app.get('/search', async (c) => {
  const query = c.req.query('q') ?? c.req.query('query');
  if (!query) {
    return c.json({ error: 'Query parameter "q" is required' }, 400);
  }

  const type = c.req.query('type') as ComponentType | undefined;
  const file_type = c.req.query('file_type');
  const media_type = c.req.query('media_type');
  const limit = parseInt(c.req.query('limit') ?? '10', 10);

  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  const results = await service.search({
    query,
    type,
    file_type,
    media_type,
    limit: Math.min(limit, 50),
  });

  return c.json({ results });
});

// ===========================================================================
// Create
// ===========================================================================

/**
 * POST /api/components
 * Create a new component (starts as draft)
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
    provenance,
    metadata,
    dependencies,
    creator,
  } = body;

  // Validate required fields
  if (!type || !description || content === undefined) {
    return c.json({
      error: 'Required fields: type, description, content',
    }, 400);
  }

  if (!['file', 'bundle', 'asset'].includes(type)) {
    return c.json({
      error: 'type must be one of: file, bundle, asset',
    }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  try {
    const result = await service.create({
      name,
      type,
      file_type,
      media_type,
      description,
      content,
      mime_type,
      provenance,
      metadata,
      dependencies,
      creator,
    });

    return c.json(result, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Components] Create error:', message);
    return c.json({ error: message }, 500);
  }
});

// ===========================================================================
// Get Component
// ===========================================================================

/**
 * GET /api/components/:id
 * Get a component by ID (returns draft if exists, else latest version)
 */
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  const result = await service.get(id);
  if (!result) {
    return c.json({ error: 'Component not found' }, 404);
  }

  return c.json(result);
});

/**
 * GET /api/components/:id/content
 * Get the current content (draft if exists, else latest version)
 */
app.get('/:id/content', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  // Try draft first
  const draftContent = await service.getDraftContent(id);
  if (draftContent) {
    return new Response(draftContent, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Get component to find latest version
  const result = await service.get(id);
  if (!result) {
    return c.json({ error: 'Component not found' }, 404);
  }

  if ('version' in result) {
    const content = await service.getVersionContent(id, result.version.version);
    if (content) {
      return new Response(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
  }

  return c.json({ error: 'Content not found' }, 404);
});

// ===========================================================================
// Update Draft
// ===========================================================================

/**
 * PUT /api/components/:id
 * Update a component's draft (creates draft if needed)
 */
app.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const { description, content, metadata, dependencies, provenance } = body;

  if (content === undefined) {
    return c.json({ error: 'content is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  try {
    const result = await service.updateDraft({
      component_id: id,
      description,
      content,
      metadata,
      dependencies,
      provenance,
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return c.json({ error: message }, 404);
    }
    console.error('[Components] Update error:', message);
    return c.json({ error: message }, 500);
  }
});

// ===========================================================================
// Publish
// ===========================================================================

/**
 * POST /api/components/:id/publish
 * Publish the current draft as a new version
 */
app.post('/:id/publish', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));

  const { changelog } = body;

  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  try {
    const result = await service.publish({
      component_id: id,
      changelog,
    });

    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('not found')) {
      return c.json({ error: message }, 404);
    }
    if (message.includes('no draft')) {
      return c.json({ error: message }, 400);
    }
    console.error('[Components] Publish error:', message);
    return c.json({ error: message }, 500);
  }
});

// ===========================================================================
// Versions
// ===========================================================================

/**
 * GET /api/components/:id/versions
 * Get version history for a component
 */
app.get('/:id/versions', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  const versions = await service.getVersionHistory(id);

  return c.json({ versions });
});

/**
 * GET /api/components/:id/versions/:version
 * Get a specific version
 */
app.get('/:id/versions/:version', async (c) => {
  const id = c.req.param('id');
  const versionStr = c.req.param('version');
  const versionNum = parseInt(versionStr, 10);

  if (isNaN(versionNum)) {
    return c.json({ error: 'Invalid version number' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  const version = await service.getVersion(id, versionNum);
  if (!version) {
    return c.json({ error: 'Version not found' }, 404);
  }

  return c.json(version);
});

/**
 * GET /api/components/:id/versions/:version/content
 * Get content for a specific version
 */
app.get('/:id/versions/:version/content', async (c) => {
  const id = c.req.param('id');
  const versionStr = c.req.param('version');
  const versionNum = parseInt(versionStr, 10);

  if (isNaN(versionNum)) {
    return c.json({ error: 'Invalid version number' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  const content = await service.getVersionContent(id, versionNum);
  if (!content) {
    return c.json({ error: 'Version content not found' }, 404);
  }

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

// ===========================================================================
// Delete
// ===========================================================================

/**
 * DELETE /api/components/:id
 * Delete a component and all its data
 */
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  try {
    const result = await service.delete(id);

    if (!result.deleted && result.errors.includes('Component not found')) {
      return c.json({ error: 'Component not found' }, 404);
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
    console.error('[Components] Delete error:', message);
    return c.json({ error: message }, 500);
  }
});

// ===========================================================================
// Draft Operations
// ===========================================================================

/**
 * GET /api/components/:id/draft
 * Get draft info for a component
 */
app.get('/:id/draft', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  const result = await service.get(id);
  if (!result) {
    return c.json({ error: 'Component not found' }, 404);
  }

  if (!('draft' in result)) {
    return c.json({ error: 'Component has no draft' }, 404);
  }

  return c.json(result.draft);
});

/**
 * GET /api/components/:id/draft/content
 * Get draft content
 */
app.get('/:id/draft/content', async (c) => {
  const id = c.req.param('id');
  const baseUrl = new URL(c.req.url).origin;
  const service = new ComponentService(c.env, baseUrl);

  const content = await service.getDraftContent(id);
  if (!content) {
    return c.json({ error: 'Draft not found' }, 404);
  }

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
});

export default app;
