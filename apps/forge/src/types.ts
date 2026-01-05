// ================================
// Environment Bindings
// ================================

export interface Env {
  // R2 bucket for artifacts (TSX, compiled JS, manifests)
  ARTIFACTS: R2Bucket;
  // R2 bucket for generated assets (images, speech)
  ASSETS: R2Bucket;
  // KV for component metadata (registry)
  REGISTRY: KVNamespace;
  // KV for component storage (instance/class/global data)
  STORAGE: KVNamespace;
  // Workers AI for embeddings
  AI: Ai;
  // Vectorize for semantic search
  VECTORIZE: VectorizeIndex;
  // Container Durable Object for generation
  GENERATOR: DurableObjectNamespace;
  // Job tracking Durable Object
  FORGE_JOBS: DurableObjectNamespace;
  // Queue for async generation
  GENERATE_QUEUE: Queue;
  // Gemini model config
  GEMINI_MODEL: string;
  GEMINI_IMAGE_MODEL: string;
  // API keys (set via secrets)
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

// ================================
// Manifest Schema
// (Immutable once created - updates create new versions)
// ================================

export interface ForgeManifest {
  // Identity
  id: string;                      // "bus-stop-v1-a7f2"
  version: number;                 // 1, 2, 3...
  previous_version?: string;       // "bus-stop-v0-z9e1"
  created_at: string;              // ISO timestamp

  // Provenance
  provenance: {
    creator?: string;              // User ID or "anonymous"
    ai_model?: string;             // "claude-sonnet-4-20250514"
    ai_provider?: string;          // "anthropic"
    source_type: 'ai' | 'manual' | 'import';
  };

  // Intent & Discovery
  description: string;             // Original natural language intent
  embedding?: number[];            // Vector for semantic search (stored separately in Vectorize)
  tags?: string[];                 // ["transport", "ui", "real-time"]

  // Component Definition
  type: 'app' | 'library';         // exports.length === 0 -> app
  components: ComponentDef[];      // What this manifest defines

  // Dependencies
  imports?: ImportDef[];           // Other forge components used

  // Customization Surface
  css_variables?: CSSVarDef[];
  parts?: PartDef[];

  // Build Artifacts (R2 URLs)
  artifacts: {
    source_tsx: string;            // R2 key to TSX source
    component_js: string;          // R2 key to transpiled JS
    type_definitions?: string;     // R2 key to .d.ts
  };

  // Usage Stats (updated separately, not part of immutable manifest)
  // Stored in D1, not in the manifest itself
}

export interface ComponentDef {
  name: string;                    // "BusStop"
  tag: string;                     // "bus-stop"
  exported: boolean;               // Can others import this?
  props: PropDef[];
  events?: EventDef[];             // What events does it emit?
}

export interface PropDef {
  name: string;
  type: 'String' | 'Number' | 'Boolean' | 'Object' | 'Array';
  default?: unknown;
  required: boolean;
  description?: string;
}

export interface EventDef {
  name: string;                    // "bus-selected"
  detail_type?: string;            // TypeScript type of event.detail
  description?: string;
}

export interface ImportDef {
  component_id: string;            // "social-nearby-v2-b8g3"
  components: string[];            // ["SocialNearby", "SocialProfile"]
}

export interface CSSVarDef {
  name: string;                    // "--bg-color"
  default: string;                 // "#1a1a1a"
  description?: string;            // "Background color for container"
}

export interface PartDef {
  name: string;                    // "container"
  description?: string;            // "Main wrapper element"
}

// ================================
// API Request/Response Types
// ================================

export interface CreateRequest {
  description: string;
  initial_code?: string;
  imports?: string[];              // Component IDs to import
  exports?: string[];              // Component names to export (empty = app)
  model?: string;                  // AI model to use
}

export interface CreateResponse {
  id: string;
  url: string;
  version: number;
  type: 'app' | 'library';
  manifest: ForgeManifest;
}

export interface UpdateRequest {
  changes: string;                 // Natural language changes
  model?: string;
}

export interface UpdateResponse {
  id: string;                      // New version ID
  url: string;
  version: number;
  previous_version: string;
  manifest: ForgeManifest;
}

export interface SearchRequest {
  query: string;
  limit?: number;
  type?: 'app' | 'library' | 'all';
}

export interface SearchResult {
  id: string;
  description: string;
  type: 'app' | 'library';
  tags?: string[];
  similarity: number;
  version: number;
  created_at: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

// ================================
// Component Storage Types
// ================================

export type StorageScope = 'instance' | 'class' | 'global';

export interface StorageKey {
  component_id: string;
  scope: StorageScope;
  instance_id?: string;            // Required for 'instance' scope
  key: string;
}

// ================================
// D1 Schema Types (for reference)
// ================================

export interface DBComponent {
  id: string;                      // Primary key
  base_name: string;               // "bus-stop" (without version suffix)
  version: number;
  previous_version: string | null;
  type: 'app' | 'library';
  description: string;
  tags: string;                    // JSON array
  created_at: string;
  manifest_key: string;            // R2 key to manifest.json
}

export interface DBImport {
  id: number;                      // Auto-increment
  component_id: string;            // FK to components
  imports_id: string;              // FK to components (the imported one)
}

export interface DBStats {
  component_id: string;            // FK to components
  uses: number;                    // How many other components import this
  instances: number;               // Active instance count
  last_used: string;               // ISO timestamp
}

// ================================
// Asset Generation Types
// ================================

export type ImageStyle = 'illustration' | 'photo' | '3d' | 'pixel-art';
export type ImagePreset = 'icon' | 'hero' | 'sprite';

export interface ImageOptions {
  width?: number;                  // Default: 512
  height?: number;                 // Default: 512
  transparent?: boolean;           // Default: false
  style?: ImageStyle;              // Visual style hint
  preset?: ImagePreset;            // Preset overrides dimensions/style
}

export type TTSVoice = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer' | 'verse' | 'marin' | 'cedar';
export type TTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

export interface SpeechOptions {
  voice?: TTSVoice;                // Default: 'alloy'
  speed?: number;                  // 0.25 to 4.0, default: 1.0
  format?: TTSFormat;              // Default: 'mp3'
  instructions?: string;           // Voice style instructions (e.g., "talk like a pirate")
}

export interface AssetMetadata {
  id: string;                      // Hash-based ID
  type: 'image' | 'speech';
  prompt: string;                  // Original prompt/text
  params: ImageOptions | SpeechOptions;
  url: string;                     // CDN URL to asset
  r2_key: string;                  // R2 storage key
  created_at: string;              // ISO timestamp
  size_bytes: number;
  model?: string;                  // AI model used (e.g., "gemini-2.5-flash-image", "gpt-4o-mini-tts")
  // For images
  width?: number;
  height?: number;
  // For speech
  duration_ms?: number;
}

export interface CreateImageRequest {
  prompt: string;
  options?: ImageOptions;
}

export interface CreateSpeechRequest {
  text: string;
  options?: SpeechOptions;
}

export interface AssetResponse {
  id: string;
  url: string;
  type: 'image' | 'speech';
  cached: boolean;                 // True if returned from cache
  created_at: string;
}

// Preset configurations
export const IMAGE_PRESETS: Record<ImagePreset, Partial<ImageOptions>> = {
  icon: { width: 512, height: 512, transparent: true, style: 'illustration' },
  hero: { width: 1920, height: 1080, transparent: false, style: 'photo' },
  sprite: { width: 64, height: 64, transparent: true, style: 'pixel-art' },
};
