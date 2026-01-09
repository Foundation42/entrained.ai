/**
 * D1 Database Layer
 *
 * Provides queryable index over assets stored in R2.
 * D1 is NOT the source of truth - R2 manifests are.
 * This can be rebuilt from R2 if needed.
 */

import type {
  Asset,
  AssetRecord,
  AssetType,
  FileType,
  VersionRefRecord,
  Component,
  ComponentRecord,
  ComponentType,
  ComponentStatus,
  Version,
  VersionRecord,
} from '../types';

export interface ListAssetsOptions {
  type?: AssetType;
  file_type?: FileType;
  canonical_name?: string;
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'version';
  order_dir?: 'asc' | 'desc';
}

export class D1Storage {
  constructor(private db: D1Database) {}

  // ===========================================================================
  // Asset Operations
  // ===========================================================================

  /**
   * Index an asset in D1 (called after storing in R2)
   */
  async indexAsset(asset: Asset): Promise<void> {
    const record: AssetRecord = {
      id: asset.id,
      canonical_name: asset.canonical_name,
      type: asset.type,
      file_type: asset.file_type ?? null,
      media_type: asset.media_type ?? null,
      version: asset.version,
      parent_id: asset.parent_id ?? null,
      description: asset.description,
      created_at: new Date(asset.created_at).getTime(),
      manifest_url: asset.manifest_url,
      content_url: asset.content_url,
      size: asset.size ?? null,
      mime_type: asset.mime_type ?? null,
    };

    await this.db
      .prepare(
        `INSERT INTO assets (
          id, canonical_name, type, file_type, media_type, version,
          parent_id, description, created_at, manifest_url, content_url,
          size, mime_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        record.id,
        record.canonical_name,
        record.type,
        record.file_type,
        record.media_type,
        record.version,
        record.parent_id,
        record.description,
        record.created_at,
        record.manifest_url,
        record.content_url,
        record.size,
        record.mime_type
      )
      .run();

    // If there's a parent, record the child relationship
    if (asset.parent_id) {
      await this.addVersionChild(asset.parent_id, asset.id);
    }

    // Update "latest" ref to point to this asset
    await this.setRef(asset.canonical_name, 'latest', asset.id);
  }

  /**
   * Get an asset by ID
   */
  async getAsset(id: string): Promise<AssetRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM assets WHERE id = ?')
      .bind(id)
      .first<AssetRecord>();

    return result ?? null;
  }

  /**
   * Get assets by canonical name (all versions)
   */
  async getAssetVersions(canonical_name: string): Promise<AssetRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM assets
         WHERE canonical_name = ?
         ORDER BY created_at DESC`
      )
      .bind(canonical_name)
      .all<AssetRecord>();

    return result.results;
  }

