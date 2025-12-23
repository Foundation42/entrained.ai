-- Backfill personal communities for existing users

-- Chris's timeline
INSERT INTO communities (
  id, name, display_name, description, created_at, created_by,
  evaluation_config, member_count,
  community_type, who_can_post, who_can_comment, who_can_view, who_can_join,
  owner_profile_id
) VALUES (
  'personal_chris_timeline',
  'u_chris',
  'chris''s Timeline',
  'Personal posts and updates from chris',
  1735023600000,
  'IdhTV48UlimOsOCLZHYgv',
  '{"good_faith_weight":1,"substantive_weight":1,"charitable_weight":1,"source_quality_weight":1}',
  1,
  'personal_timeline',
  'owner',
  'anyone',
  'public',
  'open',
  'IdhTV48UlimOsOCLZHYgv'
);

-- Chris as member of their timeline
INSERT INTO community_members (id, community_id, profile_id, joined_at)
VALUES ('cm_chris_timeline', 'personal_chris_timeline', 'IdhTV48UlimOsOCLZHYgv', 1735023600000);

-- Chris's inbox
INSERT INTO communities (
  id, name, display_name, description, created_at, created_by,
  evaluation_config, member_count,
  community_type, who_can_post, who_can_comment, who_can_view, who_can_join,
  owner_profile_id
) VALUES (
  'personal_chris_inbox',
  'u_chris_inbox',
  'chris''s Inbox',
  'Private messages and notifications',
  1735023600000,
  'IdhTV48UlimOsOCLZHYgv',
  '{"good_faith_weight":1,"substantive_weight":1,"charitable_weight":1,"source_quality_weight":1}',
  1,
  'inbox',
  'system',
  'owner',
  'owner',
  'none',
  'IdhTV48UlimOsOCLZHYgv'
);

-- Chris as member of their inbox
INSERT INTO community_members (id, community_id, profile_id, joined_at)
VALUES ('cm_chris_inbox', 'personal_chris_inbox', 'IdhTV48UlimOsOCLZHYgv', 1735023600000);

-- jawardigo7782's timeline
INSERT INTO communities (
  id, name, display_name, description, created_at, created_by,
  evaluation_config, member_count,
  community_type, who_can_post, who_can_comment, who_can_view, who_can_join,
  owner_profile_id
) VALUES (
  'personal_jawardigo7782_timeline',
  'u_jawardigo7782',
  'jawardigo7782''s Timeline',
  'Personal posts and updates from jawardigo7782',
  1735023600000,
  'yEPE_EmcL1vFfreLQ-s3I',
  '{"good_faith_weight":1,"substantive_weight":1,"charitable_weight":1,"source_quality_weight":1}',
  1,
  'personal_timeline',
  'owner',
  'anyone',
  'public',
  'open',
  'yEPE_EmcL1vFfreLQ-s3I'
);

-- jawardigo7782 as member of their timeline
INSERT INTO community_members (id, community_id, profile_id, joined_at)
VALUES ('cm_jawardigo7782_timeline', 'personal_jawardigo7782_timeline', 'yEPE_EmcL1vFfreLQ-s3I', 1735023600000);

-- jawardigo7782's inbox
INSERT INTO communities (
  id, name, display_name, description, created_at, created_by,
  evaluation_config, member_count,
  community_type, who_can_post, who_can_comment, who_can_view, who_can_join,
  owner_profile_id
) VALUES (
  'personal_jawardigo7782_inbox',
  'u_jawardigo7782_inbox',
  'jawardigo7782''s Inbox',
  'Private messages and notifications',
  1735023600000,
  'yEPE_EmcL1vFfreLQ-s3I',
  '{"good_faith_weight":1,"substantive_weight":1,"charitable_weight":1,"source_quality_weight":1}',
  1,
  'inbox',
  'system',
  'owner',
  'owner',
  'none',
  'yEPE_EmcL1vFfreLQ-s3I'
);

-- jawardigo7782 as member of their inbox
INSERT INTO community_members (id, community_id, profile_id, joined_at)
VALUES ('cm_jawardigo7782_inbox', 'personal_jawardigo7782_inbox', 'yEPE_EmcL1vFfreLQ-s3I', 1735023600000);
