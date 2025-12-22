// Gemini image generation for sprite sheets
import type { Env } from '../types';
import { generateGridTemplate } from './template';
import { mergeWithMask } from './png';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

interface GenerateOptions {
  theme: string;
  category: string;
  gridSize: number;
  cellSize: number;
  style: string;
  customPrompt?: string;
  customNotes?: string; // Additional instructions appended to the prompt
  rowLabels?: string[];
  useTemplate?: boolean; // Enable template grounding
}

interface GenerateResult {
  imageData: ArrayBuffer;
  mimeType: string;
  prompt: string;
  maskData?: ArrayBuffer;
  maskMimeType?: string;
}

// Build prompt based on category
function buildPrompt(opts: GenerateOptions): string {
  if (opts.customPrompt) {
    return opts.customPrompt;
  }

  const { theme, category, gridSize, cellSize, style, rowLabels, useTemplate, customNotes } = opts;
  const totalSize = gridSize * cellSize;

  // Template-grounded prompt prefix
  const templatePrefix = useTemplate
    ? `I'm providing a template image showing a ${gridSize}x${gridSize} grid with dark gray lines marking exact cell boundaries.
CRITICAL REQUIREMENTS:
- Fill ONLY the black areas inside each cell with the requested content
- Do NOT modify, remove, or paint over the gray grid lines
- Keep the pure black (#000000) background in any unfilled areas
- Each item must be FULLY CONTAINED within its cell boundaries
- NO elements should cross cell boundaries or touch the grid lines

`
    : '';

  // Custom notes suffix
  const notesSuffix = customNotes ? `\n\nAdditional instructions: ${customNotes}` : '';

  let basePrompt: string;

  switch (category) {
    case 'avatar':
      const rows = rowLabels || ['head shapes', 'pairs of eyes', 'mouths or accessories'];
      const rowDescs = rows.slice(0, gridSize).map((label, i) => `Row ${i + 1}: ${gridSize} different ${label}.`).join('\n');

      basePrompt = `${templatePrefix}Create a modular ${theme} avatar asset sheet.
${useTemplate ? 'Using the provided grid template, f' : 'F'}ill each cell with the following:
${rowDescs}
Total size: ${totalSize}x${totalSize} pixels, each cell ${cellSize}x${cellSize} pixels.
Style: ${style}. Clean lines, high contrast, no textures, no gradients, no shadows.
Background must remain pure black (#000000). Each item centered within its cell.`;
      break;

    case 'tileset':
      basePrompt = `${templatePrefix}Create a seamless 2D tileset for a ${theme} game environment.
${useTemplate ? 'Using the provided grid template, f' : 'F'}ill each cell with tiles.
${gridSize}x${gridSize} grid, ${totalSize}x${totalSize} pixels total, each tile ${cellSize}x${cellSize} pixels.
Include: ground tiles, wall tiles, corner pieces, decorative elements.
Style: ${style}. Background must be pure black (#000000). No shadows or noise.`;
      break;

    case 'particles':
      basePrompt = `${templatePrefix}Create particle effects for ${theme} visual effects.
${useTemplate ? 'Using the provided grid template, f' : 'F'}ill each cell with one particle effect.
${gridSize}x${gridSize} grid, ${totalSize}x${totalSize} pixels total, each cell ${cellSize}x${cellSize} pixels.
Include: explosions, sparks, smoke puffs, energy bursts, impact flashes.
Style: ${style}. High contrast, vibrant colors. Background must be pure black (#000000).`;
      break;

    case 'ships':
      basePrompt = `${templatePrefix}Create ${theme} spacecraft/vehicle designs.
${useTemplate ? 'Using the provided grid template, f' : 'F'}ill each cell with one centered vehicle.
${gridSize}x${gridSize} grid, ${totalSize}x${totalSize} pixels total, each cell ${cellSize}x${cellSize} pixels.
Include variety: fighters, transports, cruisers, unique designs.
Style: ${style}. Top-down or 3/4 view. Background must be pure black (#000000).`;
      break;

    case 'weapons':
      basePrompt = `${templatePrefix}Create ${theme} weapon designs.
${useTemplate ? 'Using the provided grid template, f' : 'F'}ill each cell with one centered weapon.
${gridSize}x${gridSize} grid, ${totalSize}x${totalSize} pixels total, each cell ${cellSize}x${cellSize} pixels.
Include variety: melee weapons, ranged weapons, magical items.
Style: ${style}. Side view, clear shapes. Background must be pure black (#000000).`;
      break;

    case 'badges':
      basePrompt = `${templatePrefix}Create achievement badges for a ${theme} platform.
${useTemplate ? 'Using the provided grid template, f' : 'F'}ill each cell with one centered badge.
${gridSize}x${gridSize} grid, ${totalSize}x${totalSize} pixels total, each cell ${cellSize}x${cellSize} pixels.
Include variety: bronze, silver, gold tiers with different icons.
Style: ${style}. Clean iconography. Background must be pure black (#000000).`;
      break;

    case 'badges_colorful':
      basePrompt = `${templatePrefix}Create colorful achievement badges for a ${theme} platform.
${useTemplate ? 'Using the provided grid template, f' : 'F'}ill each cell with one centered badge.
${gridSize}x${gridSize} grid, ${totalSize}x${totalSize} pixels total, each cell ${cellSize}x${cellSize} pixels.
Use a vibrant rainbow palette - each badge should be a DIFFERENT color: red, orange, yellow, green, blue, purple, pink, teal, etc.
Include variety of icons and shapes. NO gold or metallic colors - pure vibrant hues only.
Style: ${style}. Clean iconography. Background must be pure black (#000000).`;
      break;

    default:
      basePrompt = `${templatePrefix}Create ${theme} game assets.
${useTemplate ? 'Using the provided grid template, f' : 'F'}ill each cell with one centered item.
${gridSize}x${gridSize} grid, ${totalSize}x${totalSize} pixels total, each cell ${cellSize}x${cellSize} pixels.
Style: ${style}. Background must be pure black (#000000).`;
  }

  return basePrompt + notesSuffix;
}

