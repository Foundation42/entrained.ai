-- Sprites database schema

-- Sprite sheets (the generated NxN grids)
CREATE TABLE IF NOT EXISTS sprite_sheets (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL,
  url TEXT NOT NULL,
  grid_size INTEGER NOT NULL,
  cell_size INTEGER NOT NULL,
  theme TEXT NOT NULL,
  category TEXT NOT NULL,
  style TEXT,
  prompt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  metadata TEXT
);

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_sheets_theme ON sprite_sheets(theme);
CREATE INDEX IF NOT EXISTS idx_sheets_category ON sprite_sheets(category);
CREATE INDEX IF NOT EXISTS idx_sheets_created ON sprite_sheets(created_at DESC);

-- Individual slots within sheets (for mix-and-match)
CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  row INTEGER NOT NULL,
  col INTEGER NOT NULL,
  label TEXT,
  part_type TEXT,
  tags TEXT,
  FOREIGN KEY (sheet_id) REFERENCES sprite_sheets(id) ON DELETE CASCADE,
  UNIQUE(sheet_id, slot_index)
);

-- Index for querying slots
CREATE INDEX IF NOT EXISTS idx_slots_sheet ON slots(sheet_id);
CREATE INDEX IF NOT EXISTS idx_slots_part_type ON slots(part_type);

-- Avatar recipes (for user profiles)
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  name TEXT,
  layers TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipes_created ON recipes(created_at DESC);
