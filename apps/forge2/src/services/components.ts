/**
 * Component Service
 *
 * Implements the draft/publish workflow for components.
 * - Create → Creates draft (not searchable)
 * - Update → Updates draft (overwrites, no versions)
 * - Publish → Moves draft to version, indexes in Vectorize
 * - Search → Returns published components only
 */

import type {
  Component,
  ComponentType,
  ComponentStatus,
  Version,
  VersionProvenance,
  Env,
  ComponentRecord,
  VersionRecord,
  ComponentWithDraft,
  ComponentWithVersion,
  MediaType,
} from '../types';
import { D1Storage, ListComponentsOptions } from '../storage/d1';
import { R2Storage } from '../storage/r2';
import {
  VectorizeStorage,
  ComponentVectorMetadata,
  ComponentSearchResult,
} from '../storage/vectorize';
import { generateComponentId, generateVersionId } from '../versioning';

// ===========================================================================
// Input Types
// ===========================================================================

export interface CreateComponentInput {
  /** Optional name (AI-generated if not provided) */
  name?: string;

  /** Component type */
  type: ComponentType;

  /** File type for code components */
  file_type?: string;

  /** Media type for media components */
  media_type?: MediaType;

  /** Description of the component */
  description: string;

  /** Source content */
  content: string | ArrayBuffer;

  /** MIME type */
  mime_type?: string;

  /** Generation provenance */
  provenance?: VersionProvenance;

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** Component dependencies (other component IDs) */
  dependencies?: string[];

  /** Optional creator identifier */
  creator?: string;
}

export interface UpdateDraftInput {
  /** Component ID to update */
  component_id: string;

  /** New description (optional) */
  description?: string;

  /** New content */
  content: string | ArrayBuffer;

  /** Updated metadata */
  metadata?: Record<string, unknown>;

  /** Updated dependencies */
  dependencies?: string[];

  /** Generation provenance */
  provenance?: VersionProvenance;
}

export interface PublishInput {
  /** Component ID to publish */
  component_id: string;

  /** Optional version changelog */
  changelog?: string;

  /** Semantic version bump type (defaults to 'patch') */
  bump?: 'major' | 'minor' | 'patch';
}

export interface ComponentSearchInput {
  query: string;
  type?: ComponentType;
  file_type?: string;
  media_type?: string;
  limit?: number;
  min_score?: number;
}

// ===========================================================================
// Component Service
// ===========================================================================

export class ComponentService {
  private d1: D1Storage;
  private r2: R2Storage;
  private vectorize: VectorizeStorage;
  private baseUrl: string;
  private ai: Ai;

  constructor(env: Env, baseUrl: string) {
    this.d1 = new D1Storage(env.DB);
    this.r2 = new R2Storage(env.ASSETS);
    this.vectorize = new VectorizeStorage(env.VECTORIZE, env.AI);
    this.ai = env.AI;
    this.baseUrl = baseUrl;
  }

  // ===========================================================================
  // Create Operations
  // ===========================================================================

  /**
   * Create a new component (starts as draft)
   *
   * The component is NOT searchable until published.
   */
  async create(input: CreateComponentInput): Promise<ComponentWithDraft> {
    const {
      name,
      type,
      file_type,
      media_type,
      description,
      content,
      mime_type,
      provenance,
      metadata = {},
      dependencies = [],
      creator,
    } = input;

    // Generate component ID
    const componentId = generateComponentId();

    // Generate canonical name (AI-generated if not provided)
    const canonical_name = name || await this.generateCanonicalName(description);

    // Build component
    const now = new Date().toISOString();
    const component: Component = {
      id: componentId,
      canonical_name,
      status: 'draft',
      type,
      file_type,
      media_type,
      description,
      latest_version: 0, // Never published
      has_draft: true,
      creator,
      created_at: now,
      updated_at: now,
    };

    // Store draft in R2
    const draftManifest = await this.r2.storeDraft({
      componentId,
      content,
      manifest: {
        description,
        provenance,
        metadata,
        dependencies,
      },
      mimeType: mime_type ?? this.guessMimeType(file_type, media_type),
    });

    // Create component record in D1
    await this.d1.createComponent(component);

    // Build draft response
    const draft = {
      component_id: componentId,
      content_url: this.r2.draftContentUrl(componentId, this.baseUrl),
      manifest_url: this.r2.draftManifestUrl(componentId, this.baseUrl),
      preview_url: `${this.baseUrl}/preview/${componentId}`,
      updated_at: draftManifest.updated_at,
      metadata,
      provenance,
      dependencies,
    };

    return {
      component,
      draft,
      preview_url: draft.preview_url,
    };
  }

