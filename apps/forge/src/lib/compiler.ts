/**
 * Forge Compiler
 *
 * Thin proxy to the Generation Engine container.
 * Handles caching, embeddings, and storage.
 */

import type { Env, ForgeManifest, CreateResponse } from '../types';
import { Registry } from './registry';
import { generateTypeDefs } from './typegen';

export class Compiler {
  private registry: Registry;
  private ai: Ai;
  private vectorize: VectorizeIndex;

  constructor(private env: Env) {
    this.registry = new Registry(env.REGISTRY, env.ARTIFACTS);
    this.ai = env.AI;
    this.vectorize = env.VECTORIZE;
  }

  /**
   * Generate a new component from description
   */
  async generate(description: string): Promise<CreateResponse> {
    // Step 1: Check cache by description hash
    const descHash = await this.registry.hash(description);
    const existing = await this.registry.get(descHash);

    if (existing) {
      console.log(`[Compiler] Cache hit for "${description.slice(0, 30)}..." -> ${existing.id}`);
      return {
        id: existing.id,
        url: `https://forge.entrained.ai/${existing.id}`,
        version: existing.manifest.version,
        type: existing.manifest.type,
        manifest: existing.manifest,
      };
    }

    console.log(`[Compiler] Cache miss, calling container...`);

    // Step 2: Call container for generation
    const containerStart = Date.now();
    const result = await this.generateViaContainer(description);
    const containerTime = Date.now() - containerStart;

    // Step 3: Generate embedding for semantic search
    const embedStart = Date.now();
    const searchText = [
      description,
      result.manifest.className,
      result.manifest.description,
    ].filter(Boolean).join(' - ');
    const embedding = await this.embed(searchText);
    const embedTime = Date.now() - embedStart;

    // Step 4: Build full manifest
    const componentId = this.registry.generateId(result.manifest.tag, 1);
    const fullManifest: ForgeManifest = {
      id: componentId,
      version: 1,
      created_at: new Date().toISOString(),
      provenance: {
        ai_model: result.provenance?.model,
        ai_provider: 'gemini',
        source_type: 'ai',
      },
      description,
      type: result.manifest.exports?.length ? 'library' : 'app',
      components: [{
        name: result.manifest.className,
        tag: result.manifest.tag,
        exported: true,
        props: (result.manifest.props || []).map(p => ({
          ...p,
          type: p.type as 'String' | 'Number' | 'Boolean' | 'Object' | 'Array',
        })),
        events: result.manifest.events || [],
      }],
      css_variables: result.manifest.cssVariables,
      parts: result.manifest.parts,
      artifacts: {
        source_tsx: `${componentId}/source.tsx`,
        component_js: `${componentId}/component.js`,
      },
    };

    // Step 5: Generate type definitions
    const typeDefs = generateTypeDefs(fullManifest);

    // Step 6: Store in registry
    const storeStart = Date.now();
    await this.registry.put({
      id: componentId,
      manifest: fullManifest,
      tsx_source: result.tsx_source,
      component_js: result.component_js,
      type_defs: typeDefs,
      embedding,
    });
    const storeTime = Date.now() - storeStart;

    // Step 7: Insert into Vectorize for semantic search
    const vectorizeStart = Date.now();
    if (embedding) {
      await this.vectorize.upsert([{
        id: componentId,
        values: embedding,
        metadata: {
          description: fullManifest.description,
          type: fullManifest.type,
          tag: fullManifest.components[0]?.tag,
          version: fullManifest.version,
        },
      }]);
    }
    const vectorizeTime = Date.now() - vectorizeStart;

    console.log(`[Compiler] Timing: container=${containerTime}ms, embed=${embedTime}ms, store=${storeTime}ms, vectorize=${vectorizeTime}ms`);

    return {
      id: componentId,
      url: `https://forge.entrained.ai/${componentId}`,
      version: 1,
      type: fullManifest.type,
      manifest: fullManifest,
    };
  }

  /**
   * Update source manually (no AI, just transpile)
   */
  async updateSource(id: string, newSource: string): Promise<CreateResponse> {
    // Get existing component
    const existing = await this.registry.get(id);
    if (!existing) {
      throw new Error(`Component ${id} not found`);
    }

    // Call container for transpilation only
    const componentJS = await this.transpileViaContainer(newSource);

    // Generate new ID for new version
    const baseTag = existing.manifest.components[0]?.tag || 'component';
    const newVersion = existing.manifest.version + 1;
    const newId = this.registry.generateId(baseTag, newVersion);

    // Build updated manifest
    const updatedManifest: ForgeManifest = {
      ...existing.manifest,
      id: newId,
      version: newVersion,
      previous_version: id,
      created_at: new Date().toISOString(),
      provenance: {
        ...existing.manifest.provenance,
        source_type: 'manual',
      },
      artifacts: {
        source_tsx: `${newId}/source.tsx`,
        component_js: `${newId}/component.js`,
      },
    };

    // Generate new embedding from description
    const embedding = await this.embed(updatedManifest.description);

    // Generate type definitions
    const typeDefs = generateTypeDefs(updatedManifest);

    // Store new version
    await this.registry.put({
      id: newId,
      manifest: updatedManifest,
      tsx_source: newSource,
      component_js: componentJS,
      type_defs: typeDefs,
      embedding,
    });

    // Insert into Vectorize
    if (embedding) {
      await this.vectorize.upsert([{
        id: newId,
        values: embedding,
        metadata: {
          description: updatedManifest.description,
          type: updatedManifest.type,
          tag: updatedManifest.components[0]?.tag,
          version: updatedManifest.version,
        },
      }]);
    }

    return {
      id: newId,
      url: `https://forge.entrained.ai/${newId}`,
      version: newVersion,
      type: updatedManifest.type,
      manifest: updatedManifest,
    };
  }

