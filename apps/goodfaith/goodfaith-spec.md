# GoodFaith Platform Specification

## Project Overview

GoodFaith is a discussion platform that replaces popularity-based voting with AI-mediated evaluation of discourse quality. Instead of upvotes/downvotes, users must articulate their agreement/disagreement, and an AI system evaluates comments for good faith engagement, substantive contribution, and intellectual honesty.

**Deployment:** goodfaith.entrained.ai

**Research Context:** This is a research project by Entrained AI Research Institute exploring AI-mediated human collaboration. Rather than using AI to replace human dialogue, we're investigating how AI can improve the quality of human discourse by providing consistent, transparent evaluation of engagement quality.

### Core Principles

1. **No anonymous voting** - All feedback requires written articulation
2. **AI evaluates quality, not popularity** - Comments ranked by discourse quality, not consensus
3. **Cloaking with consequences** - Users can post anonymously, but lose this privilege through bad faith
4. **RPG-style progression** - Good faith engagement unlocks abilities and privileges
5. **Transparency** - All AI evaluations show their reasoning
6. **Edge-first architecture** - Built entirely on Cloudflare Workers platform

### The Problem We're Solving

Current platforms like Reddit optimize for:
- Consensus reinforcement (popular opinions rise)
- Early voting momentum (first votes determine visibility)
- In-group signaling (downvote "wrong" opinions)
- Reactive emotion over thoughtful response
- Power moderator abuse or moderator burnout

GoodFaith instead optimizes for:
- Substantive contribution (adds new information/perspective)
- Charitable interpretation (engages with strongest arguments)
- Coherence and clarity (regardless of position)
- Good faith engagement vs. bad faith rhetorical games

### Initial Communities

The platform will launch with research-focused communities that align with Entrained AI Research Institute's mission:

1. **AI Research Discussion** - Debate papers, methodologies, and approaches
2. **Alternative Architectures** - PSAM, non-transformer approaches, novel computational models
3. **Historical Computing** - Period-specific AI, Victorian language models, computational archaeology
4. **Consciousness & Emergence** - AI consciousness, field theories, gauge-first mathematics
5. **Meta: Platform Feedback** - Discuss GoodFaith itself as a research experiment

These communities serve as both testbeds for the platform and venues for serious technical discussion.

## Technology Stack

### Infrastructure (All Cloudflare)
- **Workers**: API endpoints, AI evaluation calls
- **Durable Objects**: Real-time thread state, user sessions
- **D1**: Primary database (SQLite at edge)
- **R2**: Archive storage for old threads
- **KV**: Caching layer for hot paths
- **Pages**: Frontend hosting (SSR at edge)
- **Workers AI**: AI evaluation calls (Claude or similar)

### Frontend
- **Framework**: Remix or Next.js (SSR at edge)
- **Styling**: Tailwind CSS
- **Real-time**: WebSockets via Durable Objects
- **Markdown**: Marked.js with DOMPurify sanitization

### Language
- **TypeScript** throughout for type safety

### Authentication
- **Cloudflare Access** or simple JWT with email verification
- Email domain age verification to prevent spam accounts

## Data Model

### Users

```typescript
interface User {
  id: string;                    // UUID
  username: string;              // unique, URL-safe
  email: string;                 // for auth
  created_at: number;            // Unix timestamp
  
  // Global reputation stats
  stats: {
    good_faith: number;          // 0-100
    substantive: number;         // 0-100
    charitable: number;          // 0-100
    source_quality: number;      // 0-100
  };
  
  level: number;                 // derived from stats
  class: ClassType | null;       // 'scholar' | 'mediator' | 'advocate' | 'synthesizer'
  
  cloak_quota: number;           // 0-100, percentage of cloaked comments allowed
  
  // Per-community stats (denormalized for performance)
  community_stats: Map<string, CommunityReputation>;
}

interface CommunityReputation {
  community_id: string;
  stats: UserStats;              // same structure as global stats
  level: number;
  joined_at: number;
}

type ClassType = 'scholar' | 'mediator' | 'advocate' | 'synthesizer';

interface UserStats {
  good_faith: number;
  substantive: number;
  charitable: number;
  source_quality: number;
}
```

### Communities (Subreddits equivalent)

```typescript
interface Community {
  id: string;
  name: string;                  // unique, URL-safe (e.g., 'climate-policy')
  display_name: string;          // human-readable (e.g., 'Climate Policy Debate')
  description: string;           // markdown
  created_at: number;
  created_by: string;            // user_id
  
  // AI evaluation criteria weights (community-specific)
  evaluation_config: {
    good_faith_weight: number;
    substantive_weight: number;
    charitable_weight: number;
    source_quality_weight: number;
    custom_criteria?: CustomCriteria[];
  };
  
  // Community requirements
  min_level_to_post?: number;
  min_good_faith_score?: number;
  require_sources_for_claims: boolean;
  
  // Metrics
  member_count: number;
  post_count: number;
}

interface CustomCriteria {
  name: string;
  description: string;
  weight: number;
  prompt_addition: string;       // added to AI evaluation prompt
}
```

### Posts

```typescript
interface Post {
  id: string;
  community_id: string;
  author_id: string;
  author_cloaked: boolean;       // was author cloaked when posting?
  
  title: string;
  content: string;               // markdown
  created_at: number;
  edited_at?: number;
  
  // AI evaluation results
  evaluation_id: string;
  
  // Aggregated metrics
  comment_count: number;
  sentiment_distribution: SentimentBreakdown;
  
  // Moderation
  locked: boolean;
  locked_reason?: string;
}

interface SentimentBreakdown {
  agree: number;                 // count
  disagree: number;
  neutral: number;
  
  // Qualitative breakdown
  reasoning_themes: {
    theme: string;               // e.g., "economic concerns"
    count: number;
    representative_quote: string;
  }[];
}
```

