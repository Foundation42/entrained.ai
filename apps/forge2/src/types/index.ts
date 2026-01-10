/**
 * Forge 2.0 Core Types
 *
 * Based on the briefing document - defines the data model for the
 * conversational asset workspace.
 */

// =============================================================================
// Component Types (New Model)
// =============================================================================

/** Component type - same as asset type but for the new model */
export type ComponentType = 'file' | 'bundle' | 'asset';

/** Component status in the draft/publish workflow */
export type ComponentStatus = 'draft' | 'published';

/**
 * Component - The conceptual entity (e.g., "a stopwatch component")
 *
 * Components are the searchable, identifiable units. Each component can have
 * multiple versions, but only ONE vector in the search index.
 */
export interface Component {
  /** Short UUID (e.g., "ebc7-4f2a") */
  id: string;

  /** AI-generated name, NOT unique (many "stopwatch" components allowed) */
  canonical_name: string;

  /** Draft or published status */
  status: ComponentStatus;

  /** Component type discriminator */
  type: ComponentType;

  /** For files: the file extension/type */
  file_type?: FileType;

  /** For media assets: the media type */
  media_type?: MediaType;

  /** Natural language description */
  description: string;

  /** Current published version number (0 = never published) */
  latest_version: number;

  /** True if there's a WIP draft */
  has_draft: boolean;

  /** Optional creator identifier (for future auth) */
  creator?: string;

  /** Creation timestamp */
  created_at: string;

  /** Last update timestamp (for draft expiry) */
  updated_at: string;
}

/**
 * Version - An immutable snapshot of a component
 *
 * Versions are created when a draft is published. They are immutable
 * and can be referenced by version number.
 */
export interface Version {
  /** Version ID: "{component_id}-v{version}" (e.g., "ebc7-4f2a-v1") */
  id: string;

  /** Parent component ID */
  component_id: string;

  /** Monotonic version number (1, 2, 3...) */
  version: number;

  /** Optional semantic version string (e.g., "1.0.0") */
  semver?: string;

  /** Parent version ID (for version chain) */
  parent_version_id?: string;

  /** Version-specific description/changelog */
  description?: string;

  /** URL to access the content */
  content_url: string;

  /** URL to the manifest */
  manifest_url: string;

  /** File size in bytes */
  size?: number;

  /** MIME type */
  mime_type?: string;

  /** Creation timestamp */
  created_at: string;

  /** Generation provenance */
  provenance: VersionProvenance;

  /** Type-specific metadata (props, css_classes, etc.) */
  metadata: Record<string, unknown>;

  /** Internal Forge component dependencies (component IDs this imports) */
  dependencies: string[];
}

/**
 * Version provenance - tracks how the version was created
 */
export interface VersionProvenance {
  /** AI model used for generation */
  ai_model?: string;

  /** AI provider (anthropic, gemini, openai) */
  ai_provider?: string;

  /** How the version was created */
  source_type: 'ai_generated' | 'manual' | 'import';

  /** Original generation parameters */
  generation_params?: Record<string, unknown>;

  /** References used during generation */
  references?: GenerationReference[];
}

// =============================================================================
// Generation References
// =============================================================================

/**
 * Reference material for AI generation
 * Used to provide context (design systems, examples, guidelines) to the AI
 */
export type GenerationReference =
  | ComponentReference
  | CssReference
  | GuidelinesReference
  | ImageReference;

/**
 * Reference to an existing component for style/behavior matching
 */
export interface ComponentReference {
  type: 'component';
  /** Component ID to reference */
  id: string;
  /** What to use from the component */
  use?: 'style' | 'behavior' | 'both';
  /** Resolved content (populated during generation) */
  resolved?: {
    name: string;
    source: string;
  };
}

/**
 * CSS/design system reference
 */
export interface CssReference {
  type: 'css';
  /** Inline CSS content OR component ID of CSS file */
  content?: string;
  id?: string;
  /** Resolved content (populated during generation) */
  resolved?: {
    source: string;
  };
}

/**
 * Text guidelines (brand guidelines, design principles, etc.)
 */
export interface GuidelinesReference {
  type: 'guidelines';
  /** Guidelines text */
  content: string;
}

/**
 * Image reference (design mockup, screenshot, etc.)
 */
