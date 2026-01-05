// Asset Registry - Storage, caching, and indexing for generated assets

import type { Env, AssetMetadata, ImageOptions, SpeechOptions, TTSVoice } from '../types';

import { generateImage, hashImageRequest } from './image-gen';
import { generateSpeech, hashSpeechRequest } from './speech-gen';

const ASSET_BASE_URL = 'https://forge.entrained.ai/api/forge/assets';

// Voice gender mapping for OpenAI TTS voices
const VOICE_GENDER: Record<TTSVoice, 'male' | 'female' | 'neutral'> = {
  alloy: 'neutral',
  ash: 'male',
  ballad: 'male',
  coral: 'female',
  echo: 'male',
  fable: 'male',
  onyx: 'male',
  nova: 'female',
  sage: 'female',
  shimmer: 'female',
  verse: 'male',
  marin: 'female',
  cedar: 'male',
};

export class AssetRegistry {
  constructor(
    private assets: R2Bucket,
    private registry: KVNamespace,
    private ai: Ai,
    private vectorize: VectorizeIndex
  ) {}

  // Get cached asset by hash, or null if not found
  async getByHash(hash: string): Promise<AssetMetadata | null> {
    const key = `asset:hash:${hash}`;
    const data = await this.registry.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as AssetMetadata;
    } catch {
      return null;
    }
  }

  // Get asset by ID
  async get(id: string): Promise<AssetMetadata | null> {
    const key = `asset:${id}`;
    const data = await this.registry.get(key);
    if (!data) return null;

    try {
      return JSON.parse(data) as AssetMetadata;
    } catch {
      return null;
    }
  }

  // Get asset file from R2
  async getFile(id: string): Promise<R2ObjectBody | null> {
    const metadata = await this.get(id);
    if (!metadata) return null;

    return await this.assets.get(metadata.r2_key);
  }

  // Store a new asset
  private async store(
    type: 'image' | 'speech',
    hash: string,
    prompt: string,
    params: ImageOptions | SpeechOptions,
    data: ArrayBuffer,
    mimeType: string,
    extra: { width?: number; height?: number; duration_ms?: number; model?: string }
  ): Promise<AssetMetadata> {
    // Generate ID from hash + timestamp for uniqueness
    const timestamp = Date.now().toString(36);
    const id = `${hash}-${timestamp}`;

    // Determine file extension
    const ext = type === 'image' ? 'png' : (params as SpeechOptions).format || 'mp3';
    const r2Key = `${type}s/${id}.${ext}`;

    // Upload to R2
    await this.assets.put(r2Key, data, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000', // Cache for 1 year
      },
    });

    const metadata: AssetMetadata = {
      id,
      type,
      prompt,
      params,
      url: `${ASSET_BASE_URL}/${id}/file`,
      r2_key: r2Key,
      created_at: new Date().toISOString(),
      size_bytes: data.byteLength,
      model: extra.model,
      ...extra,
    };

    // Store metadata in KV (both by ID and by hash for lookup)
    const metadataJson = JSON.stringify(metadata);
    await Promise.all([
      this.registry.put(`asset:${id}`, metadataJson),
      this.registry.put(`asset:hash:${hash}`, metadataJson),
    ]);

    // Index in Vectorize for semantic search
    await this.indexAsset(metadata);

    console.log(`[AssetRegistry] Stored ${type}: ${id} (${data.byteLength} bytes)`);

    return metadata;
  }

  // Index asset in Vectorize for semantic search
  private async indexAsset(metadata: AssetMetadata): Promise<void> {
    try {
      // Build embedding text - include instructions for speech assets
      let embeddingText = metadata.prompt;
      if (metadata.type === 'speech' && (metadata.params as SpeechOptions).instructions) {
        embeddingText = `${metadata.prompt} (${(metadata.params as SpeechOptions).instructions})`;
      }

      // Generate embedding
      const embedResult = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
        text: embeddingText,
      });

      const embedding = (embedResult as { data?: number[][] }).data?.[0];
      if (!embedding) {
        console.warn(`[AssetRegistry] Failed to generate embedding for ${metadata.id}`);
        return;
      }

      // Upsert into Vectorize with asset namespace
      // Include rich metadata for filtering and display
      const vectorMetadata: Record<string, string | boolean | number> = {
        type: 'asset',
        asset_type: metadata.type,
        prompt: metadata.prompt,
        url: metadata.url,
        created_at: metadata.created_at,
        // Extract just the date for easier filtering
        created_date: metadata.created_at.split('T')[0],
      };

      if (metadata.type === 'image') {
        const imageParams = metadata.params as ImageOptions;
        // Check both transparent flag and presets that imply transparency
        const isTransparent = imageParams.transparent || imageParams.preset === 'icon' || imageParams.preset === 'sprite';
        vectorMetadata.transparent = isTransparent;
        vectorMetadata.style = imageParams.style || 'illustration';
        vectorMetadata.model = metadata.model || 'gemini-2.5-flash-image';
      }

      if (metadata.type === 'speech') {
        const speechParams = metadata.params as SpeechOptions;
        const voice = speechParams.voice || 'alloy';
        vectorMetadata.voice = voice;
        vectorMetadata.voice_gender = VOICE_GENDER[voice] || 'neutral';
        vectorMetadata.model = metadata.model || 'gpt-4o-mini-tts';
        if (speechParams.instructions) {
          vectorMetadata.has_instructions = true;
        }
      }

      await this.vectorize.upsert([{
        id: `asset:${metadata.id}`,
        values: embedding,
        metadata: vectorMetadata,
      }]);

      console.log(`[AssetRegistry] Indexed asset in Vectorize: ${metadata.id}`);
    } catch (error) {
      console.error(`[AssetRegistry] Failed to index asset:`, error);
      // Don't fail the whole operation if indexing fails
    }
  }

  // Create or retrieve cached image
  async createImage(
    prompt: string,
    options: ImageOptions,
    env: Env
  ): Promise<{ metadata: AssetMetadata; cached: boolean }> {
    const hash = hashImageRequest(prompt, options);

    // Check cache first
    const cached = await this.getByHash(hash);
    if (cached) {
      console.log(`[AssetRegistry] Image cache hit: ${cached.id}`);
      return { metadata: cached, cached: true };
    }

    // Generate new image
    const result = await generateImage(prompt, options, env);
    const model = env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

    // Store and return
    const metadata = await this.store(
      'image',
      hash,
      prompt,
      options,
      result.imageData,
      result.mimeType,
      { width: result.width, height: result.height, model }
    );

    return { metadata, cached: false };
  }

  // Create or retrieve cached speech
  async createSpeech(
    text: string,
    options: SpeechOptions,
    env: Env
  ): Promise<{ metadata: AssetMetadata; cached: boolean }> {
    const hash = hashSpeechRequest(text, options);

    // Check cache first
    const cached = await this.getByHash(hash);
    if (cached) {
      console.log(`[AssetRegistry] Speech cache hit: ${cached.id}`);
      return { metadata: cached, cached: true };
    }

    // Generate new speech
    const result = await generateSpeech(text, options, env);
    const model = 'gpt-4o-mini-tts';

    // Store and return
    const metadata = await this.store(
      'speech',
      hash,
      text,
      options,
      result.audioData,
      result.mimeType,
      { model }
    );

    return { metadata, cached: false };
  }

  // Search assets semantically
  async search(query: string, limit: number = 10): Promise<AssetMetadata[]> {
    // Generate embedding for query
    const embedResult = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
      text: query,
    });

    const queryVec = (embedResult as { data?: number[][] }).data?.[0];
    if (!queryVec) {
      console.error('[AssetRegistry] Failed to generate query embedding');
      return [];
    }

    // Query Vectorize, filtering for assets only
    const vectorResults = await this.vectorize.query(queryVec, {
      topK: limit,
      returnMetadata: 'all',
      filter: { type: { $eq: 'asset' } },
    });

    // Fetch full metadata for each result
    const results: AssetMetadata[] = [];
    for (const match of vectorResults.matches) {
      // Extract asset ID from the namespaced ID (asset:xxx -> xxx)
      const assetId = match.id.replace('asset:', '');
      const metadata = await this.get(assetId);
      if (metadata) {
        results.push(metadata);
      }
    }

    return results;
  }

  // List recent assets
  async list(options: { type?: 'image' | 'speech'; limit?: number } = {}): Promise<AssetMetadata[]> {
    const limit = options.limit || 50;
    const prefix = options.type ? `asset:${options.type}` : 'asset:';

    // KV list with prefix
    const listed = await this.registry.list({ prefix, limit });

    const results: AssetMetadata[] = [];
    for (const key of listed.keys) {
      // Skip hash keys
      if (key.name.includes(':hash:')) continue;

      const data = await this.registry.get(key.name);
      if (data) {
        try {
          const metadata = JSON.parse(data) as AssetMetadata;
          if (!options.type || metadata.type === options.type) {
            results.push(metadata);
          }
        } catch {
          // Skip invalid entries
        }
      }
    }

    return results;
  }
}
