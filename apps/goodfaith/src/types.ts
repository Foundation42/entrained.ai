// GoodFaith Platform Types
// Note: Authentication handled by auth.entrained.ai

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ENVIRONMENT: string;
  DOMAIN: string;
  PARENT_SITE: string;
  AI_MODEL: string;
  GEMINI_API_KEY: string;
}

// Profile types (linked to auth.entrained.ai users)
export type ClassType = 'scholar' | 'mediator' | 'advocate' | 'synthesizer';

export interface ProfileStats {
  good_faith: number;
  substantive: number;
  charitable: number;
  source_quality: number;
}

export interface Profile {
  id: string;
  auth_user_id: string;  // From auth.entrained.ai
  username: string;
  created_at: number;
  stats: ProfileStats;
  level: number;
  class: ClassType | null;
  cloak_quota: number;
  avatar_url?: string;  // From sprites.entrained.ai via EAP
}

export interface ProfileRow {
  id: string;
  auth_user_id: string;
  username: string;
  created_at: number;
  stats_good_faith: number;
  stats_substantive: number;
  stats_charitable: number;
  stats_source_quality: number;
  level: number;
  class: string | null;
  cloak_quota: number;
  avatar_url: string | null;
}

// Community types
export interface EvaluationConfig {
  good_faith_weight: number;
  substantive_weight: number;
  charitable_weight: number;
  source_quality_weight: number;
  custom_criteria?: CustomCriteria[];
}

export interface CustomCriteria {
  name: string;
  description: string;
  weight: number;
  prompt_addition: string;
}

export interface Community {
  id: string;
  name: string;
  display_name: string;
  description: string;
  created_at: number;
  created_by: string;
  evaluation_config: EvaluationConfig;
  min_level_to_post?: number;
  min_good_faith_score?: number;
  require_sources_for_claims: boolean;
  member_count: number;
  post_count: number;
}

export interface CommunityRow {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  created_at: number;
  created_by: string;
  evaluation_config: string;
  min_level_to_post: number | null;
  min_good_faith_score: number | null;
  require_sources_for_claims: number;
  member_count: number;
  post_count: number;
}

// Post types
export interface SentimentBreakdown {
  agree: number;
  disagree: number;
  neutral: number;
  reasoning_themes: {
    theme: string;
    count: number;
    representative_quote: string;
  }[];
}

export interface Post {
  id: string;
  community_id: string;
  author_id: string;
  author_cloaked: boolean;
  title: string;
  content: string;
  created_at: number;
  edited_at?: number;
  evaluation_id: string;
  comment_count: number;
  sentiment_distribution?: SentimentBreakdown;
  locked: boolean;
  locked_reason?: string;
}

export interface PostRow {
  id: string;
  community_id: string;
  author_id: string;
  author_cloaked: number;
  title: string;
  content: string;
  created_at: number;
  edited_at: number | null;
  evaluation_id: string | null;
  comment_count: number;
  sentiment_distribution: string | null;
  locked: number;
  locked_reason: string | null;
}

// Comment types
export type Sentiment = 'agree' | 'disagree' | 'neutral';

export interface Comment {
  id: string;
  post_id: string;
  parent_id?: string;
  author_id: string;
  author_cloaked: boolean;
  content: string;
  created_at: number;
  edited_at?: number;
  evaluation_id: string;
  sentiment?: Sentiment;
  sentiment_reasoning?: string;
  depth: number;
  path: string;
  child_count: number;
  force_uncloaked: boolean;
}

export interface CommentRow {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string;
  author_cloaked: number;
  content: string;
  created_at: number;
  edited_at: number | null;
  evaluation_id: string | null;
  sentiment: string | null;
  sentiment_reasoning: string | null;
  depth: number;
  path: string;
  child_count: number;
  force_uncloaked: number;
}

// Evaluation types
export type FlagType = 'strawman' | 'ad_hominem' | 'unsourced_claim' | 'misrepresentation' | 'inflammatory';
export type FlagSeverity = 'info' | 'warning' | 'critical';

export interface EvaluationFlag {
  type: FlagType;
  severity: FlagSeverity;
  explanation: string;
  quote?: string;
}

export interface ContentEvaluation {
  id: string;
  content_id: string;
  content_type: 'post' | 'comment';
  evaluated_at: number;
  model_version: string;
  scores: ProfileStats;
  flags: EvaluationFlag[];
  suggestions: string[];
  reasoning: string;
  quoted_text?: string[];
}

export interface EvaluationRow {
  id: string;
  content_id: string;
  content_type: string;
  evaluated_at: number;
  model_version: string;
  score_good_faith: number;
  score_substantive: number;
  score_charitable: number;
  score_source_quality: number;
  flags: string | null;
  suggestions: string | null;
  reasoning: string | null;
}

// Action types
export type ActionType =
  | 'post_created'
  | 'comment_created'
  | 'content_edited'
  | 'revised_after_flag'
  | 'acknowledged_counterpoint'
  | 'provided_source'
  | 'uncloaked_voluntarily'
  | 'ability_used';

export interface StatImpact {
  good_faith_delta: number;
  substantive_delta: number;
  charitable_delta: number;
  source_quality_delta: number;
  cloak_quota_delta: number;
}

export interface ProfileAction {
  id: string;
  profile_id: string;
  action_type: ActionType;
  target_id: string;
  community_id: string;
  timestamp: number;
  impact: StatImpact;
}

// API response types
export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  data: T;
}
