-- Add XP tracking to profiles
ALTER TABLE profiles ADD COLUMN xp INTEGER DEFAULT 0;