export interface ImageReference {
  type: 'image';
  /** URL to the image */
  url: string;
  /** What to use from the image */
  use?: 'style' | 'structure' | 'both';
  /** Description of what to take from this image */
  description?: string;
}

/**
 * Draft - Mutable working copy of a component
 *
 * Drafts exist in R2 and are overwritten on each update.
 * When published, the draft becomes a new version.
 */
export interface Draft {
  /** Component this draft belongs to */
  component_id: string;

  /** URL to access draft content */
  content_url: string;

  /** URL to draft manifest */
  manifest_url: string;

  /** Preview URL for live testing */
  preview_url?: string;

  /** Last update timestamp */
  updated_at: string;

  /** Draft content (for in-memory operations) */
  content?: string | ArrayBuffer;

  /** Draft metadata */
  metadata?: Record<string, unknown>;

  /** Generation provenance for draft */
  provenance?: VersionProvenance;

  /** Dependencies extracted from draft */
  dependencies?: string[];
}

/**
 * Combined component with its current content (draft or latest version)
 */
export interface ComponentWithContent {
  component: Component;
  /** Draft if has_draft=true, otherwise latest published version */
  content: Draft | Version;
  /** Source code content */
  source?: string;
}

/**
 * Component with draft (returned from create/update operations)
 */
export interface ComponentWithDraft {
  component: Component;
  draft: Draft;
  preview_url?: string;
}

/**
 * Component with version (returned from publish operations)
 */
export interface ComponentWithVersion {
  component: Component;
  version: Version;
}

// =============================================================================
// Component D1 Records
// =============================================================================

export interface ComponentRecord {
  id: string;
  canonical_name: string;
  status: string; // ComponentStatus
  type: string; // ComponentType
  file_type: string | null;
  media_type: string | null;
  description: string;
  latest_version: number;
  has_draft: number; // SQLite boolean (0/1)
  creator: string | null;
  created_at: number; // Unix timestamp
  updated_at: number; // Unix timestamp
}

export interface VersionRecord {
  id: string;
  component_id: string;
  version: number;
  semver: string | null;
  parent_version_id: string | null;
  description: string | null;
  content_url: string;
  manifest_url: string;
  size: number | null;
  mime_type: string | null;
  created_at: number; // Unix timestamp
}

// =============================================================================
// Legacy Asset Types (to be deprecated)
// =============================================================================

export type AssetType = 'file' | 'bundle' | 'asset';

export type FileType =
  | 'tsx' | 'ts' | 'js' | 'jsx'
  | 'css' | 'scss' | 'less'
  | 'html' | 'json' | 'yaml' | 'toml'
  | 'md' | 'txt'
  | 'rs' | 'cpp' | 'c' | 'h' | 'hpp'
  | 'py' | 'go' | 'java'
  | 'dockerfile' | 'makefile'
  | 'sql' | 'graphql'
  | string; // Allow arbitrary extensions

export type MediaType = 'image' | 'speech' | 'video' | 'audio';

// =============================================================================
// Core Asset Model
// =============================================================================

export interface Asset {
  /** Immutable content-addressed ID */
  id: string;

  /** Human-readable stable name (e.g., "card-component") */
  canonical_name: string;

  /** Asset type discriminator */
  type: AssetType;

  /** For files: the file extension/type */
  file_type?: FileType;

  /** For media assets: the media type */
  media_type?: MediaType;

  /** Semantic version (e.g., "0.1.0") */
  version: string;

  /** Parent asset ID in version chain */
  parent_id?: string;

  /** Child asset IDs (for branching) */
  children_ids: string[];

  /** Natural language description */
  description: string;

  /** Creation timestamp */
  created_at: string;

  /** URL to access the content */
  content_url: string;

  /** URL to the manifest */
  manifest_url: string;

  /** File size in bytes */
  size?: number;

  /** MIME type */
  mime_type?: string;

  /** Named refs pointing to this asset (e.g., ["latest", "stable"]) */
  tags: string[];

  /** Internal Forge component dependencies (IDs of other components this imports) */
  dependencies: string[];

  /** Generation provenance */
  provenance: AssetProvenance;

  /** Type-specific metadata */
  metadata: Record<string, unknown>;
}

export interface AssetProvenance {
  /** AI model used for generation */
  ai_model?: string;

