/**
 * Instances API Routes
 *
 * REST API for the Instance Service - enables components to become
 * living, orchestratable entities with mutable props.
 */

import { Hono } from 'hono';
import type {
  Env,
  InstanceVisibility,
  InstanceBinding,
  InstancePlacement,
  CreateInstanceRequest,
} from '../types';
import { InstanceService } from '../services/instances';
import { ComponentService } from '../services/components';

const app = new Hono<{ Bindings: Env }>();

// ===========================================================================
// List Instances
// ===========================================================================

/**
 * GET /api/instances
 * List instances with optional filtering
 */
app.get('/', async (c) => {
  const component_id = c.req.query('component_id');
  const owner_id = c.req.query('owner_id');
  const visibility = c.req.query('visibility') as InstanceVisibility | undefined;
  const location = c.req.query('location');
  const tagsParam = c.req.query('tags');
  const tags = tagsParam ? tagsParam.split(',') : undefined;
  const limit = parseInt(c.req.query('limit') ?? '50', 10);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const baseUrl = new URL(c.req.url).origin;
  const service = new InstanceService(c.env, baseUrl);

  const instances = await service.list({
    component_id,
    owner_id,
    visibility,
    location,
    tags,
    limit: Math.min(limit, 100),
    offset,
  });

  return c.json({ instances });
});

// ===========================================================================
// Create Instance
// ===========================================================================

/**
 * POST /api/instances
 * Create a new instance of a component
 */
