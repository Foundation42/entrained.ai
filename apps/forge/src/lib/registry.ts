/**
 * Forge Registry
 *
 * Manages component metadata in KV and artifacts in R2.
 * Follows the same pattern as Prometheus registry.
 */

import type { ForgeManifest } from '../types';

export class Registry {
  constructor(
    private kv: KVNamespace,
    private r2: R2Bucket
  ) {}

  /**
   * Generate a hash for a component description
   */
  async hash(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Generate a unique component ID
   */
  generateId(tag: string, version: number): string {
    const suffix = crypto.randomUUID().slice(0, 4);
    return `${tag}-v${version}-${suffix}`;
  }

  /**
   * Store a component
   */
  async put(entry: {
    id: string;
    manifest: ForgeManifest;
    tsx_source: string;
    component_js: string;
    type_defs?: string;
    embedding?: number[];
  }): Promise<void> {
    const { id, manifest, tsx_source, component_js, type_defs, embedding } = entry;

    // Store artifacts in R2
    const r2Promises: Promise<R2Object | null>[] = [
      this.r2.put(`${id}/manifest.json`, JSON.stringify(manifest)),
      this.r2.put(`${id}/source.tsx`, tsx_source),
      this.r2.put(`${id}/component.js`, component_js),
    ];
    if (type_defs) {
      r2Promises.push(this.r2.put(`${id}/component.d.ts`, type_defs));
    }
    await Promise.all(r2Promises);

    // Store metadata in KV (for fast lookups)
    const kvEntry = {
      id,
      manifest,
      artifacts: {
        manifest_key: `${id}/manifest.json`,
        source_key: `${id}/source.tsx`,
        component_key: `${id}/component.js`,
        typedefs_key: type_defs ? `${id}/component.d.ts` : undefined,
        tsx_size: tsx_source.length,
        js_size: component_js.length,
        dts_size: type_defs?.length,
      },
      embedding,
      created_at: manifest.created_at,
    };

    await this.kv.put(`component:${id}`, JSON.stringify(kvEntry));

    // Also store by tag for latest version lookup
    await this.kv.put(`tag:${manifest.components[0]?.tag || id}`, id);
  }

  /**
   * Get a component by ID
   */
  async get(id: string): Promise<{
    id: string;
    manifest: ForgeManifest;
    artifacts: {
      manifest_key: string;
      source_key: string;
      component_key: string;
      tsx_size: number;
      js_size: number;
    };
    embedding?: number[];
  } | null> {
    const data = await this.kv.get(`component:${id}`);
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Get component by tag (returns latest version ID)
   */
  async getByTag(tag: string): Promise<string | null> {
    return this.kv.get(`tag:${tag}`);
  }

  /**
   * Find component by tag (returns full entry)
   */
  async findByTag(tag: string): Promise<{
    id: string;
    manifest: ForgeManifest;
    artifacts: {
      manifest_key: string;
      source_key: string;
      component_key: string;
      tsx_size: number;
      js_size: number;
    };
    embedding?: number[];
  } | null> {
    const id = await this.getByTag(tag);
    if (!id) return null;
    return this.get(id);
  }

  /**
   * Get TSX source
   */
  async getSource(id: string): Promise<string | null> {
    const obj = await this.r2.get(`${id}/source.tsx`);
    if (!obj) return null;
    return obj.text();
  }

  /**
   * Get compiled JavaScript
   */
  async getComponentJS(id: string): Promise<string | null> {
    const obj = await this.r2.get(`${id}/component.js`);
    if (!obj) return null;
    return obj.text();
  }

  /**
   * Get manifest
   */
  async getManifest(id: string): Promise<ForgeManifest | null> {
    const obj = await this.r2.get(`${id}/manifest.json`);
    if (!obj) return null;
    return obj.json();
  }

  /**
   * Get type definitions
   */
  async getTypeDefs(id: string): Promise<string | null> {
    const obj = await this.r2.get(`${id}/component.d.ts`);
    if (!obj) return null;
    return obj.text();
  }

  /**
   * List all components
   */
  async list(options: { limit?: number; cursor?: string } = {}): Promise<{
    entries: Array<{
      id: string;
      manifest: ForgeManifest;
      created_at: string;
    }>;
    cursor?: string;
  }> {
    const result = await this.kv.list({
      prefix: 'component:',
      limit: options.limit || 50,
      cursor: options.cursor,
    });

    const entries = await Promise.all(
      result.keys.map(async (key) => {
        const data = await this.kv.get(key.name);
        if (!data) return null;
        const parsed = JSON.parse(data);
        return {
          id: parsed.id,
          manifest: parsed.manifest,
          created_at: parsed.created_at,
        };
      })
    );

    return {
      entries: entries.filter((e): e is NonNullable<typeof e> => e !== null),
      cursor: result.list_complete ? undefined : result.cursor,
    };
  }

  /**
   * Update component metadata
   */
  async updateMetadata(id: string, updates: Partial<ForgeManifest>): Promise<void> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Component ${id} not found`);

    existing.manifest = { ...existing.manifest, ...updates };
    await this.kv.put(`component:${id}`, JSON.stringify(existing));
  }

  /**
   * Delete a component
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) return false;

    await Promise.all([
      this.kv.delete(`component:${id}`),
      this.r2.delete(`${id}/manifest.json`),
      this.r2.delete(`${id}/source.tsx`),
      this.r2.delete(`${id}/component.js`),
    ]);

    return true;
  }

  /**
   * Get registry stats
   */
  async stats(): Promise<{
    total_components: number;
    total_size_bytes: number;
  }> {
    const { entries } = await this.list({ limit: 1000 });
    let totalSize = 0;

    for (const entry of entries) {
      const full = await this.get(entry.id);
      if (full) {
        totalSize += full.artifacts.tsx_size + full.artifacts.js_size;
      }
    }

    return {
      total_components: entries.length,
      total_size_bytes: totalSize,
    };
  }
}