  /**
   * List assets with filtering
   */
  async listAssets(options: ListAssetsOptions = {}): Promise<AssetRecord[]> {
    const {
      type,
      file_type,
      canonical_name,
      limit = 50,
      offset = 0,
      order_by = 'created_at',
      order_dir = 'desc',
    } = options;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (file_type) {
      conditions.push('file_type = ?');
      params.push(file_type);
    }

    if (canonical_name) {
      conditions.push('canonical_name = ?');
      params.push(canonical_name);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = `ORDER BY ${order_by} ${order_dir.toUpperCase()}`;

    const query = `SELECT * FROM assets ${where} ${order} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = await this.db
      .prepare(query)
      .bind(...params)
      .all<AssetRecord>();

    return result.results;
  }

  /**
   * Find the latest version of a canonical name matching a semver range
   */
  async findByVersion(
    canonical_name: string,
    version: string
  ): Promise<AssetRecord | null> {
    // For exact version match
    const result = await this.db
      .prepare(
        `SELECT * FROM assets
         WHERE canonical_name = ? AND version = ?`
      )
      .bind(canonical_name, version)
      .first<AssetRecord>();

    return result ?? null;
  }

  // ===========================================================================
  // Version Ref Operations
  // ===========================================================================

  /**
   * Set a named ref (latest, stable, dev, etc.) to point to an asset
   */
  async setRef(
    canonical_name: string,
    ref_name: string,
    asset_id: string
  ): Promise<void> {
    const now = Date.now();

    await this.db
      .prepare(
        `INSERT INTO version_refs (canonical_name, ref_name, asset_id, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (canonical_name, ref_name)
         DO UPDATE SET asset_id = excluded.asset_id, updated_at = excluded.updated_at`
      )
      .bind(canonical_name, ref_name, asset_id, now)
      .run();
  }

  /**
   * Get the asset ID for a named ref
   */
  async getRef(
    canonical_name: string,
    ref_name: string
  ): Promise<string | null> {
    const result = await this.db
      .prepare(
        `SELECT asset_id FROM version_refs
         WHERE canonical_name = ? AND ref_name = ?`
      )
      .bind(canonical_name, ref_name)
      .first<{ asset_id: string }>();

    return result?.asset_id ?? null;
  }

  /**
   * Get all refs for a canonical name
   */
  async getRefs(canonical_name: string): Promise<VersionRefRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM version_refs
         WHERE canonical_name = ?`
      )
      .bind(canonical_name)
      .all<VersionRefRecord>();

    return result.results;
  }

  /**
   * Delete a ref
   */
  async deleteRef(canonical_name: string, ref_name: string): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM version_refs
         WHERE canonical_name = ? AND ref_name = ?`
      )
      .bind(canonical_name, ref_name)
      .run();
  }

  // ===========================================================================
  // Version Chain Operations
  // ===========================================================================

  /**
   * Record a parent-child relationship in the version chain
   */
  async addVersionChild(parent_id: string, child_id: string): Promise<void> {
    const now = Date.now();

    await this.db
      .prepare(
        `INSERT INTO version_children (parent_id, child_id, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT DO NOTHING`
      )
      .bind(parent_id, child_id, now)
      .run();
  }

  /**
   * Get all children of an asset
   */
  async getChildren(parent_id: string): Promise<string[]> {
    const result = await this.db
      .prepare(
        `SELECT child_id FROM version_children
         WHERE parent_id = ?
         ORDER BY created_at ASC`
      )
      .bind(parent_id)
      .all<{ child_id: string }>();

    return result.results.map((r) => r.child_id);
  }

  /**
   * Get the full version chain for a canonical name
   * Returns assets in chronological order (oldest first)
   */
  async getVersionChain(canonical_name: string): Promise<AssetRecord[]> {
    // Get all versions
    const versions = await this.getAssetVersions(canonical_name);

    // Build a map for quick lookup
    const byId = new Map(versions.map((v) => [v.id, v]));

    // Find the root (no parent)
    const roots = versions.filter((v) => !v.parent_id);

    // Build chain from root
    const chain: AssetRecord[] = [];
    const visited = new Set<string>();

    const traverse = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const asset = byId.get(id);
      if (!asset) return;

      chain.push(asset);

      // Find children and continue
      const children = versions.filter((v) => v.parent_id === id);
      for (const child of children) {
        traverse(child.id);
      }
    };

    for (const root of roots) {
      traverse(root.id);
    }

    return chain;
  }

  // ===========================================================================
  // Utility Operations
  // ===========================================================================

  /**
   * Check if an asset exists
   */
  async exists(id: string): Promise<boolean> {
    const result = await this.db
      .prepare('SELECT 1 FROM assets WHERE id = ?')
      .bind(id)
      .first();

    return result !== null;
  }

  /**
   * Count assets matching criteria
   */
  async count(options: Omit<ListAssetsOptions, 'limit' | 'offset'>): Promise<number> {
    const { type, file_type, canonical_name } = options;

    const conditions: string[] = [];
    const params: string[] = [];

    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (file_type) {
      conditions.push('file_type = ?');
      params.push(file_type);
    }

    if (canonical_name) {
      conditions.push('canonical_name = ?');
      params.push(canonical_name);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT COUNT(*) as count FROM assets ${where}`;

    const result = await this.db
      .prepare(query)
      .bind(...params)
      .first<{ count: number }>();

    return result?.count ?? 0;
  }

  /**
   * Delete an asset from the index (does NOT delete from R2)
   */
  async deleteAsset(id: string): Promise<void> {
    // Delete version children where this is parent or child
    await this.db
      .prepare('DELETE FROM version_children WHERE parent_id = ? OR child_id = ?')
      .bind(id, id)
      .run();

    // Delete refs pointing to this asset
    await this.db
      .prepare('DELETE FROM version_refs WHERE asset_id = ?')
      .bind(id)
      .run();

    // Delete the asset
    await this.db.prepare('DELETE FROM assets WHERE id = ?').bind(id).run();
  }

  // ===========================================================================
  // Component Operations (New Model)
  // ===========================================================================

  /**
   * Create a new component
   */
  async createComponent(component: Component): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO components (
          id, canonical_name, status, type, file_type, media_type,
          description, latest_version, has_draft, creator, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        component.id,
        component.canonical_name,
        component.status,
        component.type,
        component.file_type ?? null,
        component.media_type ?? null,
        component.description,
        component.latest_version,
        component.has_draft ? 1 : 0,
        component.creator ?? null,
        new Date(component.created_at).getTime(),
        new Date(component.updated_at).getTime()
      )
      .run();
  }

