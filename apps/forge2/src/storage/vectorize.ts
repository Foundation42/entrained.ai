/**
 * Vectorize Storage Layer
 *
 * Handles semantic search embeddings for all assets.
 * Uses Cloudflare Workers AI for embedding generation
 * and Vectorize for storage and similarity search.
 */

import type { AssetType, ComponentType, SearchResult } from '../types';

// ===========================================================================
// Component Vector Metadata (New Model)
// ===========================================================================

/**
 * Metadata stored with each component's vector
 * Note: Vectorize indexes by component_id, not version
 */
export interface ComponentVectorMetadata {
  /** Component ID (e.g., "ebc7-4f2a") - this is also the vector ID */
  component_id: string;

  /** AI-generated name (NOT unique) */
  canonical_name: string;

  /** Component type */
  type: ComponentType;

  /** File type for code components */
  file_type?: string;

  /** Media type for media components */
  media_type?: string;

  /** Description (used for search ranking) */
  description: string;

  /** Latest published version number */
  latest_version: number;

  /** Optional creator identifier */
  creator?: string;
}

export interface ComponentSearchResult {
  /** Component ID */
  component_id: string;

  /** Similarity score */
  score: number;

  /** Component metadata */
  metadata: ComponentVectorMetadata;
}

// ===========================================================================
// Legacy Asset Vector Metadata
// ===========================================================================

export interface VectorMetadata {
  id: string;
  canonical_name: string;
  type: AssetType;
  file_type?: string;
  media_type?: string;
  version: string;
  description: string;
}

export interface SearchOptions {
  /** Maximum number of results */
  limit?: number;

  /** Filter by asset type */
  type?: AssetType;

  /** Filter by file type (for type='file') */
  file_type?: string;

  /** Filter by media type (for type='asset') */
  media_type?: string;

  /** Minimum similarity score (0-1) */
  min_score?: number;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: VectorMetadata;
}

export class VectorizeStorage {
  constructor(
    private vectorize: VectorizeIndex,
    private ai: Ai
  ) {}

  // ===========================================================================
  // Embedding Generation
  // ===========================================================================

