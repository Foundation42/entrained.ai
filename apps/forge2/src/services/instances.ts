/**
 * Instance Service
 *
 * Enables components to become living, orchestratable entities.
 * Part of the "Social Magnetics" vision - UI components placed in physical space
 * that receive state and are orchestrated by AI.
 *
 * Architecture:
 * - D1: Instance metadata (queryable fields like location, tags, owner)
 * - KV: Props and bindings (fast edge access for runtime)
 */

import type {
  Instance,
  InstanceRecord,
  InstanceWithData,
  InstanceBinding,
  InstancePlacement,
  InstanceVisibility,
  InstanceRuntimeType,
  InstanceUpgradeStrategy,
  ListInstancesOptions,
  CreateInstanceRequest,
  Env,
} from '../types';

// ===========================================================================
// ID Generation
// ===========================================================================

/**
 * Generate a unique instance ID: "inst-{short-uuid}"
 */
function generateInstanceId(): string {
  const uuid = crypto.randomUUID();
  const short = uuid.slice(0, 8);
  return `inst-${short}`;
}

// ===========================================================================
// Record Conversion
// ===========================================================================

/**
 * Convert D1 record to Instance
 */
function recordToInstance(record: InstanceRecord): Instance {
  const instance: Instance = {
    id: record.id,
    component_id: record.component_id,
    visibility: record.visibility as InstanceVisibility,
    runtime_type: record.runtime_type as InstanceRuntimeType,
    upgrade_strategy: record.upgrade_strategy as InstanceUpgradeStrategy,
    created_at: new Date(record.created_at).toISOString(),
    updated_at: new Date(record.updated_at).toISOString(),
  };

  if (record.component_version !== null) {
    instance.component_version = record.component_version;
  }
  if (record.name !== null) {
    instance.name = record.name;
  }
  if (record.owner_id !== null) {
    instance.owner_id = record.owner_id;
  }

  // Reconstruct placement if any placement fields are set
  if (
    record.location !== null ||
    record.device !== null ||
    record.geo_lat !== null ||
    record.tags !== null
  ) {
    const placement: InstancePlacement = {};
    if (record.location !== null) placement.location = record.location;
    if (record.device !== null) placement.device = record.device;
    if (record.geo_lat !== null && record.geo_lng !== null) {
      placement.geo = { lat: record.geo_lat, lng: record.geo_lng };
    }
    if (record.tags !== null) {
      try {
        placement.tags = JSON.parse(record.tags);
      } catch {
        // Ignore invalid JSON
      }
    }
    instance.placement = placement;
  }

  return instance;
}

// ===========================================================================
// KV Keys
// ===========================================================================

function propsKey(instanceId: string): string {
  return `instance:${instanceId}:props`;
}

function bindingsKey(instanceId: string): string {
  return `instance:${instanceId}:bindings`;
}

function resolvedKey(instanceId: string): string {
  return `instance:${instanceId}:resolved`;
}

// ===========================================================================
// Instance Service
// ===========================================================================

export class InstanceService {
  private db: D1Database;
  private kv: KVNamespace;
  private baseUrl: string;

  constructor(env: Env, baseUrl: string) {
    this.db = env.DB;
    this.kv = env.CACHE;
    this.baseUrl = baseUrl;
  }

  // ===========================================================================
  // Create
  // ===========================================================================

