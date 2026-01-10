/**
 * Bundler Service
 *
 * Composes multiple files into a runnable bundle.
 * Calls the bundler container (Durable Object) for esbuild-based bundling.
 */

import type {
  Env,
  AssetManifest,
  BundleArtifact,
} from '../types';
import { ComponentService } from './components';

// =============================================================================
// CDN Library Definitions
// =============================================================================

interface CdnLibrary {
  /** CDN script URLs to load (in order) */
  cdnUrls: string[];
  /** Global variable name exposed by the library */
  globalName: string;
  /** Alternative import names that map to this library */
  aliases?: string[];
}

/**
 * Mapping of npm package names to CDN URLs and global names.
 * These libraries will be loaded from CDN instead of bundled.
 */
const CDN_LIBRARIES: Record<string, CdnLibrary> = {
  // 3D Graphics
  'three': {
    cdnUrls: ['https://unpkg.com/three@0.160.0/build/three.min.js'],
    globalName: 'THREE',
  },

  // Data Visualization
  'd3': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js'],
    globalName: 'd3',
  },
  'chart.js': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js'],
    globalName: 'Chart',
  },
  'plotly.js': {
    cdnUrls: ['https://cdn.plot.ly/plotly-2.35.2.min.js'],
    globalName: 'Plotly',
  },
  'plotly.js-dist': {
    cdnUrls: ['https://cdn.plot.ly/plotly-2.35.2.min.js'],
    globalName: 'Plotly',
  },
  'react-plotly.js': {
    cdnUrls: [
      'https://cdn.plot.ly/plotly-2.35.2.min.js',
      'https://cdn.jsdelivr.net/npm/react-plotly.js@2/dist/create-plotly-component.min.js',
    ],
    globalName: 'createPlotlyComponent',
  },

  // Audio
  'tone': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/tone@15/build/Tone.min.js'],
    globalName: 'Tone',
  },

  // Canvas/Graphics
  'p5': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/p5@1/lib/p5.min.js'],
    globalName: 'p5',
  },
  'fabric': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/fabric@6/dist/index.min.js'],
    globalName: 'fabric',
  },
  'konva': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/konva@9/konva.min.js'],
    globalName: 'Konva',
  },
  'react-konva': {
    cdnUrls: [
      'https://cdn.jsdelivr.net/npm/konva@9/konva.min.js',
      'https://cdn.jsdelivr.net/npm/react-konva@18/umd/react-konva.min.js',
    ],
    globalName: 'ReactKonva',
  },

  // Animation
  'gsap': {
    cdnUrls: ['https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js'],
    globalName: 'gsap',
  },
  'animejs': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/animejs@3/lib/anime.min.js'],
    globalName: 'anime',
  },
  'anime': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/animejs@3/lib/anime.min.js'],
    globalName: 'anime',
  },
  'framer-motion': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/framer-motion@11/dist/framer-motion.min.js'],
    globalName: 'Motion',
  },

  // Physics
  'matter-js': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/matter-js@0.20/build/matter.min.js'],
    globalName: 'Matter',
  },

  // Math/Science
  'mathjs': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/mathjs@13/lib/browser/math.min.js'],
    globalName: 'math',
  },

  // Utilities
  'lodash': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js'],
    globalName: '_',
  },
  'axios': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/axios@1/dist/axios.min.js'],
    globalName: 'axios',
  },
  'dayjs': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/dayjs@1/dayjs.min.js'],
    globalName: 'dayjs',
  },
  'moment': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/moment@2/moment.min.js'],
    globalName: 'moment',
  },
  'uuid': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/uuid@9/dist/umd/uuid.min.js'],
    globalName: 'uuid',
  },

  // Maps
  'leaflet': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/leaflet@1/dist/leaflet.min.js'],
    globalName: 'L',
  },
  'mapbox-gl': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/mapbox-gl@3/dist/mapbox-gl.min.js'],
    globalName: 'mapboxgl',
  },

  // Rich Text
  'marked': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/marked@12/marked.min.js'],
    globalName: 'marked',
  },
  'highlight.js': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/highlight.js@11/lib/index.min.js'],
    globalName: 'hljs',
  },

  // QR Codes
  'qrcode': {
    cdnUrls: ['https://cdn.jsdelivr.net/npm/qrcode@1/build/qrcode.min.js'],
    globalName: 'QRCode',
  },
};

/**
 * Detect which CDN libraries are imported in the given source files.
 * Scans for import statements and require calls.
 */
