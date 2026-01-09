/**
 * Version Chain Management
 *
 * Handles the Git-like version chain: parent/child relationships,
 * branching detection, and history traversal.
 */

import type { AssetRecord, VersionBump } from '../types';
import { incrementVersion, initialVersion, compareVersions } from './semver';

// =============================================================================
// Component ID Generation (New Model)
// =============================================================================

/**
 * Generate a short component ID (8 chars with hyphen)
 * Format: xxxx-xxxx (e.g., "ebc7-4f2a")
 */
export function generateComponentId(): string {
  const uuid = crypto.randomUUID();
  // Take first 8 chars and add hyphen in middle
  return `${uuid.slice(0, 4)}-${uuid.slice(4, 8)}`;
}

/**
 * Generate a version ID from component ID and version number
 * Format: {component_id}-v{version}
 * Example: "ebc7-4f2a-v1"
 */
export function generateVersionId(componentId: string, version: number): string {
  return `${componentId}-v${version}`;
}

/**
 * Check if a string is a valid component ID format
 * Pattern: xxxx-xxxx (8 hex chars with hyphen)
 */
export function isComponentId(id: string): boolean {
  return /^[a-f0-9]{4}-[a-f0-9]{4}$/.test(id);
}

/**
 * Check if a string is a valid version ID format
 * Pattern: xxxx-xxxx-vN
 */
export function isVersionId(id: string): boolean {
  return /^[a-f0-9]{4}-[a-f0-9]{4}-v\d+$/.test(id);
}

/**
 * Extract component ID from a version ID
 * Example: "ebc7-4f2a-v3" -> "ebc7-4f2a"
 */
export function extractComponentIdFromVersionId(versionId: string): string | null {
  const match = versionId.match(/^([a-f0-9]{4}-[a-f0-9]{4})-v\d+$/);
  return match?.[1] ?? null;
}

/**
 * Extract version number from a version ID
 * Example: "ebc7-4f2a-v3" -> 3
 */
export function extractVersionFromVersionId(versionId: string): number | null {
  const match = versionId.match(/-v(\d+)$/);
  return match?.[1] ? parseInt(match[1], 10) : null;
}

/**
 * Get the R2 key for a draft's content
 * Format: {component_id}/draft/content
 */
export function getDraftContentKey(componentId: string): string {
  return `${componentId}/draft/content`;
}

/**
 * Get the R2 key for a draft's manifest
 * Format: {component_id}/draft/manifest.json
 */
export function getDraftManifestKey(componentId: string): string {
  return `${componentId}/draft/manifest.json`;
}

/**
 * Get the R2 key for a version's content
 * Format: {component_id}/versions/v{version}/content
 */
export function getVersionContentKey(componentId: string, version: number): string {
  return `${componentId}/versions/v${version}/content`;
}

/**
 * Get the R2 key for a version's manifest
 * Format: {component_id}/versions/v{version}/manifest.json
 */
export function getVersionManifestKey(componentId: string, version: number): string {
  return `${componentId}/versions/v${version}/manifest.json`;
}

// =============================================================================
// Legacy Version Chain (for backwards compatibility)
// =============================================================================

export interface VersionChainNode {
  id: string;
  version: string;
  parent_id?: string;
  children_ids: string[];
  created_at: string;
  is_head: boolean;
  is_branch: boolean;
  tags: string[];
}

export interface VersionChain {
  canonical_name: string;
  nodes: VersionChainNode[];
  head_id: string | null;
  root_id: string | null;
  branches: string[]; // IDs of branch heads (non-linear children)
}

/**
 * Generate a new asset ID
 * Format: {canonical_name}-v{version_number}-{hash}
 */
export function generateAssetId(
  canonical_name: string,
  versionNumber: number,
  contentHash: string
): string {
  // Take first 4 chars of hash for brevity
  const shortHash = contentHash.slice(0, 4).toLowerCase();
  return `${canonical_name}-v${versionNumber}-${shortHash}`;
}

/**
 * Generate a content hash from the asset content
 */