  /**
   * Get a component by ID
   */
  async getComponent(id: string): Promise<ComponentRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM components WHERE id = ?')
      .bind(id)
      .first<ComponentRecord>();

    return result ?? null;
  }

  /**
   * Update a component's draft status and updated_at timestamp
   */
  async updateComponentDraft(
    id: string,
    hasDraft: boolean,
    description?: string
  ): Promise<void> {
    const now = Date.now();

    if (description !== undefined) {
      await this.db
        .prepare(
          `UPDATE components
           SET has_draft = ?, updated_at = ?, description = ?
           WHERE id = ?`
        )
        .bind(hasDraft ? 1 : 0, now, description, id)
        .run();
    } else {
      await this.db
        .prepare(
          `UPDATE components
           SET has_draft = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(hasDraft ? 1 : 0, now, id)
        .run();
    }
  }

  /**
   * Publish a component (update status, latest_version, has_draft)
   */
  async publishComponent(
    id: string,
    version: number,
    description?: string
  ): Promise<void> {
    const now = Date.now();

    if (description !== undefined) {
      await this.db
        .prepare(
          `UPDATE components
           SET status = 'published', latest_version = ?, has_draft = 0, updated_at = ?, description = ?
           WHERE id = ?`
        )
        .bind(version, now, description, id)
        .run();
    } else {
      await this.db
        .prepare(
          `UPDATE components
           SET status = 'published', latest_version = ?, has_draft = 0, updated_at = ?
           WHERE id = ?`
        )
        .bind(version, now, id)
        .run();
    }
  }

  /**
   * List components with filtering
   */
  async listComponents(options: ListComponentsOptions = {}): Promise<ComponentRecord[]> {
    const {
      status,
      type,
      file_type,
      media_type,
      limit = 50,
      offset = 0,
      order_by = 'created_at',
      order_dir = 'desc',
    } = options;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (file_type) {
      conditions.push('file_type = ?');
      params.push(file_type);
    }

    if (media_type) {
      conditions.push('media_type = ?');
      params.push(media_type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = `ORDER BY ${order_by} ${order_dir.toUpperCase()}`;

    const query = `SELECT * FROM components ${where} ${order} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = await this.db
      .prepare(query)
      .bind(...params)
      .all<ComponentRecord>();

    return result.results;
  }

  /**
   * List published components only
   */
  async listPublishedComponents(
    options: Omit<ListComponentsOptions, 'status'> = {}
  ): Promise<ComponentRecord[]> {
    return this.listComponents({ ...options, status: 'published' });
  }

  /**
   * Delete a component and all its versions
   */
  async deleteComponent(id: string): Promise<void> {
    // Delete all versions first (due to foreign key)
    await this.db
      .prepare('DELETE FROM versions WHERE component_id = ?')
      .bind(id)
      .run();

    // Delete the component
    await this.db
      .prepare('DELETE FROM components WHERE id = ?')
      .bind(id)
      .run();
  }

  /**
   * Find components with expired drafts (for cleanup)
   */
  async findExpiredDrafts(maxAgeMs: number): Promise<ComponentRecord[]> {
    const cutoff = Date.now() - maxAgeMs;

    const result = await this.db
      .prepare(
        `SELECT * FROM components
         WHERE has_draft = 1 AND updated_at < ?`
      )
      .bind(cutoff)
      .all<ComponentRecord>();

    return result.results;
  }

  // ===========================================================================
  // Version Operations (New Model)
  // ===========================================================================

  /**
   * Create a new version record
   */
  async createVersion(version: Version): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO versions (
          id, component_id, version, semver, parent_version_id,
          description, content_url, manifest_url, size, mime_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        version.id,
        version.component_id,
        version.version,
        version.semver ?? null,
        version.parent_version_id ?? null,
        version.description ?? null,
        version.content_url,
        version.manifest_url,
        version.size ?? null,
        version.mime_type ?? null,
        new Date(version.created_at).getTime()
      )
      .run();
  }

  /**
   * Get a version by ID
   */
  async getVersion(id: string): Promise<VersionRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM versions WHERE id = ?')
      .bind(id)
      .first<VersionRecord>();

    return result ?? null;
  }

  /**
   * Get the latest version for a component
   */
  async getLatestVersion(componentId: string): Promise<VersionRecord | null> {
    const result = await this.db
      .prepare(
        `SELECT * FROM versions
         WHERE component_id = ?
         ORDER BY version DESC
         LIMIT 1`
      )
      .bind(componentId)
      .first<VersionRecord>();

    return result ?? null;
  }

  /**
   * Get a specific version by component ID and version number
   */
  async getVersionByNumber(
    componentId: string,
    versionNumber: number
  ): Promise<VersionRecord | null> {
    const result = await this.db
      .prepare(
        `SELECT * FROM versions
         WHERE component_id = ? AND version = ?`
      )
      .bind(componentId, versionNumber)
      .first<VersionRecord>();

    return result ?? null;
  }

  /**
   * Get all versions for a component (ordered by version DESC)
   */
  async getVersionHistory(componentId: string): Promise<VersionRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM versions
         WHERE component_id = ?
         ORDER BY version DESC`
      )
      .bind(componentId)
      .all<VersionRecord>();

    return result.results;
  }

  /**
   * Count components matching criteria
   */
  async countComponents(
    options: Omit<ListComponentsOptions, 'limit' | 'offset'>
  ): Promise<number> {
    const { status, type, file_type, media_type } = options;

    const conditions: string[] = [];
    const params: string[] = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }

    if (file_type) {
      conditions.push('file_type = ?');
      params.push(file_type);
    }

    if (media_type) {
      conditions.push('media_type = ?');
      params.push(media_type);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT COUNT(*) as count FROM components ${where}`;

    const result = await this.db
      .prepare(query)
      .bind(...params)
      .first<{ count: number }>();

    return result?.count ?? 0;
  }
}

// ===========================================================================
// Options Interfaces
// ===========================================================================

export interface ListComponentsOptions {
  status?: ComponentStatus;
  type?: ComponentType;
  file_type?: string;
  media_type?: string;
  limit?: number;
  offset?: number;
  order_by?: 'created_at' | 'updated_at' | 'latest_version';
  order_dir?: 'asc' | 'desc';
}
