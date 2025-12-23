-- Community Permissions System
-- Adds permission fields to communities for personal timelines, inboxes, etc.

-- Community type: what kind of community this is
-- 'public' - regular public community
-- 'personal_timeline' - user's personal timeline (u/username)
-- 'inbox' - user's inbox for notifications/messages (u/username/inbox)
-- 'private' - private community (invite only)
ALTER TABLE communities ADD COLUMN community_type TEXT NOT NULL DEFAULT 'public';

-- Permission fields
-- who_can_post: 'owner' | 'members' | 'anyone' | 'system'
ALTER TABLE communities ADD COLUMN who_can_post TEXT NOT NULL DEFAULT 'members';

-- who_can_comment: 'owner' | 'members' | 'anyone'
ALTER TABLE communities ADD COLUMN who_can_comment TEXT NOT NULL DEFAULT 'anyone';

-- who_can_view: 'public' | 'members' | 'owner'
ALTER TABLE communities ADD COLUMN who_can_view TEXT NOT NULL DEFAULT 'public';

-- who_can_join: 'open' | 'approval' | 'invite' | 'none'
ALTER TABLE communities ADD COLUMN who_can_join TEXT NOT NULL DEFAULT 'open';

-- owner_profile_id: for personal communities, links to the owner's profile
-- (distinct from created_by which tracks who created any community)
ALTER TABLE communities ADD COLUMN owner_profile_id TEXT REFERENCES profiles(id);

-- Create index for finding personal communities by owner
CREATE INDEX IF NOT EXISTS idx_communities_owner ON communities(owner_profile_id);
CREATE INDEX IF NOT EXISTS idx_communities_type ON communities(community_type);