### Comments

```typescript
interface Comment {
  id: string;
  post_id: string;
  parent_id?: string;            // null for top-level comments
  author_id: string;
  author_cloaked: boolean;
  
  content: string;               // markdown
  created_at: number;
  edited_at?: number;
  
  // AI evaluation
  evaluation_id: string;
  
  // Required sentiment (replaces upvote/downvote)
  sentiment?: 'agree' | 'disagree' | 'neutral';
  sentiment_reasoning?: string;  // required if sentiment is agree/disagree
  
  // Threading (for efficient display)
  depth: number;                 // 0 for top-level
  path: string;                  // materialized path e.g., "001.002.001"
  child_count: number;
  
  // Forced uncloaking
  force_uncloaked: boolean;      // system forced uncloak due to quota violation
}
```

### Content Evaluation

```typescript
interface ContentEvaluation {
  id: string;
  content_id: string;
  content_type: 'post' | 'comment';
  
  evaluated_at: number;
  model_version: string;         // which AI model/prompt version
  
  // Scores (0-100)
  scores: {
    good_faith: number;
    substantive: number;
    charitable: number;
    source_quality: number;
  };
  
  // Issues found
  flags: EvaluationFlag[];
  
  // Constructive feedback
  suggestions: string[];
  
  // Transparency - why these scores?
  reasoning: string;
  quoted_text?: string[];        // specific passages that influenced evaluation
}

interface EvaluationFlag {
  type: 'strawman' | 'ad_hominem' | 'unsourced_claim' | 'misrepresentation' | 'inflammatory';
  severity: 'info' | 'warning' | 'critical';
  explanation: string;
  quote?: string;                // specific text that triggered flag
}
```

### User Actions (Event Log)

```typescript
interface UserAction {
  id: string;
  user_id: string;
  action_type: ActionType;
  target_id: string;             // post/comment id
  community_id: string;
  timestamp: number;
  
  // Impact on user stats (calculated at time of action)
  impact: {
    good_faith_delta: number;
    substantive_delta: number;
    charitable_delta: number;
    source_quality_delta: number;
    cloak_quota_delta: number;
  };
}

type ActionType = 
  | 'post_created'
  | 'comment_created'
  | 'content_edited'
  | 'revised_after_flag'         // user improved content after AI warning
  | 'acknowledged_counterpoint'  // explicitly conceded a point
  | 'provided_source'            // added source after being asked
  | 'uncloaked_voluntarily'      // chose to reveal identity
  | 'ability_used';
```

### Abilities (RPG Unlockables)

```typescript
interface Ability {
  id: string;
  name: string;
  description: string;
  
  // Requirements
  level_required: number;
  class_required?: ClassType;
  stat_requirements?: Partial<UserStats>;
  
  // Usage limits
  cooldown_hours: number;
  uses_per_day?: number;
  
  // What it does
  effect: AbilityEffect;
}

type AbilityEffect =
  | { type: 'flag_comment'; flag_type: string }
  | { type: 'request_steelman' }              // AI helps strengthen opponent's argument
  | { type: 'resurrect_thread' }              // revive dead discussion with new evidence
  | { type: 'good_faith_shield'; duration_hours: number }  // temp immunity from quota drops
  | { type: 'perspective_shift'; view_mode: string };      // see thread by different criteria

// Example abilities
const ABILITIES: Ability[] = [
  {
    id: 'citation-needed',
    name: 'Citation Needed',
    description: 'Flag an unsourced factual claim',
    level_required: 5,
    cooldown_hours: 1,
    uses_per_day: 10,
    effect: { type: 'flag_comment', flag_type: 'unsourced_claim' }
  },
  {
    id: 'steelman',
    name: 'Steelman',
    description: 'AI helps you rewrite opponent\'s argument in its strongest form',
    level_required: 10,
    cooldown_hours: 24,
    uses_per_day: 3,
    effect: { type: 'request_steelman' }
  },
  {
    id: 'resurrect',
    name: 'Thread Resurrect',
    description: 'Revive a dead discussion with new evidence',
    level_required: 15,
    cooldown_hours: 168, // 1 week
    effect: { type: 'resurrect_thread' }
  },
  {
    id: 'shield',
    name: 'Good Faith Shield',
    description: 'Temporary immunity from quota drops',
    level_required: 20,
    class_required: 'mediator',
    cooldown_hours: 720, // 30 days
    effect: { type: 'good_faith_shield', duration_hours: 168 }
  }
];
```

## Database Schema (D1/SQLite)