  /** AI provider (anthropic, gemini, openai) */
  ai_provider?: string;

  /** How the asset was created */
  source_type: 'ai_generated' | 'manual' | 'import';

  /** Original generation parameters */
  generation_params?: Record<string, unknown>;
}

// =============================================================================
// R2 Manifest Schema (Source of Truth)
// =============================================================================

export interface AssetManifest extends Asset {
  /** Embedding vector for semantic search (768 dimensions) */
  embedding?: number[];
}

// =============================================================================
// D1 Database Records (Queryable Index)
// =============================================================================

export interface AssetRecord {
  id: string;
  canonical_name: string;
  type: AssetType;
  file_type: string | null;
  media_type: string | null;
  version: string;
  parent_id: string | null;
  description: string;
  created_at: number; // Unix timestamp
  manifest_url: string;
  content_url: string;
  size: number | null;
  mime_type: string | null;
}

export interface VersionRefRecord {
  canonical_name: string;
  ref_name: string;
  asset_id: string;
  updated_at: number;
}

export interface VersionChildRecord {
  parent_id: string;
  child_id: string;
  created_at: number;
}

// =============================================================================
// Version Resolution
// =============================================================================

export type VersionBump = 'patch' | 'minor' | 'major';

export interface VersionRef {
  /** The reference string (e.g., "card@latest", "utils@^1.2") */
  ref: string;

  /** Parsed canonical name */
  canonical_name: string;

  /** Parsed version specifier (semver range, tag name, or exact version) */
  specifier: string;

  /** Type of reference */
  type: 'exact' | 'semver' | 'tag';
}

export interface ResolvedRef {
  ref: VersionRef;
  asset_id: string;
  version: string;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

// Search
export interface SearchRequest {
  query: string;
  type?: AssetType;
  file_type?: FileType;
  limit?: number;
}

export interface SearchResult {
  id: string;
  canonical_name: string;
  type: AssetType;
  file_type?: string;
  version: string;
  description: string;
  url: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResult[];
}

// Create File
export interface CreateFileRequest {
  description: string;
  file_type: FileType;
  parent_id?: string;
  version_tag?: string;
  bump?: VersionBump;
  hints?: {
    dependencies?: string[];
    style?: string;
    references?: string[];
  };
}

export interface CreateFileResponse {
  id: string;
  canonical_name: string;
  version: string;
  url: string;
  content: string;
  metadata: Record<string, unknown>;
}

// Create Image
export interface CreateImageRequest {
  prompt: string;
  options?: {
    width?: number;
    height?: number;
    style?: 'illustration' | 'photo' | '3d' | 'pixel-art';
    transparent?: boolean;
    preset?: 'icon' | 'hero' | 'sprite';
    /** Reference images for style/structure matching */
    references?: ImageReference[];
    /** Things to avoid in the generated image (added as DON'T section) */
    negativePrompt?: string;
  };
}

// Create Speech
export interface CreateSpeechRequest {
  text: string;
  options?: {
    voice?: string;
    speed?: number;
    format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
    instructions?: string;
  };
}

// Compose Bundle
export interface ComposeBundleRequest {
  name: string;
  description: string;
  files: string[]; // File IDs or refs
  assets?: string[]; // Asset IDs
  entry?: string; // Entry point file ID
  bundler: BundlerConfig;
}

export interface BundlerConfig {
  type: 'bun' | 'docker' | 'rust' | 'make' | string;
  config?: Record<string, unknown>;
  dockerfile?: string;
  command?: string;
}

export interface ComposeBundleResponse {
  id: string;
  url: string;
  version: string;
  artifacts: BundleArtifact[];
  metadata: Record<string, unknown>;
}

export interface BundleArtifact {
  type: string;
  url: string;
  size: number;
}

// Version Operations
export interface GetHistoryRequest {
  canonical_name: string;
}

export interface GetVersionsRequest {
  canonical_name: string;
  include_branches?: boolean;
}

export interface VersionHistoryEntry {
  id: string;
  version: string;
  parent_id?: string;
  children_ids: string[];
  created_at: string;
  description: string;
  tags: string[];
}

// =============================================================================
// Instance Service Types
// =============================================================================

/** Visibility level for instances */
export type InstanceVisibility = 'private' | 'public' | 'unlisted';

/** Runtime type for instances */
export type InstanceRuntimeType = 'edge' | 'durable';

/** Upgrade strategy for component versions */
export type InstanceUpgradeStrategy = 'pin' | 'minor' | 'latest';

/**
 * Instance - A deployed, mutable instance of a component
 *
 * Instances enable "Social Magnetics" - UI components placed in physical space
 * that receive state and are orchestrated by AI.
 */
export interface Instance {
  /** Unique identifier: "inst-{short-uuid}" */
  id: string;