app.post('/', async (c) => {
  const body = await c.req.json() as CreateInstanceRequest;

  const { component_id } = body;

  if (!component_id) {
    return c.json({ error: 'component_id is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new InstanceService(c.env, baseUrl);

  try {
    const instance = await service.create(body);
    return c.json(instance, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InstanceAPI] Create error:', message);
    return c.json({ error: message }, 500);
  }
});

// ===========================================================================
// Get Instance
// ===========================================================================

/**
 * GET /api/instances/:id
 * Get an instance by ID
 */
app.get('/:id', async (c) => {
  const id = c.req.param('id');

  const baseUrl = new URL(c.req.url).origin;
  const service = new InstanceService(c.env, baseUrl);

  const instance = await service.get(id);

  if (!instance) {
    return c.json({ error: 'Instance not found' }, 404);
  }

  return c.json(instance);
});

// ===========================================================================
// Update Props
// ===========================================================================

/**
 * PATCH /api/instances/:id/props
 * Partially update instance props (merge with existing)
 */
app.patch('/:id/props', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as Record<string, unknown>;

  const baseUrl = new URL(c.req.url).origin;
  const service = new InstanceService(c.env, baseUrl);

  // Check if instance exists
  if (!(await service.exists(id))) {
    return c.json({ error: 'Instance not found' }, 404);
  }

  try {
    const props = await service.updateProps(id, body);
    return c.json({ props });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InstanceAPI] Update props error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * PUT /api/instances/:id/props
 * Replace all instance props
 */
app.put('/:id/props', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as Record<string, unknown>;

  const baseUrl = new URL(c.req.url).origin;
  const service = new InstanceService(c.env, baseUrl);

  // Check if instance exists
  if (!(await service.exists(id))) {
    return c.json({ error: 'Instance not found' }, 404);
  }

  try {
    const props = await service.replaceProps(id, body);
    return c.json({ props });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InstanceAPI] Replace props error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/instances/:id/props
 * Get instance static props (without bindings resolved)
 */
app.get('/:id/props', async (c) => {
  const id = c.req.param('id');

  const baseUrl = new URL(c.req.url).origin;
  const service = new InstanceService(c.env, baseUrl);

  // Check if instance exists
  if (!(await service.exists(id))) {
    return c.json({ error: 'Instance not found' }, 404);
  }

  const props = await service.getProps(id);
  return c.json({ props });
});

/**
 * GET /api/instances/:id/resolved
 * Get instance props with bindings resolved
 *
 * This is Phase 2 - returns static props merged with data fetched from bindings
 */
app.get('/:id/resolved', async (c) => {
  const id = c.req.param('id');

  const baseUrl = new URL(c.req.url).origin;
  const service = new InstanceService(c.env, baseUrl);

  // Check if instance exists
  if (!(await service.exists(id))) {
    return c.json({ error: 'Instance not found' }, 404);
  }

  try {
    const resolved = await service.getResolvedProps(id);
    const bindings = await service.getBindings(id);

    return c.json({
      props: resolved,
      bindings: bindings || {},
      resolved_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InstanceAPI] Resolve error:', message);
    return c.json({ error: message }, 500);
  }
});

// ===========================================================================
// Update Bindings
// ===========================================================================

/**
 * PUT /api/instances/:id/bindings
 * Set instance bindings (replaces all bindings)
 */
app.put('/:id/bindings', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as Record<string, InstanceBinding>;

  const baseUrl = new URL(c.req.url).origin;
  const service = new InstanceService(c.env, baseUrl);

  // Check if instance exists
  if (!(await service.exists(id))) {
    return c.json({ error: 'Instance not found' }, 404);
  }

  try {
    const bindings = await service.setBindings(id, body);
    return c.json({ bindings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InstanceAPI] Set bindings error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/instances/:id/bindings
 * Get instance bindings
 */
app.get('/:id/bindings', async (c) => {
  const id = c.req.param('id');

  const baseUrl = new URL(c.req.url).origin;
  const service = new InstanceService(c.env, baseUrl);

  // Check if instance exists
  if (!(await service.exists(id))) {
    return c.json({ error: 'Instance not found' }, 404);
  }

  const bindings = await service.getBindings(id);
  return c.json({ bindings: bindings ?? {} });
});

// ===========================================================================
// Update Instance Metadata
// ===========================================================================

/**
 * PATCH /api/instances/:id
 * Update instance metadata (name, visibility, placement, etc.)
 */
app.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json() as {
    name?: string;
    visibility?: InstanceVisibility;
    placement?: InstancePlacement;
    upgrade_strategy?: 'pin' | 'minor' | 'latest';
    component_version?: number;
  };

  const baseUrl = new URL(c.req.url).origin;
  const service = new InstanceService(c.env, baseUrl);

  // Check if instance exists
  if (!(await service.exists(id))) {
    return c.json({ error: 'Instance not found' }, 404);
  }

  try {
    const instance = await service.updateMetadata(id, body);
    return c.json(instance);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InstanceAPI] Update metadata error:', message);
    return c.json({ error: message }, 500);
  }
});

// ===========================================================================
// Delete Instance
// ===========================================================================

/**
 * DELETE /api/instances/:id
 * Delete an instance
 */
app.delete('/:id', async (c) => {
  const id = c.req.param('id');

  const baseUrl = new URL(c.req.url).origin;
  const service = new InstanceService(c.env, baseUrl);

  // Check if instance exists
  if (!(await service.exists(id))) {
    return c.json({ error: 'Instance not found' }, 404);
  }

  try {
    await service.delete(id);
    return c.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InstanceAPI] Delete error:', message);
    return c.json({ error: message }, 500);
  }
});

// ===========================================================================
// Live Endpoint
// ===========================================================================

/**
 * GET /api/instances/:id/live
 * Serve the instance with injected props
 *
 * This is the key endpoint for the Social Magnetics vision - components
 * rendered with their current props, updated without regeneration.
 */
app.get('/:id/live', async (c) => {
  const id = c.req.param('id');

  const baseUrl = new URL(c.req.url).origin;
  const instanceService = new InstanceService(c.env, baseUrl);
  const componentService = new ComponentService(c.env, baseUrl);

  // 1. Get the instance
  const instance = await instanceService.get(id);
  if (!instance) {
    return c.json({ error: 'Instance not found' }, 404);
  }

  try {
    // 2. Get the component preview HTML
    // TODO: Support component versioning with component_version
    const preview = await componentService.getDraftPreview(instance.component_id);
    if (!preview) {
      return c.json({
        error: 'Component preview not found. The component may need to be regenerated.',
        component_id: instance.component_id,
      }, 404);
    }

    // 3. Get RESOLVED props (static props + bindings)
    // This is the key Phase 2 feature - bindings are resolved and merged
    const resolvedProps = await instanceService.getResolvedProps(id);

    // Also inject the ForgeHost runtime info
    const forgeHost = {
      instance: {
        id: instance.id,
        name: instance.name,
        placement: instance.placement,
      },
    };

    // Find and replace the demo props in the HTML
    const propsPattern = /window\.__FORGE_DEMO_PROPS__\s*=\s*\{[\s\S]*?\};/;
    const hostPattern = /window\.__FORGE_HOST__\s*=\s*\{[\s\S]*?\};/;

    let html = preview;

    // Replace demo props with resolved props (includes binding data)
    if (propsPattern.test(html)) {
      html = html.replace(
        propsPattern,
        `window.__FORGE_DEMO_PROPS__ = ${JSON.stringify(resolvedProps, null, 2)};`
      );
    } else {
      // If no demo props placeholder, inject before the closing </head>
      const propsScript = `<script>window.__FORGE_DEMO_PROPS__ = ${JSON.stringify(resolvedProps, null, 2)};</script>`;
      html = html.replace('</head>', `${propsScript}\n</head>`);
    }

    // Inject ForgeHost info
    if (hostPattern.test(html)) {
      html = html.replace(
        hostPattern,
        `window.__FORGE_HOST__ = ${JSON.stringify(forgeHost, null, 2)};`
      );
    } else {
      // Inject ForgeHost after the demo props
      const hostScript = `\n    window.__FORGE_HOST__ = ${JSON.stringify(forgeHost, null, 2)};`;
      html = html.replace(
        /window\.__FORGE_DEMO_PROPS__\s*=\s*\{[\s\S]*?\};/,
        (match) => `${match}${hostScript}`
      );
    }

    // 4. Serve the HTML
    return c.html(html);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InstanceAPI] Live error:', message);
    return c.json({ error: message }, 500);
  }
});

// ===========================================================================
// Bulk Operations
// ===========================================================================

/**
 * PATCH /api/instances/bulk
 * Bulk update props for instances matching criteria
 */
app.patch('/bulk', async (c) => {
  const component_id = c.req.query('component_id');
  const location = c.req.query('location');
  const tagsParam = c.req.query('tags');
  const tags = tagsParam ? tagsParam.split(',') : undefined;
  const visibility = c.req.query('visibility') as InstanceVisibility | undefined;

  const body = await c.req.json() as { props: Record<string, unknown> };

  if (!body.props) {
    return c.json({ error: 'props object is required' }, 400);
  }

  // Require at least one filter
  if (!component_id && !location && !tags && !visibility) {
    return c.json({
      error: 'At least one filter required: component_id, location, tags, or visibility',
    }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new InstanceService(c.env, baseUrl);

  try {
    const result = await service.bulkUpdateProps(
      { component_id, location, tags, visibility },
      body.props
    );
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InstanceAPI] Bulk update error:', message);
    return c.json({ error: message }, 500);
  }
});

export default app;
