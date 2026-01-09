-- Forge 2.0 Component Model Migration
-- Replaces the old asset model with Component + Version model
-- with draft/publish workflow

-- Drop old tables (DB is empty after reset, so this is safe)
DROP TABLE IF EXISTS version_children;
DROP TABLE IF EXISTS version_refs;
DROP TABLE IF EXISTS assets;

-- Components table - the searchable entity
-- Each component has a short UUID and can have multiple versions
CREATE TABLE components (
  id TEXT PRIMARY KEY,                    -- Short UUID (e.g., "ebc7-4f2a")
  canonical_name TEXT NOT NULL,           -- AI-generated, NOT unique
  status TEXT NOT NULL DEFAULT 'draft',   -- 'draft' | 'published'
  type TEXT NOT NULL,                     -- 'file' | 'bundle' | 'asset'
  file_type TEXT,                         -- 'tsx' | 'css' | etc (for files)
  media_type TEXT,                        -- 'image' | 'speech' | etc (for assets)
  description TEXT NOT NULL,
  latest_version INTEGER NOT NULL DEFAULT 0,  -- 0 = never published
  has_draft INTEGER NOT NULL DEFAULT 1,   -- SQLite boolean: 1 = has WIP draft
  creator TEXT,                           -- For future auth
  created_at INTEGER NOT NULL,            -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL             -- Unix timestamp (ms) - for draft expiry
);

-- Versions table - immutable snapshots of components
-- Created when a draft is published
CREATE TABLE versions (
  id TEXT PRIMARY KEY,                    -- "{component_id}-v{version}"
  component_id TEXT NOT NULL,             -- Reference to parent component
  version INTEGER NOT NULL,               -- Monotonic version number (1, 2, 3...)
  semver TEXT,                            -- Optional semantic version string
  parent_version_id TEXT,                 -- Previous version in chain
  description TEXT,                       -- Version changelog
  content_url TEXT NOT NULL,              -- R2 URL for content
  manifest_url TEXT NOT NULL,             -- R2 URL for manifest
  size INTEGER,                           -- File size in bytes
  mime_type TEXT,
  created_at INTEGER NOT NULL,            -- Unix timestamp (ms)

  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_version_id) REFERENCES versions(id),
  UNIQUE (component_id, version)
);

-- Indexes for components
CREATE INDEX idx_components_status ON components(status);
CREATE INDEX idx_components_canonical ON components(canonical_name);
CREATE INDEX idx_components_type ON components(type);
CREATE INDEX idx_components_type_filetype ON components(type, file_type);
CREATE INDEX idx_components_type_mediatype ON components(type, media_type);
CREATE INDEX idx_components_created ON components(created_at DESC);
CREATE INDEX idx_components_updated ON components(updated_at DESC);
CREATE INDEX idx_components_creator ON components(creator) WHERE creator IS NOT NULL;

-- Indexes for versions
CREATE INDEX idx_versions_component ON versions(component_id);
CREATE INDEX idx_versions_component_version ON versions(component_id, version DESC);
CREATE INDEX idx_versions_created ON versions(created_at DESC);
CREATE INDEX idx_versions_parent ON versions(parent_version_id) WHERE parent_version_id IS NOT NULL;
