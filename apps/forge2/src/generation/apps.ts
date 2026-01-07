/**
 * App Generation
 *
 * AI-powered generation of multi-component applications.
 * Takes a natural language description and generates all components,
 * CSS, and app wrapper automatically.
 */

import type { Env } from '../types';
import { generateCompletion, type LLMMessage, type LLMOptions } from './llm';
import { generateFile, generateCssForComponent, type GeneratedFile } from './files';
import { generateImage } from './images';
import { generateSpeech } from './speech';
import { AssetService } from '../services/assets';
import { BundlerService } from '../services/bundler';

// =============================================================================
// Types
// =============================================================================

export interface AppPlan {
  /** Name for the app (slug-friendly) */
  name: string;

  /** Brief description of the app */
  description: string;

  /** Components to generate */
  components: ComponentPlan[];

  /** Images to generate */
  images: ImageAssetPlan[];

  /** Speech/audio to generate */
  speech: SpeechAssetPlan[];

  /** Overall style/theme */
  style: string;

  /** Layout structure for the App wrapper */
  layout: string;
}

export interface ImageAssetPlan {
  /** Identifier to reference this image (e.g., "hero-image", "robot-illustration") */
  id: string;

  /** Prompt for image generation */
  prompt: string;

  /** Image style */
  style: 'illustration' | 'photo' | '3d' | 'pixel-art';

  /** Which component uses this image */
  used_by: string;
}

export interface SpeechAssetPlan {
  /** Identifier to reference this audio (e.g., "narration", "welcome-message") */
  id: string;

  /** Text to convert to speech */
  text: string;

  /** Voice style hints */
  voice_style: string;

  /** Which component uses this audio */
  used_by: string;
}

export interface ComponentPlan {
  /** Component name (e.g., "HeroSection") */
  name: string;

  /** What this component does */
  description: string;

  /** Props this component should accept */
  props: string[];

  /** Role in the layout */
  role: 'header' | 'hero' | 'section' | 'feature' | 'cta' | 'footer' | 'navigation' | 'card' | 'other';
}

export interface GeneratedComponent {
  /** Component plan */
  plan: ComponentPlan;

  /** Generated TSX file */
  tsx: GeneratedFile;

  /** Asset ID for TSX */
  tsxId: string;

  /** Generated CSS file */
  css: GeneratedFile;

  /** Asset ID for CSS */
  cssId: string;
}

export interface GeneratedAsset {
  /** Plan for this asset */
  plan: ImageAssetPlan | SpeechAssetPlan;

  /** Asset ID */
  id: string;

  /** URL to access the asset */
  url: string;

  /** Asset type */
  type: 'image' | 'speech';
}

export interface GeneratedApp {
  /** The app plan */
  plan: AppPlan;

  /** Generated components */
  components: GeneratedComponent[];

  /** Generated image assets */
  images: GeneratedAsset[];

  /** Generated speech assets */
  speech: GeneratedAsset[];

  /** App wrapper TSX */
  appWrapper: GeneratedFile;

  /** App wrapper asset ID */
  appWrapperId: string;

  /** Final composed bundle ID */
  bundleId: string;

  /** Preview URL */
  previewUrl: string;
}

// =============================================================================
// App Planning
// =============================================================================

