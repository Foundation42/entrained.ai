/**
 * Asset Service
 *
 * Unified interface for asset CRUD operations.
 * Coordinates D1 (index), R2 (content), and Vectorize (search).
 */

import type {
  Asset,
  AssetType,
  AssetManifest,
  AssetProvenance,
  MediaType,
  VersionBump,
  SearchResult,
  Env,
} from '../types';
import { D1Storage } from '../storage/d1';
import { R2Storage } from '../storage/r2';
import { VectorizeStorage, toSearchResults } from '../storage/vectorize';
import {
  parseRef,
  resolveRef,
  generateAssetId,
  hashContent,
  nextVersion,
  nextVersionNumber,
  extractVersionNumber,
  buildVersionChain,
} from '../versioning';
import { parseTSXSource } from '../generation/source-parser';

export interface CreateAssetInput {
  /** Human-readable name (will be slugified) */
  name: string;

  /** Asset type */
  type: AssetType;

  /** For files: the file extension */
  file_type?: string;

  /** For media: the media type */
  media_type?: MediaType;

  /** Natural language description */
  description: string;

  /** The content to store */
  content: string | ArrayBuffer;

  /** MIME type */
  mime_type?: string;

  /** Parent asset ID (for versioning) */
  parent_id?: string;

  /** Explicit version (otherwise auto-incremented) */
  version?: string;

  /** Version bump type if parent_id provided */
  bump?: VersionBump;

  /** Generation provenance */
  provenance: AssetProvenance;

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** Internal Forge component dependencies (IDs of other components this imports) */
  dependencies?: string[];
}

export interface UpdateAssetInput {
  /** Asset ID to update (creates new version) */
  parent_id: string;

  /** New description (optional, inherits from parent) */
  description?: string;

  /** New content */
  content: string | ArrayBuffer;

  /** Version bump type */
  bump?: VersionBump;

  /** Explicit version */
  version?: string;

  /** Updated provenance */
  provenance?: Partial<AssetProvenance>;

  /** Updated metadata */
  metadata?: Record<string, unknown>;

  /** Updated dependencies (if source changed and has new imports) */
  dependencies?: string[];
}

export interface SearchInput {
  query: string;
  type?: AssetType;
  file_type?: string;
  media_type?: string;
  limit?: number;
}

export class AssetService {
  private d1: D1Storage;
  private r2: R2Storage;
  private vectorize: VectorizeStorage;
  private baseUrl: string;

  constructor(env: Env, baseUrl: string) {
    this.d1 = new D1Storage(env.DB);
    this.r2 = new R2Storage(env.ASSETS);
    this.vectorize = new VectorizeStorage(env.VECTORIZE, env.AI);
    this.baseUrl = baseUrl;
  }

  // ===========================================================================
  // Create Operations
  // ===========================================================================

