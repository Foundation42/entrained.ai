import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { Bindings, AuthUser, SynthSchema, ParsedSchema, ExtractionJobMessage } from '../types';
import { requireAuth, optionalAuth } from '../lib/auth';

type Variables = { user: AuthUser };

export const schemaRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Start async extraction job - returns immediately with job ID
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
    mimeType = file.type || 'application/octet-stream';
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

  // Create job record
  const jobId = nanoid();
  const uploadId = nanoid();
  const ext = fileName.split('.').pop() || 'bin';
  const r2Key = `uploads/${user.id}/${uploadId}.${ext}`;
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(
    `INSERT INTO extraction_jobs (id, user_id, status, file_name, file_r2_key, created_at, updated_at)
     VALUES (?, ?, 'uploading', ?, ?, ?, ?)`
  ).bind(jobId, user.id, fileName, r2Key, now, now).run();

  // Store file to R2
  await c.env.ASSETS.put(r2Key, fileData, {
    customMetadata: {
      originalName: fileName,
      uploadedBy: user.id,
      uploadedAt: new Date().toISOString(),
    }
  });

  // Update status to processing and send to queue
  await c.env.DB.prepare(
    `UPDATE extraction_jobs SET status = 'processing', updated_at = ? WHERE id = ?`
  ).bind(Math.floor(Date.now() / 1000), jobId).run();

  // Send to queue for processing
  const queueMessage: ExtractionJobMessage = {
    jobId,
    userId: user.id,
    fileName,
    mimeType,
    r2Key
  };

  await c.env.EXTRACTION_QUEUE.send(queueMessage);
  console.log(`[Extract] Job ${jobId} queued for processing`);

  // Return immediately with job ID
  return c.json({
    job_id: jobId,
    status: 'processing',
    message: 'Extraction started. Poll /api/schema/job/:id for status.'
  }, 202);
})

// Poll job status
schemaRoutes.get('/job/:id', requireAuth(), async (c) => {
  const jobId = c.req.param('id');
  const user = c.get('user');

  const job = await c.env.DB.prepare(
    `SELECT * FROM extraction_jobs WHERE id = ? AND user_id = ?`
  ).bind(jobId, user.id).first<{
    id: string;
    status: string;
    file_name: string;
    schema_id: string | null;
    error_message: string | null;
    created_at: number;
    updated_at: number;
  }>();

  if (!job) {
    return c.json({ error: 'Job not found' }, 404);
  }

  // If completed, include the schema data
  if (job.status === 'completed' && job.schema_id) {
    const schema = await c.env.DB.prepare(
      `SELECT * FROM synth_schemas WHERE id = ?`
    ).bind(job.schema_id).first<SynthSchema>();

    if (schema) {
      const parsed = JSON.parse(schema.schema_json) as ParsedSchema;
      return c.json({
        job_id: job.id,
        status: job.status,
        schema: {
          id: schema.id,
          manufacturer: schema.manufacturer,
          synth_name: schema.synth_name,
          parameter_count: parsed.parameters?.length || 0,
          categories: parsed.categories,
          schema: parsed
        }
      });
    }
  }

  return c.json({
    job_id: job.id,
    status: job.status,
    file_name: job.file_name,
    error: job.error_message,
    created_at: job.created_at,
    updated_at: job.updated_at
  });
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

  // Don't match 'job' or 'mine' as IDs
  if (schemaId === 'job' || schemaId === 'mine') {
    return c.notFound();
  }

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