const PLANNER_SYSTEM_PROMPT = `You are an expert UI/UX architect. Given an app description, create a detailed plan for the components, images, and audio needed.

Rules:
- Break the app into logical, reusable components
- Each component should be focused and single-purpose
- Include 2-6 components depending on complexity
- Consider the visual hierarchy and layout
- Include appropriate props for customization
- Plan images that would enhance the visual appeal
- Plan speech/audio if the app would benefit from narration or sound

Output a JSON object with these keys:
1. "name": A slug-friendly name for the app (lowercase, hyphens)
2. "description": Brief description of the app
3. "components": Array of component plans, each with:
   - "name": PascalCase component name (e.g., "HeroSection")
   - "description": What this component does and looks like
   - "props": Array of prop names it should accept (include imageUrl/audioUrl props if this component uses assets)
   - "role": One of "header", "hero", "section", "feature", "cta", "footer", "navigation", "card", "other"
4. "images": Array of images to generate, each with:
   - "id": kebab-case identifier (e.g., "hero-illustration")
   - "prompt": Detailed prompt for AI image generation
   - "style": One of "illustration", "photo", "3d", "pixel-art"
   - "used_by": Component name that will use this image
5. "speech": Array of audio to generate, each with:
   - "id": kebab-case identifier (e.g., "story-narration")
   - "text": The text to convert to speech
   - "voice_style": Description of how it should sound (e.g., "warm and friendly narrator")
   - "used_by": Component name that will use this audio
6. "style": Style description to pass to CSS generation
7. "layout": How components should be arranged

Example for a story card:
{
  "name": "robot-story-card",
  "description": "An interactive story card about a robot learning to paint",
  "components": [
    {"name": "StoryCard", "description": "Card with illustration, title, story text, and play button for narration", "props": ["title", "story", "imageUrl", "audioUrl"], "role": "card"}
  ],
  "images": [
    {"id": "robot-painting", "prompt": "A cute robot with paintbrush in hand, standing at an easel, watercolor style, whimsical, warm colors", "style": "illustration", "used_by": "StoryCard"}
  ],
  "speech": [
    {"id": "story-narration", "text": "Once upon a time, there was a little robot who dreamed of becoming an artist...", "voice_style": "warm, gentle storyteller voice", "used_by": "StoryCard"}
  ],
  "style": "whimsical storybook aesthetic with soft shadows and rounded corners",
  "layout": "single centered card with image at top, text below, audio controls at bottom"
}

Output ONLY valid JSON. No markdown fences, no explanations.`;

/**
 * Plan an app from a natural language description
 */
