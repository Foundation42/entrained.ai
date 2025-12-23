// Auth integration with shared auth.entrained.ai service
import type { Env, Profile, ProfileRow, CommunityType, WhoCanPost, WhoCanComment, WhoCanView, WhoCanJoin } from '../types';
import { nanoid } from 'nanoid';
import { queueWelcomeNotification } from './notifications';

// Default evaluation config for personal communities
const DEFAULT_EVALUATION_CONFIG = JSON.stringify({
  good_faith_weight: 1,
  substantive_weight: 1,
  charitable_weight: 1,
  source_quality_weight: 1
});

const AUTH_SERVICE_URL = 'https://auth.entrained.ai';

// Response from auth.entrained.ai/api/verify
interface AuthVerifyResponse {
  valid: boolean;
  user?: {
    id: string;
    email: string;
  };
  error?: string;
}

// Verify token with auth service
export async function verifyToken(
  token: string,
  env: Env
): Promise<{ authUserId: string; email: string } | null> {
  try {
    console.log('[Auth] Verifying token with auth service...');
    const response = await fetch(`${AUTH_SERVICE_URL}/api/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('[Auth] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('[Auth] Response error:', errorText);
      return null;
    }

    const data = await response.json() as AuthVerifyResponse;
    console.log('[Auth] Response data:', JSON.stringify(data));

    if (!data.valid || !data.user) {
      console.log('[Auth] Invalid response - valid:', data.valid, 'user:', !!data.user);
      return null;
    }

    console.log('[Auth] Token verified for user:', data.user.email);
    return {
      authUserId: data.user.id,
      email: data.user.email,
    };
  } catch (err) {
    console.error('[Auth] Verification error:', err);
    return null;
  }
}

// Convert database row to Profile object
export function rowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    auth_user_id: row.auth_user_id,
    username: row.username,
    created_at: row.created_at,
    stats: {
      good_faith: row.stats_good_faith,
      substantive: row.stats_substantive,
      charitable: row.stats_charitable,
      source_quality: row.stats_source_quality,
    },
    level: row.level,
    xp: row.xp || 0,
    class: row.class as Profile['class'],
    cloak_quota: row.cloak_quota,
    avatar_url: row.avatar_url ?? undefined,
  };
}

// Get or create GoodFaith profile for authenticated user
export async function getOrCreateProfile(
  authUserId: string,
  suggestedUsername: string,
  env: Env
): Promise<Profile> {
  // Try to find existing profile
  const existingRow = await env.DB.prepare(
    'SELECT * FROM profiles WHERE auth_user_id = ?'
  ).bind(authUserId).first<ProfileRow>();

  if (existingRow) {
    return rowToProfile(existingRow);
  }

  // Create new profile
  const profileId = nanoid();
  const now = Date.now();

  // Ensure username is unique - append random suffix if needed
  let username = sanitizeUsername(suggestedUsername);
  let attempts = 0;

  while (attempts < 5) {
    const existing = await env.DB.prepare(
      'SELECT id FROM profiles WHERE username = ?'
    ).bind(username).first();

    if (!existing) break;

    // Append random suffix
    username = `${sanitizeUsername(suggestedUsername)}_${nanoid(4)}`;
    attempts++;
  }

  await env.DB.prepare(`
    INSERT INTO profiles (id, auth_user_id, username, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(profileId, authUserId, username, now).run();

  // Fetch the created profile
  const row = await env.DB.prepare(
    'SELECT * FROM profiles WHERE id = ?'
  ).bind(profileId).first<ProfileRow>();

  if (!row) {
    throw new Error('Failed to create profile');
  }

  const profile = rowToProfile(row);

  // Create personal communities for the new user
  await createPersonalCommunities(profile, env);

  return profile;
}

// Create personal communities for a user (timeline + inbox)
async function createPersonalCommunities(profile: Profile, env: Env): Promise<void> {
  const now = Date.now();

  // Create personal timeline: u/{username}
  const timelineId = nanoid();
  const timelineName = `u_${profile.username}`;

  await env.DB.prepare(`
    INSERT INTO communities (
      id, name, display_name, description, created_at, created_by,
      evaluation_config, member_count,
      community_type, who_can_post, who_can_comment, who_can_view, who_can_join,
      owner_profile_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    timelineId,
    timelineName,
    `${profile.username}'s Timeline`,
    `Personal posts and updates from ${profile.username}`,
    now,
    profile.id,
    DEFAULT_EVALUATION_CONFIG,
    1, // owner is automatically a member
    'personal_timeline' as CommunityType,
    'owner' as WhoCanPost,      // Only owner can post
    'anyone' as WhoCanComment,  // Anyone can comment
    'public' as WhoCanView,     // Public visibility
    'open' as WhoCanJoin,       // Anyone can follow/join
    profile.id
  ).run();

  // Add owner as member of their timeline
  await env.DB.prepare(`
    INSERT INTO community_members (id, community_id, profile_id, joined_at)
    VALUES (?, ?, ?, ?)
  `).bind(nanoid(), timelineId, profile.id, now).run();

  // Create inbox: u/{username}/inbox
  const inboxId = nanoid();
  const inboxName = `u_${profile.username}_inbox`;

  await env.DB.prepare(`
    INSERT INTO communities (
      id, name, display_name, description, created_at, created_by,
      evaluation_config, member_count,
      community_type, who_can_post, who_can_comment, who_can_view, who_can_join,
      owner_profile_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    inboxId,
    inboxName,
    `${profile.username}'s Inbox`,
    'Private messages and notifications',
    now,
    profile.id,
    DEFAULT_EVALUATION_CONFIG,
    1,
    'inbox' as CommunityType,
    'system' as WhoCanPost,     // Only system can post notifications
    'owner' as WhoCanComment,   // Only owner can reply
    'owner' as WhoCanView,      // Only owner can view
    'none' as WhoCanJoin,       // Nobody can join
    profile.id
  ).run();

  // Add owner as member of their inbox
  await env.DB.prepare(`
    INSERT INTO community_members (id, community_id, profile_id, joined_at)
    VALUES (?, ?, ?, ?)
  `).bind(nanoid(), inboxId, profile.id, now).run();

  // Queue welcome notification to their inbox
  if (env.NOTIFICATIONS_QUEUE) {
    await queueWelcomeNotification(env.NOTIFICATIONS_QUEUE, profile).catch(err =>
      console.error('[Auth] Welcome notification queue failed:', err)
    );
  }
}

// Get profile by auth user ID
export async function getProfileByAuthUser(
  authUserId: string,
  env: Env
): Promise<Profile | null> {
  const row = await env.DB.prepare(
    'SELECT * FROM profiles WHERE auth_user_id = ?'
  ).bind(authUserId).first<ProfileRow>();

  if (!row) return null;

  return rowToProfile(row);
}

// Get profile by profile ID
export async function getProfileById(
  profileId: string,
  env: Env
): Promise<Profile | null> {
  const row = await env.DB.prepare(
    'SELECT * FROM profiles WHERE id = ?'
  ).bind(profileId).first<ProfileRow>();

  if (!row) return null;

  return rowToProfile(row);
}

// Auth middleware helper - extract profile from request
export async function getAuthProfile(
  request: Request,
  env: Env
): Promise<Profile | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  const authResult = await verifyToken(token, env);

  if (!authResult) return null;

  // Get existing profile (don't auto-create here)
  return getProfileByAuthUser(authResult.authUserId, env);
}

// Sanitize username for URL safety
function sanitizeUsername(input: string): string {
  // Take email prefix or use as-is
  const base = input.includes('@') ? input.split('@')[0] : input;

  // Remove invalid characters, limit length
  return base
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20) || 'user';
}

// Validate username format
export function isValidUsername(username: string): boolean {
  // 3-20 chars, alphanumeric and underscores, must start with letter
  return /^[a-z][a-z0-9_]{2,19}$/.test(username);
}

// Calculate user level from stats
export function calculateLevel(stats: Profile['stats']): number {
  const avgScore = (
    stats.good_faith +
    stats.substantive +
    stats.charitable +
    stats.source_quality
  ) / 4;

  if (avgScore >= 90) return 10;
  if (avgScore >= 85) return 9;
  if (avgScore >= 80) return 8;
  if (avgScore >= 75) return 7;
  if (avgScore >= 70) return 6;
  if (avgScore >= 65) return 5;
  if (avgScore >= 60) return 4;
  if (avgScore >= 55) return 3;
  if (avgScore >= 50) return 2;
  return 1;
}

// Determine user class based on stat distribution
export function determineClass(stats: Profile['stats']): Profile['class'] {
  const level = calculateLevel(stats);
  if (level < 5) return null;

  const { good_faith, substantive, charitable, source_quality } = stats;
  const max = Math.max(good_faith, substantive, charitable, source_quality);

  if (max < 70) return null;

  if (source_quality === max) return 'scholar';
  if (charitable === max) return 'mediator';
  if (substantive === max) return 'advocate';
  if (good_faith === max) return 'synthesizer';

  return null;
}
