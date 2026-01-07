/**
 * Versioning Module Exports
 */

export {
  parseVersion,
  isValidVersion,
  isValidRange,
  incrementVersion,
  compareVersions,
  satisfiesRange,
  maxSatisfying,
  maxVersion,
  sortVersionsDesc,
  sortVersionsAsc,
  coerceVersion,
  initialVersion,
  detectBump,
} from './semver';

export type { ParsedVersion } from './semver';

export {
  parseRef,
  isAssetId,
  isExactRef,
  resolveRange,
  resolveRef,
  formatRef,
  extractCanonicalName,
  extractVersionNumber,
} from './refs';

export {
  generateAssetId,
  hashContent,
  nextVersion,
  nextVersionNumber,
  buildVersionChain,
  wouldBranch,
  getLinearHistory,
  findCommonAncestor,
  validateChain,
} from './chain';

export type { VersionChainNode, VersionChain } from './chain';