  /**
   * Create a new asset
   */
  async create(input: CreateAssetInput): Promise<AssetManifest> {
    const {
      name,
      type,
      file_type,
      media_type,
      description,
      content,
      mime_type,
      parent_id,
      version: explicitVersion,
      bump = 'patch',
      provenance,
      metadata = {},
      dependencies = [],
    } = input;

    // Slugify the name for canonical_name
    const canonical_name = this.slugify(name);

    // Get parent if updating
    let parentAsset = null;
    let parentVersion: string | null = null;

    if (parent_id) {
      parentAsset = await this.d1.getAsset(parent_id);
      if (!parentAsset) {
        throw new Error(`Parent asset not found: ${parent_id}`);
      }
      parentVersion = parentAsset.version;
    }

    // Determine version
    const version = nextVersion(parentVersion, bump, explicitVersion);

    // Get existing version numbers for this canonical name
    const existingVersions = await this.d1.getAssetVersions(canonical_name);
    const existingNumbers = existingVersions
      .map((v) => extractVersionNumber(v.id))
      .filter((n): n is number => n !== null);

    const versionNumber = nextVersionNumber(existingNumbers);

    // Generate content hash and asset ID
    const contentHash = await hashContent(content);
    const id = generateAssetId(canonical_name, versionNumber, contentHash);

    // Calculate content size
    const size = typeof content === 'string'
      ? new TextEncoder().encode(content).length
      : content.byteLength;

    // Build the asset
    const now = new Date().toISOString();
    const asset: Asset = {
      id,
      canonical_name,
      type,
      file_type,
      media_type,
      version,
      parent_id,
      children_ids: [],
      description,
      created_at: now,
      content_url: this.r2.contentUrl(id, this.baseUrl),
      manifest_url: this.r2.manifestUrl(id, this.baseUrl),
      size,
      mime_type: mime_type ?? this.guessMimeType(file_type, media_type),
      tags: ['latest'], // New assets are always latest
      dependencies, // Internal Forge component dependencies
      provenance,
      metadata,
    };

    // Generate embedding
    const contentSample = typeof content === 'string' ? content : undefined;
    const embedding = await this.vectorize.embedAsset(description, contentSample);

    // Store in R2 (source of truth)
    const manifest = await this.r2.storeAsset({
      asset,
      content,
      embedding,
    });

    // Index in D1
    await this.d1.indexAsset(asset);

    // Index in Vectorize
    await this.vectorize.indexAsset(id, embedding, {
      id,
      canonical_name,
      type,
      file_type,
      media_type,
      version,
      description,
    });

    return manifest;
  }

  /**
   * Update an existing asset (creates new version)
   */
  async update(input: UpdateAssetInput): Promise<AssetManifest> {
    const {
      parent_id,
      description: newDescription,
      content,
      bump = 'patch',
      version: explicitVersion,
      provenance: newProvenance,
      metadata: newMetadata,
      dependencies: newDependencies,
    } = input;

    // Get parent asset
    const parent = await this.r2.getManifest(parent_id);
    if (!parent) {
      throw new Error(`Parent asset not found: ${parent_id}`);
    }

    // Create new asset inheriting from parent
    return this.create({
      name: parent.canonical_name,
      type: parent.type,
      file_type: parent.file_type,
      media_type: parent.media_type as MediaType | undefined,
      description: newDescription ?? parent.description,
      content,
      mime_type: parent.mime_type,
      parent_id,
      version: explicitVersion,
      bump,
      provenance: {
        ...parent.provenance,
        ...newProvenance,
      },
      metadata: {
        ...parent.metadata,
        ...newMetadata,
      },
      // Use new dependencies if provided, otherwise inherit from parent
      dependencies: newDependencies ?? parent.dependencies ?? [],
    });
  }

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  /**
   * Get an asset by ID
   */
  async get(id: string): Promise<AssetManifest | null> {
    return this.r2.getManifest(id);
  }

  /**
   * Get an asset's content
   */
  async getContent(id: string): Promise<ArrayBuffer | null> {
    return this.r2.getContent(id);
  }

  /**
   * Get an asset's content as text
   */
  async getContentAsText(id: string): Promise<string | null> {
    return this.r2.getContentAsText(id);
  }

  /**
   * Resolve a reference to an asset
   * Supports: exact IDs, semver ranges, named tags
   */
  async resolve(ref: string): Promise<AssetManifest | null> {
    const parsed = parseRef(ref);

    const record = await resolveRef(parsed, {
      getById: (id) => this.d1.getAsset(id),
      getByTag: (name, tag) => this.d1.getRef(name, tag),
      getVersions: (name) => this.d1.getAssetVersions(name),
    });

    if (!record) {
      return null;
    }

    return this.r2.getManifest(record.id);
  }

  /**
   * Get all versions of an asset by canonical name
   */
  async getVersions(canonical_name: string): Promise<AssetManifest[]> {
    const records = await this.d1.getAssetVersions(canonical_name);
    const manifests = await Promise.all(
      records.map((r) => this.r2.getManifest(r.id))
    );
    return manifests.filter((m): m is AssetManifest => m !== null);
  }