  /** Component template this instance uses */
  component_id: string;

  /** Pinned component version (null = latest) */
  component_version?: number;

  /** Human-readable name */
  name?: string;

  /** Owner/creator identifier (for future auth) */
  owner_id?: string;

  /** Visibility: private, public, unlisted */
  visibility: InstanceVisibility;

  /** Physical/logical placement */
  placement?: InstancePlacement;

  /** Runtime configuration */
  runtime_type: InstanceRuntimeType;

  /** Upgrade policy for component versions */
  upgrade_strategy: InstanceUpgradeStrategy;

  /** Creation timestamp */
  created_at: string;

  /** Last update timestamp */
  updated_at: string;
}

/**
 * Instance with its runtime data (props, bindings)
 */
export interface InstanceWithData extends Instance {
  /** Current props (from KV) */
  props: Record<string, unknown>;

  /** Binding configurations (from KV) */
  bindings?: Record<string, InstanceBinding>;

  /** Live URL to view the instance */
  url: string;
}

/**
 * Placement information for spatial computing
 */
export interface InstancePlacement {
  /** Logical location identifier */
  location?: string;

  /** Device identifier */
  device?: string;

  /** Geographic coordinates */
  geo?: { lat: number; lng: number };

  /** Searchable tags */
  tags?: string[];
}

/**
 * Binding - connects a prop to a live data source
 */
export interface InstanceBinding {
  /** Data source type */
  source: 'kv' | 'api' | 'do' | 'static';

  /** Path or URL to the data */
  path: string;

  /** Refresh strategy */
  strategy?:
    | { type: 'static' }
    | { type: 'poll'; interval: number }
    | { type: 'sse'; url: string }
    | { type: 'webhook'; secret: string };
}

/**
 * D1 record for instances table
 */
export interface InstanceRecord {
  id: string;
  component_id: string;
  component_version: number | null;
  name: string | null;
  owner_id: string | null;
  visibility: string;
  location: string | null;
  device: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  tags: string | null; // JSON array
  runtime_type: string;
  upgrade_strategy: string;
  created_at: number; // Unix timestamp (ms)
  updated_at: number; // Unix timestamp (ms)
}

/**
 * Options for listing instances
 */
export interface ListInstancesOptions {
  component_id?: string;
  owner_id?: string;
  visibility?: InstanceVisibility;
  location?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at';
  order_dir?: 'asc' | 'desc';
}

/**
 * Create instance request
 */
export interface CreateInstanceRequest {
  component_id: string;
  component_version?: number;
  name?: string;
  owner_id?: string;
  visibility?: InstanceVisibility;
  props?: Record<string, unknown>;
  bindings?: Record<string, InstanceBinding>;
  placement?: InstancePlacement;
  runtime_type?: InstanceRuntimeType;
  upgrade_strategy?: InstanceUpgradeStrategy;
}

/**
 * Update instance props request (partial update)
 */
export interface UpdateInstancePropsRequest {
  props: Record<string, unknown>;
}

/**
 * Update instance bindings request
 */
export interface UpdateInstanceBindingsRequest {
  bindings: Record<string, InstanceBinding>;
}

// =============================================================================
// Cloudflare Bindings
// =============================================================================

export interface Env {
  // D1 Database
  DB: D1Database;

  // R2 Buckets
  ASSETS: R2Bucket;

  // KV Namespaces
  CACHE: KVNamespace;

  // Vectorize
  VECTORIZE: VectorizeIndex;

  // Workers AI
  AI: Ai;

  // Bundler Container (Durable Object)
  BUNDLER: DurableObjectNamespace;

  // Environment variables
  LLM_PROVIDER: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_API_KEY: string;
  GEMINI_MODEL: string;
  GEMINI_IMAGE_MODEL: string;
  GEMINI_API_KEY: string;
  OPENAI_API_KEY: string;
}