function detectCdnLibraries(files: ResolvedFile[]): string[] {
  const detected = new Set<string>();

  // Patterns to match imports:
  // import X from 'library'
  // import { X } from 'library'
  // import * as X from 'library'
  // const X = require('library')
  const importPatterns = [
    /import\s+(?:[\w{},\s*]+)\s+from\s+['"]([^'"./][^'"]*)['"]/g,
    /require\s*\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g,
  ];

  for (const file of files) {
    if (!['tsx', 'jsx', 'ts', 'js'].includes(file.fileType)) {
      continue;
    }

    for (const pattern of importPatterns) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(file.content)) !== null) {
        const importName = match[1];
        if (!importName) continue;

        // Get base package name (handle scoped packages and subpaths)
        const baseName = importName.startsWith('@')
          ? importName.split('/').slice(0, 2).join('/')
          : importName.split('/')[0];

        if (baseName && CDN_LIBRARIES[baseName]) {
          detected.add(baseName);
          console.log(`[Bundler] Detected CDN library: ${baseName} in ${file.canonical_name}`);
        }
      }
    }
  }

  return Array.from(detected);
}

/**
 * Get CDN library info by name
 */
function getCdnLibrary(name: string): CdnLibrary | undefined {
  return CDN_LIBRARIES[name];
}

// Container response types
interface ContainerBundleResponse {
  js: string;
  css: string;
  warnings: string[];
  buildTimeMs: number;
}

interface ContainerHealthResponse {
  status: string;
  service: string;
  runtime: string;
  esbuild: string;
  timestamp: string;
}

export interface BundleInput {
  /** Name for the bundle */
  name: string;

  /** Description of what the bundle does */
  description: string;

  /** File references to include (IDs or refs like "card@latest") */
  files: string[];

  /** Optional asset references (images, etc.) */
  assets?: string[];

  /** Entry point file reference (defaults to first TSX/JSX file) */
  entry?: string;

  /** HTML template customization */
  template?: {
    title?: string;
    styles?: string;
    scripts?: string;
    head?: string;
    body?: string;
  };
}

export interface BundleOutput {
  /** Generated HTML content */
  html: string;

  /** Bundled JavaScript */
  js: string;

  /** Combined CSS */
  css: string;

  /** List of resolved files */
  resolvedFiles: ResolvedFile[];

  /** List of resolved assets */
  resolvedAssets: AssetManifest[];

  /** Any build warnings */
  warnings: string[];

  /** Build time in ms */
  buildTimeMs: number;
}

export interface ResolvedFile {
  ref: string;
  id: string;
  canonical_name: string;
  content: string;
  fileType: string;
}

export class BundlerService {
  private componentService: ComponentService;
  private env: Env;

  constructor(env: Env, baseUrl: string) {
    this.componentService = new ComponentService(env, baseUrl);
    this.env = env;
  }

  /**
   * Get the bundler container stub
   */
  private getBundlerStub(): DurableObjectStub {
    // Use a fixed ID so we always get the same container instance
    const id = this.env.BUNDLER.idFromName('bundler');
    return this.env.BUNDLER.get(id);
  }

  /**
   * Check if the bundler container is healthy
   */
  async checkHealth(): Promise<ContainerHealthResponse> {
    const stub = this.getBundlerStub();
    const response = await stub.fetch('http://container/health');

    if (!response.ok) {
      throw new Error(`Bundler health check failed: ${response.status}`);
    }

    return response.json() as Promise<ContainerHealthResponse>;
  }

  /**
   * Wait for the bundler container to be ready
   */
  async waitForReady(timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const health = await this.checkHealth();
        if (health.status === 'ok') {
          console.log(`[Bundler] Container ready (${health.runtime}, esbuild ${health.esbuild})`);
          return;
        }
      } catch {
        // Container not ready yet, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    throw new Error('Bundler container failed to become ready');
  }