  /**
   * Create a new instance of a component
   */
  async create(request: CreateInstanceRequest): Promise<InstanceWithData> {
    const id = generateInstanceId();
    const now = Date.now();

    const {
      component_id,
      component_version,
      name,
      owner_id,
      visibility = 'private',
      props = {},
      bindings,
      placement,
      runtime_type = 'edge',
      upgrade_strategy = 'pin',
    } = request;

    // Insert into D1
    await this.db
      .prepare(
        `INSERT INTO instances (
          id, component_id, component_version, name, owner_id, visibility,
          location, device, geo_lat, geo_lng, tags,
          runtime_type, upgrade_strategy, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        component_id,
        component_version ?? null,
        name ?? null,
        owner_id ?? null,
        visibility,
        placement?.location ?? null,
        placement?.device ?? null,
        placement?.geo?.lat ?? null,
        placement?.geo?.lng ?? null,
        placement?.tags ? JSON.stringify(placement.tags) : null,
        runtime_type,
        upgrade_strategy,
        now,
        now
      )
      .run();

    // Store props in KV
    await this.kv.put(propsKey(id), JSON.stringify(props));

    // Store bindings in KV if provided
    if (bindings) {
      await this.kv.put(bindingsKey(id), JSON.stringify(bindings));
    }

    const instance: Instance = {
      id,
      component_id,
      component_version,
      name,
      owner_id,
      visibility,
      placement,
      runtime_type,
      upgrade_strategy,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };

    return {
      ...instance,
      props,
      bindings,
      url: this.getLiveUrl(id),
    };
  }

  // ===========================================================================
  // Get
  // ===========================================================================

  /**
   * Get an instance by ID
   */
  async get(id: string): Promise<InstanceWithData | null> {
    // Get from D1
    const record = await this.db
      .prepare('SELECT * FROM instances WHERE id = ?')
      .bind(id)
      .first<InstanceRecord>();

    if (!record) {
      return null;
    }

    const instance = recordToInstance(record);

    // Get props from KV
    const propsJson = await this.kv.get(propsKey(id));
    const props = propsJson ? JSON.parse(propsJson) : {};

    // Get bindings from KV
    const bindingsJson = await this.kv.get(bindingsKey(id));
    const bindings = bindingsJson ? JSON.parse(bindingsJson) : undefined;

    return {
      ...instance,
      props,
      bindings,
      url: this.getLiveUrl(id),
    };
  }

  /**
   * Check if an instance exists
   */
  async exists(id: string): Promise<boolean> {
    const result = await this.db
      .prepare('SELECT 1 FROM instances WHERE id = ?')
      .bind(id)
      .first();
    return result !== null;
  }

  // ===========================================================================
  // List
  // ===========================================================================

  /**
   * List instances with filtering
   */
  async list(options: ListInstancesOptions = {}): Promise<InstanceWithData[]> {
    const {
      component_id,
      owner_id,
      visibility,
      location,
      tags,
      limit = 50,
      offset = 0,
      order_by = 'created_at',
      order_dir = 'desc',
    } = options;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (component_id) {
      conditions.push('component_id = ?');
      params.push(component_id);
    }

    if (owner_id) {
      conditions.push('owner_id = ?');
      params.push(owner_id);
    }

    if (visibility) {
      conditions.push('visibility = ?');
      params.push(visibility);
    }

    if (location) {
      conditions.push('location = ?');
      params.push(location);
    }

    // Tag filtering - check if any requested tag is in the JSON array
    if (tags && tags.length > 0) {
      // For each tag, check if it's in the JSON array
      // This uses SQLite's JSON functions
      const tagConditions = tags.map(() => "json_each.value = ?");
      conditions.push(
        `id IN (SELECT i.id FROM instances i, json_each(i.tags) WHERE ${tagConditions.join(' OR ')})`
      );
      params.push(...tags);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = `ORDER BY ${order_by} ${order_dir.toUpperCase()}`;

    const query = `SELECT * FROM instances ${where} ${order} LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const result = await this.db
      .prepare(query)
      .bind(...params)
      .all<InstanceRecord>();

    // Fetch props and bindings for each instance
    const instances: InstanceWithData[] = [];
    for (const record of result.results) {
      const instance = recordToInstance(record);

      // Get props from KV
      const propsJson = await this.kv.get(propsKey(record.id));
      const props = propsJson ? JSON.parse(propsJson) : {};

      // Get bindings from KV
      const bindingsJson = await this.kv.get(bindingsKey(record.id));
      const bindings = bindingsJson ? JSON.parse(bindingsJson) : undefined;

      instances.push({
        ...instance,
        props,
        bindings,
        url: this.getLiveUrl(record.id),
      });
    }

    return instances;
  }

  /**
   * Count instances matching criteria
   */
  async count(
    options: Omit<ListInstancesOptions, 'limit' | 'offset' | 'order_by' | 'order_dir'>
  ): Promise<number> {
    const { component_id, owner_id, visibility, location } = options;

    const conditions: string[] = [];
    const params: string[] = [];

    if (component_id) {
      conditions.push('component_id = ?');
      params.push(component_id);
    }

    if (owner_id) {
      conditions.push('owner_id = ?');
      params.push(owner_id);
    }

    if (visibility) {
      conditions.push('visibility = ?');
      params.push(visibility);
    }

    if (location) {
      conditions.push('location = ?');
      params.push(location);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT COUNT(*) as count FROM instances ${where}`;

    const result = await this.db
      .prepare(query)
      .bind(...params)
      .first<{ count: number }>();

    return result?.count ?? 0;
  }

  // ===========================================================================
  // Update Props
  // ===========================================================================

  /**
   * Update instance props (partial merge)
   */
  async updateProps(
    id: string,
    props: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Get existing props
    const existingJson = await this.kv.get(propsKey(id));
    const existing = existingJson ? JSON.parse(existingJson) : {};

    // Merge props
    const merged = { ...existing, ...props };

    // Store back in KV
    await this.kv.put(propsKey(id), JSON.stringify(merged));

    // Update timestamp in D1
    await this.db
      .prepare('UPDATE instances SET updated_at = ? WHERE id = ?')
      .bind(Date.now(), id)
      .run();

    // Invalidate resolved cache
    await this.kv.delete(resolvedKey(id));

    return merged;
  }

  /**
   * Replace all instance props
   */
  async replaceProps(
    id: string,
    props: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Store in KV (replace, not merge)
    await this.kv.put(propsKey(id), JSON.stringify(props));

    // Update timestamp in D1
    await this.db
      .prepare('UPDATE instances SET updated_at = ? WHERE id = ?')
      .bind(Date.now(), id)
      .run();

    // Invalidate resolved cache
    await this.kv.delete(resolvedKey(id));

    return props;
  }

  /**
   * Get instance props
   */
  async getProps(id: string): Promise<Record<string, unknown>> {
    const propsJson = await this.kv.get(propsKey(id));
    return propsJson ? JSON.parse(propsJson) : {};
  }

  // ===========================================================================
  // Update Bindings
  // ===========================================================================

  /**
   * Set instance bindings (replaces all bindings)
   */
  async setBindings(
    id: string,
    bindings: Record<string, InstanceBinding>
  ): Promise<Record<string, InstanceBinding>> {
    // Store in KV
    await this.kv.put(bindingsKey(id), JSON.stringify(bindings));

    // Update timestamp in D1
    await this.db
      .prepare('UPDATE instances SET updated_at = ? WHERE id = ?')
      .bind(Date.now(), id)
      .run();

    // Invalidate resolved cache
    await this.kv.delete(resolvedKey(id));

    return bindings;
  }

  /**
   * Get instance bindings
   */
  async getBindings(id: string): Promise<Record<string, InstanceBinding> | null> {
    const bindingsJson = await this.kv.get(bindingsKey(id));
    return bindingsJson ? JSON.parse(bindingsJson) : null;
  }

  // ===========================================================================
  // Update Instance Metadata
  // ===========================================================================

  /**
   * Update instance metadata (name, visibility, placement, etc.)
   */
  async updateMetadata(
    id: string,
    updates: {
      name?: string;
      visibility?: InstanceVisibility;
      placement?: InstancePlacement;
      upgrade_strategy?: InstanceUpgradeStrategy;
      component_version?: number;
    }
  ): Promise<Instance | null> {
    const now = Date.now();

    // Build dynamic update query
    const fields: string[] = ['updated_at = ?'];
    const params: (string | number | null)[] = [now];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }

    if (updates.visibility !== undefined) {
      fields.push('visibility = ?');
      params.push(updates.visibility);
    }

    if (updates.upgrade_strategy !== undefined) {
      fields.push('upgrade_strategy = ?');
      params.push(updates.upgrade_strategy);
    }

    if (updates.component_version !== undefined) {
      fields.push('component_version = ?');
      params.push(updates.component_version);
    }

    if (updates.placement !== undefined) {
      fields.push('location = ?');
      params.push(updates.placement.location ?? null);

      fields.push('device = ?');
      params.push(updates.placement.device ?? null);

      fields.push('geo_lat = ?');
      params.push(updates.placement.geo?.lat ?? null);

      fields.push('geo_lng = ?');
      params.push(updates.placement.geo?.lng ?? null);

      fields.push('tags = ?');
      params.push(
        updates.placement.tags ? JSON.stringify(updates.placement.tags) : null
      );
    }

    params.push(id);

    await this.db
      .prepare(`UPDATE instances SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run();

    // Fetch and return updated instance
    const record = await this.db
      .prepare('SELECT * FROM instances WHERE id = ?')
      .bind(id)
      .first<InstanceRecord>();

    return record ? recordToInstance(record) : null;
  }

  // ===========================================================================
  // Delete
  // ===========================================================================

  /**
   * Delete an instance
   */
  async delete(id: string): Promise<void> {
    // Delete from D1
    await this.db
      .prepare('DELETE FROM instances WHERE id = ?')
      .bind(id)
      .run();

    // Delete from KV
    await Promise.all([
      this.kv.delete(propsKey(id)),
      this.kv.delete(bindingsKey(id)),
      this.kv.delete(resolvedKey(id)),
    ]);
  }

  // ===========================================================================
  // Bulk Operations
  // ===========================================================================

  /**
   * Bulk update props for instances matching criteria
   */
  async bulkUpdateProps(
    filter: {
      component_id?: string;
      location?: string;
      tags?: string[];
      visibility?: InstanceVisibility;
    },
    props: Record<string, unknown>
  ): Promise<{ updated: number }> {
    // First, get matching instances
    const instances = await this.list({
      ...filter,
      limit: 1000, // Safety limit
    });

    // Update each instance's props
    let updated = 0;
    for (const instance of instances) {
      await this.updateProps(instance.id, props);
      updated++;
    }

    return { updated };
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Get the live URL for an instance
   */
  private getLiveUrl(id: string): string {
    return `${this.baseUrl}/live/${id}`;
  }

  /**
   * Get resolved props (props with bindings resolved)
   * This will be implemented in Phase 2 when we add binding resolution
   */
  async getResolvedProps(id: string): Promise<Record<string, unknown>> {
    // For Phase 1, just return the static props
    // Phase 2 will add binding resolution
    return this.getProps(id);
  }
}