  /**
   * Get the version chain for an asset
   */
  async getVersionChain(canonical_name: string) {
    const records = await this.d1.getAssetVersions(canonical_name);
    const refRecords = await this.d1.getRefs(canonical_name);

    const refs = new Map(refRecords.map((r) => [r.ref_name, r.asset_id]));

    return buildVersionChain(canonical_name, records, refs);
  }

  // ===========================================================================
  // Search Operations
  // ===========================================================================

  /**
   * Search for assets by semantic similarity
   */
  async search(input: SearchInput): Promise<SearchResult[]> {
    const { query, type, file_type, media_type, limit = 10 } = input;

    const results = await this.vectorize.search(query, {
      limit,
      type,
      file_type,
      media_type,
    });

    return toSearchResults(results, this.baseUrl);
  }

  // ===========================================================================
  // Version Ref Operations
  // ===========================================================================

  /**
   * Set a named ref (stable, dev, etc.)
   */
  async setRef(canonical_name: string, ref_name: string, asset_id: string): Promise<void> {
    await this.d1.setRef(canonical_name, ref_name, asset_id);
  }

  /**
   * Get the asset ID for a named ref
   */
  async getRef(canonical_name: string, ref_name: string): Promise<string | null> {
    return this.d1.getRef(canonical_name, ref_name);
  }

  // ===========================================================================
  // List Operations
  // ===========================================================================

