// Sprites Service - Modular Sprite Sheet Generation
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { nanoid } from 'nanoid';
import type { Env, GenerateRequest, SpriteSheetRow, SlotRow, STYLES } from './types';
import { generateSpriteSheet } from './lib/gemini';
import { uploadToR2, getPublicUrl } from './lib/storage';
import { saveSheet, saveSlots, getSheets, getSheetWithSlots, saveRecipe, getRecipe } from './lib/db';
import { playgroundPage } from './pages/playground';

const app = new Hono<{ Bindings: Env }>();

// CORS for cross-origin requests from entrained.ai subdomains
app.use('/api/*', cors({
  origin: (origin) => {
    if (!origin) return 'https://sprites.entrained.ai';
    if (origin.endsWith('.entrained.ai') || origin === 'https://entrained.ai') {
      return origin;
    }
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }
    return null;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'sprites' }));

// ================================
// API Routes
// ================================

// POST /api/generate - Generate a new sprite sheet
app.post('/api/generate', async (c) => {
  const body = await c.req.json<GenerateRequest>();

  // Validate
  if (!body.theme) {
    return c.json({ error: 'Theme is required' }, 400);
  }

  const category = body.category || 'avatar';
  const gridSize = body.grid_size || 3;
  const cellSize = body.cell_size || 512;
  const style = body.style || c.env.SITE_STYLE;

  console.log(`[Generate] theme=${body.theme}, category=${category}, grid=${gridSize}x${gridSize}`);

  try {
    // Generate image with Gemini (includes mask generation)
    const { imageData, mimeType, prompt, maskData, maskMimeType } = await generateSpriteSheet({
      theme: body.theme,
      category,
      gridSize,
      cellSize,
      style,
      customPrompt: body.custom_prompt,
      customNotes: body.custom_notes,
      rowLabels: body.row_labels,
    }, c.env);

    // Upload to R2
    const sheetId = nanoid();
    // Sanitize theme for URL-safe R2 key (handle emoji and unicode)
    const safeTheme = body.theme
      .normalize('NFKD')                          // Decompose unicode
      .replace(/[\u0300-\u036f]/g, '')            // Remove diacritics
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')                // Keep only alphanumeric
      .replace(/^-+|-+$/g, '')                    // Trim leading/trailing hyphens
      || 'untitled';                              // Fallback if empty
    const r2Key = `sheets/${category}/${safeTheme}/${sheetId}.png`;

    await uploadToR2(c.env.ASSETS, r2Key, imageData, mimeType);
    const url = getPublicUrl(r2Key);

    // Upload mask if generated
    let maskR2Key: string | null = null;
    let maskUrl: string | null = null;

    if (maskData && maskMimeType) {
      maskR2Key = `sheets/${category}/${safeTheme}/${sheetId}_mask.png`;
      await uploadToR2(c.env.ASSETS, maskR2Key, maskData, maskMimeType);
      maskUrl = getPublicUrl(maskR2Key);
      console.log(`[Generate] Mask uploaded: ${maskUrl}`);
    }

    // Save to database
    const sheet = await saveSheet(c.env.DB, {
      id: sheetId,
      r2_key: r2Key,
      url,
      mask_r2_key: maskR2Key,
      mask_url: maskUrl,
      grid_size: gridSize,
      cell_size: cellSize,
      theme: body.theme,
      category,
      style,
      prompt,
      created_at: Date.now(),
      metadata: null,
    });

    // Create slot entries
    const slots = await saveSlots(c.env.DB, sheetId, gridSize, body.row_labels);

    return c.json({
      data: {
        sheet: {
          id: sheet.id,
          url: sheet.url,
          mask_url: sheet.mask_url,
          grid_size: sheet.grid_size,
          cell_size: sheet.cell_size,
          theme: sheet.theme,
          category: sheet.category,
        },
        slots: slots.map(s => ({
          id: s.id,
          slot_index: s.slot_index,
          row: s.row,
          col: s.col,
          label: s.label,
          part_type: s.part_type,
        })),
      }
    }, 201);
  } catch (err) {
    console.error('[Generate] Error:', err);
    return c.json({
      error: err instanceof Error ? err.message : 'Generation failed'
    }, 500);
  }
});

// GET /api/sheets - List sprite sheets
app.get('/api/sheets', async (c) => {
  const theme = c.req.query('theme');
  const category = c.req.query('category');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const sheets = await getSheets(c.env.DB, { theme, category, limit, offset });

  return c.json({
    data: sheets.map(s => ({
      id: s.id,
      url: s.url,
      grid_size: s.grid_size,
      cell_size: s.cell_size,
      theme: s.theme,
      category: s.category,
      created_at: s.created_at,
    })),
  });
});

