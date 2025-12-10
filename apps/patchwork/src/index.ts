import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { nanoid } from 'nanoid';
import type { Bindings, ExtractionJobMessage, ParsedSchema } from './types';
import { landingPage } from './pages/landing';
import { patchDesignerPage } from './pages/patch-designer';
import { sequencerPage } from './pages/sequencer';
import { schemaExtractorPage } from './pages/schema-extractor';
import { synthsPage } from './pages/synths';
import { schemaRoutes } from './routes/schema';
import { extractSchemaFromText, extractSchemaFromPDF } from './lib/gemini';

const app = new Hono<{ Bindings: Bindings }>();

// CORS for API routes
app.use('/api/*', cors({
  origin: ['https://patchwork.entrained.ai', 'http://localhost:8787'],
  credentials: true,
}));

// API routes
app.route('/api/schema', schemaRoutes);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// Pages
app.get('/', (c) => c.html(landingPage()));
app.get('/patch-designer', (c) => c.html(patchDesignerPage()));
app.get('/sequencer', (c) => c.html(sequencerPage()));
app.get('/schema-extractor', (c) => c.html(schemaExtractorPage()));
app.get('/synths', (c) => c.html(synthsPage()));

// Queue consumer for extraction jobs
async function handleExtractionJob(
  message: ExtractionJobMessage,
  env: Bindings
): Promise<void> {
  const { jobId, userId, fileName, mimeType, r2Key } = message;
  console.log(`[Queue] Processing job ${jobId} for ${fileName}`);

  try {
    // Get file from R2
    const file = await env.ASSETS.get(r2Key);
    if (!file) {
      throw new Error(`File not found in R2: ${r2Key}`);
    }

    const fileData = await file.arrayBuffer();
    console.log(`[Queue] Got file from R2 (${fileData.byteLength} bytes)`);

    let schema: ParsedSchema;

    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      console.log(`[Queue] Using Gemini File API for PDF...`);
      schema = await extractSchemaFromPDF(fileData, fileName, env.GEMINI_API_KEY);
    } else {
      console.log(`[Queue] Processing as text file...`);
      const text = new TextDecoder().decode(fileData);
      schema = await extractSchemaFromText(text, env.GEMINI_API_KEY);
    }

    console.log(`[Queue] Extraction complete: ${schema.manufacturer} ${schema.synth_name}`);

    // Store schema in D1
    const schemaId = nanoid();
    const now = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      `INSERT INTO synth_schemas
       (id, user_id, manufacturer, synth_name, schema_json, source_file_r2_key, extraction_model, is_public, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      schemaId,
      userId,
      schema.manufacturer,
      schema.synth_name,
      JSON.stringify(schema),
      r2Key,
      'gemini-3-pro-preview',
      1,
      now,
      now
    ).run();

    // Update job as completed
    await env.DB.prepare(
      `UPDATE extraction_jobs SET status = 'completed', schema_id = ?, updated_at = ? WHERE id = ?`
    ).bind(schemaId, now, jobId).run();

    console.log(`[Queue] Job ${jobId} completed, schema ID: ${schemaId}`);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[Queue] Job ${jobId} failed: ${errorMessage}`);

    // Update job as failed
    await env.DB.prepare(
      `UPDATE extraction_jobs SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`
    ).bind(errorMessage, Math.floor(Date.now() / 1000), jobId).run();

    // Re-throw to trigger retry
    throw err;
  }
}

export default {
  fetch: app.fetch,
  async queue(
    batch: MessageBatch<ExtractionJobMessage>,
    env: Bindings
  ): Promise<void> {
    console.log(`[Queue] Received batch of ${batch.messages.length} messages`);

    for (const message of batch.messages) {
      try {
        await handleExtractionJob(message.body, env);
        message.ack();
      } catch (err) {
        console.error(`[Queue] Message failed:`, err);
        message.retry();
      }
    }
  }
};
