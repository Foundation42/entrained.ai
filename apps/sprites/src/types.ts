// Sprites service types

export interface Env {
  // Cloudflare bindings
  DB: D1Database;
  ASSETS: R2Bucket;

  // Configuration
  GEMINI_MODEL: string;
  GEMINI_API_KEY: string;
  SITE_STYLE: string;
}

// Database row types
export interface SpriteSheetRow {
  id: string;
  r2_key: string;
  url: string;
  mask_r2_key: string | null;
  mask_url: string | null;
  grid_size: number;
  cell_size: number;
  theme: string;
  category: string;
  style: string | null;
  prompt: string;
  created_at: number;
  metadata: string | null;
}

export interface SlotRow {
  id: string;
  sheet_id: string;
  slot_index: number;
  row: number;
  col: number;
  label: string | null;
  part_type: string | null;
  tags: string | null;
}

export interface RecipeRow {
  id: string;
  name: string | null;
  layers: string;
  created_at: number;
}

// API types
export interface GenerateRequest {
  theme: string;
  category: 'avatar' | 'tileset' | 'particles' | 'ships' | 'weapons' | 'badges' | 'badges_colorful';
  grid_size?: number;
  cell_size?: number;
  style?: string;
  custom_prompt?: string;
  custom_notes?: string;
  row_labels?: string[];
}

export interface SpriteSheet {
  id: string;
  url: string;
  grid_size: number;
  cell_size: number;
  theme: string;
  category: string;
  style: string | null;
  created_at: number;
}

export interface Slot {
  id: string;
  sheet_id: string;
  slot_index: number;
  row: number;
  col: number;
  label: string | null;
  part_type: string | null;
}

export interface RecipeLayer {
  sheet_id: string;
  slot_index: number;
  z_index: number;
}

export interface Recipe {
  id: string;
  name: string | null;
  layers: RecipeLayer[];
  created_at: number;
}

// Style presets
export const STYLES = {
  flat_vector: 'minimalist flat vector 2.0, clean thick outlines, vibrant saturation',
  pixel_art: '16-bit pixel art, limited palette, crisp edges, no anti-aliasing',
  hand_drawn: 'hand-drawn sketch style, organic lines, slight imperfections',
  neon: 'neon glow effects, dark background, cyberpunk aesthetic',
} as const;

export type StyleKey = keyof typeof STYLES;