```sql
-- Users
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  
  -- Global stats
  stats_good_faith REAL DEFAULT 50,
  stats_substantive REAL DEFAULT 50,
  stats_charitable REAL DEFAULT 50,
  stats_source_quality REAL DEFAULT 50,
  
  level INTEGER DEFAULT 1,
  class TEXT,
  cloak_quota REAL DEFAULT 90
);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_level ON users(level DESC);

-- Communities
CREATE TABLE communities (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id),
  
  -- Evaluation config (stored as JSON)
  evaluation_config TEXT NOT NULL,
  
  -- Requirements
  min_level_to_post INTEGER,
  min_good_faith_score REAL,
  require_sources_for_claims INTEGER DEFAULT 0,
  
  -- Metrics
  member_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0
);
CREATE INDEX idx_communities_name ON communities(name);
CREATE INDEX idx_communities_created_at ON communities(created_at DESC);

-- Posts
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  community_id TEXT REFERENCES communities(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id),
  author_cloaked INTEGER NOT NULL,
  
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
CREATE INDEX idx_posts_community ON posts(community_id, created_at DESC);
CREATE INDEX idx_posts_author ON posts(author_id, created_at DESC);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);

-- Comments
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id),
  author_cloaked INTEGER NOT NULL,
  
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  
  evaluation_id TEXT,
  
  sentiment TEXT, -- 'agree' | 'disagree' | 'neutral'
  sentiment_reasoning TEXT,
  
  -- Threading
  depth INTEGER NOT NULL,
  path TEXT NOT NULL,
  child_count INTEGER DEFAULT 0,
  
  force_uncloaked INTEGER DEFAULT 0
);
CREATE INDEX idx_comments_post ON comments(post_id, path);
CREATE INDEX idx_comments_author ON comments(author_id, created_at DESC);
CREATE INDEX idx_comments_parent ON comments(parent_id);

-- Evaluations
CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL, -- 'post' | 'comment'
  evaluated_at INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  
  -- Scores
  score_good_faith REAL,
  score_substantive REAL,
  score_charitable REAL,
  score_source_quality REAL,
  
  -- Details (stored as JSON)
  flags TEXT, -- JSON array of EvaluationFlag
  suggestions TEXT, -- JSON array of strings
  reasoning TEXT
);
CREATE INDEX idx_evaluations_content ON evaluations(content_id);
CREATE INDEX idx_evaluations_created_at ON evaluations(evaluated_at DESC);

-- User actions (event log for stat calculation)
CREATE TABLE user_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  community_id TEXT,
  timestamp INTEGER NOT NULL,
  
  impact TEXT -- JSON of stat deltas
);
CREATE INDEX idx_actions_user ON user_actions(user_id, timestamp DESC);
CREATE INDEX idx_actions_community ON user_actions(community_id, timestamp DESC);
CREATE INDEX idx_actions_timestamp ON user_actions(timestamp DESC);

-- Community memberships (for per-community stats)
CREATE TABLE community_members (
  id TEXT PRIMARY KEY,
  community_id TEXT REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  
  -- Community-specific stats
  stats_good_faith REAL DEFAULT 50,
  stats_substantive REAL DEFAULT 50,
  stats_charitable REAL DEFAULT 50,
  stats_source_quality REAL DEFAULT 50,
  
  level INTEGER DEFAULT 1,
  
  UNIQUE(community_id, user_id)
);
CREATE INDEX idx_members_community ON community_members(community_id);
CREATE INDEX idx_members_user ON community_members(user_id);

-- Ability usage tracking
CREATE TABLE ability_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  ability_id TEXT NOT NULL,
  used_at INTEGER NOT NULL,
  target_id TEXT, -- what was it used on?
  
  result TEXT -- JSON of what happened
);
CREATE INDEX idx_ability_usage_user ON ability_usage(user_id, used_at DESC);
CREATE INDEX idx_ability_usage_ability ON ability_usage(ability_id, used_at DESC);
```

## Durable Objects

### ThreadCoordinator

Manages real-time state for a single post/thread.

**Responsibilities:**
- Comment ordering and path management
- Live sentiment aggregation
- WebSocket connections for live thread updates
- Temporary evaluation results cache
- Rate limiting for rapid posting

**State:**
```typescript
class ThreadCoordinator {
  state: DurableObjectState;
  
  // In-memory cache
  comments: Map<string, Comment>;
  websockets: Set<WebSocket>;
  
  // Rate limiting
  recentComments: Map<string, number[]>; // user_id -> timestamps
  
  async fetch(request: Request) {
    // Handle WebSocket upgrades
    // Handle comment submission
    // Broadcast updates to connected clients
  }
  
  async addComment(comment: Comment) {
    // Assign path based on parent
    // Update parent's child_count
    // Persist to D1
    // Broadcast to WebSockets
  }
  
  async getSentimentBreakdown(): SentimentBreakdown {
    // Aggregate from all comments
  }
}
```

### UserSession

Manages a user's active session state.

**Responsibilities:**
- Current cloak quota tracking
- Active abilities and cooldowns
- Recent actions for rate limiting
- Draft content evaluations (pre-submit check)
- Temporary "good faith shield" status

**State:**
```typescript
class UserSession {
  state: DurableObjectState;
  userId: string;
  
  // Session state
  activeCooldowns: Map<string, number>; // ability_id -> expires_at
  dailyUsage: Map<string, number>;      // ability_id -> count today
  recentActions: UserAction[];
  
  async fetch(request: Request) {
    // Handle ability usage
    // Check cooldowns
    // Pre-flight content evaluation
  }
  
  async useAbility(abilityId: string, targetId: string) {
    // Check requirements
    // Check cooldown
    // Apply effect
    // Record usage
  }
  
  async evaluateDraft(content: string, context: any): Promise<ContentEvaluation> {
    // Call AI
    // Show predicted impact on stats
    // Cache result briefly
  }
}
```

## API Routes (Workers)

### Public Routes (Cached)

```typescript
GET /api/communities
// List all communities
// Cache: 5 minutes
// Returns: Community[]

GET /api/c/:community
// Get community details and recent posts
// Cache: 1 minute
// Returns: { community: Community, posts: Post[] }

GET /api/c/:community/p/:post
// Get post with comments (threaded)
// Cache: 30 seconds
// Returns: { post: Post, comments: Comment[], sentiment: SentimentBreakdown }

GET /api/u/:username
// Get user profile (if not cloaked or if viewing own)
// Cache: 1 minute
// Returns: { user: User, recentActivity: UserAction[] }
```

