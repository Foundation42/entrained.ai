-- Instance Service Migration
-- Enables components to be deployed as living, orchestratable entities
-- Part of the Social Magnetics vision

-- Instances table - deployed component instances with mutable props
CREATE TABLE instances (
  id TEXT PRIMARY KEY,                      -- "inst-{short-uuid}"
  component_id TEXT NOT NULL,               -- Reference to component template
  component_version INTEGER,                -- Pinned version (null = latest)

  -- Identity
  name TEXT,                                -- Human-readable name
  owner_id TEXT,                            -- Creator/owner (for future auth)
  visibility TEXT NOT NULL DEFAULT 'private', -- 'private' | 'public' | 'unlisted'

  -- Placement (for spatial computing)
  location TEXT,                            -- Logical location identifier
  device TEXT,                              -- Device identifier
  geo_lat REAL,                             -- Latitude
  geo_lng REAL,                             -- Longitude
  tags TEXT,                                -- JSON array of tags

  -- Runtime configuration
  runtime_type TEXT NOT NULL DEFAULT 'edge', -- 'edge' (KV) | 'durable' (DO)

  -- Versioning policy
  upgrade_strategy TEXT NOT NULL DEFAULT 'pin', -- 'pin' | 'minor' | 'latest'

  -- Timestamps
  created_at INTEGER NOT NULL,              -- Unix timestamp (ms)
  updated_at INTEGER NOT NULL,              -- Unix timestamp (ms)

  FOREIGN KEY (component_id) REFERENCES components(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX idx_instances_component ON instances(component_id);
CREATE INDEX idx_instances_owner ON instances(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_instances_visibility ON instances(visibility);
CREATE INDEX idx_instances_location ON instances(location) WHERE location IS NOT NULL;
CREATE INDEX idx_instances_geo ON instances(geo_lat, geo_lng) WHERE geo_lat IS NOT NULL;
CREATE INDEX idx_instances_created ON instances(created_at DESC);
CREATE INDEX idx_instances_updated ON instances(updated_at DESC);

-- Note: Props and bindings are stored in KV for edge performance
-- KV keys:
--   instance:{id}:props     → JSON props
--   instance:{id}:bindings  → JSON bindings config
--   instance:{id}:resolved  → Cached resolved props
