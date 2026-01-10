/**
 * R2 Storage Layer
 *
 * R2 is the SOURCE OF TRUTH for all assets.
 * Each asset has:
 *   - {id}/content: The actual file content
 *   - {id}/manifest.json: Complete metadata (can rebuild D1 from this)
 */

import type { Asset, AssetManifest, VersionProvenance } from '../types';
import {
  getDraftContentKey,
  getDraftManifestKey,
  getDraftPreviewKey,
  getDraftCssKey,
  getVersionContentKey,
  getVersionManifestKey,
} from '../versioning';

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

  // ===========================================================================
  // Draft Operations (New Component Model)
  // ===========================================================================

  /**
   * Store draft content and manifest for a component
   * Drafts are mutable and can be overwritten
   */
  async storeDraft(options: StoreDraftOptions): Promise<DraftManifest> {
    const { componentId, content, manifest, mimeType } = options;

    const contentKey = getDraftContentKey(componentId);
    const manifestKey = getDraftManifestKey(componentId);

    // Store content (without immutable caching - drafts can be overwritten)
    await this.bucket.put(contentKey, content, {
      httpMetadata: {
        contentType: mimeType ?? 'application/octet-stream',
        cacheControl: 'no-cache', // Drafts can change
      },
      customMetadata: {
        component_id: componentId,
        is_draft: 'true',
      },
    });

    // Build draft manifest
    const draftManifest: DraftManifest = {
      ...manifest,
      component_id: componentId,
      updated_at: new Date().toISOString(),
    };

    // Store manifest
    await this.bucket.put(manifestKey, JSON.stringify(draftManifest, null, 2), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'no-cache',
      },
    });

    return draftManifest;
  }

  /**
   * Get draft content for a component
   */
  async getDraftContent(componentId: string): Promise<ArrayBuffer | null> {
    const contentKey = getDraftContentKey(componentId);
    const object = await this.bucket.get(contentKey);
    return object ? object.arrayBuffer() : null;
  }

  /**
   * Get draft content with metadata (for serving with correct MIME type)
   */
  async getDraftContentWithMetadata(componentId: string): Promise<{
    content: ArrayBuffer;
    contentType: string;
  } | null> {
    const contentKey = getDraftContentKey(componentId);
    const object = await this.bucket.get(contentKey);
    if (!object) return null;

    return {
      content: await object.arrayBuffer(),
      contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
    };
  }

  /**
   * Get draft content as text
   */
  async getDraftContentAsText(componentId: string): Promise<string | null> {
    const contentKey = getDraftContentKey(componentId);
    const object = await this.bucket.get(contentKey);
    return object ? object.text() : null;
  }

  /**
   * Get draft manifest for a component
   */
  async getDraftManifest(componentId: string): Promise<DraftManifest | null> {
    const manifestKey = getDraftManifestKey(componentId);
    const object = await this.bucket.get(manifestKey);

    if (!object) {
      return null;
    }

    const text = await object.text();
    return JSON.parse(text) as DraftManifest;
  }

  /**
   * Check if a draft exists
   */
  async draftExists(componentId: string): Promise<boolean> {
    const contentKey = getDraftContentKey(componentId);
    const head = await this.bucket.head(contentKey);
    return head !== null;
  }

  /**
   * Store preview HTML for a component draft
   * Returns the public URL for the preview
   */
  async storeDraftPreview(
    componentId: string,
    html: string,
    baseUrl: string
  ): Promise<string> {
    const key = getDraftPreviewKey(componentId);

    await this.bucket.put(key, html, {
      httpMetadata: {
        contentType: 'text/html',
        cacheControl: 'no-cache', // Drafts can change
      },
      customMetadata: {
        component_id: componentId,
        is_draft: 'true',
        type: 'preview',
      },
    });

    return `${baseUrl}/api/forge/${componentId}/preview`;
  }

  /**
   * Get draft preview HTML
   */
  async getDraftPreview(componentId: string): Promise<string | null> {
    const key = getDraftPreviewKey(componentId);
    const object = await this.bucket.get(key);
    return object ? object.text() : null;
  }

  /**
   * Store CSS for a component draft
   * Returns the public URL for the CSS
   */
  async storeDraftCss(
    componentId: string,
    css: string,
    baseUrl: string
  ): Promise<string> {
    const key = getDraftCssKey(componentId);

    await this.bucket.put(key, css, {
      httpMetadata: {
        contentType: 'text/css',
        cacheControl: 'no-cache',
      },
      customMetadata: {
        component_id: componentId,
        is_draft: 'true',
        type: 'css',
      },
    });

    return `${baseUrl}/api/forge/${componentId}/styles.css`;
  }

  /**
   * Get draft CSS
   */
  async getDraftCss(componentId: string): Promise<string | null> {
    const key = getDraftCssKey(componentId);
    const object = await this.bucket.get(key);
    return object ? object.text() : null;
  }

  /**
   * Delete a draft
   */
  async deleteDraft(componentId: string): Promise<void> {
    const contentKey = getDraftContentKey(componentId);
    const manifestKey = getDraftManifestKey(componentId);

    await Promise.all([
      this.bucket.delete(contentKey),
      this.bucket.delete(manifestKey),
    ]);
  }

  // ===========================================================================
  // Version Operations (New Component Model)
  // ===========================================================================

  /**
   * Store a published version
   * Versions are immutable once published
   */
  async storeVersion(options: StoreVersionOptions): Promise<VersionManifest> {
    const { componentId, version, content, manifest, mimeType } = options;

    const contentKey = getVersionContentKey(componentId, version);
    const manifestKey = getVersionManifestKey(componentId, version);

    // Store content (with immutable caching - versions never change)
    await this.bucket.put(contentKey, content, {
      httpMetadata: {
        contentType: mimeType ?? 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        component_id: componentId,
        version: version.toString(),
      },
    });

    // Build version manifest
    const versionManifest: VersionManifest = {
      ...manifest,
      component_id: componentId,
      version,
      created_at: new Date().toISOString(),
    };

    // Store manifest
    await this.bucket.put(manifestKey, JSON.stringify(versionManifest, null, 2), {
      httpMetadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    return versionManifest;
  }

  /**
   * Get version content
   */
  async getVersionContent(componentId: string, version: number): Promise<ArrayBuffer | null> {
    const contentKey = getVersionContentKey(componentId, version);
    const object = await this.bucket.get(contentKey);
    return object ? object.arrayBuffer() : null;
  }

  /**
   * Get version content with metadata (for serving with correct MIME type)
   */
  async getVersionContentWithMetadata(componentId: string, version: number): Promise<{
    content: ArrayBuffer;
    contentType: string;
  } | null> {
    const contentKey = getVersionContentKey(componentId, version);
    const object = await this.bucket.get(contentKey);
    if (!object) return null;

    return {
      content: await object.arrayBuffer(),
      contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
    };
  }

  /**
   * Get version content as text
   */
  async getVersionContentAsText(componentId: string, version: number): Promise<string | null> {
    const contentKey = getVersionContentKey(componentId, version);
    const object = await this.bucket.get(contentKey);
    return object ? object.text() : null;
  }

  /**
   * Get version manifest
   */
  async getVersionManifest(componentId: string, version: number): Promise<VersionManifest | null> {
    const manifestKey = getVersionManifestKey(componentId, version);
    const object = await this.bucket.get(manifestKey);

    if (!object) {
      return null;
    }

    const text = await object.text();
    return JSON.parse(text) as VersionManifest;
  }

  /**
   * Check if a version exists
   */
  async versionExists(componentId: string, version: number): Promise<boolean> {
    const contentKey = getVersionContentKey(componentId, version);
    const head = await this.bucket.head(contentKey);
    return head !== null;
  }

  /**
   * Delete a component and all its data (draft + all versions)
   */
  async deleteComponent(componentId: string): Promise<void> {
    // List all objects with this component prefix
    const prefix = `${componentId}/`;
    let cursor: string | undefined;

    do {
      const listed = await this.bucket.list({ prefix, cursor });

      // Delete all objects in this batch
      for (const obj of listed.objects) {
        await this.bucket.delete(obj.key);
      }

      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  }

  // ===========================================================================
  // Component URL Generation
  // ===========================================================================

  /**
   * Generate URL for draft content
   */
  draftContentUrl(componentId: string, baseUrl: string): string {
    return `${baseUrl}/api/components/${componentId}/draft/content`;
  }

  /**
   * Generate URL for draft manifest
   */
  draftManifestUrl(componentId: string, baseUrl: string): string {
    return `${baseUrl}/api/components/${componentId}/draft`;
  }

  /**
   * Generate URL for version content
   */
  versionContentUrl(componentId: string, version: number, baseUrl: string): string {
    return `${baseUrl}/api/components/${componentId}/versions/${version}/content`;
  }

  /**
   * Generate URL for version manifest
   */
  versionManifestUrl(componentId: string, version: number, baseUrl: string): string {
    return `${baseUrl}/api/components/${componentId}/versions/${version}`;
  }
}

// ===========================================================================
// Component Storage Interfaces
// ===========================================================================

export interface StoreDraftOptions {
  componentId: string;
  content: ArrayBuffer | string | ReadableStream;
  manifest: Omit<DraftManifest, 'component_id' | 'updated_at'>;
  mimeType?: string;
}

export interface StoreVersionOptions {
  componentId: string;
  version: number;
  content: ArrayBuffer | string | ReadableStream;
  manifest: Omit<VersionManifest, 'component_id' | 'version' | 'created_at'>;
  mimeType?: string;
}

export interface DraftManifest {
  component_id: string;
  description: string;
  updated_at: string;
  provenance?: VersionProvenance;
  metadata?: Record<string, unknown>;
  dependencies?: string[];
  embedding?: number[];
}

export interface VersionManifest {
  component_id: string;
  version: number;
  description?: string;
  created_at: string;
  provenance?: VersionProvenance;
  metadata?: Record<string, unknown>;
  dependencies?: string[];
  embedding?: number[];
}
