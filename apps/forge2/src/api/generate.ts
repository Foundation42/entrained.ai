/**
 * Generation API Routes
 *
 * Endpoints for generating images and speech, integrated with the asset system.
 * Generated media are stored as versioned assets like everything else.
 */

import { Hono } from 'hono';
import type { Env, CreateImageRequest, CreateSpeechRequest } from '../types';
import { AssetService } from '../services/assets';
import {
  generateImage,
  hashImageRequest,
  imageRequestToOptions,
  generateSpeech,
  hashSpeechRequest,
  speechRequestToOptions,
  VOICE_DESCRIPTIONS,
  AVAILABLE_VOICES,
  AVAILABLE_FORMATS,
} from '../generation';

const app = new Hono<{ Bindings: Env }>();

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
