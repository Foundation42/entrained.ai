/**
 * R2 Storage Layer
 *
 * R2 is the SOURCE OF TRUTH for all assets.
 * Each asset has:
 *   - {id}/content: The actual file content
 *   - {id}/manifest.json: Complete metadata (can rebuild D1 from this)
 */

import type { Asset, AssetManifest } from '../types';

export interface StoreAssetOptions {
  /** The asset to store */
  asset: Asset;

  /** The file content (Buffer, string, or ReadableStream) */
  content: ArrayBuffer | string | ReadableStream;

  /** Optional embedding vector for semantic search */
  embedding?: number[];
}

export interface GetAssetResult {
  manifest: AssetManifest;
  content: ArrayBuffer;
}

export class R2Storage {
  constructor(private bucket: R2Bucket) {}

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  /**
   * Store an asset (content + manifest) in R2
   */
  async storeAsset(options: StoreAssetOptions): Promise<AssetManifest> {
    const { asset, content, embedding } = options;

    // Build the full manifest
    const manifest: AssetManifest = {
      ...asset,
      embedding,
    };

    // Store content
    const contentKey = this.contentKey(asset.id);
    await this.bucket.put(contentKey, content, {
      httpMetadata: {
        contentType: asset.mime_type ?? 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable', // 1 year, immutable
      },
      customMetadata: {
        asset_id: asset.id,
        canonical_name: asset.canonical_name,
        type: asset.type,
        version: asset.version,
      },
    });

    // Store manifest
    const manifestKey = this.manifestKey(asset.id);
    await this.bucket.put(manifestKey, JSON.stringify(manifest, null, 2), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    return manifest;
  }

  /**
   * Store just the content (for media assets where content is generated separately)
   */
  async storeContent(
    id: string,
    content: ArrayBuffer | string | ReadableStream,
    options: { mimeType?: string; metadata?: Record<string, string> } = {}
  ): Promise<void> {
    const contentKey = this.contentKey(id);

    await this.bucket.put(contentKey, content, {
      httpMetadata: {
        contentType: options.mimeType ?? 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: options.metadata,
    });
  }

  /**
   * Store just the manifest
   */
  async storeManifest(manifest: AssetManifest): Promise<void> {
    const manifestKey = this.manifestKey(manifest.id);

    await this.bucket.put(manifestKey, JSON.stringify(manifest, null, 2), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get an asset's manifest
   */
  async getManifest(id: string): Promise<AssetManifest | null> {
    const manifestKey = this.manifestKey(id);
    const object = await this.bucket.get(manifestKey);

    if (!object) {
      return null;
    }

    const text = await object.text();
    return JSON.parse(text) as AssetManifest;
  }

  /**
   * Get an asset's content
   */
  async getContent(id: string): Promise<ArrayBuffer | null> {
    const contentKey = this.contentKey(id);
    const object = await this.bucket.get(contentKey);

    if (!object) {
      return null;
    }

    return object.arrayBuffer();
  }

  /**
   * Get an asset's content as text
   */
  async getContentAsText(id: string): Promise<string | null> {
    const contentKey = this.contentKey(id);
    const object = await this.bucket.get(contentKey);

    if (!object) {
      return null;
    }

    return object.text();
  }

  /**
   * Get an asset's content as a stream (for large files)
   */
  async getContentStream(id: string): Promise<ReadableStream | null> {
    const contentKey = this.contentKey(id);
    const object = await this.bucket.get(contentKey);

    if (!object) {
      return null;
    }

    return object.body;
  }

  /**
   * Get full asset (manifest + content)
   */
  async getAsset(id: string): Promise<GetAssetResult | null> {
    const [manifest, content] = await Promise.all([
      this.getManifest(id),
      this.getContent(id),
    ]);

    if (!manifest || !content) {
      return null;
    }

    return { manifest, content };
  }

  /**
   * Get R2 object metadata (size, etag, etc.) without downloading content
   */
  async getContentHead(id: string): Promise<R2Object | null> {
    const contentKey = this.contentKey(id);
    return this.bucket.head(contentKey);
  }

  // ===========================================================================
  // Existence Checks
  // ===========================================================================

  /**
   * Check if an asset exists (has both manifest and content)
   */
  async exists(id: string): Promise<boolean> {
    const [manifestHead, contentHead] = await Promise.all([
      this.bucket.head(this.manifestKey(id)),
      this.bucket.head(this.contentKey(id)),
    ]);

    return manifestHead !== null && contentHead !== null;
  }

  /**
   * Check if just the manifest exists
   */
  async manifestExists(id: string): Promise<boolean> {
    const head = await this.bucket.head(this.manifestKey(id));
    return head !== null;
  }

  /**
   * Check if just the content exists
   */
  async contentExists(id: string): Promise<boolean> {
    const head = await this.bucket.head(this.contentKey(id));
    return head !== null;
  }

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  /**
   * Delete an asset (both manifest and content)
   * Note: Assets are immutable, so this should rarely be needed
   */
  async deleteAsset(id: string): Promise<void> {
    await Promise.all([
      this.bucket.delete(this.manifestKey(id)),
      this.bucket.delete(this.contentKey(id)),
    ]);
  }

  // ===========================================================================
  // Listing Operations (for rebuilding D1 index)
  // ===========================================================================

  /**
   * List all asset IDs in the bucket
   * Used for rebuilding D1 index from R2 manifests
   */
  async listAssetIds(options: { limit?: number; cursor?: string } = {}): Promise<{
    ids: string[];
    cursor?: string;
    truncated: boolean;
  }> {
    const { limit = 1000, cursor } = options;

    // List all manifest.json files
    const listed = await this.bucket.list({
      prefix: '',
      delimiter: '/',
      limit,
      cursor,
    });

    // Extract asset IDs from the delimited prefixes
    // Each asset has {id}/manifest.json and {id}/content
    // The delimited listing will give us {id}/ as prefixes
    const ids = listed.delimitedPrefixes.map((prefix) =>
      prefix.replace(/\/$/, '')
    );

    return {
      ids,
      cursor: listed.truncated ? listed.cursor : undefined,
      truncated: listed.truncated,
    };
  }

  /**
   * Iterate over all manifests in the bucket
   * Useful for full reindex operations
   */
  async *iterateManifests(): AsyncGenerator<AssetManifest> {
    let cursor: string | undefined;

    do {
      const { ids, cursor: nextCursor, truncated } = await this.listAssetIds({
        cursor,
      });

      for (const id of ids) {
        const manifest = await this.getManifest(id);
        if (manifest) {
          yield manifest;
        }
      }

      cursor = truncated ? nextCursor : undefined;
    } while (cursor);
  }

  // ===========================================================================
  // URL Generation
  // ===========================================================================

  /**
   * Generate the public URL for an asset's content
   */
  contentUrl(id: string, baseUrl: string): string {
    return `${baseUrl}/api/assets/${id}/content`;
  }

  /**
   * Generate the public URL for an asset's manifest
   */
  manifestUrl(id: string, baseUrl: string): string {
    return `${baseUrl}/api/assets/${id}`;
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private contentKey(id: string): string {
    return `${id}/content`;
  }

  private manifestKey(id: string): string {
    return `${id}/manifest.json`;
  }
}