  // ===========================================================================
  // Update Operations
  // ===========================================================================

  /**
   * Update a component's draft
   *
   * If the component is published with no draft, copies latest version to draft first.
   * Then overwrites the draft with new content.
   */
  async updateDraft(input: UpdateDraftInput): Promise<ComponentWithDraft> {
    const {
      component_id,
      description,
      content,
      metadata = {},
      dependencies = [],
      provenance,
    } = input;

    // Get existing component
    const componentRecord = await this.d1.getComponent(component_id);
    if (!componentRecord) {
      throw new Error(`Component not found: ${component_id}`);
    }

    // If published with no draft, we need to copy latest version to draft first
    // (This happens when updating a published component)
    if (componentRecord.status === 'published' && !componentRecord.has_draft) {
      // Get latest version content
      const latestContent = await this.r2.getVersionContentAsText(
        component_id,
        componentRecord.latest_version
      );
      const latestManifest = await this.r2.getVersionManifest(
        component_id,
        componentRecord.latest_version
      );

      // Store as draft first
      if (latestContent && latestManifest) {
        await this.r2.storeDraft({
          componentId: component_id,
          content: latestContent,
          manifest: {
            description: latestManifest.description ?? componentRecord.description,
            provenance: latestManifest.provenance,
            metadata: latestManifest.metadata,
            dependencies: latestManifest.dependencies,
          },
          mimeType: this.guessMimeType(
            componentRecord.file_type ?? undefined,
            componentRecord.media_type as MediaType | undefined
          ),
        });
      }
    }

    // Store new draft content
    const newDescription = description ?? componentRecord.description;
    const draftManifest = await this.r2.storeDraft({
      componentId: component_id,
      content,
      manifest: {
        description: newDescription,
        provenance,
        metadata,
        dependencies,
      },
      mimeType: this.guessMimeType(
        componentRecord.file_type ?? undefined,
        componentRecord.media_type as MediaType | undefined
      ),
    });

    // Update component in D1
    await this.d1.updateComponentDraft(component_id, true, newDescription);

    // Build response
    const component = this.recordToComponent({
      ...componentRecord,
      description: newDescription,
      has_draft: 1,
      updated_at: Date.now(),
    });

    const draft = {
      component_id,
      content_url: this.r2.draftContentUrl(component_id, this.baseUrl),
      manifest_url: this.r2.draftManifestUrl(component_id, this.baseUrl),
      preview_url: `${this.baseUrl}/preview/${component_id}`,
      updated_at: draftManifest.updated_at,
      metadata,
      provenance,
      dependencies,
    };

    return {
      component,
      draft,
      preview_url: draft.preview_url,
    };
  }

  // ===========================================================================
  // Publish Operations
  // ===========================================================================

