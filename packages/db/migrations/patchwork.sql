-- Patchwork Database Schema
-- Database: patchwork

CREATE TABLE IF NOT EXISTS synth_schemas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  synth_name TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  source_file_r2_key TEXT,
  extraction_model TEXT,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS patches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  schema_id TEXT NOT NULL REFERENCES synth_schemas(id),
  name TEXT NOT NULL,
  description TEXT,
  patch_json TEXT NOT NULL,
  reasoning TEXT,
  generation_model TEXT,
  is_public INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('schema', 'patch')),
  target_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('schema', 'patch')),
  target_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes for synth_schemas
CREATE INDEX IF NOT EXISTS idx_schemas_manufacturer ON synth_schemas(manufacturer);
CREATE INDEX IF NOT EXISTS idx_schemas_synth ON synth_schemas(synth_name);
CREATE INDEX IF NOT EXISTS idx_schemas_user ON synth_schemas(user_id);
CREATE INDEX IF NOT EXISTS idx_schemas_public ON synth_schemas(is_public) WHERE is_public = 1;

-- Indexes for patches
CREATE INDEX IF NOT EXISTS idx_patches_schema ON patches(schema_id);
CREATE INDEX IF NOT EXISTS idx_patches_user ON patches(user_id);
CREATE INDEX IF NOT EXISTS idx_patches_public ON patches(is_public) WHERE is_public = 1;

-- Indexes for ratings and comments
CREATE INDEX IF NOT EXISTS idx_ratings_target ON ratings(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id);

-- Views for aggregated ratings
CREATE VIEW IF NOT EXISTS schema_ratings AS
SELECT
  target_id as schema_id,
  COUNT(*) as rating_count,
  ROUND(AVG(score), 2) as avg_rating
FROM ratings
WHERE target_type = 'schema'
GROUP BY target_id;

CREATE VIEW IF NOT EXISTS patch_ratings AS
SELECT
  target_id as patch_id,
  COUNT(*) as rating_count,
  ROUND(AVG(score), 2) as avg_rating
FROM ratings
WHERE target_type = 'patch'
GROUP BY target_id;

-- Extraction jobs table for async processing
CREATE TABLE IF NOT EXISTS extraction_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'processing', 'completed', 'failed')),
  file_name TEXT NOT NULL,
  file_r2_key TEXT,
  gemini_file_uri TEXT,
  schema_id TEXT REFERENCES synth_schemas(id),
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_jobs_user ON extraction_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON extraction_jobs(status);