export async function planApp(
  description: string,
  style: string | undefined,
  env: Env
): Promise<AppPlan> {
  const userPrompt = `Create an app plan for: "${description}"
${style ? `\nDesired style: ${style}` : ''}`;

  const messages: LLMMessage[] = [
    { role: 'system', content: PLANNER_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const options: LLMOptions = {
    max_tokens: 4096,
    temperature: 0.5,
  };

  console.log(`[AppGen] Planning app: ${description.slice(0, 100)}...`);

  const response = await generateCompletion(messages, options, env);

  let content = response.content.trim();
  // Strip markdown fences if present
  content = content.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '');

  try {
    const parsed = JSON.parse(content);
    // Ensure arrays exist (backward compatibility)
    const plan: AppPlan = {
      ...parsed,
      images: parsed.images || [],
      speech: parsed.speech || [],
    };
    console.log(`[AppGen] Plan: ${plan.name} with ${plan.components.length} components, ${plan.images.length} images, ${plan.speech.length} audio`);
    return plan;
  } catch (error) {
    console.error('[AppGen] Failed to parse plan:', content);
    throw new Error('Failed to parse app plan from AI response');
  }
}

// =============================================================================
// App Generation
// =============================================================================

/**
 * Generate a complete app from a description
 * This is the main orchestration function that:
 * 1. Plans the app structure
 * 2. Generates each component (TSX + CSS)
 * 3. Generates the App wrapper
 * 4. Composes everything into a bundle
 */
export async function generateApp(
  description: string,
  style: string | undefined,
  env: Env,
  baseUrl: string
): Promise<GeneratedApp> {
  const assetService = new AssetService(env, baseUrl);
  const bundlerService = new BundlerService(env, baseUrl);

  // 1. Plan the app
  console.log('[AppGen] Step 1: Planning app structure...');
  const plan = await planApp(description, style, env);

  // 2. Generate each component
  console.log(`[AppGen] Step 2: Generating ${plan.components.length} components...`);
  const generatedComponents: GeneratedComponent[] = [];

  for (const componentPlan of plan.components) {
    console.log(`[AppGen] Generating component: ${componentPlan.name}`);

    // Generate TSX
    const tsxDescription = `${componentPlan.name} component: ${componentPlan.description}. Props: ${componentPlan.props.join(', ')}`;
    const tsx = await generateFile(tsxDescription, 'tsx', { style: plan.style }, env);

    // Store TSX as asset
    const tsxManifest = await assetService.create({
      name: `${plan.name}-${componentPlan.name.toLowerCase()}`,
      type: 'file',
      file_type: 'tsx',
      description: tsxDescription,
      content: tsx.content,
      mime_type: 'text/typescript',
      provenance: {
        ai_model: tsx.model,
        ai_provider: tsx.provider,
        source_type: 'ai_generated',
        generation_params: { description: tsxDescription, style: plan.style },
      },
      metadata: {
        demo_props: tsx.demo_props,
        props: tsx.props,
        css_classes: tsx.css_classes,
        exports: tsx.exports,
        app_name: plan.name,
        component_role: componentPlan.role,
      },
    });

    // Generate CSS for the component
    let css: GeneratedFile;
    let cssManifest;

    if (tsx.css_classes && tsx.css_classes.length > 0) {
      css = await generateCssForComponent(
        tsx.css_classes,
        tsxDescription,
        plan.style,
        env
      );

      cssManifest = await assetService.create({
        name: `${plan.name}-${componentPlan.name.toLowerCase()}-styles`,
        type: 'file',
        file_type: 'css',
        description: `CSS for ${componentPlan.name}`,
        content: css.content,
        mime_type: 'text/css',
        provenance: {
          ai_model: css.model,
          ai_provider: css.provider,
          source_type: 'ai_generated',
          generation_params: { css_classes: tsx.css_classes, style: plan.style },
        },
        metadata: {
          for_component: tsxManifest.id,
          classes_defined: css.classes_defined,
          variables_defined: css.variables_defined,
          keyframes_defined: css.keyframes_defined,
        },
      });
    } else {
      // Create empty CSS if no classes
      css = {
        content: `/* No CSS classes for ${componentPlan.name} */`,
        canonical_name: `${plan.name}-${componentPlan.name.toLowerCase()}-styles`,
        file_type: 'css',
        model: 'none',
        provider: 'none',
      };

      cssManifest = await assetService.create({
        name: css.canonical_name,
        type: 'file',
        file_type: 'css',
        description: `CSS for ${componentPlan.name}`,
        content: css.content,
        mime_type: 'text/css',
        provenance: { source_type: 'ai_generated' },
        metadata: { for_component: tsxManifest.id },
      });
    }

    generatedComponents.push({
      plan: componentPlan,
      tsx,
      tsxId: tsxManifest.id,
      css,
      cssId: cssManifest.id,
    });
  }

  // 3. Generate images (if any)
  const generatedImages: GeneratedAsset[] = [];
  if (plan.images.length > 0) {
    console.log(`[AppGen] Step 3a: Generating ${plan.images.length} images...`);
    for (const imagePlan of plan.images) {
      console.log(`[AppGen] Generating image: ${imagePlan.id}`);
      try {
        const imageResult = await generateImage(
          imagePlan.prompt,
          { style: imagePlan.style, width: 512, height: 512 },
          env
        );

        const imageManifest = await assetService.create({
          name: `${plan.name}-${imagePlan.id}`,
          type: 'asset',
          media_type: 'image',
          description: imagePlan.prompt,
          content: imageResult.data,
          mime_type: imageResult.mimeType,
          provenance: {
            ai_model: env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-exp',
            ai_provider: 'gemini',
            source_type: 'ai_generated',
            generation_params: { prompt: imagePlan.prompt, style: imagePlan.style },
          },
          metadata: {
            app_name: plan.name,
            used_by: imagePlan.used_by,
            width: imageResult.width,
            height: imageResult.height,
          },
        });

        generatedImages.push({
          plan: imagePlan,
          id: imageManifest.id,
          url: imageManifest.content_url,
          type: 'image',
        });
      } catch (error) {
        console.error(`[AppGen] Failed to generate image ${imagePlan.id}:`, error);
        // Continue without this image
      }
    }
  }

  // 3b. Generate speech (if any)
  const generatedSpeech: GeneratedAsset[] = [];
  if (plan.speech.length > 0) {
    console.log(`[AppGen] Step 3b: Generating ${plan.speech.length} audio clips...`);
    for (const speechPlan of plan.speech) {
      console.log(`[AppGen] Generating speech: ${speechPlan.id}`);
      try {
        const speechResult = await generateSpeech(
          speechPlan.text,
          { voice: 'nova', format: 'mp3' },
          env
        );

        const speechManifest = await assetService.create({
          name: `${plan.name}-${speechPlan.id}`,
          type: 'asset',
          media_type: 'speech',
          description: speechPlan.text.slice(0, 200),
          content: speechResult.data,
          mime_type: speechResult.mimeType,
          provenance: {
            ai_model: 'gpt-4o-mini-tts',
            ai_provider: 'openai',
            source_type: 'ai_generated',
            generation_params: { text: speechPlan.text, voice_style: speechPlan.voice_style },
          },
          metadata: {
            app_name: plan.name,
            used_by: speechPlan.used_by,
            text_length: speechPlan.text.length,
          },
        });

        generatedSpeech.push({
          plan: speechPlan,
          id: speechManifest.id,
          url: speechManifest.content_url,
          type: 'speech',
        });
      } catch (error) {
        console.error(`[AppGen] Failed to generate speech ${speechPlan.id}:`, error);
        // Continue without this audio
      }
    }
  }

  // Build asset URL map for components to use
  const assetUrls: Record<string, string> = {};
  for (const img of generatedImages) {
    assetUrls[(img.plan as ImageAssetPlan).id] = img.url;
  }
  for (const speech of generatedSpeech) {
    assetUrls[(speech.plan as SpeechAssetPlan).id] = speech.url;
  }

  // 4. Generate App wrapper
  console.log('[AppGen] Step 4: Generating App wrapper...');
  const appWrapper = await generateAppWrapper(plan, generatedComponents, assetUrls, env);

  const appWrapperManifest = await assetService.create({
    name: `${plan.name}-app`,
    type: 'file',
    file_type: 'tsx',
    description: `Main App component for ${plan.name}`,
    content: appWrapper.content,
    mime_type: 'text/typescript',
    provenance: {
      ai_model: appWrapper.model,
      ai_provider: appWrapper.provider,
      source_type: 'ai_generated',
      generation_params: { plan: plan.name },
    },
    metadata: {
      demo_props: appWrapper.demo_props,
      css_classes: appWrapper.css_classes,
      component_count: generatedComponents.length,
    },
  });

  // Generate CSS for App wrapper if it has classes
  let appCssId: string | undefined;
  if (appWrapper.css_classes && appWrapper.css_classes.length > 0) {
    const appCss = await generateCssForComponent(
      appWrapper.css_classes,
      `App wrapper for ${plan.name}`,
      plan.style,
      env
    );

    const appCssManifest = await assetService.create({
      name: `${plan.name}-app-styles`,
      type: 'file',
      file_type: 'css',
      description: `CSS for ${plan.name} App wrapper`,
      content: appCss.content,
      mime_type: 'text/css',
      provenance: {
        ai_model: appCss.model,
        ai_provider: appCss.provider,
        source_type: 'ai_generated',
      },
      metadata: { for_component: appWrapperManifest.id },
    });
    appCssId = appCssManifest.id;
  }

  // 4. Compose everything
  console.log('[AppGen] Step 4: Composing bundle...');

  // Collect all file IDs: App wrapper + all component TSX + all CSS
  const fileIds: string[] = [
    appWrapperManifest.id,
    ...generatedComponents.map(c => c.tsxId),
    ...generatedComponents.map(c => c.cssId),
  ];
  if (appCssId) {
    fileIds.push(appCssId);
  }

  // Collect asset IDs for the bundle
  const assetIds = [
    ...generatedImages.map(i => i.id),
    ...generatedSpeech.map(s => s.id),
  ];

  const bundleResult = await bundlerService.bundle({
    name: plan.name,
    description: plan.description,
    files: fileIds,
    assets: assetIds,
    entry: appWrapperManifest.id,
  });

  // Store the bundle
  const bundleManifest = await assetService.create({
    name: plan.name,
    type: 'bundle',
    description: plan.description,
    content: bundleResult.html,
    mime_type: 'text/html',
    provenance: {
      source_type: 'ai_generated',
      generation_params: {
        description,
        style,
        component_count: generatedComponents.length,
      },
    },
    metadata: {
      plan,
      component_ids: generatedComponents.map(c => c.tsxId),
      css_ids: generatedComponents.map(c => c.cssId),
      app_wrapper_id: appWrapperManifest.id,
      js_size: bundleResult.js.length,
      css_size: bundleResult.css.length,
      html_size: bundleResult.html.length,
      build_time_ms: bundleResult.buildTimeMs,
    },
  });

  const previewUrl = `${baseUrl}/api/assets/${bundleManifest.id}/content`;
  console.log(`[AppGen] Complete! Bundle: ${bundleManifest.id}, Preview: ${previewUrl}`);

  return {
    plan,
    components: generatedComponents,
    images: generatedImages,
    speech: generatedSpeech,
    appWrapper,
    appWrapperId: appWrapperManifest.id,
    bundleId: bundleManifest.id,
    previewUrl,
  };
}

// =============================================================================
// App Wrapper Generation
// =============================================================================

/**
 * Generate an App wrapper that imports and composes all components
 */
async function generateAppWrapper(
  plan: AppPlan,
  components: GeneratedComponent[],
  assetUrls: Record<string, string>,
  env: Env
): Promise<GeneratedFile> {
  const componentList = components.map(c => ({
    name: c.plan.name,
    role: c.plan.role,
    props: c.plan.props,
    demoProps: c.tsx.demo_props,
  }));

  // Build asset props for each component based on the plan
  const componentAssets: Record<string, Record<string, string>> = {};
  for (const img of plan.images) {
    const url = assetUrls[img.id];
    if (url) {
      const existing = componentAssets[img.used_by] ?? {};
      existing.imageUrl = url;
      componentAssets[img.used_by] = existing;
    }
  }
  for (const speech of plan.speech) {
    const url = assetUrls[speech.id];
    if (url) {
      const existing = componentAssets[speech.used_by] ?? {};
      existing.audioUrl = url;
      componentAssets[speech.used_by] = existing;
    }
  }

  const systemPrompt = `You are an expert React developer. Generate an App wrapper component that imports and uses the given components.

Rules:
- Import React and all listed components
- Use relative imports for components (e.g., import Hero from './hero')
- The component names in imports should be lowercase with hyphens matching the file names
- Arrange components according to the layout description
- Pass appropriate demo props to each component
- If asset URLs are provided (imageUrl, audioUrl), pass them to the appropriate components
- Include a container div with app-level styling classes
- Use semantic CSS class names for the layout

Output a JSON object with these keys:
1. "code": The complete TypeScript/React code
2. "demo_props": Empty object {} (App doesn't take props)
3. "props": Empty array []
4. "css_classes": Array of CSS class names used in the App wrapper
5. "exports": ["default"]

Output ONLY valid JSON. No markdown fences, no explanations.`;

  const userPrompt = `Generate an App wrapper for "${plan.name}".

Layout: ${plan.layout}

Components to include:
${componentList.map(c => `- ${c.name} (role: ${c.role}, props: ${c.props.join(', ')})`).join('\n')}

Demo props for each component:
${componentList.map(c => `- ${c.name}: ${JSON.stringify(c.demoProps || {})}`).join('\n')}

Asset URLs to pass to components:
${Object.entries(componentAssets).map(([comp, urls]) => `- ${comp}: ${JSON.stringify(urls)}`).join('\n') || '(none)'}

The file names for imports are:
${components.map(c => `- ${c.plan.name}: ./${plan.name}-${c.plan.name.toLowerCase()}`).join('\n')}`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const options: LLMOptions = {
    max_tokens: 8192,
    temperature: 0.3,
  };

  const response = await generateCompletion(messages, options, env);

  let content = response.content.trim();
  content = content.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '');

  try {
    const parsed = JSON.parse(content);
    return {
      content: parsed.code || content,
      canonical_name: `${plan.name}-app`,
      file_type: 'tsx',
      model: response.model,
      provider: response.provider,
      demo_props: parsed.demo_props,
      props: parsed.props,
      css_classes: parsed.css_classes,
      exports: parsed.exports,
    };
  } catch {
    console.warn('[AppGen] Failed to parse App wrapper JSON, using raw content');
    return {
      content,
      canonical_name: `${plan.name}-app`,
      file_type: 'tsx',
      model: response.model,
      provider: response.provider,
    };
  }
}
