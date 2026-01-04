/**
 * Forge Component Storage
 *
 * Provides instance/class/global storage APIs for components.
 * Each storage scope is namespaced in KV.
 */

export class ComponentStorage {
  constructor(
    private kv: KVNamespace,
    private componentId: string
  ) {}

  /**
   * Get storage for a specific instance
   */
  instance(instanceId: string): StorageScope {
    return new StorageScope(this.kv, `${this.componentId}:instance:${instanceId}`);
  }

  /**
   * Get storage shared across all instances of this component
   */
  get class(): StorageScope {
    return new StorageScope(this.kv, `${this.componentId}:class`);
  }

  /**
   * Get global storage shared across all components
   */
  get global(): StorageScope {
    return new StorageScope(this.kv, 'global');
  }
}

class StorageScope {
  constructor(
    private kv: KVNamespace,
    private prefix: string
  ) {}

  private key(name: string): string {
    return `storage:${this.prefix}:${name}`;
  }

  async get<T = unknown>(name: string): Promise<T | null> {
    const data = await this.kv.get(this.key(name));
    if (!data) return null;
    return JSON.parse(data) as T;
  }

  async set(name: string, value: unknown): Promise<void> {
    await this.kv.put(this.key(name), JSON.stringify(value));
  }

  async delete(name: string): Promise<void> {
    await this.kv.delete(this.key(name));
  }

  async list(): Promise<string[]> {
    const result = await this.kv.list({ prefix: `storage:${this.prefix}:` });
    const prefixLen = `storage:${this.prefix}:`.length;
    return result.keys.map(k => k.name.slice(prefixLen));
  }

  async clear(): Promise<void> {
    const keys = await this.list();
    await Promise.all(keys.map(k => this.delete(k)));
  }
}

/**
 * Handle storage API requests
 */
export async function handleStorageRequest(
  kv: KVNamespace,
  componentId: string,
  scope: 'instance' | 'class' | 'global',
  instanceId: string | null,
  key: string | null,
  method: string,
  body?: unknown
): Promise<Response> {
  const storage = new ComponentStorage(kv, componentId);

  let scopeStorage: StorageScope;
  if (scope === 'instance') {
    if (!instanceId) {
      return Response.json({ error: 'Instance ID required' }, { status: 400 });
    }
    scopeStorage = storage.instance(instanceId);
  } else if (scope === 'class') {
    scopeStorage = storage.class;
  } else {
    scopeStorage = storage.global;
  }

  // GET /data - List all keys
  if (method === 'GET' && !key) {
    const keys = await scopeStorage.list();
    return Response.json({ keys });
  }

  // GET /data/:key - Get value (returns null for missing keys, not 404)
  if (method === 'GET' && key) {
    const value = await scopeStorage.get(key);
    return Response.json({ key, value });
  }

  // POST /data/:key - Set value
  if (method === 'POST' && key) {
    await scopeStorage.set(key, body);
    return Response.json({ key, success: true });
  }

  // DELETE /data/:key - Delete value
  if (method === 'DELETE' && key) {
    await scopeStorage.delete(key);
    return Response.json({ key, deleted: true });
  }

  return Response.json({ error: 'Invalid request' }, { status: 400 });
}