  /**
   * Create a bundle from raw source code
   * Useful for bundling draft content that isn't stored as an asset yet
   */
  async bundleFromSource(input: {
    name: string;
    description?: string;
    source: string;
    fileType: string;
    cssId?: string;
    inlineCss?: string;
    demoProps?: Record<string, unknown>;
  }): Promise<BundleOutput> {
    const { name, source, fileType, cssId, inlineCss, demoProps } = input;
    console.log(`[Bundler] Creating bundle from source: ${name}`);

    // Create a resolved file from the source
    const resolvedFiles: ResolvedFile[] = [{
      ref: name,
      id: name,
      canonical_name: name,
      content: source,
      fileType,
    }];

    // If inline CSS provided, use it directly
    if (inlineCss) {
      resolvedFiles.push({
        ref: `${name}-styles`,
        id: `${name}-styles`,
        canonical_name: `${name}-styles`,
        content: inlineCss,
        fileType: 'css',
      });
    }
    // Otherwise if CSS ID provided, resolve and include it
    else if (cssId) {
      try {
        const cssResult = await this.componentService.get(cssId);
        if (cssResult) {
          // Get CSS content - prefer draft, fall back to latest version
          let cssContent: string | null = null;
          if ('draft' in cssResult && cssResult.draft) {
            cssContent = await this.componentService.getDraftContent(cssId);
          }
          if (!cssContent && cssResult.component.latest_version > 0) {
            cssContent = await this.componentService.getVersionContent(cssId, cssResult.component.latest_version);
          }
          if (cssContent) {
            resolvedFiles.push({
              ref: cssId,
              id: cssResult.component.id,
              canonical_name: cssResult.component.canonical_name,
              content: cssContent,
              fileType: 'css',
            });
          }
        }
      } catch (error) {
        console.error(`[Bundler] Error resolving CSS ${cssId}:`, error);
      }
    }

    // Detect CDN libraries
    const detectedLibraries = detectCdnLibraries(resolvedFiles);
    console.log(`[Bundler] Detected ${detectedLibraries.length} CDN libraries`);

    // Build virtual FS
    const fs: Record<string, string> = {};
    for (const file of resolvedFiles) {
      const ext = file.fileType || 'ts';
      const path = `/${file.id}.${ext}`;
      fs[path] = file.content;
    }

    const entry = `/${name}.${fileType}`;

    // Build externals
    const externals = ['react', 'react-dom', ...detectedLibraries];
    const externalGlobals: Record<string, string> = {};
    for (const libName of detectedLibraries) {
      const lib = getCdnLibrary(libName);
      if (lib) {
        externalGlobals[libName] = lib.globalName;
      }
    }

    // Call bundler container
    const stub = this.getBundlerStub();
    const bundleResponse = await stub.fetch('http://container/bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: fs,
        entry,
        format: 'iife',
        minify: true,
        external: externals,
        externalGlobals,
      }),
    });

    if (!bundleResponse.ok) {
      const errorText = await bundleResponse.text();
      throw new Error(`Bundle failed: ${errorText}`);
    }

    const bundleResult = await bundleResponse.json() as ContainerBundleResponse;
    console.log(`[Bundler] Bundle complete: ${bundleResult.js.length} bytes JS, ${bundleResult.buildTimeMs}ms`);

    // Collect standalone CSS
    const standaloneCss = resolvedFiles
      .filter(f => f.fileType === 'css')
      .map(f => f.content)
      .join('\n\n');

    const combinedCss = [bundleResult.css, standaloneCss].filter(Boolean).join('\n\n');

    // Generate HTML
    const html = this.generateHTML({
      title: name,
      js: bundleResult.js,
      css: combinedCss,
      assets: [],
      demoProps: demoProps ?? {},
      cdnLibraries: detectedLibraries,
    });

    return {
      html,
      js: bundleResult.js,
      css: combinedCss,
      resolvedFiles,
      resolvedAssets: [],
      warnings: bundleResult.warnings,
      buildTimeMs: bundleResult.buildTimeMs,
    };
  }

  /**
   * Create a bundle from file references
   */
  async bundle(input: BundleInput): Promise<BundleOutput> {
    console.log(`[Bundler] Creating bundle: ${input.name}`);

    // 1. Resolve all file references
    const resolvedFiles = await this.resolveFiles(input.files);
    console.log(`[Bundler] Resolved ${resolvedFiles.length} files`);

    if (resolvedFiles.length === 0) {
      throw new Error('No files could be resolved. Check that the file references are correct.');
    }

    // 2. Resolve asset references
    const resolvedAssets = await this.resolveAssets(input.assets ?? []);
    console.log(`[Bundler] Resolved ${resolvedAssets.length} assets`);

    // 3. Collect demo_props from all TSX/JSX components for composition
    const componentDemoProps = await this.collectComponentDemoProps(resolvedFiles);
    const isMultiComponent = resolvedFiles.filter(f => f.fileType === 'tsx' || f.fileType === 'jsx').length > 1;

    // 4. Build the virtual file system (may create synthetic entry for multi-component bundles)
    const { fs: files, syntheticEntry } = this.buildVirtualFS(resolvedFiles, input.template?.body);

    // 5. Determine entry point (prefer synthetic entry for multi-component bundles)
    const entry = syntheticEntry ?? this.findEntryPoint(resolvedFiles, input.entry);
    console.log(`[Bundler] Entry point: ${entry}${syntheticEntry ? ' (synthetic)' : ''}`);

    // 5.5. Detect CDN libraries in source files
    let detectedLibraries = detectCdnLibraries(resolvedFiles);
    console.log(`[Bundler] Detected ${detectedLibraries.length} CDN libraries: ${detectedLibraries.join(', ') || 'none'}`);

    // Check if @react-three packages are used - if so, let Bun bundle three instead of CDN
    const usesReactThree = resolvedFiles.some(f =>
      f.content.includes('@react-three/fiber') || f.content.includes('@react-three/drei')
    );
    if (usesReactThree) {
      // Remove 'three' from CDN list - Bun will bundle it with R3F
      detectedLibraries = detectedLibraries.filter(lib => lib !== 'three');
      console.log(`[Bundler] R3F detected - letting Bun bundle three instead of CDN`);
    }

    // Build externals list: React + detected CDN libraries
    const externals = ['react', 'react-dom', ...detectedLibraries];

    // Build externalGlobals mapping for detected libraries
    const externalGlobals: Record<string, string> = {};
    for (const libName of detectedLibraries) {
      const lib = getCdnLibrary(libName);
      if (lib) {
        externalGlobals[libName] = lib.globalName;
      }
    }

    // 6. Call the bundler container
    const stub = this.getBundlerStub();
    const bundleResponse = await stub.fetch('http://container/bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files,
        entry,
        format: 'iife',
        minify: true,
        external: externals,
        externalGlobals,
      }),
    });

    if (!bundleResponse.ok) {
      const errorText = await bundleResponse.text();
      throw new Error(`Bundle failed: ${errorText}`);
    }

    const bundleResult = await bundleResponse.json() as ContainerBundleResponse;
    console.log(`[Bundler] Bundle complete: ${bundleResult.js.length} bytes JS, ${bundleResult.css.length} bytes CSS, ${bundleResult.buildTimeMs}ms`);

    // 7. For multi-component bundles, use collected props; for single component, get from entry file
    let demoProps: Record<string, unknown> = {};
    if (isMultiComponent) {
      // For compositions, store props keyed by canonical_name
      demoProps = componentDemoProps;
      console.log(`[Bundler] Using multi-component demo_props for ${Object.keys(componentDemoProps).length} components`);
    } else {
      // For single component, use flat props from entry file
      const entryFile = resolvedFiles.find(f => f.fileType === 'tsx' || f.fileType === 'jsx') ?? resolvedFiles[0];
      if (entryFile) {
        const componentResult = await this.componentService.get(entryFile.id);
        if (componentResult) {
          // Get metadata from draft or version
          let metadata: Record<string, unknown> = {};
          if ('draft' in componentResult && componentResult.draft) {
            metadata = componentResult.draft.metadata ?? {};
          } else if ('version' in componentResult && componentResult.version) {
            metadata = componentResult.version.metadata ?? {};
          }
          if (metadata.demo_props) {
            demoProps = metadata.demo_props as Record<string, unknown>;
          }
        }
      }
    }

    // 7. Collect standalone CSS from resolved files
    // (CSS that isn't imported by JS won't be bundled by esbuild)
    const standaloneCss = resolvedFiles
      .filter(f => f.fileType === 'css')
      .map(f => f.content)
      .join('\n\n');

    // Combine esbuild-bundled CSS with standalone CSS
    const combinedCss = [bundleResult.css, standaloneCss].filter(Boolean).join('\n\n');
    console.log(`[Bundler] CSS: ${bundleResult.css.length} bytes bundled + ${standaloneCss.length} bytes standalone`);

    // 8. Generate HTML
    const html = this.generateHTML({
      title: input.template?.title ?? input.name,
      js: bundleResult.js,
      css: combinedCss,
      assets: resolvedAssets,
      demoProps,
      cdnLibraries: detectedLibraries,
      customHead: input.template?.head,
      customBody: input.template?.body,
      customStyles: input.template?.styles,
      customScripts: input.template?.scripts,
    });

    return {
      html,
      js: bundleResult.js,
      css: combinedCss,
      resolvedFiles,
      resolvedAssets,
      warnings: bundleResult.warnings,
      buildTimeMs: bundleResult.buildTimeMs,
    };
  }

  /**
   * Resolve file references to actual content, including transitive dependencies.
   *
   * This recursively resolves all Forge component dependencies from manifests,
   * building a complete dependency graph before bundling.
   */
  private async resolveFiles(refs: string[]): Promise<ResolvedFile[]> {
    const resolved: ResolvedFile[] = [];
    const resolvedIds = new Set<string>(); // Track resolved to avoid duplicates
    const resolving = new Set<string>(); // Track currently resolving for circular detection
    const errors: string[] = [];

    /**
     * Recursively resolve a single file and its dependencies
     */
    const resolveOne = async (ref: string, depth: number = 0): Promise<void> => {
      const indent = '  '.repeat(depth);

      try {
        console.log(`${indent}[Bundler] Resolving: ${ref}`);

        // Resolve the component using ComponentService
        const result = await this.componentService.get(ref);

        if (!result) {
          errors.push(`Could not resolve: ${ref}`);
          console.warn(`${indent}[Bundler] Could not resolve: ${ref}`);
          return;
        }

        const { component } = result;

        // Check if already resolved
        if (resolvedIds.has(component.id)) {
          console.log(`${indent}[Bundler] Already resolved: ${component.id}`);
          return;
        }

        // Check for circular dependency
        if (resolving.has(component.id)) {
          const error = `Circular dependency detected: ${ref} (${component.id})`;
          errors.push(error);
          console.error(`${indent}[Bundler] ${error}`);
          throw new Error(error);
        }

        // Mark as currently resolving
        resolving.add(component.id);

        console.log(`${indent}[Bundler] Resolved ${ref} -> ${component.id}`);

        // Fetch the content - prefer draft, fall back to latest version
        let content: string | null = null;
        let dependencies: string[] = [];

        if ('draft' in result && result.draft) {
          content = await this.componentService.getDraftContent(component.id);
          dependencies = result.draft.dependencies ?? [];
        }
        if (!content && component.latest_version > 0) {
          content = await this.componentService.getVersionContent(component.id, component.latest_version);
          // Get dependencies from version
          if ('version' in result && result.version) {
            dependencies = result.version.dependencies ?? [];
          }
        }

        if (!content) {
          errors.push(`No content for: ${component.id}`);
          console.warn(`${indent}[Bundler] No content for: ${component.id}`);
          resolving.delete(component.id);
          return;
        }

        // Recursively resolve dependencies BEFORE adding this file
        // This ensures dependencies are added to the list before the files that depend on them
        if (dependencies.length > 0) {
          console.log(`${indent}[Bundler] Resolving ${dependencies.length} dependencies for ${component.canonical_name}: ${dependencies.join(', ')}`);

          for (const depId of dependencies) {
            await resolveOne(depId, depth + 1);
          }
        }

        // Now add this file (after its dependencies)
        resolved.push({
          ref,
          id: component.id,
          canonical_name: component.canonical_name,
          content,
          fileType: component.file_type ?? 'txt',
        });

        resolvedIds.add(component.id);
        resolving.delete(component.id);

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('Circular dependency')) {
          errors.push(`Error resolving ${ref}: ${msg}`);
        }
        console.error(`${indent}[Bundler] Error resolving ${ref}:`, error);
        throw error; // Re-throw to stop processing on circular deps
      }
    };

    // Resolve all requested files and their transitive dependencies
    for (const ref of refs) {
      try {
        await resolveOne(ref, 0);
      } catch (error) {
        // If it's a circular dependency, we've already logged it
        // Continue with other refs or fail based on what we have
        if (error instanceof Error && error.message.includes('Circular dependency')) {
          throw error; // Fail fast on circular deps
        }
      }
    }

    if (resolved.length === 0 && errors.length > 0) {
      throw new Error(`Failed to resolve any files:\n${errors.join('\n')}`);
    }

    console.log(`[Bundler] Total files resolved: ${resolved.length} (from ${refs.length} refs)`);

    return resolved;
  }

  /**
   * Resolve asset references (media assets like images/audio)
   * Note: These are stored as components with type='asset' in the new model
   */
  private async resolveAssets(refs: string[]): Promise<AssetManifest[]> {
    const resolved: AssetManifest[] = [];

    for (const ref of refs) {
      try {
        const result = await this.componentService.get(ref);
        if (result) {
          // Convert to AssetManifest format for compatibility
          const { component } = result;
          let content_url = '';
          let manifest_url = '';
          let metadata: Record<string, unknown> = {};
          let provenance: { source_type: 'ai_generated' | 'manual' | 'import' } = { source_type: 'manual' };

          if ('draft' in result && result.draft) {
            content_url = result.draft.content_url;
            manifest_url = result.draft.manifest_url ?? '';
            metadata = result.draft.metadata ?? {};
            provenance = result.draft.provenance ?? { source_type: 'manual' };
          } else if ('version' in result && result.version) {
            content_url = result.version.content_url;
            manifest_url = result.version.manifest_url ?? '';
            metadata = result.version.metadata ?? {};
            provenance = result.version.provenance ?? { source_type: 'manual' };
          }

          resolved.push({
            id: component.id,
            canonical_name: component.canonical_name,
            type: component.type,
            file_type: component.file_type,
            media_type: component.media_type,
            description: component.description,
            version: `${component.latest_version}`,
            content_url,
            manifest_url,
            created_at: component.created_at,
            children_ids: [],
            tags: [],
            dependencies: [],
            metadata,
            provenance,
          });
        }
      } catch (error) {
        console.error(`[Bundler] Error resolving asset ${ref}:`, error);
      }
    }

    return resolved;
  }

  /**
   * Collect demo_props from all TSX/JSX components for multi-component bundles
   * Returns a map of canonical_name -> demo_props
   */
  private async collectComponentDemoProps(files: ResolvedFile[]): Promise<Record<string, Record<string, unknown>>> {
    const propsMap: Record<string, Record<string, unknown>> = {};

    const tsxFiles = files.filter(f => f.fileType === 'tsx' || f.fileType === 'jsx');

    for (const file of tsxFiles) {
      try {
        const result = await this.componentService.get(file.id);
        if (result) {
          // Get metadata from draft or version
          let metadata: Record<string, unknown> = {};
          if ('draft' in result && result.draft) {
            metadata = result.draft.metadata ?? {};
          } else if ('version' in result && result.version) {
            metadata = result.version.metadata ?? {};
          }

          if (metadata.demo_props) {
            propsMap[file.canonical_name] = metadata.demo_props as Record<string, unknown>;
            console.log(`[Bundler] Collected demo_props for ${file.canonical_name}`);
          }
        }
      } catch (error) {
        console.error(`[Bundler] Error getting demo_props for ${file.id}:`, error);
      }
    }

    return propsMap;
  }

  /**
   * Build a virtual file system for the bundler container
   * If multiple TSX/JSX components exist, creates a synthetic entry that imports them all
   *
   * Files are added using their ID as the filename (e.g., /vector-renderer-v1-fe3b.tsx)
   * This ensures that imports like `import X from './vector-renderer-v1-fe3b'` resolve correctly.
   */
  private buildVirtualFS(files: ResolvedFile[], layout?: string): { fs: Record<string, string>; syntheticEntry?: string } {
    const fs: Record<string, string> = {};

    // Add all files to the virtual FS using their ID as the filename
    // This is crucial for import resolution - components import by ID (e.g., './vector-renderer-v1-fe3b')
    for (const file of files) {
      const ext = file.fileType || 'ts';
      // Use the full ID as the filename so imports resolve correctly
      const path = `/${file.id}.${ext}`;
      fs[path] = file.content;
      console.log(`[Bundler] VFS: ${path} (${file.content.length} bytes)`);
    }

    // Check if we have multiple TSX/JSX components that need a synthetic entry
    const tsxFiles = files.filter(f => f.fileType === 'tsx' || f.fileType === 'jsx');

    if (tsxFiles.length > 1) {
      // Create a synthetic entry that imports and renders all components
      const syntheticEntry = this.createSyntheticEntry(tsxFiles, layout);
      fs['/_forge_app.tsx'] = syntheticEntry;
      console.log(`[Bundler] VFS: /_forge_app.tsx (synthetic entry, ${syntheticEntry.length} bytes)`);
      return { fs, syntheticEntry: '/_forge_app.tsx' };
    }

    return { fs };
  }

  /**
   * Create a synthetic entry file that imports and renders multiple components
   * Each component receives its demo_props from window.__FORGE_DEMO_PROPS__[canonicalName]
   */
  private createSyntheticEntry(components: ResolvedFile[], _layout?: string): string {
    // Generate import statements and component name mappings
    const imports: string[] = ['import React from "react";'];
    const componentMap: Array<{ name: string; path: string; canonical: string }> = [];

    for (const comp of components) {
      // Convert canonical name to PascalCase for component name
      const compName = comp.canonical_name
        .split(/[-_]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
      // Use the ID for the import path to match VFS naming convention
      const path = `./${comp.id}.${comp.fileType}`;
      imports.push(`import ${compName} from "${path}";`);
      componentMap.push({ name: compName, path, canonical: comp.canonical_name });
    }

    // Generate the App component that reads props from window.__FORGE_DEMO_PROPS__
    // Each component's props are stored under its canonical name
    const appBody = componentMap
      .map(c => `      <${c.name} {...(allProps["${c.canonical}"] || {})} />`)
      .join('\n');

    // Generate global exports for each component so custom layouts can use them
    const globalExports = componentMap
      .map(c => `(window as any).${c.name} = ${c.name};`)
      .join('\n');

    return `${imports.join('\n')}

// Access demo props from window - each component's props are keyed by canonical name
const allProps = (typeof window !== 'undefined' && (window as any).__FORGE_DEMO_PROPS__) || {};

// Expose individual components as globals for custom layout scripts
if (typeof window !== 'undefined') {
${globalExports}
}

const ForgeApp = () => {
  return (
    <div className="forge-app">
${appBody}
    </div>
  );
};

export default ForgeApp;
`;
  }

  /**
   * Find the entry point file
   * Returns the path using the file's ID to match the VFS naming convention.
   */
  private findEntryPoint(files: ResolvedFile[], explicitEntry?: string): string {
    // If explicit entry provided, find it
    if (explicitEntry) {
      const entry = files.find(
        (f) => f.ref === explicitEntry ||
               f.id === explicitEntry ||
               f.canonical_name === explicitEntry
      );
      if (entry) {
        return `/${entry.id}.${entry.fileType || 'ts'}`;
      }
    }

    // Look for common entry point patterns
    const entryPatterns = ['index', 'main', 'app', 'entry'];

    for (const pattern of entryPatterns) {
      const match = files.find((f) =>
        f.canonical_name.toLowerCase().includes(pattern) &&
        ['tsx', 'jsx', 'ts', 'js'].includes(f.fileType)
      );
      if (match) {
        return `/${match.id}.${match.fileType || 'ts'}`;
      }
    }

    // Fall back to first TSX/JSX file
    const tsxFile = files.find((f) => f.fileType === 'tsx' || f.fileType === 'jsx');
    if (tsxFile) {
      return `/${tsxFile.id}.${tsxFile.fileType}`;
    }

    // Fall back to first file
    const first = files[0];
    if (!first) {
      throw new Error('No files to bundle');
    }
    return `/${first.id}.${first.fileType || 'ts'}`;
  }

  /**
   * Generate the HTML page
   */
  private generateHTML(options: {
    title: string;
    js: string;
    css: string;
    assets: AssetManifest[];
    demoProps?: Record<string, unknown>;
    cdnLibraries?: string[];
    customHead?: string;
    customBody?: string;
    customStyles?: string;
    customScripts?: string;
  }): string {
    const { title, js, css, assets, demoProps, cdnLibraries = [], customHead, customBody, customStyles, customScripts } = options;

    // Build asset map for runtime
    const assetMap = assets.reduce((acc, asset) => {
      acc[asset.canonical_name] = asset.content_url;
      return acc;
    }, {} as Record<string, string>);

    // Build CDN script tags for detected libraries
    const cdnScripts: string[] = [];
    // Note: For libraries with named exports (import { x } from 'lib'), we spread all
    // library properties so named imports like useState, useRef, gsap.to() work correctly
    const spreadLib = 'if (!m) return {}; if (m.__esModule) return m; var r = { default: m, __esModule: true }; for (var k in m) r[k] = m[k]; return r;';
    // Create jsx-runtime shim that wraps React.createElement
    // jsx(type, props, key) -> createElement(type, props) with children in props
    const jsxRuntimeShim = `(function() {
      var R = window.React;
      function jsx(type, props, key) {
        var newProps = key !== undefined ? Object.assign({}, props, { key: key }) : props;
        return R.createElement(type, newProps);
      }
      return { jsx: jsx, jsxs: jsx, jsxDEV: jsx, Fragment: R.Fragment, __esModule: true };
    })()`;

    const requireShimEntries: string[] = [
      `if (name === "react") { var m = window.React; ${spreadLib} }`,
      `if (name === "react/jsx-runtime") { return cache[name] = ${jsxRuntimeShim}; }`,
      `if (name === "react/jsx-dev-runtime") { return cache[name] = ${jsxRuntimeShim}; }`,
      `if (name === "react-dom") { var m = window.ReactDOM; ${spreadLib} }`,
      `if (name === "react-dom/client") { var m = window.ReactDOM; ${spreadLib} }`,
    ];

    for (const libName of cdnLibraries) {
      const lib = getCdnLibrary(libName);
      if (lib) {
        // Add script tags for each CDN URL
        for (const url of lib.cdnUrls) {
          cdnScripts.push(`  <script crossorigin src="${url}"></script>`);
        }
        // Add entry to require shim that spreads all library properties for named imports
        requireShimEntries.push(`if (name === "${libName}") { var m = window.${lib.globalName}; ${spreadLib} }`);
        // Handle subpath imports (e.g., 'three/examples/jsm/...')
        requireShimEntries.push(`if (name.startsWith("${libName}/")) return window.${lib.globalName};`);
      }
    }

    const cdnScriptsHtml = cdnScripts.length > 0
      ? `\n  <!-- CDN Libraries -->\n${cdnScripts.join('\n')}\n`
      : '';

    // Build the require shim with all library mappings
    const requireShim = `var require = (function() {
  var cache = {};
  return function(name) {
    if (cache[name]) return cache[name];
    ${requireShimEntries.join('\n    ')}
    console.warn("Unknown module:", name);
    return {};
  };
})();`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>

  <!-- React from CDN -->
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
${cdnScriptsHtml}
  <!-- Base Reset + Bundled Styles -->
  <style>
*, *::before, *::after {
  box-sizing: border-box;
}
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  min-height: 100vh;
}
#root {
  width: 100%;
  min-height: 100vh;
}
#root:empty {
  display: none;
}
img {
  max-width: 100%;
  height: auto;
}
${css}
${customStyles ?? ''}
  </style>

  ${customHead ?? ''}