  /**
   * Publish a component's draft
   *
   * - Moves draft content to a new version
   * - Updates component status to 'published'
   * - Indexes in Vectorize (NOW searchable)
   * - Deletes the draft
   */
  async publish(input: PublishInput): Promise<ComponentWithVersion> {
    const { component_id, changelog, bump = 'patch' } = input;

    // Get component
    const componentRecord = await this.d1.getComponent(component_id);
    if (!componentRecord) {
      throw new Error(`Component not found: ${component_id}`);
    }

    // Check for draft
    if (!componentRecord.has_draft) {
      throw new Error(`Component has no draft to publish: ${component_id}`);
    }

    // Get draft content and manifest
    const draftContent = await this.r2.getDraftContent(component_id);
    const draftManifest = await this.r2.getDraftManifest(component_id);

    if (!draftContent || !draftManifest) {
      throw new Error(`Draft content not found for: ${component_id}`);
    }

    // Calculate next version number
    const nextVersion = componentRecord.latest_version + 1;
    const versionId = generateVersionId(component_id, nextVersion);

    // Get previous version for parent_version_id and semver calculation
    const prevVersionId = componentRecord.latest_version > 0
      ? generateVersionId(component_id, componentRecord.latest_version)
      : undefined;

    // Calculate semver based on previous version and bump type
    let semver: string;
    if (componentRecord.latest_version === 0) {
      // First version starts at 1.0.0
      semver = '1.0.0';
    } else {
      // Get previous version's semver
      const prevVersion = await this.d1.getLatestVersion(component_id);
      const prevSemver = prevVersion?.semver ?? '1.0.0';
      semver = this.bumpSemver(prevSemver, bump);
    }

    // Store version in R2
    const versionManifest = await this.r2.storeVersion({
      componentId: component_id,
      version: nextVersion,
      content: draftContent,
      manifest: {
        description: changelog ?? draftManifest.description,
        provenance: draftManifest.provenance,
        metadata: draftManifest.metadata,
        dependencies: draftManifest.dependencies,
        embedding: draftManifest.embedding,
      },
      mimeType: this.guessMimeType(
        componentRecord.file_type ?? undefined,
        componentRecord.media_type as MediaType | undefined
      ),
    });

    // Create version record in D1
    const version: Version = {
      id: versionId,
      component_id,
      version: nextVersion,
      semver,
      parent_version_id: prevVersionId,
      description: changelog ?? draftManifest.description,
      content_url: this.r2.versionContentUrl(component_id, nextVersion, this.baseUrl),
      manifest_url: this.r2.versionManifestUrl(component_id, nextVersion, this.baseUrl),
      size: draftContent.byteLength,
      mime_type: this.guessMimeType(
        componentRecord.file_type ?? undefined,
        componentRecord.media_type as MediaType | undefined
      ),
      created_at: versionManifest.created_at,
      provenance: draftManifest.provenance ?? { source_type: 'manual' },
      metadata: draftManifest.metadata ?? {},
      dependencies: draftManifest.dependencies ?? [],
    };

    await this.d1.createVersion(version);

    // Update component in D1
    await this.d1.publishComponent(component_id, nextVersion, draftManifest.description);

    // Generate embedding and index in Vectorize (NOW searchable)
    const contentSample = typeof draftContent === 'string'
      ? draftContent
      : new TextDecoder().decode(draftContent.slice(0, 2000));

    const embedding = await this.vectorize.embedAsset(
      draftManifest.description,
      contentSample
    );

    const vectorMetadata: ComponentVectorMetadata = {
      component_id,
      canonical_name: componentRecord.canonical_name,
      type: componentRecord.type as ComponentType,
      file_type: componentRecord.file_type ?? undefined,
      media_type: componentRecord.media_type ?? undefined,
      description: draftManifest.description,
      latest_version: nextVersion,
      creator: componentRecord.creator ?? undefined,
    };

    await this.vectorize.indexComponent(component_id, embedding, vectorMetadata);

    // Delete draft from R2
    await this.r2.deleteDraft(component_id);

    // Build response
    const component = this.recordToComponent({
      ...componentRecord,
      status: 'published',
      latest_version: nextVersion,
      has_draft: 0,
      updated_at: Date.now(),
    });

    return { component, version };
  }

  // ===========================================================================
  // Get Operations
  // ===========================================================================

  /**
   * Get a component by ID
   *
   * Returns component with either draft (if has_draft) or latest version
   */
  async get(id: string): Promise<ComponentWithDraft | ComponentWithVersion | null> {
    const componentRecord = await this.d1.getComponent(id);
    if (!componentRecord) {
      return null;
    }

    const component = this.recordToComponent(componentRecord);

    // If has draft, return with draft
    if (componentRecord.has_draft) {
      const draftManifest = await this.r2.getDraftManifest(id);
      if (draftManifest) {
        return {
          component,
          draft: {
            component_id: id,
            content_url: this.r2.draftContentUrl(id, this.baseUrl),
            manifest_url: this.r2.draftManifestUrl(id, this.baseUrl),
            preview_url: `${this.baseUrl}/preview/${id}`,
            updated_at: draftManifest.updated_at,
            metadata: draftManifest.metadata,
            provenance: draftManifest.provenance,
            dependencies: draftManifest.dependencies,
          },
          preview_url: `${this.baseUrl}/preview/${id}`,
        };
      }
    }

    // Return with latest version
    if (componentRecord.latest_version > 0) {
      const versionRecord = await this.d1.getLatestVersion(id);
      if (versionRecord) {
        return {
          component,
          version: this.recordToVersion(versionRecord),
        };
      }
    }

    // Draft-only component with missing draft data
    return {
      component,
      draft: {
        component_id: id,
        content_url: this.r2.draftContentUrl(id, this.baseUrl),
        manifest_url: this.r2.draftManifestUrl(id, this.baseUrl),
        preview_url: `${this.baseUrl}/preview/${id}`,
        updated_at: component.updated_at,
      },
      preview_url: `${this.baseUrl}/preview/${id}`,
    };
  }

