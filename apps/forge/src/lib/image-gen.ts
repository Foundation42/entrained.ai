// Image generation using Google Gemini
// Ported and adapted from apps/sprites/src/lib/gemini.ts

import type { Env, ImageOptions, ImageStyle } from '../types';
import { mergeWithMask } from './png';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

interface GenerateImageResult {
  imageData: ArrayBuffer;
  mimeType: string;
  width: number;
  height: number;
}

// Apply preset if specified, then apply individual options
function resolveOptions(options: ImageOptions = {}): Required<Omit<ImageOptions, 'preset'>> {
  // Import the presets constant
  const PRESETS: Record<string, Partial<ImageOptions>> = {
    icon: { width: 512, height: 512, transparent: true, style: 'illustration' },
    hero: { width: 1920, height: 1080, transparent: false, style: 'photo' },
    sprite: { width: 64, height: 64, transparent: true, style: 'pixel-art' },
  };

  // Start with defaults
  let resolved: Required<Omit<ImageOptions, 'preset'>> = {
    width: 512,
    height: 512,
    transparent: false,
    style: 'illustration',
  };

  // Apply preset if specified
  if (options.preset && PRESETS[options.preset]) {
    resolved = { ...resolved, ...PRESETS[options.preset] };
  }

  // Apply individual options (override preset)
  if (options.width !== undefined) resolved.width = options.width;
  if (options.height !== undefined) resolved.height = options.height;
  if (options.transparent !== undefined) resolved.transparent = options.transparent;
  if (options.style !== undefined) resolved.style = options.style;

  return resolved;
}

// Build style-specific prompt additions
function getStylePrompt(style: ImageStyle): string {
  switch (style) {
    case 'illustration':
      return 'digital illustration style, clean lines, vibrant colors, modern vector art aesthetic';
    case 'photo':
      return 'photorealistic, high quality photograph, professional lighting, detailed';
    case '3d':
      return '3D rendered, soft lighting, smooth surfaces, modern 3D art style';
    case 'pixel-art':
      return 'pixel art style, limited color palette, crisp pixels, retro game aesthetic';
    default:
      return 'high quality digital art';
  }
}

// Build the full prompt for image generation
function buildPrompt(userPrompt: string, options: Required<Omit<ImageOptions, 'preset'>>): string {
  const styleHint = getStylePrompt(options.style);
  // When transparency is requested, ask for a clean solid background (we'll mask it out later)
  // Do NOT mention "transparent" or "alpha" - Gemini will render checkerboard patterns
  const bgHint = options.transparent
    ? 'Place the subject on a clean, solid black background. The subject should be clearly isolated from the background.'
    : '';
  const sizeHint = `Output dimensions: ${options.width}x${options.height} pixels.`;

  return `Create an image: ${userPrompt}

Style: ${styleHint}
${bgHint}
${sizeHint}

Requirements:
- High quality, detailed output
- Clean, professional appearance
- Centered composition
- No text or watermarks unless specifically requested`;
}

export async function generateImage(
  prompt: string,
  options: ImageOptions,
  env: Env
): Promise<GenerateImageResult> {
  const resolved = resolveOptions(options);
  const fullPrompt = buildPrompt(prompt, resolved);
  // Use dedicated image model (not the code generation model)
  const model = env.GEMINI_IMAGE_MODEL || 'gemini-2.0-flash-exp';

  const url = `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  console.log(`[ImageGen] Generating ${resolved.width}x${resolved.height} ${resolved.style} image`);
  console.log(`[ImageGen] Prompt: ${prompt.slice(0, 100)}...`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[ImageGen] API error: ${response.status} - ${errText}`);
    throw new Error(`Gemini API error: ${response.status} - ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: {
            mimeType: string;
            data: string;
          };
        }>;
      };
    }>;
  };

  // Find the image part in the response
  const responseParts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = responseParts.find(p => p.inlineData);

  if (!imagePart?.inlineData) {
    console.error('[ImageGen] No image in response:', JSON.stringify(data).slice(0, 500));
    throw new Error('No image generated');
  }

  // Decode base64 to ArrayBuffer
  const base64 = imagePart.inlineData.data;
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  console.log(`[ImageGen] Generated image: ${bytes.length} bytes, type: ${imagePart.inlineData.mimeType}`);

  // If transparency requested, generate a mask and merge
  if (resolved.transparent) {
    console.log('[ImageGen] Generating transparency mask...');
    try {
      const maskResult = await generateMask(bytes.buffer, imagePart.inlineData.mimeType, env);
      console.log(`[ImageGen] Generated mask: ${maskResult.imageData.byteLength} bytes`);

      // Merge image RGB with mask alpha
      const mergedPng = await mergeWithMask(bytes.buffer, maskResult.imageData);
      console.log(`[ImageGen] Merged with mask: ${mergedPng.length} bytes`);

      return {
        imageData: mergedPng.buffer as ArrayBuffer,
        mimeType: 'image/png',
        width: resolved.width,
        height: resolved.height,
      };
    } catch (maskError) {
      console.warn('[ImageGen] Mask generation failed, returning image without transparency:', maskError);
      // Fall through to return original image
    }
  }

  return {
    imageData: bytes.buffer,
    mimeType: imagePart.inlineData.mimeType,
    width: resolved.width,
    height: resolved.height,
  };
}

// Generate alpha mask from an image
async function generateMask(
  imageData: ArrayBuffer,
  mimeType: string,
  env: Env
): Promise<{ imageData: ArrayBuffer; mimeType: string }> {
  const model = env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const url = `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  // Convert image to base64
  const bytes = new Uint8Array(imageData);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const imageBase64 = btoa(binary);

  const maskPrompt = `Create a transparency mask for this image. The main subject/object should be filled with white (opaque). The background should be black (transparent). Use grayscale only for anti-aliased edges. Output a black and white mask image.`;

  console.log(`[ImageGen] Mask request: ${imageBase64.length} chars base64`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType,
              data: imageBase64,
            },
          },
          { text: maskPrompt },
        ],
      }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Mask generation failed: ${response.status} - ${errText.slice(0, 200)}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          inlineData?: {
            mimeType: string;
            data: string;
          };
        }>;
      };
    }>;
  };

  const parts = data.candidates?.[0]?.content?.parts || [];
  const maskPart = parts.find(p => p.inlineData);

  if (!maskPart?.inlineData) {
    throw new Error('No mask image in response');
  }

  const maskBase64 = maskPart.inlineData.data;
  const maskBinary = atob(maskBase64);
  const maskBytes = new Uint8Array(maskBinary.length);
  for (let i = 0; i < maskBinary.length; i++) {
    maskBytes[i] = maskBinary.charCodeAt(i);
  }

  return {
    imageData: maskBytes.buffer,
    mimeType: maskPart.inlineData.mimeType,
  };
}

// Generate a deterministic hash for caching
export function hashImageRequest(prompt: string, options: ImageOptions): string {
  const resolved = resolveOptions(options);
  const input = JSON.stringify({
    prompt: prompt.toLowerCase().trim(),
    width: resolved.width,
    height: resolved.height,
    transparent: resolved.transparent,
    style: resolved.style,
  });

  // Simple hash function (djb2)
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
  }
  // Convert to hex and take 12 chars
  return Math.abs(hash).toString(16).padStart(12, '0').slice(0, 12);
}