### Authenticated Routes

```typescript
POST /api/auth/signup
// Create new account
// Body: { username, email, password }
// Returns: { token, user }

POST /api/auth/login
// Authenticate
// Body: { email, password }
// Returns: { token, user }

GET /api/me
// Get current user's full profile
// Returns: { user: User, abilities: Ability[], stats: DetailedStats }

GET /api/me/abilities
// Get available abilities with cooldown status
// Returns: { abilities: AbilityStatus[] }

POST /api/c/create
// Create new community
// Body: { name, display_name, description, evaluation_config }
// Returns: { community: Community }

PUT /api/c/:community/config
// Update community evaluation criteria
// Body: { evaluation_config }
// Requires: Community creator or admin
// Returns: { community: Community }

POST /api/c/:community/post
// Create new post (with pre-flight evaluation)
// Body: { title, content, cloaked }
// Returns: { post: Post, evaluation: ContentEvaluation }

POST /api/c/:community/p/:post/comment
// Create new comment (with evaluation)
// Body: { content, parent_id?, sentiment?, sentiment_reasoning?, cloaked }
// Returns: { comment: Comment, evaluation: ContentEvaluation, quota_impact: number }

PUT /api/comment/:id
// Edit existing comment
// Body: { content }
// Returns: { comment: Comment, evaluation: ContentEvaluation }

POST /api/comment/:id/uncloak
// Voluntarily uncloak a comment
// Returns: { comment: Comment, quota_bonus: number }

POST /api/evaluate
// Get evaluation for draft content (pre-submit)
// Body: { content, context?, type }
// Returns: { evaluation: ContentEvaluation, predicted_impact: StatDeltas }

POST /api/ability/:ability_id/use
// Use an ability
// Body: { target_id, parameters? }
// Returns: { result: any, cooldown_until: number }
```

## AI Integration

### Evaluation Prompt Template

```typescript
const EVALUATION_PROMPT = `You are evaluating a comment for discourse quality on a debate platform.

Your role is to assess whether the comment engages in good faith, not whether you agree with its position.

COMMENT TO EVALUATE:
"""
{content}
"""

PARENT COMMENT (if replying):
"""
{parent_content}
"""

THREAD CONTEXT:
{thread_summary}

COMMUNITY EVALUATION CRITERIA:
{community_criteria}

USER'S RECENT BEHAVIOR:
{user_history_summary}

Evaluate on these dimensions (0-100):

1. GOOD FAITH (0-100)
   - Is this genuinely engaging with ideas vs. trolling/baiting?
   - Does it assume best intentions of others?
   - Is the tone conducive to productive discussion?

2. SUBSTANTIVE (0-100)
   - Does it add new information or perspective?
   - Is there meaningful analysis or reasoning?
   - Or is it just restating known positions?

3. CHARITABLE (0-100)
   - Does it represent opposing views accurately?
   - Does it engage with the strongest version of counterarguments?
   - Or does it strawman/misrepresent?

4. SOURCE QUALITY (0-100)
   - Are factual claims backed by credible sources?
   - Are sources appropriate for the claims made?
   - Is there proper attribution?

