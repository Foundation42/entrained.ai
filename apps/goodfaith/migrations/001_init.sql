-- GoodFaith Platform Database Schema
-- Version: 1.0.0
-- Note: Authentication handled by shared auth.entrained.ai service

-- User profiles (linked to auth.entrained.ai users by auth_user_id)
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  auth_user_id TEXT UNIQUE NOT NULL,  -- From auth.entrained.ai
  username TEXT UNIQUE NOT NULL,       -- GoodFaith display name
  created_at INTEGER NOT NULL,

  -- Global stats (0-100)
  stats_good_faith REAL DEFAULT 50,
  stats_substantive REAL DEFAULT 50,
  stats_charitable REAL DEFAULT 50,
  stats_source_quality REAL DEFAULT 50,

  level INTEGER DEFAULT 1,
  class TEXT,  -- 'scholar' | 'mediator' | 'advocate' | 'synthesizer'
  cloak_quota REAL DEFAULT 90
);
CREATE INDEX IF NOT EXISTS idx_profiles_auth_user ON profiles(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_level ON profiles(level DESC);

-- Communities
CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES profiles(id),

  -- Evaluation config (stored as JSON)
  evaluation_config TEXT NOT NULL DEFAULT '{"good_faith_weight":1,"substantive_weight":1,"charitable_weight":1,"source_quality_weight":1}',

  -- Requirements
  min_level_to_post INTEGER,
  min_good_faith_score REAL,
  require_sources_for_claims INTEGER DEFAULT 0,

  -- Metrics
  member_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_communities_name ON communities(name);
CREATE INDEX IF NOT EXISTS idx_communities_created_at ON communities(created_at DESC);

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  community_id TEXT REFERENCES communities(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES profiles(id),
  author_cloaked INTEGER NOT NULL DEFAULT 0,

  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,

  evaluation_id TEXT,

  comment_count INTEGER DEFAULT 0,
  sentiment_distribution TEXT, -- JSON

  locked INTEGER DEFAULT 0,
  locked_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_community ON posts(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES profiles(id),
  author_cloaked INTEGER NOT NULL DEFAULT 0,

  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,

  evaluation_id TEXT,

  sentiment TEXT, -- 'agree' | 'disagree' | 'neutral'
  sentiment_reasoning TEXT,

  -- Threading (materialized path)
  depth INTEGER NOT NULL DEFAULT 0,
  path TEXT NOT NULL,
  child_count INTEGER DEFAULT 0,

  force_uncloaked INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, path);
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

-- Evaluations
CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL, -- 'post' | 'comment'
  evaluated_at INTEGER NOT NULL,
  model_version TEXT NOT NULL,

  -- Scores (0-100)
  score_good_faith REAL,
  score_substantive REAL,
  score_charitable REAL,
  score_source_quality REAL,

  -- Details (stored as JSON)
  flags TEXT, -- JSON array of EvaluationFlag
  suggestions TEXT, -- JSON array of strings
  reasoning TEXT
);
CREATE INDEX IF NOT EXISTS idx_evaluations_content ON evaluations(content_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_created_at ON evaluations(evaluated_at DESC);

-- User actions (event log for stat calculation)
CREATE TABLE IF NOT EXISTS user_actions (
  id TEXT PRIMARY KEY,
  profile_id TEXT REFERENCES profiles(id),
  action_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  community_id TEXT,
  timestamp INTEGER NOT NULL,

  impact TEXT -- JSON of stat deltas
);
CREATE INDEX IF NOT EXISTS idx_actions_profile ON user_actions(profile_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_actions_community ON user_actions(community_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_actions_timestamp ON user_actions(timestamp DESC);

-- Community memberships
CREATE TABLE IF NOT EXISTS community_members (
  id TEXT PRIMARY KEY,
  community_id TEXT REFERENCES communities(id) ON DELETE CASCADE,
  profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,

  -- Community-specific stats
  stats_good_faith REAL DEFAULT 50,
  stats_substantive REAL DEFAULT 50,
  stats_charitable REAL DEFAULT 50,
  stats_source_quality REAL DEFAULT 50,

  level INTEGER DEFAULT 1,

  UNIQUE(community_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_members_community ON community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_members_profile ON community_members(profile_id);

-- Ability usage tracking
CREATE TABLE IF NOT EXISTS ability_usage (
  id TEXT PRIMARY KEY,
  profile_id TEXT REFERENCES profiles(id),
  ability_id TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  target_id TEXT,

  result TEXT -- JSON of what happened
);
CREATE INDEX IF NOT EXISTS idx_ability_usage_profile ON ability_usage(profile_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_ability_usage_ability ON ability_usage(ability_id, used_at DESC);