  /**
   * Update an existing component
   */
  async update(id: string, changes: string): Promise<CreateResponse> {
    // Get existing component
    const existing = await this.registry.get(id);
    if (!existing) {
      throw new Error(`Component ${id} not found`);
    }

    // Get current source
    const currentSource = await this.registry.getSource(id);
    if (!currentSource) {
      throw new Error(`Source for ${id} not found`);
    }

    // Call container for update
    const result = await this.updateViaContainer(currentSource, existing.manifest, changes);

    // Generate new ID for new version
    const baseTag = existing.manifest.components[0]?.tag || 'component';
    const newVersion = existing.manifest.version + 1;
    const newId = this.registry.generateId(baseTag, newVersion);

    // Build updated manifest
    const updatedManifest: ForgeManifest = {
      ...existing.manifest,
      id: newId,
      version: newVersion,
      previous_version: id,
      created_at: new Date().toISOString(),
      provenance: {
        ...existing.manifest.provenance,
        source_type: 'ai',
      },
      artifacts: {
        source_tsx: `${newId}/source.tsx`,
        component_js: `${newId}/component.js`,
      },
    };

    // Generate new embedding
    const searchText = [
      updatedManifest.description,
      changes,
    ].join(' - ');
    const embedding = await this.embed(searchText);

    // Generate type definitions
    const typeDefs = generateTypeDefs(updatedManifest);

    // Store new version
    await this.registry.put({
      id: newId,
      manifest: updatedManifest,
      tsx_source: result.tsx_source,
      component_js: result.component_js,
      type_defs: typeDefs,
      embedding,
    });

    // Insert into Vectorize
    if (embedding) {
      await this.vectorize.upsert([{
        id: newId,
        values: embedding,
        metadata: {
          description: updatedManifest.description,
          type: updatedManifest.type,
          tag: updatedManifest.components[0]?.tag,
          version: updatedManifest.version,
        },
      }]);
    }

    return {
      id: newId,
      url: `https://forge.entrained.ai/${newId}`,
      version: newVersion,
      type: updatedManifest.type,
      manifest: updatedManifest,
    };
  }

  /**
   * Wait for container to be ready
   */
  private async waitForContainer(
    generator: DurableObjectStub,
    maxWaitMs = 120000,
    pollIntervalMs = 500
  ): Promise<boolean> {
    const startTime = Date.now();
    let lastError: string | null = null;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await generator.fetch('http://container/health', {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        if (response.ok) {
          const elapsed = Date.now() - startTime;
          console.log(`[Compiler] Container ready after ${elapsed}ms`);
          return true;
        }
        lastError = `HTTP ${response.status}`;
      } catch (err) {
        lastError = (err as Error).message;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Container not ready after ${maxWaitMs}ms: ${lastError}`);
  }

  /**
   * Call container for full generation
   */
  private async generateViaContainer(description: string): Promise<{
    manifest: {
      tag: string;
      className: string;
      description: string;
      props?: Array<{ name: string; type: string; default?: unknown; required: boolean; description?: string }>;
      events?: Array<{ name: string; description?: string }>;
      cssVariables?: Array<{ name: string; default: string; description?: string }>;
      parts?: Array<{ name: string; description?: string }>;
      exports?: string[];
    };
    tsx_source: string;
    component_js: string;
    provenance?: {
      model: string;
      generated_at: string;
      container_version: string;
    };
  }> {
    const generatorId = this.env.GENERATOR.idFromName('generator');
    const generator = this.env.GENERATOR.get(generatorId);

    await this.waitForContainer(generator);

    const response = await generator.fetch('http://container/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string };
      throw new Error(error.error || 'Container generation failed');
    }

    return response.json();
  }

  /**
   * Call container for update
   */
  private async updateViaContainer(
    source: string,
    manifest: ForgeManifest,
    changes: string
  ): Promise<{
    tsx_source: string;
    component_js: string;
  }> {
    const generatorId = this.env.GENERATOR.idFromName('generator');
    const generator = this.env.GENERATOR.get(generatorId);

    await this.waitForContainer(generator);

    const response = await generator.fetch('http://container/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, manifest, changes }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string };
      throw new Error(error.error || 'Container update failed');
    }

    return response.json();
  }

  /**
   * Call container for transpilation only (no AI)
   */
  private async transpileViaContainer(source: string): Promise<string> {
    const generatorId = this.env.GENERATOR.idFromName('generator');
    const generator = this.env.GENERATOR.get(generatorId);

    await this.waitForContainer(generator);

    const response = await generator.fetch('http://container/transpile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source }),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: string };
      throw new Error(error.error || 'Transpilation failed');
    }

    const result = await response.json() as { component_js: string };
    return result.component_js;
  }

  /**
   * Generate semantic embedding
   */
  private async embed(text: string): Promise<number[] | undefined> {
    try {
      const response = await this.ai.run('@cf/baai/bge-base-en-v1.5', {
        text,
      });
      return (response as { data?: number[][] }).data?.[0] || undefined;
    } catch (e) {
      console.warn('Embedding failed:', (e as Error).message);
      return undefined;
    }
  }
}