// GET /api/sheets/:id - Get sheet with slots
app.get('/api/sheets/:id', async (c) => {
  const id = c.req.param('id');
  let result = await getSheetWithSlots(c.env.DB, id);

  if (!result) {
    return c.json({ error: 'Sheet not found' }, 404);
  }

  // Auto-generate slots if none exist (for older sheets)
  if (result.slots.length === 0) {
    console.log(`[Sheet ${id}] No slots found, generating default slots`);
    const slots = await saveSlots(c.env.DB, id, result.sheet.grid_size);
    result = { sheet: result.sheet, slots };
  }

  return c.json({ data: result });
});

// GET /api/css/:sheetId/:slotIndex - Get CSS for a slot
app.get('/api/css/:sheetId/:slotIndex', async (c) => {
  const sheetId = c.req.param('sheetId');
  const slotIndex = parseInt(c.req.param('slotIndex'));
  const size = parseInt(c.req.query('size') || '100');

  const result = await getSheetWithSlots(c.env.DB, sheetId);
  if (!result) {
    return c.json({ error: 'Sheet not found' }, 404);
  }

  const { sheet } = result;
  const gridSize = sheet.grid_size;

  // Calculate background position
  const col = slotIndex % gridSize;
  const row = Math.floor(slotIndex / gridSize);
  const bgPosX = (col / (gridSize - 1)) * 100;
  const bgPosY = (row / (gridSize - 1)) * 100;
  const bgSize = gridSize * 100;

  const css = `
.sprite-${sheetId}-${slotIndex} {
  width: ${size}px;
  height: ${size}px;
  background-image: url('${sheet.url}');
  background-size: ${bgSize}% ${bgSize}%;
  background-position: ${bgPosX}% ${bgPosY}%;
  background-repeat: no-repeat;
}`.trim();

  return c.text(css, 200, { 'Content-Type': 'text/css' });
});

// POST /api/recipes - Save a recipe
app.post('/api/recipes', async (c) => {
  const body = await c.req.json<{ name?: string; layers: unknown[] }>();

  if (!body.layers || !Array.isArray(body.layers)) {
    return c.json({ error: 'Layers array is required' }, 400);
  }

  const recipeId = nanoid();
  const recipe = await saveRecipe(c.env.DB, {
    id: recipeId,
    name: body.name || null,
    layers: JSON.stringify(body.layers),
    created_at: Date.now(),
  });

  return c.json({
    data: {
      id: recipe.id,
      name: recipe.name,
      created_at: recipe.created_at,
    }
  }, 201);
});

// GET /api/recipes - List recipes
app.get('/api/recipes', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20');

  const result = await c.env.DB.prepare(
    'SELECT id, name, created_at FROM recipes ORDER BY created_at DESC LIMIT ?'
  ).bind(limit).all<{ id: string; name: string | null; created_at: number }>();

  return c.json({
    data: result.results.map(r => ({
      id: r.id,
      name: r.name,
      created_at: r.created_at,
    })),
  });
});

// GET /api/recipes/:id - Get a recipe
app.get('/api/recipes/:id', async (c) => {
  const id = c.req.param('id');
  const recipe = await getRecipe(c.env.DB, id);

  if (!recipe) {
    return c.json({ error: 'Recipe not found' }, 404);
  }

  return c.json({
    data: {
      id: recipe.id,
      name: recipe.name,
      layers: JSON.parse(recipe.layers),
      created_at: recipe.created_at,
    }
  });
});

// DELETE /api/sheets/:id - Delete a sprite sheet
app.delete('/api/sheets/:id', async (c) => {
  const id = c.req.param('id');

  // Get sheet first to find R2 keys
  const result = await getSheetWithSlots(c.env.DB, id);
  if (!result) {
    return c.json({ error: 'Sheet not found' }, 404);
  }

  const { sheet } = result;

  try {
    // Delete from R2
    await c.env.ASSETS.delete(sheet.r2_key);
    console.log(`[Delete] Removed R2: ${sheet.r2_key}`);

    // Delete mask from R2 if exists
    if (sheet.mask_r2_key) {
      await c.env.ASSETS.delete(sheet.mask_r2_key);
      console.log(`[Delete] Removed R2 mask: ${sheet.mask_r2_key}`);
    }

    // Delete slots from D1
    await c.env.DB.prepare('DELETE FROM slots WHERE sheet_id = ?').bind(id).run();

    // Delete sheet from D1
    await c.env.DB.prepare('DELETE FROM sprite_sheets WHERE id = ?').bind(id).run();

    console.log(`[Delete] Removed sheet: ${id}`);

    return c.json({ success: true });
  } catch (err) {
    console.error('[Delete] Error:', err);
    return c.json({ error: 'Failed to delete sheet' }, 500);
  }
});