  /**
   * Get draft content as text
   */
  async getDraftContent(componentId: string): Promise<string | null> {
    return this.r2.getDraftContentAsText(componentId);
  }

  /**
   * Get draft content with metadata (for serving binary content with correct MIME type)
   */
  async getDraftContentWithMetadata(componentId: string): Promise<{
    content: ArrayBuffer;
    contentType: string;
  } | null> {
    return this.r2.getDraftContentWithMetadata(componentId);
  }

  /**
   * Get version content as text
   */
  async getVersionContent(componentId: string, version: number): Promise<string | null> {
    return this.r2.getVersionContentAsText(componentId, version);
  }

  /**
   * Get version content with metadata (for binary content like images)
   */
  async getVersionContentWithMetadata(componentId: string, version: number): Promise<{
    content: ArrayBuffer;
    contentType: string;
  } | null> {
    return this.r2.getVersionContentWithMetadata(componentId, version);
  }

  /**
   * Get version history for a component
   */
  async getVersionHistory(componentId: string): Promise<Version[]> {
    const records = await this.d1.getVersionHistory(componentId);
    return records.map((r) => this.recordToVersion(r));
  }

  /**
   * Get a specific version
   */
  async getVersion(componentId: string, versionNumber: number): Promise<Version | null> {
    const record = await this.d1.getVersionByNumber(componentId, versionNumber);
    return record ? this.recordToVersion(record) : null;
  }

  // ===========================================================================
  // Search Operations
  // ===========================================================================

  /**
   * Search for published components
   *
   * Only returns published components - drafts are not searchable.
   */
  async search(input: ComponentSearchInput): Promise<ComponentSearchResult[]> {
    return this.vectorize.searchComponents(input.query, {
      type: input.type,
      file_type: input.file_type,
      media_type: input.media_type,
      limit: input.limit,
      min_score: input.min_score,
    });
  }

  // ===========================================================================
  // List Operations
  // ===========================================================================

  /**
   * List components with filtering
   */
  async list(options: ListComponentsOptions = {}): Promise<Component[]> {
    const records = await this.d1.listComponents(options);
    return records.map((r) => this.recordToComponent(r));
  }

  /**
   * List published components only
   */
  async listPublished(
    options: Omit<ListComponentsOptions, 'status'> = {}
  ): Promise<Component[]> {
    const records = await this.d1.listPublishedComponents(options);
    return records.map((r) => this.recordToComponent(r));
  }

  // ===========================================================================
  // Delete Operations
  // ===========================================================================