  /**
   * Generate an embedding vector for text
   * Uses Workers AI with the BGE model (768 dimensions)
   */
  async embed(text: string): Promise<number[]> {
    const result = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
      text: [text],
    });

    // Workers AI returns { shape: [1, 768], data: [[...]] }
    const data = (result as { data: number[][] }).data;
    const embedding = data?.[0];

    if (!embedding || embedding.length === 0) {
      throw new Error('Failed to generate embedding');
    }

    return embedding;
  }

  /**
   * Generate embedding for an asset based on its description and content sample
   */
  async embedAsset(description: string, contentSample?: string): Promise<number[]> {
    // Combine description with content sample for richer embedding
    const text = contentSample
      ? `${description}\n\n${contentSample.slice(0, 1000)}`
      : description;

    return this.embed(text);
  }

  // ===========================================================================
  // Index Operations
  // ===========================================================================

  /**
   * Index an asset in Vectorize
   */
  async indexAsset(
    id: string,
    embedding: number[],
    metadata: VectorMetadata
  ): Promise<void> {
    await this.vectorize.upsert([
      {
        id,
        values: embedding,
        metadata: metadata as unknown as Record<string, VectorizeVectorMetadata>,
      },
    ]);
  }

  /**
   * Remove an asset from the index
   */
  async removeAsset(id: string): Promise<void> {
    await this.vectorize.deleteByIds([id]);
  }

  /**
   * Batch index multiple assets
   */
  async indexBatch(
    items: Array<{
      id: string;
      embedding: number[];
      metadata: VectorMetadata;
    }>
  ): Promise<void> {
    if (items.length === 0) return;

    const vectors = items.map((item) => ({
      id: item.id,
      values: item.embedding,
      metadata: item.metadata as unknown as Record<string, VectorizeVectorMetadata>,
    }));

    // Vectorize has a limit of 1000 vectors per upsert
    const batchSize = 1000;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await this.vectorize.upsert(batch);
    }
  }

  // ===========================================================================
  // Search Operations
  // ===========================================================================

  /**
   * Search for assets by semantic similarity
   */
  async search(
    query: string,
    options: SearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const { limit = 10, type, file_type, media_type, min_score = 0 } = options;

    // Generate query embedding
    const queryEmbedding = await this.embed(query);

    // Build filter
    const filter = this.buildFilter({ type, file_type, media_type });

    // Query Vectorize
    const results = await this.vectorize.query(queryEmbedding, {
      topK: limit,
      returnMetadata: 'all',
      filter,
    });

    // Transform and filter results
    return results.matches
      .filter((match) => match.score >= min_score)
      .map((match) => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata as unknown as VectorMetadata,
      }));
  }

  /**
   * Search with a pre-computed embedding vector
   */
  async searchByVector(
    embedding: number[],
    options: SearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const { limit = 10, type, file_type, media_type, min_score = 0 } = options;

    const filter = this.buildFilter({ type, file_type, media_type });

    const results = await this.vectorize.query(embedding, {
      topK: limit,
      returnMetadata: 'all',
      filter,
    });

    return results.matches
      .filter((match) => match.score >= min_score)
      .map((match) => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata as unknown as VectorMetadata,
      }));
  }

  /**
   * Find similar assets to a given asset
   */
  async findSimilar(
    assetId: string,
    embedding: number[],
    options: SearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const results = await this.searchByVector(embedding, {
      ...options,
      limit: (options.limit ?? 10) + 1, // Get one extra to exclude self
    });

    // Filter out the source asset
    return results.filter((r) => r.id !== assetId).slice(0, options.limit ?? 10);
  }

  // ===========================================================================
  // Utility Operations
  // ===========================================================================

  /**
   * Get the vector for an asset (if indexed)
   */
  async getVector(id: string): Promise<number[] | null> {
    const results = await this.vectorize.getByIds([id]);

    if (results.length === 0) {
      return null;
    }

    const values = results[0]?.values;
    if (!values) return null;

    // Convert Float32Array to regular array if needed
    return Array.isArray(values) ? values : Array.from(values);
  }

  /**
   * Check if an asset is indexed
   */
  async isIndexed(id: string): Promise<boolean> {
    const results = await this.vectorize.getByIds([id]);
    return results.length > 0;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private buildFilter(options: {
    type?: AssetType;
    file_type?: string;
    media_type?: string;
  }): VectorizeVectorMetadataFilter | undefined {
    const conditions: VectorizeVectorMetadataFilter = {};

    if (options.type) {
      conditions.type = { $eq: options.type };
    }

    if (options.file_type) {
      conditions.file_type = { $eq: options.file_type };
    }

    if (options.media_type) {
      conditions.media_type = { $eq: options.media_type };
    }

    return Object.keys(conditions).length > 0 ? conditions : undefined;
  }

  // ===========================================================================
  // Component Operations (New Model)
  // ===========================================================================

  /**
   * Index a component in Vectorize
   *
   * This is called ONLY when publishing a component.
   * The vector ID is the component_id, so upsert will update existing vectors.
   *
   * @param componentId - The component's short UUID (e.g., "ebc7-4f2a")
   * @param embedding - The embedding vector (768 dimensions)
   * @param metadata - Component metadata for filtering and display
   */
  async indexComponent(
    componentId: string,
    embedding: number[],
    metadata: ComponentVectorMetadata
  ): Promise<void> {
    await this.vectorize.upsert([
      {
        id: componentId, // Component ID is the vector ID - enables upsert
        values: embedding,
        metadata: metadata as unknown as Record<string, VectorizeVectorMetadata>,
      },
    ]);
  }

  /**
   * Update a component's vector (called when publishing new version)
   *
   * This is identical to indexComponent - the upsert will replace the existing vector.
   * Named separately for clarity in the code flow.
   */
  async updateComponentVector(
    componentId: string,
    embedding: number[],
    metadata: ComponentVectorMetadata
  ): Promise<void> {
    // Upsert with the same component_id replaces the existing vector
    await this.indexComponent(componentId, embedding, metadata);
  }

  /**
   * Remove a component from the search index
   */
  async removeComponent(componentId: string): Promise<void> {
    await this.vectorize.deleteByIds([componentId]);
  }

  /**
   * Search for components by semantic similarity
   *
   * Returns COMPONENTS (not versions) - each component appears at most once.
   */
  async searchComponents(
    query: string,
    options: ComponentSearchOptions = {}
  ): Promise<ComponentSearchResult[]> {
    const { limit = 10, type, file_type, media_type, min_score = 0 } = options;

    // Generate query embedding
    const queryEmbedding = await this.embed(query);

    // Build filter (same logic as legacy, types are compatible)
    const filter = this.buildComponentFilter({ type, file_type, media_type });

    // Query Vectorize
    const results = await this.vectorize.query(queryEmbedding, {
      topK: limit,
      returnMetadata: 'all',
      filter,
    });

    // Transform and filter results
    return results.matches
      .filter((match) => match.score >= min_score)
      .map((match) => ({
        component_id: match.id,
        score: match.score,
        metadata: match.metadata as unknown as ComponentVectorMetadata,
      }));
  }

  /**
   * Search components with a pre-computed embedding
   */
  async searchComponentsByVector(
    embedding: number[],
    options: ComponentSearchOptions = {}
  ): Promise<ComponentSearchResult[]> {
    const { limit = 10, type, file_type, media_type, min_score = 0 } = options;

    const filter = this.buildComponentFilter({ type, file_type, media_type });

    const results = await this.vectorize.query(embedding, {
      topK: limit,
      returnMetadata: 'all',
      filter,
    });

    return results.matches
      .filter((match) => match.score >= min_score)
      .map((match) => ({
        component_id: match.id,
        score: match.score,
        metadata: match.metadata as unknown as ComponentVectorMetadata,
      }));
  }

  /**
   * Find similar components to a given component
   */
  async findSimilarComponents(
    componentId: string,
    embedding: number[],
    options: ComponentSearchOptions = {}
  ): Promise<ComponentSearchResult[]> {
    const results = await this.searchComponentsByVector(embedding, {
      ...options,
      limit: (options.limit ?? 10) + 1,
    });

    // Filter out the source component
    return results
      .filter((r) => r.component_id !== componentId)
      .slice(0, options.limit ?? 10);
  }

  /**
   * Check if a component is indexed
   */
  async isComponentIndexed(componentId: string): Promise<boolean> {
    const results = await this.vectorize.getByIds([componentId]);
    return results.length > 0;
  }

  private buildComponentFilter(options: {
    type?: ComponentType;
    file_type?: string;
    media_type?: string;
  }): VectorizeVectorMetadataFilter | undefined {
    const conditions: VectorizeVectorMetadataFilter = {};

    if (options.type) {
      conditions.type = { $eq: options.type };
    }

    if (options.file_type) {
      conditions.file_type = { $eq: options.file_type };
    }

    if (options.media_type) {
      conditions.media_type = { $eq: options.media_type };
    }

    return Object.keys(conditions).length > 0 ? conditions : undefined;
  }
}

// ===========================================================================
// Component Search Options
// ===========================================================================

export interface ComponentSearchOptions {
  /** Maximum number of results */
  limit?: number;

  /** Filter by component type */
  type?: ComponentType;

  /** Filter by file type (for type='file') */
  file_type?: string;

  /** Filter by media type (for type='asset') */
  media_type?: string;

  /** Minimum similarity score (0-1) */
  min_score?: number;
}

/**
 * Transform vector search results to API search results
 */
export function toSearchResults(
  vectorResults: VectorSearchResult[],
  baseUrl: string
): SearchResult[] {
  return vectorResults.map((r) => ({
    id: r.id,
    canonical_name: r.metadata.canonical_name,
    type: r.metadata.type,
    file_type: r.metadata.file_type,
    version: r.metadata.version,
    description: r.metadata.description,
    url: `${baseUrl}/assets/${r.id}`,
    score: r.score,
    metadata: r.metadata as unknown as Record<string, unknown>,
  }));
}