export async function hashContent(content: string | ArrayBuffer): Promise<string> {
  const data = typeof content === 'string'
    ? new TextEncoder().encode(content)
    : new Uint8Array(content);

  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Determine the next version for a new asset
 */
export function nextVersion(
  parentVersion: string | null,
  bump: VersionBump = 'patch',
  explicitVersion?: string
): string {
  // If explicit version provided, use it
  if (explicitVersion) {
    return explicitVersion;
  }

  // If no parent, start at initial version
  if (!parentVersion) {
    return initialVersion();
  }

  // Increment parent version
  return incrementVersion(parentVersion, bump);
}

/**
 * Determine the next version number (for ID generation)
 */
export function nextVersionNumber(
  existingVersionNumbers: number[]
): number {
  if (existingVersionNumbers.length === 0) {
    return 1;
  }

  return Math.max(...existingVersionNumbers) + 1;
}

/**
 * Build a version chain from a list of asset records
 */
export function buildVersionChain(
  canonical_name: string,
  assets: AssetRecord[],
  refs: Map<string, string> // ref_name -> asset_id
): VersionChain {
  if (assets.length === 0) {
    return {
      canonical_name,
      nodes: [],
      head_id: null,
      root_id: null,
      branches: [],
    };
  }

  // Build lookup maps
  const childrenOf = new Map<string, string[]>();

  // Build children map
  for (const asset of assets) {
    if (asset.parent_id) {
      const children = childrenOf.get(asset.parent_id) ?? [];
      children.push(asset.id);
      childrenOf.set(asset.parent_id, children);
    }
  }

  // Find roots (assets with no parent)
  const roots = assets.filter((a) => !a.parent_id);

  // Find heads (assets with no children) - potential branch heads
  const heads = assets.filter((a) => {
    const children = childrenOf.get(a.id) ?? [];
    return children.length === 0;
  });

  // Get the "latest" ref to identify the main head
  const latestId = refs.get('latest');

  // Identify branches (heads that aren't the main latest)
  const branches = heads
    .filter((h) => h.id !== latestId)
    .map((h) => h.id);

  // Build reverse ref map (asset_id -> tag names)
  const tagsFor = new Map<string, string[]>();
  for (const [tag, assetId] of refs) {
    const tags = tagsFor.get(assetId) ?? [];
    tags.push(tag);
    tagsFor.set(assetId, tags);
  }

  // Build nodes
  const nodes: VersionChainNode[] = assets.map((asset) => {
    const children = childrenOf.get(asset.id) ?? [];
    const isHead = children.length === 0;
    const isBranch = isHead && asset.id !== latestId && latestId !== null;

    return {
      id: asset.id,
      version: asset.version,
      parent_id: asset.parent_id ?? undefined,
      children_ids: children,
      created_at: new Date(asset.created_at).toISOString(),
      is_head: isHead,
      is_branch: isBranch,
      tags: tagsFor.get(asset.id) ?? [],
    };
  });

  // Sort nodes by version (oldest first)
  nodes.sort((a, b) => compareVersions(a.version, b.version));

  return {
    canonical_name,
    nodes,
    head_id: latestId ?? (heads[0]?.id ?? null),
    root_id: roots[0]?.id ?? null,
    branches,
  };
}

/**
 * Check if creating a child from a parent would create a branch
 * (i.e., the parent already has children)
 */
export function wouldBranch(
  _parentId: string,
  existingChildren: string[]
): boolean {
  return existingChildren.length > 0;
}

/**
 * Get the linear history from an asset back to the root
 */
export function getLinearHistory(
  assetId: string,
  byId: Map<string, AssetRecord>
): AssetRecord[] {
  const history: AssetRecord[] = [];
  let current = byId.get(assetId);

  while (current) {
    history.unshift(current); // Add to beginning (oldest first)
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }

  return history;
}

/**
 * Find common ancestor of two assets
 */
export function findCommonAncestor(
  id1: string,
  id2: string,
  byId: Map<string, AssetRecord>
): string | null {
  const ancestors1 = new Set<string>();

  // Collect all ancestors of id1
  let current = byId.get(id1);
  while (current) {
    ancestors1.add(current.id);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }

  // Walk up from id2 until we find a common ancestor
  current = byId.get(id2);
  while (current) {
    if (ancestors1.has(current.id)) {
      return current.id;
    }
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }

  return null;
}

/**
 * Validate that a version chain is consistent
 */
export function validateChain(chain: VersionChain): string[] {
  const errors: string[] = [];

  const nodeById = new Map(chain.nodes.map((n) => [n.id, n]));

  for (const node of chain.nodes) {
    // Check parent exists
    if (node.parent_id && !nodeById.has(node.parent_id)) {
      errors.push(`Node ${node.id} references non-existent parent ${node.parent_id}`);
    }

    // Check children exist
    for (const childId of node.children_ids) {
      if (!nodeById.has(childId)) {
        errors.push(`Node ${node.id} references non-existent child ${childId}`);
      }
    }

    // Check bidirectional consistency
    for (const childId of node.children_ids) {
      const child = nodeById.get(childId);
      if (child && child.parent_id !== node.id) {
        errors.push(
          `Inconsistent parent/child: ${node.id} lists ${childId} as child, ` +
          `but ${childId} has parent ${child.parent_id}`
        );
      }
    }
  }

  return errors;
}
