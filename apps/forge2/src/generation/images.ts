/**
 * Image Generation
 *
 * Generates images using Google Gemini API with optional transparency.
 * Ported from Forge 1.0 and adapted for the unified asset model.
 */

import type { Env, CreateImageRequest, ImageReference } from '../types';
import { mergeWithMask } from './png';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

export type ImageStyle = 'illustration' | 'photo' | '3d' | 'pixel-art';
export type ImagePreset = 'icon' | 'hero' | 'sprite';

/** Fetched reference image with binary data */
export interface FetchedReference {
  data: ArrayBuffer;
  mimeType: string;
  use?: 'style' | 'structure' | 'both';
  description?: string;
}

export interface ImageOptions {
  width?: number;
  height?: number;
  transparent?: boolean;
  style?: ImageStyle;
  preset?: ImagePreset;
  /** Reference images for style/structure matching */
  references?: ImageReference[];
  /** Things to avoid (added as DON'T section in prompt) */
  negativePrompt?: string;
}

export interface GeneratedImage {
  data: ArrayBuffer;
  mimeType: string;
  width: number;
  height: number;
}

// Preset configurations
const PRESETS: Record<ImagePreset, Partial<ImageOptions>> = {
  icon: { width: 512, height: 512, transparent: true, style: 'illustration' },
  hero: { width: 1920, height: 1080, transparent: false, style: 'photo' },
  sprite: { width: 64, height: 64, transparent: true, style: 'pixel-art' },
};

/** Resolved options with required base fields */
type ResolvedOptions = Required<Omit<ImageOptions, 'preset' | 'references' | 'negativePrompt'>>;

/**
 * Resolve options with preset and defaults applied
 */
