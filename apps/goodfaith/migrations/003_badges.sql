-- Badges system for achievements and recognition

-- Badge definitions
CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,  -- From sprites.entrained.ai
  category TEXT DEFAULT 'achievement',  -- achievement, milestone, special, community
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_badges_category ON badges(category);

-- Badges awarded to users
CREATE TABLE IF NOT EXISTS user_badges (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at INTEGER NOT NULL,
  awarded_by TEXT REFERENCES profiles(id),  -- null if system-awarded
  reason TEXT,  -- Optional note about why they earned it
  UNIQUE(profile_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_profile ON user_badges(profile_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_awarded ON user_badges(awarded_at DESC);
