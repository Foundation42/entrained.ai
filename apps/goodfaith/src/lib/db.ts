// Database utilities for GoodFaith
import type {
  Env,
  Profile,
  ProfileRow,
  Community,
  CommunityRow,
  Post,
  PostRow,
  Comment,
  CommentRow,
  ContentEvaluation,
  EvaluationRow,
  EvaluationConfig
} from '../types';

// Convert community row to Community object
export function rowToCommunity(row: CommunityRow): Community {
  return {
    id: row.id,
    name: row.name,
    display_name: row.display_name,
    description: row.description ?? '',
    created_at: row.created_at,
    created_by: row.created_by,
    evaluation_config: JSON.parse(row.evaluation_config) as EvaluationConfig,
    min_level_to_post: row.min_level_to_post ?? undefined,
    min_good_faith_score: row.min_good_faith_score ?? undefined,
    require_sources_for_claims: row.require_sources_for_claims === 1,
    member_count: row.member_count,
    post_count: row.post_count,
    image_url: row.image_url ?? undefined,
  };
}

// Convert post row to Post object
export function rowToPost(row: PostRow): Post {
  return {
    id: row.id,
    community_id: row.community_id,
    author_id: row.author_id,
    author_cloaked: row.author_cloaked === 1,
    title: row.title,
    content: row.content,
    created_at: row.created_at,
    edited_at: row.edited_at ?? undefined,
    evaluation_id: row.evaluation_id ?? '',
    comment_count: row.comment_count,
    sentiment_distribution: row.sentiment_distribution
      ? JSON.parse(row.sentiment_distribution)
      : undefined,
    locked: row.locked === 1,
    locked_reason: row.locked_reason ?? undefined,
  };
}

// Convert comment row to Comment object
export function rowToComment(row: CommentRow): Comment {
  return {
    id: row.id,
    post_id: row.post_id,
    parent_id: row.parent_id ?? undefined,
    author_id: row.author_id,
    author_cloaked: row.author_cloaked === 1,
    content: row.content,
    created_at: row.created_at,
    edited_at: row.edited_at ?? undefined,
    evaluation_id: row.evaluation_id ?? '',
    sentiment: row.sentiment as Comment['sentiment'],
    sentiment_reasoning: row.sentiment_reasoning ?? undefined,
    depth: row.depth,
    path: row.path,
    child_count: row.child_count,
    force_uncloaked: row.force_uncloaked === 1,
  };
}

// Convert evaluation row to ContentEvaluation object
export function rowToEvaluation(row: EvaluationRow): ContentEvaluation {
  return {
    id: row.id,
    content_id: row.content_id,
    content_type: row.content_type as ContentEvaluation['content_type'],
    evaluated_at: row.evaluated_at,
    model_version: row.model_version,
    scores: {
      good_faith: row.score_good_faith,
      substantive: row.score_substantive,
      charitable: row.score_charitable,
      source_quality: row.score_source_quality,
    },
    flags: row.flags ? JSON.parse(row.flags) : [],
    suggestions: row.suggestions ? JSON.parse(row.suggestions) : [],
    reasoning: row.reasoning ?? '',
  };
}