// POST /api/avatars - Upload a rendered avatar composite
app.post('/api/avatars', async (c) => {
  try {
    const body = await c.req.json<{ imageData: string; sheetId?: string }>();

    if (!body.imageData) {
      return c.json({ error: 'imageData is required' }, 400);
    }

    // imageData should be base64 encoded PNG (data URL or raw base64)
    let base64Data = body.imageData;
    if (base64Data.startsWith('data:')) {
      base64Data = base64Data.split(',')[1];
    }

    const imageBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Generate unique avatar ID
    const avatarId = nanoid();
    const r2Key = `avatars/${avatarId}.png`;

    // Upload to R2
    await uploadToR2(c.env.ASSETS, r2Key, imageBuffer.buffer as ArrayBuffer, 'image/png');
    const url = getPublicUrl(r2Key);

    console.log(`[Avatar] Uploaded: ${url}`);

    return c.json({
      data: {
        id: avatarId,
        url,
      }
    }, 201);
  } catch (err) {
    console.error('[Avatar] Upload error:', err);
    return c.json({ error: 'Failed to upload avatar' }, 500);
  }
});

// ================================
// Public Pages
// ================================

// Playground UI
app.get('/', async (c) => {
  const sheets = await getSheets(c.env.DB, { limit: 10 });
  return c.html(playgroundPage(sheets));
});

// EAP Intent endpoint for avatar.create capability
app.get('/create', async (c) => {
  const sheets = await getSheets(c.env.DB, { limit: 10 });
  // Serves the same playground page - intent is parsed client-side from ?intent= param
  return c.html(playgroundPage(sheets));
});

// Serve assets from R2
app.get('/assets/*', async (c) => {
  const key = c.req.path.replace('/assets/', '');

  const object = await c.env.ASSETS.get(key);
  if (!object) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/png');
  headers.set('Cache-Control', 'public, max-age=31536000');
  headers.set('ETag', object.httpEtag);

  return new Response(object.body, { headers });
});

// ================================
// EAP Manifest
// ================================

app.get('/manifest.json', (c) => {
  const manifest = {
    app: 'sprites.entrained.ai',
    version: '1.0.0',
    name: 'Sprite Generator',
    description: 'AI-powered sprite sheet generation and avatar composition',

    capabilities: [
      {
        id: 'avatar.create',
        name: 'Create Avatar',
        description: 'Generate or compose a sprite avatar from modular parts',
        endpoint: '/create',
        method: 'GET',
        parameters: {
          theme: { type: 'string', optional: true, description: 'Visual theme (e.g., robot, fantasy, cyberpunk)' },
          style: { type: 'string', optional: true, description: 'Art style (flat_vector, pixel_art, etc.)' },
          returnTo: { type: 'url', required: true, description: 'URL to return to after completion' },
        },
        returns: {
          type: 'object',
          schema: {
            avatarUrl: 'string',
            recipe: 'object',
            sheetId: 'string',
          },
        },
        aiInstructions: {
          summary: 'Create pixel art or vector avatars from themes and styles',
          examples: [
            {
              input: { theme: 'robot', style: 'pixel_art' },
              output: { avatarUrl: 'https://sprites.entrained.ai/avatars/...', recipe: { layers: [] } },
            },
          ],
          tips: [
            'Pixel art works best for retro game aesthetics',
            'Flat vector is ideal for modern UI',
          ],
        },
      },
      {
        id: 'spritesheet.generate',
        name: 'Generate Sprite Sheet',
        description: 'AI-generate modular sprite sheets for games',
        endpoint: '/generate',
        method: 'GET',
        parameters: {
          theme: { type: 'string', required: true, description: 'Visual theme' },
          category: { type: 'string', required: true, description: 'avatar, tileset, particles, ships, weapons, badges' },
          style: { type: 'string', required: true, description: 'Art style' },
          gridSize: { type: 'number', optional: true, description: 'Grid size (3 or 4)', default: 3 },
          returnTo: { type: 'url', required: true, description: 'URL to return to after completion' },
        },
        returns: {
          type: 'object',
          schema: {
            sheetId: 'string',
            sheetUrl: 'string',
            slots: 'array',
          },
        },
      },
    ],

    permissions: ['storage.write'],

    introspection: {
      health: '/health',
    },

    ai: {
      apiEndpoint: '/api',
      instructions: {
        summary: 'Sprite Generator creates modular sprite sheets and composable avatars using AI',
        capabilities: [
          'Generate themed sprite sheets (avatars, tilesets, particles, ships, weapons, badges)',
          'Compose avatars from layered sprite parts',
          'Export recipes for avatar configurations',
        ],
        bestPractices: [
          'Use specific themes for better results',
          'Pixel art style works best for small sprites',
          'Avatar sheets allow mixing and matching parts',
        ],
      },
    },
  };

  return c.json(manifest, 200, {
    'Cache-Control': 'public, max-age=300',
  });
});

export default app;
