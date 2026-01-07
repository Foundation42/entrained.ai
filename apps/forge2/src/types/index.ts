/**
 * Forge 2.0 Core Types
 *
 * Based on the briefing document - defines the data model for the
 * conversational asset workspace.
 */

// =============================================================================
// Asset Types
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
