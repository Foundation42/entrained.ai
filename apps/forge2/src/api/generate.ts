/**
 * Generation API Routes
 *
 * Endpoints for generating files, images, and speech, integrated with the asset system.
 * All generated content is stored as versioned assets.
 */

import { Hono } from 'hono';
import type { Env, CreateImageRequest, CreateSpeechRequest, CreateFileRequest } from '../types';
import { AssetService } from '../services/assets';
import {
  generateImage,
  hashImageRequest,
  imageRequestToOptions,
  generateSpeech,
  hashSpeechRequest,
  speechRequestToOptions,
  generateFile,
  generateCssForComponent,
  hashFileRequest,
  fileRequestToHints,
  getMimeType,
  VOICE_DESCRIPTIONS,
  AVAILABLE_VOICES,
  AVAILABLE_FORMATS,
} from '../generation';

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/generate/file
 * Generate a source file (TSX, TS, CSS, etc.)
 */
app.post('/file', async (c) => {
  const body = await c.req.json() as CreateFileRequest;
  const { description, file_type } = body;

  if (!description) {
    return c.json({ error: 'description is required' }, 400);
  }

  if (!file_type) {
    return c.json({ error: 'file_type is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  // Get hints from request
  const hints = fileRequestToHints(body);
  const hash = hashFileRequest(description, file_type, hints);

  // TODO: Check cache for identical request

  try {
    // Generate the file
    const result = await generateFile(description, file_type, hints, c.env);

    // Create as an asset
    const manifest = await service.create({
      name: result.canonical_name || `file-${hash}`,
      type: 'file',
      file_type: file_type,
      description,
      content: result.content,
      mime_type: getMimeType(file_type),
      provenance: {
        ai_model: result.model,
        ai_provider: result.provider,
        source_type: 'ai_generated',
        generation_params: {
          description,
          file_type,
          hints,
        },
      },
      metadata: {
        lines: result.content.split('\n').length,
        characters: result.content.length,
        // TSX/JSX metadata
        demo_props: result.demo_props,
        props: result.props,
        css_classes: result.css_classes,
        exports: result.exports,
        // CSS metadata
        classes_defined: result.classes_defined,
        variables_defined: result.variables_defined,
        keyframes_defined: result.keyframes_defined,
      },
    });

    return c.json({
      id: manifest.id,
      canonical_name: manifest.canonical_name,
      version: manifest.version,
      url: manifest.content_url,
      content: result.content,
      file_type,
      metadata: manifest.metadata,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FileGen] Error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/generate/css-for-component
 * Generate CSS that matches a component's css_classes
 * This is the key to AI-assisted composition - automatically generating
 * CSS that matches the class names a component uses.
 */
app.post('/css-for-component', async (c) => {
  const body = await c.req.json() as {
    component_id: string;
    style?: string;
  };
  const { component_id, style } = body;

  if (!component_id) {
    return c.json({ error: 'component_id is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  try {
    // Resolve the component
    const manifest = await service.resolve(component_id);
    if (!manifest) {
      return c.json({ error: `Component not found: ${component_id}` }, 404);
    }

    // Get css_classes from metadata
    const cssClasses = manifest.metadata?.css_classes as string[] | undefined;
    if (!cssClasses || cssClasses.length === 0) {
      return c.json({
        error: 'Component has no css_classes in metadata. Regenerate with newer version.',
        component_id: manifest.id,
      }, 400);
    }

    console.log(`[CSSForComponent] Generating CSS for ${cssClasses.length} classes from ${manifest.id}`);

    // Generate CSS that matches
    const result = await generateCssForComponent(
      cssClasses,
      manifest.description,
      style,
      c.env
    );

    // Create as an asset
    const cssManifest = await service.create({
      name: `${manifest.canonical_name}-styles`,
      type: 'file',
      file_type: 'css',
      description: `CSS styles for ${manifest.description}`,
      content: result.content,
      mime_type: 'text/css',
      provenance: {
        ai_model: result.model,
        ai_provider: result.provider,
        source_type: 'ai_generated',
        generation_params: {
          component_id: manifest.id,
          css_classes: cssClasses,
          style,
        },
      },
      metadata: {
        for_component: manifest.id,
        classes_defined: result.classes_defined,
        variables_defined: result.variables_defined,
        keyframes_defined: result.keyframes_defined,
        lines: result.content.split('\n').length,
        characters: result.content.length,
      },
    });

    // Normalize classes_defined for comparison (already normalized in generation)
    const normalizedDefined = result.classes_defined ?? [];
    const missingClasses = cssClasses.filter(c => !normalizedDefined.includes(c));

    return c.json({
      id: cssManifest.id,
      canonical_name: cssManifest.canonical_name,
      version: cssManifest.version,
      url: cssManifest.content_url,
      content: result.content,
      for_component: manifest.id,
      classes_defined: normalizedDefined,
      classes_requested: cssClasses,
      missing_classes: missingClasses,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CSSForComponent] Error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/generate/image
 * Generate an image asset
 */
app.post('/image', async (c) => {
  const body = await c.req.json() as CreateImageRequest;
  const { prompt } = body;

  if (!prompt) {
    return c.json({ error: 'prompt is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  // Check cache first using hash
  const imageOptions = imageRequestToOptions(body);
  const hash = hashImageRequest(prompt, imageOptions);

  // TODO: Check if we already have this exact image cached
  // For now, always generate

  try {
    // Generate the image
    const result = await generateImage(prompt, imageOptions, c.env);

    // Create as an asset
    const manifest = await service.create({
      name: `image-${hash}`,
      type: 'asset',
      media_type: 'image',
      description: prompt,
      content: result.data,
      mime_type: result.mimeType,
      provenance: {
        ai_model: c.env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-exp',
        ai_provider: 'gemini',
        source_type: 'ai_generated',
        generation_params: {
          prompt,
          options: imageOptions,
        },
      },
      metadata: {
        width: result.width,
        height: result.height,
        style: imageOptions.style,
        transparent: imageOptions.transparent,
      },
    });

    return c.json({
      id: manifest.id,
      url: manifest.content_url,
      width: result.width,
      height: result.height,
      mimeType: result.mimeType,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[ImageGen] Error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * POST /api/generate/speech
 * Generate a speech asset
 */
app.post('/speech', async (c) => {
  const body = await c.req.json() as CreateSpeechRequest;
  const { text } = body;

  if (!text) {
    return c.json({ error: 'text is required' }, 400);
  }

  const baseUrl = new URL(c.req.url).origin;
  const service = new AssetService(c.env, baseUrl);

  // Check cache first using hash
  const speechOptions = speechRequestToOptions(body);
  const hash = hashSpeechRequest(text, speechOptions);

  // TODO: Check if we already have this exact speech cached
  // For now, always generate

  try {
    // Generate the speech
    const result = await generateSpeech(text, speechOptions, c.env);

    // Create as an asset
    const manifest = await service.create({
      name: `speech-${hash}`,
      type: 'asset',
      media_type: 'speech',
      description: text.slice(0, 200), // Use text as description (truncated)
      content: result.data,
      mime_type: result.mimeType,
      provenance: {
        ai_model: 'gpt-4o-mini-tts',
        ai_provider: 'openai',
        source_type: 'ai_generated',
        generation_params: {
          text,
          options: speechOptions,
        },
      },
      metadata: {
        format: result.format,
        voice: speechOptions.voice,
        speed: speechOptions.speed,
        instructions: speechOptions.instructions,
        text_length: text.length,
      },
    });

    return c.json({
      id: manifest.id,
      url: manifest.content_url,
      format: result.format,
      mimeType: result.mimeType,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SpeechGen] Error:', message);
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /api/generate/voices
 * List available TTS voices
 */
app.get('/voices', (c) => {
  const voices = AVAILABLE_VOICES.map((voice) => ({
    id: voice,
    description: VOICE_DESCRIPTIONS[voice],
  }));

  return c.json({ voices });
});

/**
 * GET /api/generate/formats
 * List available audio formats
 */
app.get('/formats', (c) => {
  return c.json({ formats: AVAILABLE_FORMATS });
});

export default app;
