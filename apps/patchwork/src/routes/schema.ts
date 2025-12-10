import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Bindings, AuthUser, SynthSchema, ParsedSchema } from '../types';
import { requireAuth, optionalAuth } from '../lib/auth';
import { extractSchemaFromText, extractSchemaFromPDF } from '../lib/gemini';

type Variables = { user: AuthUser };

export const schemaRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Extract schema from uploaded file
schemaRoutes.post('/extract', requireAuth(), async (c) => {
  const user = c.get('user');

  const contentType = c.req.header('Content-Type') || '';
  let fileData: ArrayBuffer;
  let fileName: string;
  let mimeType: string;

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    fileData = await file.arrayBuffer();
    fileName = file.name;
    mimeType = file.type;
  } else {
    // JSON body with base64 data
    const body = await c.req.json<{
      file_data: string;  // base64
      file_name: string;
      mime_type: string;
    }>();

    if (!body.file_data || !body.file_name) {
      return c.json({ error: 'Missing file_data or file_name' }, 400);
    }

    fileData = Uint8Array.from(atob(body.file_data), c => c.charCodeAt(0)).buffer;
    fileName = body.file_name;
    mimeType = body.mime_type || 'application/octet-stream';
  }

  // Store original file to R2
  const uploadId = nanoid();
  const ext = fileName.split('.').pop() || 'bin';
  const r2Key = `uploads/${user.id}/${uploadId}.${ext}`;

  await c.env.ASSETS.put(r2Key, fileData, {
    customMetadata: {
      originalName: fileName,
      uploadedBy: user.id,
      uploadedAt: new Date().toISOString(),
    }
  });

  // Extract schema using Gemini
  let schema: ParsedSchema;
  try {
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      const base64 = btoa(String.fromCharCode(...new Uint8Array(fileData)));
      schema = await extractSchemaFromPDF(base64, c.env.GEMINI_API_KEY);
    } else {
      // Assume text file
      const text = new TextDecoder().decode(fileData);
      schema = await extractSchemaFromText(text, c.env.GEMINI_API_KEY);
    }
  } catch (err) {
    return c.json({
      error: 'Schema extraction failed',
      details: err instanceof Error ? err.message : String(err)
    }, 500);
  }

  // Store schema in D1
  const schemaId = nanoid();
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `INSERT INTO synth_schemas
     (id, user_id, manufacturer, synth_name, schema_json, source_file_r2_key, extraction_model, is_public, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    schemaId,
    user.id,
    schema.manufacturer,
    schema.synth_name,
    JSON.stringify(schema),
    r2Key,
    'gemini-1.5-flash',
    1,  // Public by default
    now,
    now
  ).run();

  return c.json({
    id: schemaId,
    manufacturer: schema.manufacturer,
    synth_name: schema.synth_name,
    parameter_count: schema.parameters.length,
    categories: schema.categories,
    schema
  }, 201);
});

// Get user's schemas
schemaRoutes.get('/mine', requireAuth(), async (c) => {
  const user = c.get('user');

  const result = await c.env.DB.prepare(
    `SELECT id, manufacturer, synth_name, is_public, created_at, updated_at,
            (SELECT COUNT(*) FROM patches WHERE schema_id = synth_schemas.id) as patch_count
     FROM synth_schemas
     WHERE user_id = ?
     ORDER BY updated_at DESC`
  ).bind(user.id).all<SynthSchema & { patch_count: number }>();

  return c.json(result.results);
});

// Get single schema
schemaRoutes.get('/:id', optionalAuth(), async (c) => {
  const schemaId = c.req.param('id');
  const user = c.get('user');

  const schema = await c.env.DB.prepare(
    `SELECT * FROM synth_schemas WHERE id = ?`
  ).bind(schemaId).first<SynthSchema>();

  if (!schema) {
    return c.json({ error: 'Schema not found' }, 404);
  }

  // Check access
  if (!schema.is_public && schema.user_id !== user?.id) {
    return c.json({ error: 'Access denied' }, 403);
  }

  return c.json({
    ...schema,
    schema_json: JSON.parse(schema.schema_json),
    is_owner: user?.id === schema.user_id
  });
});

// List public schemas
schemaRoutes.get('/', optionalAuth(), async (c) => {
  const manufacturer = c.req.query('manufacturer');
  const search = c.req.query('search');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = parseInt(c.req.query('offset') || '0');

  let query = `
    SELECT s.id, s.manufacturer, s.synth_name, s.user_id, s.created_at,
           (SELECT COUNT(*) FROM patches WHERE schema_id = s.id AND is_public = 1) as patch_count,
           sr.avg_rating, sr.rating_count
    FROM synth_schemas s
    LEFT JOIN schema_ratings sr ON s.id = sr.schema_id
    WHERE s.is_public = 1
  `;
  const params: (string | number)[] = [];

  if (manufacturer) {
    query += ` AND s.manufacturer = ?`;
    params.push(manufacturer);
  }

  if (search) {
    query += ` AND (s.manufacturer LIKE ? OR s.synth_name LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ` ORDER BY s.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const result = await c.env.DB.prepare(query).bind(...params).all();

  // Get list of manufacturers for filtering
  const manufacturers = await c.env.DB.prepare(
    `SELECT DISTINCT manufacturer FROM synth_schemas WHERE is_public = 1 ORDER BY manufacturer`
  ).all<{ manufacturer: string }>();

  return c.json({
    schemas: result.results,
    manufacturers: manufacturers.results.map(m => m.manufacturer)
  });
});

// Update schema (owner only)
schemaRoutes.put('/:id', requireAuth(), async (c) => {
  const schemaId = c.req.param('id');
  const user = c.get('user');

  const existing = await c.env.DB.prepare(
    `SELECT user_id FROM synth_schemas WHERE id = ?`
  ).bind(schemaId).first<{ user_id: string }>();

  if (!existing) {
    return c.json({ error: 'Schema not found' }, 404);
  }

  if (existing.user_id !== user.id) {
    return c.json({ error: 'Access denied' }, 403);
  }

  const body = await c.req.json<{
    manufacturer?: string;
    synth_name?: string;
    schema_json?: ParsedSchema;
    is_public?: boolean;
  }>();

  const updates: string[] = [];
  const params: (string | number)[] = [];

  if (body.manufacturer) {
    updates.push('manufacturer = ?');
    params.push(body.manufacturer);
  }
  if (body.synth_name) {
    updates.push('synth_name = ?');
    params.push(body.synth_name);
  }
  if (body.schema_json) {
    updates.push('schema_json = ?');
    params.push(JSON.stringify(body.schema_json));
  }
  if (body.is_public !== undefined) {
    updates.push('is_public = ?');
    params.push(body.is_public ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json({ error: 'No updates provided' }, 400);
  }

  updates.push('updated_at = ?');
  params.push(Math.floor(Date.now() / 1000));
  params.push(schemaId);

  await c.env.DB.prepare(
    `UPDATE synth_schemas SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  return c.json({ success: true });
});

// Delete schema (owner only)
schemaRoutes.delete('/:id', requireAuth(), async (c) => {
  const schemaId = c.req.param('id');
  const user = c.get('user');

  const existing = await c.env.DB.prepare(
    `SELECT user_id, source_file_r2_key FROM synth_schemas WHERE id = ?`
  ).bind(schemaId).first<{ user_id: string; source_file_r2_key: string | null }>();

  if (!existing) {
    return c.json({ error: 'Schema not found' }, 404);
  }

  if (existing.user_id !== user.id) {
    return c.json({ error: 'Access denied' }, 403);
  }

  // Delete from R2 if exists
  if (existing.source_file_r2_key) {
    await c.env.ASSETS.delete(existing.source_file_r2_key);
  }

  // Delete from D1 (cascades to patches via foreign key)
  await c.env.DB.prepare(
    `DELETE FROM synth_schemas WHERE id = ?`
  ).bind(schemaId).run();

  return c.json({ success: true });
});