</head>
<body>
  <div id="root"></div>

  <!-- Asset Map -->
  <script>
    window.__FORGE_ASSETS__ = ${JSON.stringify(assetMap, null, 2)};
    window.__FORGE_DEMO_PROPS__ = ${JSON.stringify(demoProps ?? {}, null, 2)};
  </script>

  <!-- Require shim for external modules -->
  <script>
${requireShim}
  </script>

  <!-- Bundled JavaScript -->
  <script>
${js}

// Auto-mount the default export if present (skip if custom layout provided)
(function() {
  var hasCustomLayout = ${customBody ? 'true' : 'false'};
  if (hasCustomLayout) {
    console.log('[Forge] Custom layout detected, skipping auto-mount');
    return;
  }
  try {
    var bundle = window.ForgeBundle;
    if (bundle && bundle.default) {
      var root = ReactDOM.createRoot(document.getElementById('root'));
      // Use demo props from manifest if available
      var demoProps = window.__FORGE_DEMO_PROPS__ || {};

      // Convert string functions to actual functions
      Object.keys(demoProps).forEach(function(key) {
        var val = demoProps[key];
        if (typeof val === 'string' && (val.startsWith('()') || val.startsWith('function'))) {
          try {
            demoProps[key] = new Function('return ' + val)();
          } catch (e) {
            console.warn('Could not parse function:', key, e);
          }
        }
      });

      root.render(React.createElement(bundle.default, demoProps));
    }
  } catch (e) {
    console.error('Failed to mount component:', e);
    document.getElementById('root').innerHTML = '<pre style="color:red">' + e.message + '</pre>';
  }
})();
  </script>

  <!-- Custom layout (after bundle so components are available as globals) -->
  ${customBody ?? ''}

  ${customScripts ?? ''}
</body>
</html>`;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

/**
 * Create bundle artifacts metadata
 */
export function bundleToArtifacts(output: BundleOutput, baseUrl: string): BundleArtifact[] {
  return [
    {
      type: 'html',
      url: `${baseUrl}/index.html`,
      size: new TextEncoder().encode(output.html).length,
    },
    {
      type: 'js',
      url: `${baseUrl}/bundle.js`,
      size: new TextEncoder().encode(output.js).length,
    },
    {
      type: 'css',
      url: `${baseUrl}/styles.css`,
      size: new TextEncoder().encode(output.css).length,
    },
  ];
}
