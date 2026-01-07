/**
 * Semver Utilities
 *
 * Handles semantic versioning parsing, comparison, and incrementing.
 * Uses the semver library for most operations.
 */

import * as semver from 'semver';
import type { VersionBump } from '../types';

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly string[];
  build: readonly string[];
  raw: string;
}

/**
 * Parse a version string into components
 */
export function parseVersion(version: string): ParsedVersion | null {
  const parsed = semver.parse(version);

  if (!parsed) {
    return null;
  }

  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: parsed.prerelease as string[],
    build: parsed.build,
    raw: parsed.raw,
  };
}

/**
 * Check if a string is a valid semver version
 */
export function isValidVersion(version: string): boolean {
  return semver.valid(version) !== null;
}

/**
 * Check if a string is a valid semver range
 */
export function isValidRange(range: string): boolean {
  return semver.validRange(range) !== null;
}

/**
 * Increment a version based on bump type
 */
export function incrementVersion(
  version: string,
  bump: VersionBump = 'patch'
): string {
  const incremented = semver.inc(version, bump);

  if (!incremented) {
    throw new Error(`Failed to increment version ${version} with bump ${bump}`);
  }

  return incremented;
}

/**
 * Compare two versions
 * Returns:
 *   -1 if v1 < v2
 *    0 if v1 == v2
 *    1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): -1 | 0 | 1 {
  return semver.compare(v1, v2);
}

/**
 * Check if a version satisfies a semver range
 */
export function satisfiesRange(version: string, range: string): boolean {
  return semver.satisfies(version, range);
}

/**
 * Find the highest version that satisfies a range from a list
 */
export function maxSatisfying(
  versions: string[],
  range: string
): string | null {
  return semver.maxSatisfying(versions, range);
}

/**
 * Find the highest version from a list
 */
export function maxVersion(versions: string[]): string | null {
  if (versions.length === 0) return null;

  const sorted = [...versions].sort(semver.rcompare);
  return sorted[0] ?? null;
}

/**
 * Sort versions in descending order (newest first)
 */
export function sortVersionsDesc(versions: string[]): string[] {
  return [...versions].sort(semver.rcompare);
}

/**
 * Sort versions in ascending order (oldest first)
 */
export function sortVersionsAsc(versions: string[]): string[] {
  return [...versions].sort(semver.compare);
}

/**
 * Coerce a potentially loose version string to valid semver
 * e.g., "1" -> "1.0.0", "1.2" -> "1.2.0"
 */
export function coerceVersion(version: string): string | null {
  const coerced = semver.coerce(version);
  return coerced?.version ?? null;
}

/**
 * Get the default initial version
 */
export function initialVersion(): string {
  return '0.1.0';
}

/**
 * Determine what bump type would transform v1 to v2
 */
export function detectBump(v1: string, v2: string): VersionBump | null {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);

  if (!p1 || !p2) return null;

  if (p2.major > p1.major) return 'major';
  if (p2.minor > p1.minor) return 'minor';
  if (p2.patch > p1.patch) return 'patch';

  return null;
}