// Save evaluation to database
export async function saveEvaluation(
  db: D1Database,
  evaluation: ContentEvaluation
): Promise<void> {
  await db.prepare(`
    INSERT INTO evaluations (
      id, content_id, content_type, evaluated_at, model_version,
      score_good_faith, score_substantive, score_charitable, score_source_quality,
      flags, suggestions, reasoning
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    evaluation.id,
    evaluation.content_id,
    evaluation.content_type,
    evaluation.evaluated_at,
    evaluation.model_version,
    evaluation.scores.good_faith,
    evaluation.scores.substantive,
    evaluation.scores.charitable,
    evaluation.scores.source_quality,
    JSON.stringify(evaluation.flags),
    JSON.stringify(evaluation.suggestions),
    evaluation.reasoning
  ).run();
}

// Generate materialized path for comment threading
export async function generateCommentPath(
  db: D1Database,
  postId: string,
  parentId?: string
): Promise<{ path: string; depth: number }> {
  if (!parentId) {
    // Top-level comment - find next sibling number
    const result = await db.prepare(`
      SELECT MAX(CAST(path AS INTEGER)) as max_path
      FROM comments
      WHERE post_id = ? AND parent_id IS NULL
    `).bind(postId).first<{ max_path: number | null }>();

    const nextNum = (result?.max_path ?? 0) + 1;
    return {
      path: nextNum.toString().padStart(6, '0'),
      depth: 0
    };
  }

  // Reply to existing comment
  const parent = await db.prepare(`
    SELECT path, depth FROM comments WHERE id = ?
  `).bind(parentId).first<{ path: string; depth: number }>();

  if (!parent) {
    throw new Error('Parent comment not found');
  }

  // Find next sibling under this parent
  const result = await db.prepare(`
    SELECT COUNT(*) as count FROM comments
    WHERE post_id = ? AND parent_id = ?
  `).bind(postId, parentId).first<{ count: number }>();

  const siblingNum = (result?.count ?? 0) + 1;

  return {
    path: `${parent.path}.${siblingNum.toString().padStart(4, '0')}`,
    depth: parent.depth + 1
  };
}

// Award XP to a profile
export async function awardXP(
  db: D1Database,
  profileId: string,
  baseXP: number,
  qualityMultiplier: number = 1.0
): Promise<number> {
  // Calculate final XP with quality bonus
  const xpAwarded = Math.round(baseXP * qualityMultiplier);

  await db.prepare(
    'UPDATE profiles SET xp = xp + ? WHERE id = ?'
  ).bind(xpAwarded, profileId).run();

  return xpAwarded;
}

// Update profile stats after evaluation
export async function updateProfileStats(
  db: D1Database,
  profileId: string,
  statDeltas: {
    good_faith?: number;
    substantive?: number;
    charitable?: number;
    source_quality?: number;
  },
  quotaDelta: number = 0
): Promise<void> {
  // Fetch current stats
  const profile = await db.prepare(
    'SELECT * FROM profiles WHERE id = ?'
  ).bind(profileId).first<ProfileRow>();

  if (!profile) return;

  // Apply deltas with clamping
  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  const newStats = {
    good_faith: clamp(profile.stats_good_faith + (statDeltas.good_faith ?? 0)),
    substantive: clamp(profile.stats_substantive + (statDeltas.substantive ?? 0)),
    charitable: clamp(profile.stats_charitable + (statDeltas.charitable ?? 0)),
    source_quality: clamp(profile.stats_source_quality + (statDeltas.source_quality ?? 0)),
  };

  const newQuota = clamp(profile.cloak_quota + quotaDelta);

  // Calculate new level
  const avgScore = (
    newStats.good_faith +
    newStats.substantive +
    newStats.charitable +
    newStats.source_quality
  ) / 4;

  let newLevel = 1;
  if (avgScore >= 90) newLevel = 10;
  else if (avgScore >= 85) newLevel = 9;
  else if (avgScore >= 80) newLevel = 8;
  else if (avgScore >= 75) newLevel = 7;
  else if (avgScore >= 70) newLevel = 6;
  else if (avgScore >= 65) newLevel = 5;
  else if (avgScore >= 60) newLevel = 4;
  else if (avgScore >= 55) newLevel = 3;
  else if (avgScore >= 50) newLevel = 2;

  await db.prepare(`
    UPDATE profiles SET
      stats_good_faith = ?,
      stats_substantive = ?,
      stats_charitable = ?,
      stats_source_quality = ?,
      cloak_quota = ?,
      level = ?
    WHERE id = ?
  `).bind(
    newStats.good_faith,
    newStats.substantive,
    newStats.charitable,
    newStats.source_quality,
    newQuota,
    newLevel,
    profileId
  ).run();
}
