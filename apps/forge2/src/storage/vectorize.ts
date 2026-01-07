/**
 * Vectorize Storage Layer
 *
 * Handles semantic search embeddings for all assets.
 * Uses Cloudflare Workers AI for embedding generation
 * and Vectorize for storage and similarity search.
 */

import type { AssetType, SearchResult } from '../types';

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