function resolveOptions(options: ImageOptions = {}): ResolvedOptions {
  let resolved: ResolvedOptions = {
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

/**
 * Build style-specific prompt additions
 */
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

/**
 * Build reference image descriptions for the prompt
 */
function buildReferenceDescriptions(references: FetchedReference[]): string {
  if (references.length === 0) return '';

  const lines: string[] = ['Reference images provided:'];

  for (let i = 0; i < references.length; i++) {
    const ref = references[i]!;
    const useType = ref.use || 'reference';
    const desc = ref.description || `Image ${i + 1}`;

    if (useType === 'style') {
      lines.push(`- Style reference (Image ${i + 1}): ${desc}. Match the visual style, colors, and character design from this image.`);
    } else if (useType === 'structure') {
      lines.push(`- Structure reference (Image ${i + 1}): ${desc}. Match the exact pose, body position, and composition from this image.`);
    } else if (useType === 'both') {
      lines.push(`- Style & structure reference (Image ${i + 1}): ${desc}. Match both the visual style AND the pose/composition from this image.`);
    } else {
      lines.push(`- Reference (Image ${i + 1}): ${desc}`);
    }
  }

  return lines.join('\n');
}

/**
 * Build the full prompt for image generation
 */
function buildPrompt(
  userPrompt: string,
  options: ResolvedOptions,
  references: FetchedReference[] = [],
  negativePrompt?: string
): string {
  const styleHint = getStylePrompt(options.style);
  // When transparency is requested, ask for a clean solid background
  // Do NOT mention "transparent" or "alpha" - Gemini renders checkerboard patterns
  const bgHint = options.transparent
    ? 'Place the subject on a clean, solid black background. The subject should be clearly isolated from the background.'
    : '';
  const sizeHint = `Output dimensions: ${options.width}x${options.height} pixels.`;

  // Build reference descriptions
  const refDescriptions = buildReferenceDescriptions(references);

  // Build DON'T section for negative prompts
  const dontSection = negativePrompt
    ? `\nDON'T:\n- ${negativePrompt.split(',').map(s => s.trim()).join('\n- ')}`
    : '';

  return `Create an image: ${userPrompt}

Style: ${styleHint}
${bgHint}
${sizeHint}
${refDescriptions}

Requirements:
- High quality, detailed output
- Clean, professional appearance
- Centered composition
- No text or watermarks unless specifically requested${dontSection}`;
}

/**
 * Fetch reference images from URLs
 */
async function fetchReferenceImages(
  references: ImageReference[]
): Promise<FetchedReference[]> {
  const fetched: FetchedReference[] = [];

  for (const ref of references) {
    try {
      console.log(`[ImageGen] Fetching reference: ${ref.url}`);
      const response = await fetch(ref.url);

      if (!response.ok) {
        console.warn(`[ImageGen] Failed to fetch reference ${ref.url}: ${response.status}`);
        continue;
      }

      const contentType = response.headers.get('content-type') || 'image/png';
      const data = await response.arrayBuffer();

      fetched.push({
        data,
        mimeType: contentType,
        use: ref.use,
        description: ref.description,
      });

      console.log(`[ImageGen] Fetched reference: ${data.byteLength} bytes, type: ${contentType}`);
    } catch (error) {
      console.warn(`[ImageGen] Error fetching reference ${ref.url}:`, error);
    }
  }

  return fetched;
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Generate an image using Gemini
 */
export async function generateImage(
  prompt: string,
  options: ImageOptions,
  env: Env
): Promise<GeneratedImage> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const resolved = resolveOptions(options);

  // Fetch reference images if provided
  const fetchedRefs = options.references?.length
    ? await fetchReferenceImages(options.references)
    : [];

  const fullPrompt = buildPrompt(prompt, resolved, fetchedRefs, options.negativePrompt);
  const model = env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

  const url = `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  console.log(`[ImageGen] Generating ${resolved.width}x${resolved.height} ${resolved.style} image`);
  console.log(`[ImageGen] Prompt: ${prompt.slice(0, 100)}...`);
  if (fetchedRefs.length > 0) {
    console.log(`[ImageGen] Including ${fetchedRefs.length} reference image(s)`);
  }

  // Build the parts array: reference images first, then the text prompt
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  // Add reference images as inline data
  for (const ref of fetchedRefs) {
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: arrayBufferToBase64(ref.data),
      },
    });
  }

  // Add the text prompt
  parts.push({ text: fullPrompt });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
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
    console.log('[ImageGen] Transparency requested, generating mask...');
    console.log(`[ImageGen] Image size: ${bytes.length} bytes, mimeType: ${imagePart.inlineData.mimeType}`);
    try {
      const maskResult = await generateMask(bytes.buffer as ArrayBuffer, imagePart.inlineData.mimeType, env);
      console.log(`[ImageGen] Generated mask: ${maskResult.data.byteLength} bytes`);

      // Merge image RGB with mask alpha
      const mergedPng = await mergeWithMask(bytes.buffer as ArrayBuffer, maskResult.data);
      console.log(`[ImageGen] Merged with mask: ${mergedPng.length} bytes`);

      return {
        data: mergedPng.buffer as ArrayBuffer,
        mimeType: 'image/png',
        width: resolved.width,
        height: resolved.height,
      };
    } catch (maskError) {
      const errMsg = maskError instanceof Error ? maskError.message : String(maskError);
      console.error('[ImageGen] Mask generation failed:', errMsg);
      console.error('[ImageGen] Full error:', JSON.stringify(maskError, Object.getOwnPropertyNames(maskError as object)));
      // Fall through to return original image
    }
  }

  return {
    data: bytes.buffer as ArrayBuffer,
    mimeType: imagePart.inlineData.mimeType,
    width: resolved.width,
    height: resolved.height,
  };
}

/**
 * Generate alpha mask from an image
 */
async function generateMask(
  imageData: ArrayBuffer,
  mimeType: string,
  env: Env
): Promise<{ data: ArrayBuffer; mimeType: string }> {
  const model = env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const url = `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  // Convert image to base64
  const bytes = new Uint8Array(imageData);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
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
    data: maskBytes.buffer as ArrayBuffer,
    mimeType: maskPart.inlineData.mimeType,
  };
}

/**
 * Generate a deterministic hash for caching
 */
export function hashImageRequest(prompt: string, options: ImageOptions): string {
  const resolved = resolveOptions(options);

  // Include reference URLs in the hash (sorted for consistency)
  const refUrls = options.references
    ?.map((r) => `${r.url}:${r.use || 'ref'}`)
    .sort()
    .join('|') || '';

  const input = JSON.stringify({
    prompt: prompt.toLowerCase().trim(),
    width: resolved.width,
    height: resolved.height,
    transparent: resolved.transparent,
    style: resolved.style,
    refs: refUrls,
    neg: options.negativePrompt?.toLowerCase().trim() || '',
  });

  // djb2 hash function
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
  }
  return Math.abs(hash).toString(16).padStart(12, '0').slice(0, 12);
}

/**
 * Convert API request to internal options
 */
export function requestToOptions(request: CreateImageRequest): ImageOptions {
  return {
    width: request.options?.width,
    height: request.options?.height,
    style: request.options?.style,
    transparent: request.options?.transparent,
    preset: request.options?.preset,
    references: request.options?.references,
    negativePrompt: request.options?.negativePrompt,
  };
}