  /**
   * List assets with filtering
   */
  async list(options: {
    type?: AssetType;
    file_type?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const records = await this.d1.listAssets({
      type: options.type,
      file_type: options.file_type,
      limit: options.limit,
      offset: options.offset,
    });

    return Promise.all(records.map((r) => this.r2.getManifest(r.id)));
  }

  // ===========================================================================
  // Utility Operations
  // ===========================================================================

  /**
   * Check if an asset exists
   */
  async exists(id: string): Promise<boolean> {
    return this.r2.exists(id);
  }

  /**
   * Reindex all assets (rebuild D1 + Vectorize from R2)
   */
  async reindex(): Promise<{ indexed: number; errors: string[] }> {
    let indexed = 0;
    const errors: string[] = [];

    for await (const manifest of this.r2.iterateManifests()) {
      try {
        // Reindex in D1
        await this.d1.indexAsset(manifest);

        // Reindex in Vectorize if we have an embedding
        if (manifest.embedding) {
          await this.vectorize.indexAsset(manifest.id, manifest.embedding, {
            id: manifest.id,
            canonical_name: manifest.canonical_name,
            type: manifest.type,
            file_type: manifest.file_type,
            media_type: manifest.media_type,
            version: manifest.version,
            description: manifest.description,
          });
        }

        indexed++;
      } catch (error) {
        errors.push(`Failed to reindex ${manifest.id}: ${error}`);
      }
    }

    return { indexed, errors };
  }

  /**
   * Reindex dependencies for all TSX/JSX components.
   *
   * This migration scans all existing components, parses their source code
   * to extract Forge dependencies, and updates their manifests in R2.
   *
   * Use this to backfill dependencies for components created before
   * dependency tracking was implemented.
   */
  async reindexDependencies(): Promise<{
    scanned: number;
    updated: number;
    skipped: number;
    errors: string[];
  }> {
    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    console.log('[AssetService] Starting dependency reindex...');

    for await (const manifest of this.r2.iterateManifests()) {
      scanned++;

      // Only process TSX/JSX files
      if (manifest.file_type !== 'tsx' && manifest.file_type !== 'jsx') {
        skipped++;
        continue;
      }

      try {
        // Fetch the source content
        const content = await this.r2.getContentAsText(manifest.id);
        if (!content) {
          errors.push(`No content for ${manifest.id}`);
          continue;
        }

        // Parse to extract dependencies
        const parsed = parseTSXSource(content);
        const newDependencies = parsed.dependencies;

        // Check if dependencies changed
        const existingDeps = manifest.dependencies ?? [];
        const depsChanged =
          newDependencies.length !== existingDeps.length ||
          newDependencies.some((d, i) => d !== existingDeps[i]);

        if (!depsChanged) {
          console.log(`[AssetService] ${manifest.id}: dependencies unchanged (${existingDeps.length})`);
          skipped++;
          continue;
        }

        // Update the manifest with new dependencies
        const updatedManifest: AssetManifest = {
          ...manifest,
          dependencies: newDependencies,
        };

        // Store updated manifest back to R2
        await this.r2.storeManifest(updatedManifest);

        console.log(
          `[AssetService] ${manifest.id}: updated dependencies ` +
          `[${existingDeps.join(', ') || 'none'}] -> [${newDependencies.join(', ') || 'none'}]`
        );
        updated++;

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Failed to process ${manifest.id}: ${msg}`);
        console.error(`[AssetService] Error processing ${manifest.id}:`, error);
      }
    }

    console.log(
      `[AssetService] Dependency reindex complete: ` +
      `${scanned} scanned, ${updated} updated, ${skipped} skipped, ${errors.length} errors`
    );

    return { scanned, updated, skipped, errors };
  }

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  /**
   * Delete an asset from all stores (R2, D1, Vectorize)
   *
   * This removes:
   * - The manifest and content from R2 (source of truth)
   * - The index entry from D1
   * - The vector embedding from Vectorize
   *
   * Note: Assets are immutable, so deletion is typically only used for:
   * - Cleanup of broken/invalid assets
   * - Admin operations
   * - Testing
   */
  async delete(id: string): Promise<{ deleted: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check if asset exists first
    const exists = await this.r2.exists(id);
    if (!exists) {
      return { deleted: false, errors: ['Asset not found'] };
    }

    // Delete from Vectorize (search index)
    try {
      await this.vectorize.removeAsset(id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Vectorize: ${msg}`);
      // Continue with other deletions even if Vectorize fails
    }

    // Delete from D1 (queryable index)
    try {
      await this.d1.deleteAsset(id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`D1: ${msg}`);
      // Continue with R2 deletion even if D1 fails
    }

    // Delete from R2 (source of truth) - do this last
    try {
      await this.r2.deleteAsset(id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`R2: ${msg}`);
    }

    return { deleted: errors.length === 0, errors };
  }

  /**
   * Delete multiple assets
   */
  async deleteMany(ids: string[]): Promise<{
    deleted: number;
    failed: number;
    errors: Array<{ id: string; error: string }>;
  }> {
    let deleted = 0;
    let failed = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const id of ids) {
      const result = await this.delete(id);
      if (result.deleted) {
        deleted++;
      } else {
        failed++;
        errors.push({ id, error: result.errors.join(', ') });
      }
    }

    return { deleted, failed, errors };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private guessMimeType(file_type?: string, media_type?: string): string {
    // Media types
    if (media_type === 'image') return 'image/png';
    if (media_type === 'speech') return 'audio/mpeg';

    // File types
    const mimeMap: Record<string, string> = {
      tsx: 'text/typescript',
      ts: 'text/typescript',
      jsx: 'text/javascript',
      js: 'text/javascript',
      css: 'text/css',
      html: 'text/html',
      json: 'application/json',
      yaml: 'text/yaml',
      toml: 'text/toml',
      md: 'text/markdown',
      txt: 'text/plain',
      rs: 'text/rust',
      cpp: 'text/x-c++',
      c: 'text/x-c',
      py: 'text/x-python',
      go: 'text/x-go',
    };

    return file_type ? (mimeMap[file_type] ?? 'application/octet-stream') : 'application/octet-stream';
  }
}
