import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Bindings, AuthUser, SynthSchema, ParsedSchema, Patch } from '../types';
import { requireAuth, optionalAuth } from '../lib/auth';
import { generatePatch, type GeneratedPatch } from '../lib/gemini';

type Variables = { user: AuthUser };

export const patchRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Generate a new patch using AI
patchRoutes.post('/generate', requireAuth(), async (c) => {
  const user = c.get('user');

  const body = await c.req.json<{
    schema_id: string;
    prompt: string;
  }>();

  if (!body.schema_id || !body.prompt) {
    return c.json({ error: 'Missing schema_id or prompt' }, 400);
  }

  if (body.prompt.length > 1000) {
    return c.json({ error: 'Prompt too long (max 1000 characters)' }, 400);
  }

  // Fetch the schema
  const schema = await c.env.DB.prepare(
    `SELECT * FROM synth_schemas WHERE id = ?`
  ).bind(body.schema_id).first<SynthSchema>();

  if (!schema) {
    return c.json({ error: 'Schema not found' }, 404);
  }

  // Check access - user must own or schema must be public
  if (!schema.is_public && schema.user_id !== user.id) {
    return c.json({ error: 'Access denied' }, 403);
  }

  const parsedSchema = JSON.parse(schema.schema_json) as ParsedSchema;

  try {
    console.log(`[Patch Generate] User ${user.id} generating patch for ${schema.synth_name}`);

    const generatedPatch = await generatePatch(
      parsedSchema,
      body.prompt,
      c.env.GEMINI_API_KEY,
      c.env.GEMINI_MODEL
    );

    return c.json({
      patch: generatedPatch,
      schema_id: body.schema_id,
      synth_name: `${schema.manufacturer} ${schema.synth_name}`,
      prompt: body.prompt,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Patch Generate] Error: ${errorMessage}`);
    return c.json({ error: `Failed to generate patch: ${errorMessage}` }, 500);
  }
});

// Save a generated patch
patchRoutes.post('/', requireAuth(), async (c) => {
  const user = c.get('user');

  const body = await c.req.json<{
    schema_id: string;
    name: string;
    description?: string;
    patch_json: GeneratedPatch;
    prompt?: string;
  }>();

  if (!body.schema_id || !body.name || !body.patch_json) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  // Verify schema exists
  const schema = await c.env.DB.prepare(
    `SELECT id, user_id, is_public FROM synth_schemas WHERE id = ?`
  ).bind(body.schema_id).first<{ id: string; user_id: string; is_public: number }>();

  if (!schema) {
    return c.json({ error: 'Schema not found' }, 404);
  }

  // Check access
  if (!schema.is_public && schema.user_id !== user.id) {
    return c.json({ error: 'Access denied' }, 403);
  }

  const patchId = nanoid();
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `INSERT INTO patches (id, user_id, schema_id, name, description, patch_json, reasoning, generation_model, is_public, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    patchId,
    user.id,
    body.schema_id,
    body.name,
    body.description || null,
    JSON.stringify(body.patch_json),
    body.prompt || null,  // Store the original prompt as reasoning
    'gemini-3-pro-preview',
    1,  // Public by default
    now,
    now
  ).run();

  return c.json({
    id: patchId,
    message: 'Patch saved successfully'
  }, 201);
});

// Get user's patches
patchRoutes.get('/mine', requireAuth(), async (c) => {
  const user = c.get('user');
  const schemaId = c.req.query('schema_id');

  let query = `
    SELECT p.*, s.manufacturer, s.synth_name
    FROM patches p
    JOIN synth_schemas s ON p.schema_id = s.id
    WHERE p.user_id = ?
  `;
  const params: (string | number)[] = [user.id];

  if (schemaId) {
    query += ` AND p.schema_id = ?`;
    params.push(schemaId);
  }

  query += ` ORDER BY p.created_at DESC`;

  const result = await c.env.DB.prepare(query).bind(...params).all<Patch & { manufacturer: string; synth_name: string }>();

  return c.json(result.results.map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    manufacturer: p.manufacturer,
    synth_name: p.synth_name,
    schema_id: p.schema_id,
    is_public: p.is_public,
    created_at: p.created_at,
  })));
});

// Get a single patch
patchRoutes.get('/:id', optionalAuth(), async (c) => {
  const patchId = c.req.param('id');
  const user = c.get('user');

  // Don't match 'mine' or 'generate' as IDs
  if (patchId === 'mine' || patchId === 'generate') {
    return c.notFound();
  }

  const patch = await c.env.DB.prepare(
    `SELECT p.*, s.manufacturer, s.synth_name, s.schema_json
     FROM patches p
     JOIN synth_schemas s ON p.schema_id = s.id
     WHERE p.id = ?`
  ).bind(patchId).first<Patch & { manufacturer: string; synth_name: string; schema_json: string }>();

  if (!patch) {
    return c.json({ error: 'Patch not found' }, 404);
  }

  // Check access
  if (!patch.is_public && patch.user_id !== user?.id) {
    return c.json({ error: 'Access denied' }, 403);
  }

  return c.json({
    id: patch.id,
    name: patch.name,
    description: patch.description,
    manufacturer: patch.manufacturer,
    synth_name: patch.synth_name,
    schema_id: patch.schema_id,
    patch_json: JSON.parse(patch.patch_json),
    reasoning: patch.reasoning,
    is_public: patch.is_public,
    is_owner: user?.id === patch.user_id,
    created_at: patch.created_at,
  });
});

// Delete a patch
patchRoutes.delete('/:id', requireAuth(), async (c) => {
  const patchId = c.req.param('id');
  const user = c.get('user');

  const existing = await c.env.DB.prepare(
    `SELECT user_id FROM patches WHERE id = ?`
  ).bind(patchId).first<{ user_id: string }>();

  if (!existing) {
    return c.json({ error: 'Patch not found' }, 404);
  }

  if (existing.user_id !== user.id) {
    return c.json({ error: 'Access denied' }, 403);
  }

  await c.env.DB.prepare(
    `DELETE FROM patches WHERE id = ?`
  ).bind(patchId).run();

  return c.json({ success: true });
});

// List public patches (for browsing)
patchRoutes.get('/', optionalAuth(), async (c) => {
  const schemaId = c.req.query('schema_id');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  let query = `
    SELECT p.id, p.name, p.description, p.schema_id, p.created_at,
           s.manufacturer, s.synth_name,
           pr.avg_rating, pr.rating_count
    FROM patches p
    JOIN synth_schemas s ON p.schema_id = s.id
    LEFT JOIN patch_ratings pr ON p.id = pr.patch_id
    WHERE p.is_public = 1
  `;
  const params: (string | number)[] = [];

  if (schemaId) {
    query += ` AND p.schema_id = ?`;
    params.push(schemaId);
  }

  query += ` ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const result = await c.env.DB.prepare(query).bind(...params).all();

  return c.json({
    patches: result.results
  });
});