Look for these RED FLAGS:
- Strawman arguments (misrepresenting opponent's position)
- Ad hominem attacks (attacking person not argument)
- Unsourced factual claims (stating facts without evidence)
- Misrepresentation (twisting parent's words)
- Inflammatory language (designed to provoke not persuade)

Return JSON in this exact format:
{
  "scores": {
    "good_faith": <number 0-100>,
    "substantive": <number 0-100>,
    "charitable": <number 0-100>,
    "source_quality": <number 0-100>
  },
  "flags": [
    {
      "type": "strawman" | "ad_hominem" | "unsourced_claim" | "misrepresentation" | "inflammatory",
      "severity": "info" | "warning" | "critical",
      "explanation": "<specific explanation>",
      "quote": "<exact text that triggered this>"
    }
  ],
  "suggestions": [
    "<constructive suggestion for improvement>"
  ],
  "reasoning": "<brief explanation of scores>"
}

Remember: You can score low on good faith while disagreeing with popular opinion. Someone arguing an unpopular position with evidence and charity should score HIGHLY.`;
```

### Pre-Submit Check

```typescript
async function preSubmitCheck(
  content: string,
  context: {
    parentComment?: Comment;
    threadSummary?: string;
    user: User;
    community: Community;
  }
): Promise<{
  evaluation: ContentEvaluation;
  canSubmit: boolean;
  warnings: EvaluationFlag[];
  suggestions: string[];
  predictedImpact: {
    cloakQuotaDelta: number;
    statChanges: Partial<UserStats>;
  };
}> {
  // Call AI with prompt
  const evaluation = await evaluateContent(content, context);
  
  // Calculate predicted impact
  const impact = calculateStatImpact(evaluation, context.user);
  
  // Determine if we should warn user
  const criticalFlags = evaluation.flags.filter(f => f.severity === 'critical');
  const shouldWarn = criticalFlags.length > 0 || impact.cloakQuotaDelta < -10;
  
  return {
    evaluation,
    canSubmit: true, // Always allow, but warn
    warnings: criticalFlags,
    suggestions: evaluation.suggestions,
    predictedImpact: impact
  };
}
```

### Stat Impact Calculation

```typescript
function calculateStatImpact(
  evaluation: ContentEvaluation,
  user: User
): {
  cloakQuotaDelta: number;
  statChanges: Partial<UserStats>;
} {
  const { scores } = evaluation;
  
  // Compare to user's current stats
  const deltas = {
    good_faith: (scores.good_faith - user.stats.good_faith) * 0.05, // 5% weight per comment
    substantive: (scores.substantive - user.stats.substantive) * 0.05,
    charitable: (scores.charitable - user.stats.charitable) * 0.05,
    source_quality: (scores.source_quality - user.stats.source_quality) * 0.05,
  };
  
  // Cloak quota impact (more severe for bad faith)
  let quotaDelta = 0;
  if (scores.good_faith < 30) quotaDelta = -10;
  else if (scores.good_faith < 50) quotaDelta = -5;
  else if (scores.good_faith > 80) quotaDelta = +2;
  
  // Critical flags have additional penalty
  const criticalCount = evaluation.flags.filter(f => f.severity === 'critical').length;
  quotaDelta -= criticalCount * 5;
  
  return {
    cloakQuotaDelta: quotaDelta,
    statChanges: deltas
  };
}
```

### Sentiment Extraction

```typescript
async function extractSentiment(
  reasoning: string,
  parentContent: string
): Promise<{
  position: 'support' | 'counterpoint' | 'clarification';
  quality: number; // 0-100
  themes: string[];
}> {
  const prompt = `
Analyze this comment's sentiment reasoning:

PARENT COMMENT:
"""
${parentContent}
"""

SENTIMENT REASONING:
"""
${reasoning}
"""

Classify:
1. Position: Is this 'support' (agrees), 'counterpoint' (disagrees), or 'clarification' (neutral)?
2. Quality: How well-reasoned is this? (0-100)
3. Themes: What are the main themes/concerns? (max 3)

Return JSON:
{
  "position": "support" | "counterpoint" | "clarification",
  "quality": <number>,
  "themes": ["theme1", "theme2"]
}
`;

  const result = await callAI(prompt);
  return JSON.parse(result);
}
```

## Caching Strategy

### Worker KV Cache

```typescript
// User stats: 5min TTL, update on write
await KV.put(`user:${userId}:stats`, JSON.stringify(user.stats), {
  expirationTtl: 300
});

// Community config: 1hr TTL
await KV.put(`community:${communityId}:config`, JSON.stringify(config), {
  expirationTtl: 3600
});

// Evaluation results: Permanent (immutable once created)
await KV.put(`eval:${contentId}`, JSON.stringify(evaluation));

// Thread metadata: 1min TTL
await KV.put(`thread:${postId}:meta`, JSON.stringify(metadata), {
  expirationTtl: 60
});
```

### HTTP Cache Headers

```typescript
// User profiles
res.headers.set('Cache-Control', 'public, max-age=60');

// Thread views
res.headers.set('Cache-Control', 'public, max-age=30');

// Community lists
res.headers.set('Cache-Control', 'public, max-age=300');

// Static assets
res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
```

## Rate Limiting & Abuse Prevention

### Per-User Limits

```typescript
const RATE_LIMITS = {
  // Posting
  comments_per_minute: 2,
  comments_per_hour: 30,
  posts_per_day: 10,
  
  // AI evaluation budget
  evaluations_per_day: 100,
  
  // Ability usage (per ability)
  ability_cooldowns: {
    'citation-needed': 3600,      // 1 hour
    'steelman': 86400,            // 24 hours
    'resurrect': 604800,          // 1 week
    'shield': 2592000             // 30 days
  }
};

async function checkRateLimit(userId: string, action: string): Promise<boolean> {
  const key = `ratelimit:${userId}:${action}`;
  const count = await KV.get(key);
  
  if (!count) {
    await KV.put(key, '1', { expirationTtl: getLimitWindow(action) });
    return true;
  }
  
  const current = parseInt(count);
  const limit = RATE_LIMITS[action];
  
  if (current >= limit) {
    return false; // Rate limited
  }
  
  await KV.put(key, String(current + 1), { expirationTtl: getLimitWindow(action) });
  return true;
}
```

### Suspicious Pattern Detection

```typescript
interface SuspiciousPattern {
  type: 'rapid_posting' | 'single_thread_focus' | 'vote_manipulation';
  severity: 'low' | 'medium' | 'high';
  details: any;
}

async function detectSuspiciousPatterns(userId: string): Promise<SuspiciousPattern[]> {
  const patterns: SuspiciousPattern[] = [];
  
  // Get recent actions from last 24h
  const actions = await db.prepare(
    'SELECT * FROM user_actions WHERE user_id = ? AND timestamp > ? ORDER BY timestamp DESC'
  ).bind(userId, Date.now() - 86400000).all();
  
  // Rapid posting check
  const timeWindows = groupByTimeWindow(actions, 300000); // 5min windows
  const maxInWindow = Math.max(...timeWindows.map(w => w.length));
  if (maxInWindow > 10) {
    patterns.push({
      type: 'rapid_posting',
      severity: 'medium',
      details: { count: maxInWindow, window: '5min' }
    });
  }
  
  // Single thread focus
  const postIds = actions.map(a => a.target_id);
  const uniquePosts = new Set(postIds).size;
  if (postIds.length > 20 && uniquePosts < 3) {
    patterns.push({
      type: 'single_thread_focus',
      severity: 'high',
      details: { comments: postIds.length, threads: uniquePosts }
    });
  }
  
  return patterns;
}
```

### Shadow Cooldown (Quota Violation)

```typescript
async function checkQuotaViolation(user: User): Promise<boolean> {
  if (user.cloak_quota < 50) {
    // Roll dice weighted by quota
    // Lower quota = higher chance of forced uncloak
    const shouldUncloak = Math.random() > (user.cloak_quota / 100);
    return shouldUncloak;
  }
  return false;
}

async function applyQuotaPenalty(userId: string, delta: number) {
  const user = await getUser(userId);
  const newQuota = Math.max(0, Math.min(100, user.cloak_quota + delta));
  
  await db.prepare(
    'UPDATE users SET cloak_quota = ? WHERE id = ?'
  ).bind(newQuota, userId).run();
  
  // If quota dropped below threshold, temp cooldown
  if (newQuota < 30) {
    await KV.put(`cooldown:${userId}`, 'true', {
      expirationTtl: 3600 // 1 hour cooldown
    });
  }
}
```

## Frontend UI Components

### Temperature Check Modal (Pre-Submit Warning)

```typescript
interface TemperatureCheckProps {
  evaluation: ContentEvaluation;
  predictedImpact: {
    cloakQuotaDelta: number;
    statChanges: Partial<UserStats>;
  };
  onRevise: () => void;
  onSubmitAnyway: () => void;
}

function TemperatureCheck({ evaluation, predictedImpact, onRevise, onSubmitAnyway }: TemperatureCheckProps) {
  const criticalFlags = evaluation.flags.filter(f => f.severity === 'critical');
  
  return (
    <div className="modal">
      <h2>⚠️ Consider Revising</h2>
      
      {criticalFlags.length > 0 && (
        <div className="flags">
          <h3>Issues Detected:</h3>
          {criticalFlags.map(flag => (
            <div key={flag.type} className="flag critical">
              <strong>{flag.type}</strong>
              <p>{flag.explanation}</p>
              {flag.quote && <blockquote>{flag.quote}</blockquote>}
            </div>
          ))}
        </div>
      )}
      
      {evaluation.suggestions.length > 0 && (
        <div className="suggestions">
          <h3>Suggestions:</h3>
          <ul>
            {evaluation.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="impact">
        <h3>Predicted Impact:</h3>
        <p>Cloak Quota: {predictedImpact.cloakQuotaDelta > 0 ? '+' : ''}{predictedImpact.cloakQuotaDelta}%</p>
        <div className="stat-changes">
          {Object.entries(predictedImpact.statChanges).map(([stat, delta]) => (
            <div key={stat}>
              {stat}: {delta > 0 ? '+' : ''}{delta.toFixed(1)}
            </div>
          ))}
        </div>
      </div>
      
      <div className="actions">
        <button onClick={onRevise} className="primary">Revise Comment</button>
        <button onClick={onSubmitAnyway} className="secondary">Submit Anyway</button>
      </div>
    </div>
  );
}
```

### User Stats Display (RPG Character Sheet)

```typescript
interface UserStatsProps {
  user: User;
  abilities: AbilityStatus[];
}

function UserStats({ user, abilities }: UserStatsProps) {
  const progress = calculateLevelProgress(user);
  
  return (
    <div className="character-sheet">
      <div className="header">
        <h2>{user.username}</h2>
        <div className="level">
          Level {user.level} {user.class && <span className="class">{user.class}</span>}
        </div>
        <div className="progress-bar">
          <div className="fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
      
      <div className="stats">
        <StatBar label="Good Faith" value={user.stats.good_faith} />
        <StatBar label="Substantive" value={user.stats.substantive} />
        <StatBar label="Charitable" value={user.stats.charitable} />
        <StatBar label="Source Quality" value={user.stats.source_quality} />
      </div>
      
      <div className="cloak-quota">
        <h3>Cloak Integrity</h3>
        <div className="quota-bar" data-level={getQuotaLevel(user.cloak_quota)}>
          <div className="fill" style={{ width: `${user.cloak_quota}%` }} />
        </div>
        <p className="quota-text">{user.cloak_quota.toFixed(0)}%</p>
      </div>
      
      <div className="abilities">
        <h3>Abilities</h3>
        {abilities.map(ability => (
          <AbilityCard key={ability.id} ability={ability} />
        ))}
      </div>
    </div>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-bar">
      <label>{label}</label>
      <div className="bar">
        <div className="fill" style={{ width: `${value}%` }} />
      </div>
      <span className="value">{value.toFixed(0)}</span>
    </div>
  );
}
```

### Thread Sentiment Visualization

```typescript
interface ThreadSentimentProps {
  sentiment: SentimentBreakdown;
}

function ThreadSentiment({ sentiment }: ThreadSentimentProps) {
  const total = sentiment.agree + sentiment.disagree + sentiment.neutral;
  
  return (
    <div className="thread-sentiment">
      <h3>Discussion Breakdown</h3>
      
      <div className="sentiment-bars">
        <div className="bar agree" style={{ width: `${(sentiment.agree / total) * 100}%` }}>
          {sentiment.agree} agree
        </div>
        <div className="bar disagree" style={{ width: `${(sentiment.disagree / total) * 100}%` }}>
          {sentiment.disagree} disagree
        </div>
        <div className="bar neutral" style={{ width: `${(sentiment.neutral / total) * 100}%` }}>
          {sentiment.neutral} neutral
        </div>
      </div>
      
      {sentiment.reasoning_themes.length > 0 && (
        <div className="themes">
          <h4>Main Themes:</h4>
          {sentiment.reasoning_themes.map((theme, i) => (
            <div key={i} className="theme">
              <strong>{theme.theme}</strong> ({theme.count} mentions)
              <blockquote>{theme.representative_quote}</blockquote>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Site Footer

```typescript
function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="content">
        <div className="brand">
          <h3>GoodFaith</h3>
          <p>AI-mediated discourse platform</p>
        </div>
        
        <div className="links">
          <div className="section">
            <h4>Project</h4>
            <a href="/about">About</a>
            <a href="/how-it-works">How It Works</a>
            <a href="/research">Research Context</a>
            <a href="/privacy">Privacy Policy</a>
          </div>
          
          <div className="section">
            <h4>Community</h4>
            <a href="/c/meta">Platform Feedback</a>
            <a href="/guidelines">Community Guidelines</a>
            <a href="/stats">Platform Stats</a>
          </div>
          
          <div className="section">
            <h4>Entrained AI</h4>
            <a href="https://entrained.ai">Research Institute</a>
            <a href="https://entrained.ai/publications">Publications</a>
            <a href="https://entrained.ai/about">About Christian</a>
          </div>
        </div>
        
        <div className="meta">
          <p>
            A research experiment by <a href="https://entrained.ai">Entrained AI Research Institute</a>
          </p>
          <p className="status">
            <span className="badge alpha">Alpha</span>
            Expect changes • Your feedback shapes this
          </p>
        </div>
      </div>
    </footer>
  );
}
```

## MVP Phase Breakdown

### Phase 0: Initial Setup & Branding

**Goal:** Establish identity as research project

- [ ] Site header links back to entrained.ai
- [ ] About page explaining research context
- [ ] "This is an experiment" messaging
- [ ] Research consent/expectations (users know they're participating in research)
- [ ] Link to research papers/documentation

**Content for About Page:**

```markdown
# About GoodFaith

