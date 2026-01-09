/**
 * Reference Resolver
 *
 * Resolves reference material for AI generation.
 * Fetches component sources, CSS files, etc. and prepares them for prompts.
 */

import type { GenerationReference, ComponentReference, CssReference, Env } from '../types';
import { AssetService } from '../services/assets';
import { ComponentService } from '../services/components';

/**
 * Resolve all references, fetching their content
 */
export async function resolveReferences(
  references: GenerationReference[],
  env: Env,
  baseUrl: string
): Promise<GenerationReference[]> {
  const assetService = new AssetService(env, baseUrl);
  const componentService = new ComponentService(env, baseUrl);

  const resolved: GenerationReference[] = [];

  for (const ref of references) {
    try {
      switch (ref.type) {
        case 'component':
          resolved.push(await resolveComponentRef(ref, componentService, assetService));
          break;

        case 'css':
          resolved.push(await resolveCssRef(ref, componentService, assetService));
          break;

        case 'guidelines':
        case 'image':
          // These don't need resolution, pass through
          resolved.push(ref);
          break;
      }
    } catch (error) {
      console.error(`[References] Failed to resolve ${ref.type} reference:`, error);
      // Skip failed references but continue with others
    }
  }

  return resolved;
}

/**
 * Resolve a component reference by fetching its source
 */
async function resolveComponentRef(
  ref: ComponentReference,
  componentService: ComponentService,
  assetService: AssetService
): Promise<ComponentReference> {
  // Try to get from ComponentService first (new model)
  const component = await componentService.get(ref.id);
  if (component) {
    let source: string | null = null;

    // Get source from draft or latest version
    if ('draft' in component && component.draft) {
      source = await componentService.getDraftContent(ref.id);
    } else if ('version' in component && component.version) {
      source = await componentService.getVersionContent(ref.id, component.version.version);
    }

    if (source) {
      return {
        ...ref,
        resolved: {
          name: component.component.canonical_name,
          source,
        },
      };
    }
  }

  // Fall back to AssetService (legacy)
  const asset = await assetService.resolve(ref.id);
  if (asset) {
    const source = await assetService.getContentAsText(asset.id);
    if (source) {
      return {
        ...ref,
        resolved: {
          name: asset.canonical_name,
          source,
        },
      };
    }
  }

  console.warn(`[References] Could not resolve component: ${ref.id}`);
  return ref;
}

/**
 * Resolve a CSS reference by fetching its content
 */
async function resolveCssRef(
  ref: CssReference,
  componentService: ComponentService,
  assetService: AssetService
): Promise<CssReference> {
  // If content is already provided, use it
  if (ref.content) {
    return {
      ...ref,
      resolved: { source: ref.content },
    };
  }

  // If ID is provided, fetch the CSS
  if (ref.id) {
    // Try ComponentService first
    const component = await componentService.get(ref.id);
    if (component) {
      let source: string | null = null;

      if ('draft' in component && component.draft) {
        source = await componentService.getDraftContent(ref.id);
      } else if ('version' in component && component.version) {
        source = await componentService.getVersionContent(ref.id, component.version.version);
      }

      if (source) {
        return {
          ...ref,
          resolved: { source },
        };
      }
    }

    // Fall back to AssetService
    const asset = await assetService.resolve(ref.id);
    if (asset) {
      const source = await assetService.getContentAsText(asset.id);
      if (source) {
        return {
          ...ref,
          resolved: { source },
        };
      }
    }
  }

  console.warn(`[References] Could not resolve CSS: ${ref.id}`);
  return ref;
}
