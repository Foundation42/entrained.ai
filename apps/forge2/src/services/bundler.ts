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
import { AssetService } from './assets';

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
  private assetService: AssetService;
  private env: Env;

  constructor(env: Env, baseUrl: string) {
    this.assetService = new AssetService(env, baseUrl);
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

    // 3. Build the virtual file system
    const files = this.buildVirtualFS(resolvedFiles);

    // 4. Determine entry point
    const entry = this.findEntryPoint(resolvedFiles, input.entry);
    console.log(`[Bundler] Entry point: ${entry}`);

    // 5. Call the bundler container
    const stub = this.getBundlerStub();
    const bundleResponse = await stub.fetch('http://container/bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files,
        entry,
        format: 'iife',
        minify: true,
        external: ['react', 'react-dom'],
      }),
    });

    if (!bundleResponse.ok) {
      const errorText = await bundleResponse.text();
      throw new Error(`Bundle failed: ${errorText}`);
    }

    const bundleResult = await bundleResponse.json() as ContainerBundleResponse;
    console.log(`[Bundler] Bundle complete: ${bundleResult.js.length} bytes JS, ${bundleResult.css.length} bytes CSS, ${bundleResult.buildTimeMs}ms`);

    // 6. Get demo props from entry file's manifest (look for TSX/JSX file)
    const entryFile = resolvedFiles.find(f => f.fileType === 'tsx' || f.fileType === 'jsx') ?? resolvedFiles[0];
    let demoProps: Record<string, unknown> = {};
    if (entryFile) {
      const manifest = await this.assetService.get(entryFile.id);
      if (manifest?.metadata?.demo_props) {
        demoProps = manifest.metadata.demo_props as Record<string, unknown>;
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
   * Resolve file references to actual content
   */
  private async resolveFiles(refs: string[]): Promise<ResolvedFile[]> {
    const resolved: ResolvedFile[] = [];
    const errors: string[] = [];

    for (const ref of refs) {
      try {
        console.log(`[Bundler] Resolving: ${ref}`);

        // Resolve the reference (handles @latest, semver, exact IDs)
        const manifest = await this.assetService.resolve(ref);

        if (!manifest) {
          errors.push(`Could not resolve: ${ref}`);
          console.warn(`[Bundler] Could not resolve: ${ref}`);
          continue;
        }

        console.log(`[Bundler] Resolved ${ref} -> ${manifest.id}`);

        // Fetch the content
        const content = await this.assetService.getContentAsText(manifest.id);

        if (!content) {
          errors.push(`No content for: ${manifest.id}`);
          console.warn(`[Bundler] No content for: ${manifest.id}`);
          continue;
        }

        resolved.push({
          ref,
          id: manifest.id,
          canonical_name: manifest.canonical_name,
          content,
          fileType: manifest.file_type ?? 'txt',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Error resolving ${ref}: ${msg}`);
        console.error(`[Bundler] Error resolving ${ref}:`, error);
      }
    }

    if (resolved.length === 0 && errors.length > 0) {
      throw new Error(`Failed to resolve any files:\n${errors.join('\n')}`);
    }

    return resolved;
  }

  /**
   * Resolve asset references
   */
  private async resolveAssets(refs: string[]): Promise<AssetManifest[]> {
    const resolved: AssetManifest[] = [];

    for (const ref of refs) {
      try {
        const manifest = await this.assetService.resolve(ref);
        if (manifest) {
          resolved.push(manifest);
        }
      } catch (error) {
        console.error(`[Bundler] Error resolving asset ${ref}:`, error);
      }
    }

    return resolved;
  }

  /**
   * Build a virtual file system for the bundler container
   */
  private buildVirtualFS(files: ResolvedFile[]): Record<string, string> {
    const fs: Record<string, string> = {};

    for (const file of files) {
      // Use canonical name as the file path
      const ext = file.fileType || 'ts';
      const path = `/${file.canonical_name}.${ext}`;
      fs[path] = file.content;
      console.log(`[Bundler] VFS: ${path} (${file.content.length} bytes)`);
    }

    return fs;
  }

  /**
   * Find the entry point file
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
        return `/${entry.canonical_name}.${entry.fileType || 'ts'}`;
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
        return `/${match.canonical_name}.${match.fileType || 'ts'}`;
      }
    }

    // Fall back to first TSX/JSX file
    const tsxFile = files.find((f) => f.fileType === 'tsx' || f.fileType === 'jsx');
    if (tsxFile) {
      return `/${tsxFile.canonical_name}.${tsxFile.fileType}`;
    }

    // Fall back to first file
    const first = files[0];
    if (!first) {
      throw new Error('No files to bundle');
    }
    return `/${first.canonical_name}.${first.fileType || 'ts'}`;
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
    customHead?: string;
    customBody?: string;
    customStyles?: string;
    customScripts?: string;
  }): string {
    const { title, js, css, assets, demoProps, customHead, customBody, customStyles, customScripts } = options;

    // Build asset map for runtime
    const assetMap = assets.reduce((acc, asset) => {
      acc[asset.canonical_name] = asset.content_url;
      return acc;
    }, {} as Record<string, string>);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>

  <!-- React from CDN -->
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>

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
  ${customBody ?? ''}

  <!-- Asset Map -->
  <script>
    window.__FORGE_ASSETS__ = ${JSON.stringify(assetMap, null, 2)};
    window.__FORGE_DEMO_PROPS__ = ${JSON.stringify(demoProps ?? {}, null, 2)};
  </script>

  <!-- Bundled JavaScript -->
  <script>
${js}

// Auto-mount the default export if present
(function() {
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