  /**
   * Delete a component and all its data
   *
   * Removes from D1, R2, and Vectorize.
   */
  async delete(componentId: string): Promise<{ deleted: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Check if component exists
    const component = await this.d1.getComponent(componentId);
    if (!component) {
      return { deleted: false, errors: ['Component not found'] };
    }

    // Remove from Vectorize (if published)
    if (component.status === 'published') {
      try {
        await this.vectorize.removeComponent(componentId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Vectorize: ${msg}`);
      }
    }

    // Remove from D1
    try {
      await this.d1.deleteComponent(componentId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`D1: ${msg}`);
    }

    // Remove from R2
    try {
      await this.r2.deleteComponent(componentId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`R2: ${msg}`);
    }

    return { deleted: errors.length === 0, errors };
  }

  // ===========================================================================
  // Preview and CSS Operations
  // ===========================================================================

  /**
   * Store preview HTML for a component draft
   * Returns the public URL for the preview
   */
  async storeDraftPreview(componentId: string, html: string): Promise<string> {
    return this.r2.storeDraftPreview(componentId, html, this.baseUrl);
  }

  /**
   * Get draft preview HTML
   */
  async getDraftPreview(componentId: string): Promise<string | null> {
    return this.r2.getDraftPreview(componentId);
  }

  /**
   * Store CSS for a component draft
   * Returns the public URL for the CSS
   */
  async storeDraftCss(componentId: string, css: string): Promise<string> {
    return this.r2.storeDraftCss(componentId, css, this.baseUrl);
  }

  /**
   * Get draft CSS
   */
  async getDraftCss(componentId: string): Promise<string | null> {
    return this.r2.getDraftCss(componentId);
  }

  // ===========================================================================
  // Utility Operations
  // ===========================================================================

  /**
   * Generate a canonical name using AI
   */
  async generateCanonicalName(description: string): Promise<string> {
    try {
      const prompt = `Generate a short 2-3 word kebab-case name for this component. Return ONLY the name, nothing else.

Description: ${description}

Examples of good names:
- neon-stopwatch
- audio-player
- pixel-fireworks
- bus-schedule
- login-form

Name:`;

      const result = await this.ai.run('@cf/meta/llama-3-8b-instruct', {
        prompt,
        max_tokens: 20,
      });

      // Extract the name from the response
      const response = (result as { response?: string }).response ?? '';
      const name = response
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30);

      return name || 'component';
    } catch {
      // Fallback to simple slugification
      return description
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 30) || 'component';
    }
  }

  /**
   * Cleanup expired drafts
   */
  async cleanupExpiredDrafts(maxAgeHours = 48): Promise<{ deleted: number }> {
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const expiredComponents = await this.d1.findExpiredDrafts(maxAgeMs);

    let deleted = 0;
    for (const component of expiredComponents) {
      // Only delete if it's a draft-only component (never published)
      if (component.status === 'draft' && component.latest_version === 0) {
        const result = await this.delete(component.id);
        if (result.deleted) {
          deleted++;
        }
      } else {
        // Published component with expired draft - just delete the draft
        await this.r2.deleteDraft(component.id);
        await this.d1.updateComponentDraft(component.id, false);
      }
    }

    return { deleted };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private recordToComponent(record: ComponentRecord): Component {
    return {
      id: record.id,
      canonical_name: record.canonical_name,
      status: record.status as ComponentStatus,
      type: record.type as ComponentType,
      file_type: record.file_type ?? undefined,
      media_type: record.media_type as MediaType | undefined,
      description: record.description,
      latest_version: record.latest_version,
      has_draft: record.has_draft === 1,
      creator: record.creator ?? undefined,
      created_at: new Date(record.created_at).toISOString(),
      updated_at: new Date(record.updated_at).toISOString(),
    };
  }

  private recordToVersion(record: VersionRecord): Version {
    return {
      id: record.id,
      component_id: record.component_id,
      version: record.version,
      semver: record.semver ?? undefined,
      parent_version_id: record.parent_version_id ?? undefined,
      description: record.description ?? undefined,
      content_url: record.content_url,
      manifest_url: record.manifest_url,
      size: record.size ?? undefined,
      mime_type: record.mime_type ?? undefined,
      created_at: new Date(record.created_at).toISOString(),
      provenance: { source_type: 'manual' }, // TODO: Store in DB
      metadata: {}, // TODO: Store in DB
      dependencies: [], // TODO: Store in DB
    };
  }

  private guessMimeType(fileType?: string, mediaType?: MediaType): string {
    if (mediaType === 'image') return 'image/png';
    if (mediaType === 'speech') return 'audio/mpeg';

    const mimeMap: Record<string, string> = {
      tsx: 'text/typescript',
      ts: 'text/typescript',
      jsx: 'text/javascript',
      js: 'text/javascript',
      css: 'text/css',
      html: 'text/html',
      json: 'application/json',
    };

    return fileType ? (mimeMap[fileType] ?? 'application/octet-stream') : 'application/octet-stream';
  }

  /**
   * Bump a semantic version string
   */
  private bumpSemver(current: string, bump: 'major' | 'minor' | 'patch'): string {
    const parts = current.split('.').map(Number);
    const [major = 1, minor = 0, patch = 0] = parts;

    switch (bump) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
      default:
        return `${major}.${minor}.${patch + 1}`;
    }
  }
}
