/**
 * Version Reference Resolution
 *
 * Handles Git-like references: exact IDs, semver ranges, and named tags.
 *
 * Reference formats:
 *   - "card-component-abc123"     → exact ID
 *   - "card-component@latest"     → named tag
 *   - "card-component@stable"     → named tag
 *   - "card-component@0.1.0"      → exact version
 *   - "card-component@^0.1"       → semver range (latest matching)
 *   - "card-component@~1.2.3"     → semver range
 *   - "card-component"            → implicit @latest
 */

import type { VersionRef, AssetRecord } from '../types';
import { isValidVersion, isValidRange, maxSatisfying } from './semver';

/** Well-known tag names that aren't semver */
const KNOWN_TAGS = new Set(['latest', 'stable', 'dev', 'next', 'canary', 'beta', 'alpha']);

/**
 * Parse a reference string into its components
 */
export function parseRef(ref: string): VersionRef {
  // Check if it looks like a full asset ID (contains version marker and hash)
  // Format: {name}-v{version}-{hash} e.g., "card-component-v1-abc123"
  const idPattern = /^(.+)-v(\d+)-([a-f0-9]{4,})$/;
  const idMatch = ref.match(idPattern);

  if (idMatch) {
    return {
      ref,
      canonical_name: ref, // The full ID is used as-is
      specifier: ref,
      type: 'exact',
    };
  }

  // Check for @ separator
  const atIndex = ref.lastIndexOf('@');

  if (atIndex === -1) {
    // No @, treat as canonical name with implicit @latest
    return {
      ref,
      canonical_name: ref,
      specifier: 'latest',
      type: 'tag',
    };
  }

  const canonical_name = ref.slice(0, atIndex);
  const specifier = ref.slice(atIndex + 1);

  // Determine specifier type
  if (KNOWN_TAGS.has(specifier.toLowerCase())) {
    return {
      ref,
      canonical_name,
      specifier: specifier.toLowerCase(),
      type: 'tag',
    };
  }

  if (isValidVersion(specifier)) {
    return {
      ref,
      canonical_name,
      specifier,
      type: 'exact',
    };
  }

  if (isValidRange(specifier)) {
    return {
      ref,
      canonical_name,
      specifier,
      type: 'semver',
    };
  }

  // Assume it's a custom tag name
  return {
    ref,
    canonical_name,
    specifier,
    type: 'tag',
  };
}

/**
 * Check if a string looks like a full asset ID
 */
export function isAssetId(ref: string): boolean {
  // Asset IDs have format: {name}-v{version}-{hash}
  return /^.+-v\d+-[a-f0-9]{4,}$/.test(ref);
}

/**
 * Check if a reference is to a specific version (not a range or tag)
 */
export function isExactRef(ref: VersionRef): boolean {
  return ref.type === 'exact';
}

/**
 * Resolve a semver range against a list of available versions
 */
export function resolveRange(
  range: string,
  availableVersions: string[]
): string | null {
  return maxSatisfying(availableVersions, range);
}

/**
 * Resolve a parsed ref to an asset ID
 *
 * This is the main resolution function. It takes:
 * - The parsed ref
 * - A function to get asset by ID
 * - A function to get asset by tag
 * - A function to get all versions for a canonical name
 */
export async function resolveRef(
  ref: VersionRef,
  options: {
    getById: (id: string) => Promise<AssetRecord | null>;
    getByTag: (canonical_name: string, tag: string) => Promise<string | null>;
    getVersions: (canonical_name: string) => Promise<AssetRecord[]>;
  }
): Promise<AssetRecord | null> {
  const { getById, getByTag, getVersions } = options;

  switch (ref.type) {
    case 'exact': {
      // If specifier is an asset ID, look it up directly
      if (isAssetId(ref.specifier)) {
        return getById(ref.specifier);
      }

      // Otherwise it's an exact version - find by canonical name + version
      const versions = await getVersions(ref.canonical_name);
      return versions.find((v) => v.version === ref.specifier) ?? null;
    }

    case 'tag': {
      // Look up the tag to get the asset ID
      const assetId = await getByTag(ref.canonical_name, ref.specifier);
      if (!assetId) return null;
      return getById(assetId);
    }

    case 'semver': {
      // Get all versions and find the best match
      const versions = await getVersions(ref.canonical_name);
      const versionStrings = versions.map((v) => v.version);
      const bestVersion = resolveRange(ref.specifier, versionStrings);

      if (!bestVersion) return null;

      return versions.find((v) => v.version === bestVersion) ?? null;
    }

    default:
      return null;
  }
}

/**
 * Format a canonical name and version as a reference string
 */
export function formatRef(canonical_name: string, specifier: string): string {
  return `${canonical_name}@${specifier}`;
}

/**
 * Extract the canonical name from an asset ID
 * e.g., "card-component-v1-abc123" → "card-component"
 */
export function extractCanonicalName(assetId: string): string | null {
  const match = assetId.match(/^(.+)-v\d+-[a-f0-9]{4,}$/);
  return match?.[1] ?? null;
}

/**
 * Extract the version number from an asset ID
 * e.g., "card-component-v1-abc123" → 1
 */
export function extractVersionNumber(assetId: string): number | null {
  const match = assetId.match(/-v(\d+)-[a-f0-9]{4,}$/);
  return match?.[1] ? parseInt(match[1], 10) : null;
}
