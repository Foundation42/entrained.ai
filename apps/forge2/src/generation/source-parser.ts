/**
 * Source Code Parser
 *
 * Extracts metadata from source code WITHOUT using AI.
 * This enables manual component upload where Claude Chat provides raw source
 * and Forge automatically generates the manifest.
 */

import type { FileType } from '../types';

// =============================================================================
// Types
// =============================================================================

export interface PropDefinition {
  name: string;
  type: string;
  required: boolean;
  default: unknown;
}

export interface ParsedTSXMetadata {
  /** Component name extracted from export */
  componentName?: string;

  /** Props interface parsed from TypeScript */
  props: PropDefinition[];

  /** CSS class names used in the component */
  css_classes: string[];

  /** Export names (default, named) */
  exports: string[];

  /** Demo props inferred from defaults or simple types */
  demo_props: Record<string, unknown>;

  /** Internal Forge component dependencies (IDs extracted from imports) */
  dependencies: string[];
}

export interface ParsedCSSMetadata {
  /** CSS class names defined */
  classes_defined: string[];

  /** CSS custom properties (variables) defined */
  variables_defined: string[];

  /** Keyframe animation names defined */
  keyframes_defined: string[];
}

export interface ParsedSourceMetadata {
  /** For TSX/JSX files */
  tsx?: ParsedTSXMetadata;

  /** For CSS files */
  css?: ParsedCSSMetadata;

  /** Lines of code */
  lines: number;

  /** Character count */
  characters: number;
}

// =============================================================================
// TSX/JSX Parser
// =============================================================================

/**
 * Parse TSX/JSX source code to extract metadata
 */
export function parseTSXSource(source: string): ParsedTSXMetadata {
  const props = extractPropsInterface(source);
  const css_classes = extractCSSClasses(source);
  const exports = extractExports(source);
  const componentName = extractComponentName(source);
  const demo_props = generateDemoProps(props);
  const dependencies = extractForgeDependencies(source);

  return {
    componentName,
    props,
    css_classes,
    exports,
    demo_props,
    dependencies,
  };
}

/**
 * Extract internal Forge component dependencies from import statements.
 *
 * Identifies imports that reference other Forge components by looking for:
 * - Relative imports matching the Forge ID pattern: ./component-name-vN-XXXX
 * - The pattern is: name-vN-XXXX where N is version number and XXXX is 4 hex chars
 *
 * Examples:
 *   import VectorRenderer from './vector-renderer-v1-fe3b';  -> "vector-renderer-v1-fe3b"
 *   import { Mesh } from './vector-mesh-v1-4718';            -> "vector-mesh-v1-4718"
 *   import * as THREE from 'three';                          -> ignored (external)
 *   import React from 'react';                               -> ignored (external)
 */
function extractForgeDependencies(source: string): string[] {
  const dependencies = new Set<string>();

  // Pattern to match Forge component IDs in imports
  // Forge IDs look like: name-vN-XXXX (e.g., vector-renderer-v1-fe3b)
  // The pattern matches: ./canonical-name-vN-XXXX or ./canonical-name-vN-XXXX.tsx etc
  const forgeIdPattern = /^\.\/([a-z0-9-]+-v\d+-[a-f0-9]{4})(?:\.\w+)?$/;

  // Match various import patterns:
  // import X from './path'
  // import { X } from './path'
  // import * as X from './path'
  // import './path'
  const importPatterns = [
    /import\s+(?:[\w{},\s*]+\s+from\s+)?['"]([^'"]+)['"]/g,
  ];

  for (const pattern of importPatterns) {
    pattern.lastIndex = 0;
    let match;

    while ((match = pattern.exec(source)) !== null) {
      const importPath = match[1];
      if (!importPath) continue;

      // Check if this is a relative import matching Forge ID pattern
      const forgeMatch = importPath.match(forgeIdPattern);
      if (forgeMatch?.[1]) {
        dependencies.add(forgeMatch[1]);
      }
    }
  }

  return Array.from(dependencies).sort();
}

/**
 * Extract props interface from TypeScript code
 * Looks for patterns like:
 * - interface XxxProps { ... }
 * - type XxxProps = { ... }
 * - Props in React.FC<Props> or FC<Props>
 */
function extractPropsInterface(source: string): PropDefinition[] {
  const props: PropDefinition[] = [];

  // Pattern 1: interface XxxProps { ... }
  const interfacePattern = /interface\s+\w*Props\s*\{([^}]+)\}/g;
  // Pattern 2: type XxxProps = { ... }
  const typePattern = /type\s+\w*Props\s*=\s*\{([^}]+)\}/g;

  const patterns = [interfacePattern, typePattern];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const body = match[1];
      if (body) {
        const parsedProps = parsePropsBody(body);
        props.push(...parsedProps);
      }
    }
  }

  // Deduplicate by name
  const seen = new Set<string>();
  return props.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}