GoodFaith is a research experiment by [Entrained AI Research Institute](https://entrained.ai) 
exploring how AI can improve the quality of human discourse.

## The Hypothesis

Most social platforms optimize for engagement and consensus. We're testing whether 
AI-mediated evaluation of discourse quality (not popularity) can create better conversations.

## How It Works

Instead of upvotes/downvotes, our AI evaluates comments for:
- Good faith engagement (genuine vs. trolling)
- Substantive contribution (adds new perspective)
- Charitable interpretation (engages with strongest arguments)
- Source quality (credible evidence)

Your "reputation" reflects how you engage, not what you believe.

## Why Participate?

- Help us research AI-mediated collaboration
- Engage in serious technical discussions
- Experiment with novel discourse mechanics
- Influence the future of online discussion

## Privacy & Data

All evaluations are transparent. We log AI decisions for research purposes but 
don't sell data or track you across sites. Cloaking protects your identity while 
maintaining accountability.

## Current Status

**Alpha Research Version** - Expect bugs, changes, and evolution. Your feedback 
shapes this experiment.

Built by [Christian Bernier](https://entrained.ai) • [Report Issues](#) • [Research Updates](#)
```

### Phase 1: Foundation (Week 1-2)

**Goal:** Basic posting and commenting with AI evaluation

- [ ] Database setup (D1 schema)
- [ ] User authentication (email + JWT)
- [ ] Create community
- [ ] Create post
- [ ] Comment with threading (materialized path)
- [ ] AI evaluation on submit
- [ ] Pre-flight temperature check
- [ ] Basic stats tracking
- [ ] Cloaking toggle (UI only, no quota yet)

**Deliverable:** Can create communities, post, comment, and see AI feedback

### Phase 2: Reputation System (Week 3-4)

**Goal:** Stats actually matter, quota enforcement

- [ ] Stat calculation from evaluations
- [ ] User action event log
- [ ] Cloak quota enforcement
- [ ] Random forced uncloaking when quota low
- [ ] Sentiment requirement for agree/disagree
- [ ] Thread sentiment aggregation
- [ ] User profile with stats display
- [ ] Community-specific reputation

**Deliverable:** Good faith behavior has consequences

### Phase 3: Abilities & Progression (Week 5-6)

**Goal:** RPG mechanics working

- [ ] Level calculation from stats
- [ ] Class assignment based on stat distribution
- [ ] Ability system (at least 3 abilities working)
- [ ] Cooldown tracking
- [ ] "Citation Needed" ability
- [ ] "Steelman" ability
- [ ] Ability usage UI
- [ ] Achievement notifications

**Deliverable:** Users can level up and unlock powers

### Phase 4: Polish & Launch (Week 7-8)

**Goal:** Production ready

- [ ] Performance optimization
- [ ] Rate limiting
- [ ] Abuse detection
- [ ] Mobile responsive design
- [ ] Onboarding flow
- [ ] Community discovery
- [ ] Moderation tools (basic)
- [ ] Analytics dashboard
- [ ] Documentation
- [ ] Public launch

## What We're NOT Building Yet

To keep scope manageable for MVP:

- ❌ Private messages
- ❌ User blocking
- ❌ Media uploads (text only)
- ❌ Mobile native apps (web-first)
- ❌ Moderation appeals system
- ❌ Community styling/themes
- ❌ Awards/badges beyond abilities
- ❌ Thread sentiment over time (analytics)
- ❌ Advanced search
- ❌ User mentions/notifications
- ❌ Email digests

These can all come post-launch based on user feedback.

## Integration with Entrained.AI

### Content Cross-Pollination

GoodFaith serves as the discussion layer for Entrained AI Research Institute:

**From entrained.ai to GoodFaith:**
- Link to relevant discussions from research papers
- "Discuss this paper on GoodFaith" CTAs
- Embed sentiment breakdowns in research posts
- Showcase interesting debates on main site

**From GoodFaith to entrained.ai:**
- Header link to main research site
- Footer attribution and branding
- About page explains research context
- User profiles can link to entrained.ai author pages

### Technical Integration

```typescript
// Example: Embed discussion widget on entrained.ai
<script src="https://goodfaith.entrained.ai/embed.js"></script>
<div 
  data-goodfaith-discussion="paper-psam-2024"
  data-community="ai-research"
></div>
```

This creates a discussion thread on GoodFaith that can be embedded in blog posts/papers on entrained.ai.

### Shared Identity (Optional Phase 2)

Consider unified SSO later:
- Same account works on both entrained.ai and goodfaith.entrained.ai
- GoodFaith stats visible on entrained.ai profile
- Contributions to discussions count toward entrained.ai author credibility

Not required for MVP but worth planning for.

## Deployment

### Domain Configuration

Primary deployment: **goodfaith.entrained.ai**

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create goodfaith-db

# Deploy workers
wrangler deploy

# Deploy frontend (Pages)
wrangler pages deploy ./dist

# Configure custom domain
wrangler pages project create goodfaith
# In Cloudflare dashboard: Pages > goodfaith > Custom domains
# Add: goodfaith.entrained.ai
# Cloudflare will automatically configure DNS
```

### DNS Setup (Cloudflare)

Since entrained.ai is already on Cloudflare, adding the subdomain is automatic:

1. Deploy to Cloudflare Pages
2. Add custom domain `goodfaith.entrained.ai` in Pages dashboard
3. DNS CNAME record is created automatically
4. SSL/TLS certificate provisions automatically

No manual DNS configuration needed!

### Environment Variables

```toml
# wrangler.toml
name = "goodfaith"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "goodfaith-db"
database_id = "<DATABASE_ID>"

[[kv_namespaces]]
binding = "KV"
id = "<KV_ID>"

[[r2_buckets]]
binding = "ARCHIVE"
bucket_name = "goodfaith-archive"

[vars]
ENVIRONMENT = "production"
DOMAIN = "goodfaith.entrained.ai"
PARENT_SITE = "https://entrained.ai"
ORGANIZATION = "Entrained AI Research Institute"
JWT_SECRET = "<SECRET>"
AI_MODEL = "claude-sonnet-4-20250514"
```

### Branding & Identity

```typescript
// Site metadata
const SITE_CONFIG = {
  name: "GoodFaith",
  domain: "goodfaith.entrained.ai",
  organization: "Entrained AI Research Institute",
  parentSite: "https://entrained.ai",
  description: "AI-mediated discourse platform - a research experiment in improving human dialogue quality",
  tagline: "Where AI evaluates quality, not popularity",
  researchContext: "Part of Entrained AI Research Institute's exploration of AI-mediated human collaboration"
};
```

## Security Considerations

1. **SQL Injection**: Use prepared statements always
2. **XSS**: Sanitize markdown rendering (DOMPurify)
3. **CSRF**: Token-based auth, no cookies
4. **Rate Limiting**: Multiple layers (IP, user, action)
5. **Content Validation**: Max lengths on all inputs
6. **Email Verification**: Required before posting
7. **API Key Protection**: Never expose in client code

## Monitoring & Observability

```typescript
// Log all AI evaluations for quality monitoring
await logToAnalytics({
  type: 'evaluation',
  content_type: 'comment',
  scores: evaluation.scores,
  flags: evaluation.flags.map(f => f.type),
  user_level: user.level,
  timestamp: Date.now()
});

// Track quota violations
await logToAnalytics({
  type: 'quota_violation',
  user_id: userId,
  quota: user.cloak_quota,
  forced_uncloak: true,
  timestamp: Date.now()
});

// Monitor ability usage patterns
await logToAnalytics({
  type: 'ability_used',
  ability_id: abilityId,
  user_level: user.level,
  target_type: 'comment',
  timestamp: Date.now()
});
```

## Success Metrics

### User Engagement

- Average comments per post
- Comment depth (threading engagement)
- Time spent reading vs. posting
- Return rate (DAU/MAU)

### Discourse Quality

- Average good faith score per thread
- Percentage of comments with sources
- Strawman flag rate (lower is better)
- Revision rate after temperature check

### Community Health

- Distribution of sentiment (balanced disagreement is good)
- Cloak quota distribution (most users should be >70%)
- Voluntary uncloaking rate (trust signal)
- Ability usage per level (engagement with mechanics)

### Research Outcomes

**Primary Questions:**
1. Does AI evaluation lead to higher quality discourse than voting?
2. Do users internalize good faith principles over time (improving scores)?
3. Does cloaking with consequences create better accountability than anonymity or full identity?
4. What role does gamification (abilities, levels) play in sustained engagement?

**Data Collection:**
- All evaluations logged with metadata
- User progression tracking (stat changes over time)
- A/B tests on prompt variations
- Qualitative feedback through meta community
- Comparison with control communities (traditional voting)

**Publication Goals:**
- Research paper on AI-mediated discourse quality
- Open source the codebase for academic replication
- Public dashboard showing aggregate platform statistics
- Regular blog posts on entrained.ai discussing findings

## Questions for Implementation

1. **TypeScript everywhere?** Yes
2. **Monorepo or separate packages?** Monorepo (easier for MVP)
3. **Testing strategy?** Unit tests for stat calculation, integration tests for API
4. **Abilities in DB or code?** Code-defined, easier to iterate
5. **Admin panel?** Simple read-only analytics in Phase 4

## Next Steps

Claude Code should:

1. Set up project structure (monorepo with Turborepo)
2. Initialize Wrangler config
3. Create D1 schema and migrations
4. Build auth system (email/JWT)
5. Implement core API routes
6. Build ThreadCoordinator Durable Object
7. Integrate AI evaluation (Workers AI or Anthropic API)
8. Create basic frontend (Remix)
9. Implement temperature check UI
10. Test end-to-end flow (signup → post → comment → evaluation)

This spec should be sufficient to build the MVP. Any questions or clarifications needed before starting implementation?
