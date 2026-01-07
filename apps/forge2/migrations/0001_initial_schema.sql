-- Forge 2.0 Initial Schema
-- This creates the queryable index for assets stored in R2

-- Core asset metadata table
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,              -- Content hash (immutable)
  canonical_name TEXT NOT NULL,     -- Stable name (e.g., "card-component")
  type TEXT NOT NULL,               -- "file" | "bundle" | "asset"
  file_type TEXT,                   -- "tsx" | "css" | "rs" | etc (for files)
  media_type TEXT,                  -- "image" | "speech" | etc (for assets)
  version TEXT NOT NULL,            -- Semver "0.1.0"
  parent_id TEXT,                   -- Parent in version chain
  description TEXT NOT NULL,
  created_at INTEGER NOT NULL,      -- Unix timestamp (ms)
  manifest_url TEXT NOT NULL,       -- R2 URL for full manifest
  content_url TEXT NOT NULL,        -- R2 URL for content
  size INTEGER,                     -- File size in bytes
  mime_type TEXT,

  FOREIGN KEY (parent_id) REFERENCES assets(id)
);

-- Named version refs (latest, stable, dev, etc.)
CREATE TABLE IF NOT EXISTS version_refs (
  canonical_name TEXT NOT NULL,
  ref_name TEXT NOT NULL,           -- "latest" | "stable" | "dev"
  asset_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,      -- Unix timestamp (ms)

  PRIMARY KEY (canonical_name, ref_name),
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);

-- Version chain children (for tracking branches/forks)
CREATE TABLE IF NOT EXISTS version_children (
  parent_id TEXT NOT NULL,
  child_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,      -- Unix timestamp (ms)

  PRIMARY KEY (parent_id, child_id),
  FOREIGN KEY (parent_id) REFERENCES assets(id),
  FOREIGN KEY (child_id) REFERENCES assets(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_assets_canonical_version
  ON assets(canonical_name, version);

CREATE INDEX IF NOT EXISTS idx_assets_type_filetype
  ON assets(type, file_type);

CREATE INDEX IF NOT EXISTS idx_assets_type_mediatype
  ON assets(type, media_type);

CREATE INDEX IF NOT EXISTS idx_assets_created_at
  ON assets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assets_parent
  ON assets(parent_id);

CREATE INDEX IF NOT EXISTS idx_refs_asset
  ON version_refs(asset_id);

CREATE INDEX IF NOT EXISTS idx_children_child
  ON version_children(child_id);
