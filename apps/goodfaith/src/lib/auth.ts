// Auth integration with shared auth.entrained.ai service
import type { Env, Profile, ProfileRow } from '../types';
import { nanoid } from 'nanoid';

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
    const response = await fetch(`${AUTH_SERVICE_URL}/api/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as AuthVerifyResponse;

    if (!data.valid || !data.user) {
      return null;
    }

    return {
      authUserId: data.user.id,
      email: data.user.email,
    };
  } catch {
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
    class: row.class as Profile['class'],
    cloak_quota: row.cloak_quota,
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

  return rowToProfile(row);
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