export async function generateSpriteSheet(
  opts: GenerateOptions,
  env: Env
): Promise<GenerateResult> {
  // Default to using template for better consistency
  const useTemplate = opts.useTemplate !== false;
  const optsWithTemplate = { ...opts, useTemplate };

  const prompt = buildPrompt(optsWithTemplate);
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash-image';

  const url = `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  console.log(`[Gemini] Generating ${opts.gridSize}x${opts.gridSize} ${opts.category} sheet for theme: ${opts.theme} (template: ${useTemplate})`);

  // Build request parts
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // If using template, generate and include it first
  if (useTemplate) {
    const template = generateGridTemplate({
      gridSize: opts.gridSize,
      cellSize: opts.cellSize,
      lineColor: { r: 50, g: 50, b: 50 }, // Subtle gray lines
      lineWidth: 3,
    });

    console.log(`[Gemini] Generated template image: ${template.data.length} bytes`);

    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: template.base64,
      },
    });
  }

  // Add the text prompt
  parts.push({ text: prompt });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[Gemini] API error: ${response.status} - ${errText}`);
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
    console.error('[Gemini] No image in response:', JSON.stringify(data).slice(0, 500));
    throw new Error('No image generated');
  }

  // Decode base64 to ArrayBuffer
  const base64 = imagePart.inlineData.data;
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  console.log(`[Gemini] Generated image: ${bytes.length} bytes, type: ${imagePart.inlineData.mimeType}`);

  // Generate mask from the sprite sheet
  let maskData: ArrayBuffer | undefined;
  let maskMimeType: string | undefined;
  let finalImageData: ArrayBuffer = bytes.buffer;
  let finalMimeType: string = imagePart.inlineData.mimeType;

  try {
    const maskResult = await generateMask(bytes.buffer, imagePart.inlineData.mimeType, env);
    maskData = maskResult.imageData;
    maskMimeType = maskResult.mimeType;
    console.log(`[Gemini] Generated mask: ${maskData.byteLength} bytes`);

    // Merge sprite with mask to create RGBA PNG with baked-in alpha
    try {
      const mergedPng = await mergeWithMask(bytes.buffer, maskData, opts.gridSize);
      finalImageData = mergedPng.buffer.slice(0) as ArrayBuffer;
      finalMimeType = 'image/png';
      console.log(`[Gemini] Merged sprite with mask: ${mergedPng.length} bytes`);
    } catch (mergeErr) {
      console.error('[Gemini] Merge failed, using original sprite:', mergeErr);
    }
  } catch (err) {
    console.error('[Gemini] Mask generation failed:', err);
    // Continue without mask - it's optional
  }

  return {
    imageData: finalImageData,
    mimeType: finalMimeType,
    prompt,
    maskData,
    maskMimeType,
  };
}

// Generate alpha mask from sprite sheet
async function generateMask(
  imageData: ArrayBuffer,
  mimeType: string,
  env: Env
): Promise<{ imageData: ArrayBuffer; mimeType: string }> {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash-image';
  const url = `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  // Convert image to base64
  const bytes = new Uint8Array(imageData);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const imageBase64 = btoa(binary);

  const maskPrompt = `Create a transparency mask for this sprite sheet. Each distinct object or component should be filled with white for solid areas. Transparent areas should be black. Use grayscale for alpha-blend. No colors.`;

  console.log(`[Gemini Mask] Sending request with image (${imageBase64.length} chars base64)`);

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
        responseModalities: ['IMAGE'],  // Only request image output
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
  console.log(`[Gemini Mask] Response has ${parts.length} parts`);

  // Log what types of parts we got
  parts.forEach((p, i) => {
    if (p.inlineData) {
      console.log(`[Gemini Mask] Part ${i}: image (${p.inlineData.data.length} chars)`);
    } else if (p.text) {
      console.log(`[Gemini Mask] Part ${i}: text ("${p.text.slice(0, 100)}...")`);
    }
  });

  const imagePart = parts.find(p => p.inlineData);

  if (!imagePart?.inlineData) {
    throw new Error('No mask image in response');
  }

  const maskBase64 = imagePart.inlineData.data;

  // Check if the mask is different from input
  if (maskBase64 === imageBase64) {
    console.warn('[Gemini Mask] WARNING: Output image is identical to input!');
  } else {
    console.log(`[Gemini Mask] Output image differs from input (${maskBase64.length} vs ${imageBase64.length} chars)`);
  }
  const maskBinary = atob(maskBase64);
  const maskBytes = new Uint8Array(maskBinary.length);
  for (let i = 0; i < maskBinary.length; i++) {
    maskBytes[i] = maskBinary.charCodeAt(i);
  }

  return {
    imageData: maskBytes.buffer,
    mimeType: imagePart.inlineData.mimeType,
  };
}