/**
 * Parse the body of a props interface/type
 */
function parsePropsBody(body: string): PropDefinition[] {
  const props: PropDefinition[] = [];

  // Match prop definitions: name?: type; or name: type;
  // Handle multi-line and complex types
  const propPattern = /(\w+)(\??)\s*:\s*([^;]+);/g;

  let match;
  while ((match = propPattern.exec(body)) !== null) {
    const name = match[1];
    const optional = match[2] === '?';
    const typeRaw = match[3];

    if (!name || !typeRaw) continue;

    // Clean up type - remove comments, normalize whitespace
    const type = typeRaw.replace(/\/\/.*$/gm, '').replace(/\/\*.*?\*\//g, '').trim();

    props.push({
      name,
      type,
      required: !optional,
      default: null,
    });
  }

  return props;
}

/**
 * Extract CSS class names used in JSX
 * Looks for className="..." and className={...}
 */
function extractCSSClasses(source: string): string[] {
  const classes = new Set<string>();

  // Pattern 1: className="class1 class2 ..."
  const staticPattern = /className\s*=\s*["']([^"']+)["']/g;

  let match;
  while ((match = staticPattern.exec(source)) !== null) {
    const classString = match[1];
    if (classString) {
      // Split on whitespace and filter empty strings
      classString.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
    }
  }

  // Pattern 2: className={`...${...}...`} - extract static parts from template literals
  const templatePattern = /className\s*=\s*\{`([^`]+)`\}/g;
  while ((match = templatePattern.exec(source)) !== null) {
    const template = match[1];
    if (template) {
      // Extract static class names (not inside ${})
      const staticParts = template.replace(/\$\{[^}]+\}/g, ' ').split(/\s+/);
      staticParts.filter(Boolean).forEach(c => classes.add(c));
    }
  }

  // Pattern 3: className={clsx(...)} or classNames(...) - extract string literals
  const clsxPattern = /className\s*=\s*\{(?:clsx|classNames?)\s*\(([^)]+)\)\}/g;
  while ((match = clsxPattern.exec(source)) !== null) {
    const args = match[1];
    if (args) {
      // Extract string literals from the arguments
      const stringPattern = /["']([^"']+)["']/g;
      let strMatch;
      while ((strMatch = stringPattern.exec(args)) !== null) {
        const str = strMatch[1];
        if (str) {
          str.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
        }
      }
    }
  }

  // Pattern 4: className={styles.xxx} or className={css.xxx} - extract the class name
  const modulesPattern = /className\s*=\s*\{(?:styles|css|classes)\.(\w+)\}/g;
  while ((match = modulesPattern.exec(source)) !== null) {
    const className = match[1];
    if (className) {
      classes.add(className);
    }
  }

  return Array.from(classes).sort();
}

/**
 * Extract export names from source
 */
function extractExports(source: string): string[] {
  const exports = new Set<string>();

  // Pattern 1: export default
  if (/export\s+default\s+/.test(source)) {
    exports.add('default');
  }

  // Pattern 2: export const/function/class Name
  const namedExportPattern = /export\s+(?:const|let|function|class|type|interface)\s+(\w+)/g;
  let match;
  while ((match = namedExportPattern.exec(source)) !== null) {
    const name = match[1];
    if (name) {
      exports.add(name);
    }
  }

  // Pattern 3: export { Name1, Name2 }
  const exportListPattern = /export\s+\{([^}]+)\}/g;
  while ((match = exportListPattern.exec(source)) !== null) {
    const content = match[1];
    if (content) {
      const names = content.split(',')
        .map(n => n.trim().split(/\s+as\s+/)[0]?.trim())
        .filter((n): n is string => Boolean(n));
      names.forEach(n => exports.add(n));
    }
  }

  return Array.from(exports).sort();
}

/**
 * Extract component name from export default
 */
function extractComponentName(source: string): string | undefined {
  // Pattern 1: export default function Name
  const funcMatch = source.match(/export\s+default\s+function\s+(\w+)/);
  if (funcMatch?.[1]) return funcMatch[1];

  // Pattern 2: export default Name;
  const varMatch = source.match(/export\s+default\s+(\w+)\s*;/);
  if (varMatch?.[1]) return varMatch[1];

  // Pattern 3: const Name = ... ; export default Name;
  const constMatch = source.match(/const\s+(\w+)\s*(?::\s*\w+)?\s*=.*export\s+default\s+\1/s);
  if (constMatch?.[1]) return constMatch[1];

  return undefined;
}

/**
 * Generate demo props from prop definitions
 */
function generateDemoProps(props: PropDefinition[]): Record<string, unknown> {
  const demo: Record<string, unknown> = {};

  for (const prop of props) {
    // Skip if not required and no sensible default
    if (!prop.required) continue;

    // Generate sensible defaults based on type
    const type = prop.type.toLowerCase();

    if (type === 'string') {
      demo[prop.name] = `Sample ${prop.name}`;
    } else if (type === 'number') {
      demo[prop.name] = 42;
    } else if (type === 'boolean') {
      demo[prop.name] = true;
    } else if (type.includes('[]') || type.startsWith('array')) {
      demo[prop.name] = [];
    } else if (type.includes('react.reactnode') || type.includes('reactnode')) {
      demo[prop.name] = 'Sample content';
    } else if (type.startsWith('()') || type.includes('=>')) {
      // Function type - provide a no-op
      demo[prop.name] = '() => {}';
    }
  }

  return demo;
}

// =============================================================================
// CSS Parser
// =============================================================================

/**
 * Parse CSS source code to extract metadata
 */
export function parseCSSSource(source: string): ParsedCSSMetadata {
  return {
    classes_defined: extractCSSClassDefinitions(source),
    variables_defined: extractCSSVariables(source),
    keyframes_defined: extractKeyframes(source),
  };
}

/**
 * Extract class names defined in CSS
 */
function extractCSSClassDefinitions(source: string): string[] {
  const classes = new Set<string>();

  // Match .classname in selectors (not inside strings or comments)
  // Remove comments first
  const noComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  // Match class selectors
  const classPattern = /\.([a-zA-Z_][\w-]*)/g;

  let match;
  while ((match = classPattern.exec(noComments)) !== null) {
    const className = match[1];
    if (className) {
      classes.add(className);
    }
  }

  return Array.from(classes).sort();
}

/**
 * Extract CSS custom properties (variables) defined
 */
function extractCSSVariables(source: string): string[] {
  const variables = new Set<string>();

  // Match --variable-name: value
  const varPattern = /(--[\w-]+)\s*:/g;

  let match;
  while ((match = varPattern.exec(source)) !== null) {
    const varName = match[1];
    if (varName) {
      variables.add(varName);
    }
  }

  return Array.from(variables).sort();
}

/**
 * Extract keyframe animation names
 */
function extractKeyframes(source: string): string[] {
  const keyframes = new Set<string>();

  // Match @keyframes name
  const keyframePattern = /@keyframes\s+([\w-]+)/g;

  let match;
  while ((match = keyframePattern.exec(source)) !== null) {
    const name = match[1];
    if (name) {
      keyframes.add(name);
    }
  }

  return Array.from(keyframes).sort();
}

// =============================================================================
// Main Parser
// =============================================================================

/**
 * Parse source code and extract metadata based on file type
 */
export function parseSource(source: string, fileType: FileType): ParsedSourceMetadata {
  const result: ParsedSourceMetadata = {
    lines: source.split('\n').length,
    characters: source.length,
  };

  if (fileType === 'tsx' || fileType === 'jsx') {
    result.tsx = parseTSXSource(source);
  } else if (fileType === 'css' || fileType === 'scss' || fileType === 'less') {
    result.css = parseCSSSource(source);
  }

  return result;
}

/**
 * Generate a canonical name from component name or source content
 */
export function generateCanonicalName(
  source: string,
  fileType: FileType,
  providedName?: string
): string {
  // Use provided name if given
  if (providedName) {
    return slugify(providedName);
  }

  // Try to extract component name from TSX/JSX
  if (fileType === 'tsx' || fileType === 'jsx') {
    const metadata = parseTSXSource(source);
    if (metadata.componentName) {
      return slugify(metadata.componentName);
    }

    // Try to find a named export that looks like a component (PascalCase)
    const componentExport = metadata.exports.find(e =>
      e !== 'default' && /^[A-Z][a-zA-Z0-9]*$/.test(e)
    );
    if (componentExport) {
      return slugify(componentExport);
    }
  }

  // Generate a hash-based name as fallback
  const hash = simpleHash(source);
  const prefix = fileType === 'css' ? 'styles' : 'component';
  return `${prefix}-${hash}`;
}

/**
 * Convert a string to a URL-safe slug
 */
function slugify(str: string): string {
  return str
    // Convert camelCase/PascalCase to kebab-case
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Simple hash function for generating IDs
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash).toString(16).slice(0, 8);
}
