// Database helpers for sprites
import { nanoid } from 'nanoid';
import type { SpriteSheetRow, SlotRow, RecipeRow } from '../types';

// Save a new sprite sheet
export async function saveSheet(
  db: D1Database,
  sheet: SpriteSheetRow
): Promise<SpriteSheetRow> {
  await db.prepare(`
    INSERT INTO sprite_sheets (
      id, r2_key, url, mask_r2_key, mask_url, grid_size, cell_size, theme, category, style, prompt, created_at, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    sheet.id,
    sheet.r2_key,
    sheet.url,
    sheet.mask_r2_key,
    sheet.mask_url,
    sheet.grid_size,
    sheet.cell_size,
    sheet.theme,
    sheet.category,
    sheet.style,
    sheet.prompt,
    sheet.created_at,
    sheet.metadata
  ).run();

  return sheet;
}

// Create slot entries for a sheet
export async function saveSlots(
  db: D1Database,
  sheetId: string,
  gridSize: number,
  rowLabels?: string[]
): Promise<SlotRow[]> {
  const slots: SlotRow[] = [];
  const partTypes = rowLabels || getDefaultPartTypes(gridSize);

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const slotIndex = row * gridSize + col;
      const partType = partTypes[row] || null;
      const label = partType ? `${partType} #${col + 1}` : null;

      const slot: SlotRow = {
        id: nanoid(),
        sheet_id: sheetId,
        slot_index: slotIndex,
        row,
        col,
        label,
        part_type: partType,
        tags: null,
      };

      await db.prepare(`
        INSERT INTO slots (id, sheet_id, slot_index, row, col, label, part_type, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        slot.id,
        slot.sheet_id,
        slot.slot_index,
        slot.row,
        slot.col,
        slot.label,
        slot.part_type,
        slot.tags
      ).run();

      slots.push(slot);
    }
  }

  return slots;
}

function getDefaultPartTypes(gridSize: number): string[] {
  if (gridSize === 3) {
    return ['head', 'eyes', 'mouth'];
  } else if (gridSize === 4) {
    return ['head', 'eyes', 'mouth', 'accessory'];
  }
  return [];
}

// Get sheets with optional filters
export async function getSheets(
  db: D1Database,
  opts: {
    theme?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }
): Promise<SpriteSheetRow[]> {
  let query = 'SELECT * FROM sprite_sheets WHERE 1=1';
  const params: (string | number)[] = [];

  if (opts.theme) {
    query += ' AND theme = ?';
    params.push(opts.theme);
  }

  if (opts.category) {
    query += ' AND category = ?';
    params.push(opts.category);
  }

  query += ' ORDER BY created_at DESC';
  query += ` LIMIT ? OFFSET ?`;
  params.push(opts.limit || 50, opts.offset || 0);

  const result = await db.prepare(query).bind(...params).all<SpriteSheetRow>();
  return result.results;
}

// Get a single sheet with its slots
export async function getSheetWithSlots(
  db: D1Database,
  sheetId: string
): Promise<{ sheet: SpriteSheetRow; slots: SlotRow[] } | null> {
  const sheet = await db.prepare(
    'SELECT * FROM sprite_sheets WHERE id = ?'
  ).bind(sheetId).first<SpriteSheetRow>();

  if (!sheet) {
    return null;
  }

  const slots = await db.prepare(
    'SELECT * FROM slots WHERE sheet_id = ? ORDER BY slot_index'
  ).bind(sheetId).all<SlotRow>();

  return { sheet, slots: slots.results };
}

// Get slots by part type (e.g., all "eyes" across all sheets)
export async function getSlotsByPartType(
  db: D1Database,
  partType: string,
  limit = 50
): Promise<(SlotRow & { sheet_url: string })[]> {
  const result = await db.prepare(`
    SELECT s.*, ss.url as sheet_url
    FROM slots s
    JOIN sprite_sheets ss ON s.sheet_id = ss.id
    WHERE s.part_type = ?
    ORDER BY ss.created_at DESC
    LIMIT ?
  `).bind(partType, limit).all<SlotRow & { sheet_url: string }>();

  return result.results;
}

// Save a recipe
export async function saveRecipe(
  db: D1Database,
  recipe: RecipeRow
): Promise<RecipeRow> {
  await db.prepare(`
    INSERT INTO recipes (id, name, layers, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(recipe.id, recipe.name, recipe.layers, recipe.created_at).run();

  return recipe;
}

// Get a recipe
export async function getRecipe(
  db: D1Database,
  recipeId: string
): Promise<RecipeRow | null> {
  return await db.prepare(
    'SELECT * FROM recipes WHERE id = ?'
  ).bind(recipeId).first<RecipeRow>();
}
