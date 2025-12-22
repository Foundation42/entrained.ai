// Provider-agnostic AI evaluation service
import type { ContentEvaluation, EvaluationFlag, ProfileStats, Env } from '../types';
import { nanoid } from 'nanoid';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const IMAGE_MODEL = 'gemini-2.5-flash-image';  // Model that supports image generation

interface EvaluationContext {
  parentContent?: string;
  threadSummary?: string;
  communityCriteria?: string;
  userHistorySummary?: string;
}

interface RawEvaluationResult {
  scores: {
    good_faith: number;
    substantive: number;
    charitable: number;
    source_quality: number;
  };
  flags: EvaluationFlag[];
  suggestions: string[];
  reasoning: string;
}

// Build the evaluation prompt
function buildEvaluationPrompt(
  content: string,
  context: EvaluationContext
): string {
  return `You are evaluating a comment for discourse quality on a debate platform.

Your role is to assess whether the comment engages in good faith, not whether you agree with its position.

COMMENT TO EVALUATE:
"""
${content}
"""

${context.parentContent ? `PARENT COMMENT (if replying):
"""
${context.parentContent}
"""` : ''}

${context.threadSummary ? `THREAD CONTEXT:
${context.threadSummary}` : ''}

${context.communityCriteria ? `COMMUNITY EVALUATION CRITERIA:
${context.communityCriteria}` : ''}

${context.userHistorySummary ? `USER'S RECENT BEHAVIOR:
${context.userHistorySummary}` : ''}

Evaluate on these dimensions (0-100):

1. GOOD FAITH (0-100)
   - Is this genuinely engaging with ideas vs. trolling/baiting?
   - Does it assume best intentions of others?
   - Is the tone conducive to productive discussion?

2. SUBSTANTIVE (0-100)
   - Does it add new information or perspective?
   - Is there meaningful analysis or reasoning?
   - Or is it just restating known positions?

3. CHARITABLE (0-100)
   - Does it represent opposing views accurately?
   - Does it engage with the strongest version of counterarguments?
   - Or does it strawman/misrepresent?

4. SOURCE QUALITY (0-100)
   - Are factual claims backed by credible sources?
   - Are sources appropriate for the claims made?
   - Is there proper attribution?

Look for these RED FLAGS:
- Strawman arguments (misrepresenting opponent's position)
- Ad hominem attacks (attacking person not argument)
- Unsourced factual claims (stating facts without evidence)
- Misrepresentation (twisting parent's words)
- Inflammatory language (designed to provoke not persuade)

Return JSON in this exact format:
{
  "scores": {
    "good_faith": <number 0-100>,
    "substantive": <number 0-100>,
    "charitable": <number 0-100>,
    "source_quality": <number 0-100>
  },
  "flags": [
    {
      "type": "strawman" | "ad_hominem" | "unsourced_claim" | "misrepresentation" | "inflammatory",
      "severity": "info" | "warning" | "critical",
      "explanation": "<specific explanation>",
      "quote": "<exact text that triggered this>"
    }
  ],
  "suggestions": [
    "<constructive suggestion for improvement>"
  ],
  "reasoning": "<brief explanation of scores>"
}

Remember: You can score low on good faith while disagreeing with popular opinion. Someone arguing an unpopular position with evidence and charity should score HIGHLY.`;
}

// Call Gemini API
async function callGemini(
  prompt: string,
  apiKey: string,
  model: string
): Promise<string> {
  const url = `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error('No content in Gemini response');
  }

  return content;
}

// Main evaluation function
export async function evaluateContent(
  content: string,
  contentType: 'post' | 'comment',
  context: EvaluationContext,
  env: Env
): Promise<ContentEvaluation> {
  const prompt = buildEvaluationPrompt(content, context);

  const rawResult = await callGemini(
    prompt,
    env.GEMINI_API_KEY,
    env.AI_MODEL
  );

  let parsed: RawEvaluationResult;
  try {
    parsed = JSON.parse(rawResult);
  } catch (e) {
    throw new Error(`Failed to parse AI response: ${e}`);
  }

  // Validate and clamp scores
  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  const evaluation: ContentEvaluation = {
    id: nanoid(),
    content_id: '', // Will be set by caller
    content_type: contentType,
    evaluated_at: Date.now(),
    model_version: env.AI_MODEL,
    scores: {
      good_faith: clamp(parsed.scores?.good_faith ?? 50),
      substantive: clamp(parsed.scores?.substantive ?? 50),
      charitable: clamp(parsed.scores?.charitable ?? 50),
      source_quality: clamp(parsed.scores?.source_quality ?? 50),
    },
    flags: parsed.flags ?? [],
    suggestions: parsed.suggestions ?? [],
    reasoning: parsed.reasoning ?? ''
  };

  return evaluation;
}

// Calculate stat impact from evaluation
export function calculateStatImpact(
  evaluation: ContentEvaluation,
  profileStats: ProfileStats
): {
  cloakQuotaDelta: number;
  statChanges: Partial<ProfileStats>;
} {
  const { scores } = evaluation;

  // Compare to user's current stats - 5% weight per comment
  const deltas = {
    good_faith: (scores.good_faith - profileStats.good_faith) * 0.05,
    substantive: (scores.substantive - profileStats.substantive) * 0.05,
    charitable: (scores.charitable - profileStats.charitable) * 0.05,
    source_quality: (scores.source_quality - profileStats.source_quality) * 0.05,
  };

  // Cloak quota impact (more severe for bad faith)
  let quotaDelta = 0;
  if (scores.good_faith < 30) quotaDelta = -10;
  else if (scores.good_faith < 50) quotaDelta = -5;
  else if (scores.good_faith > 80) quotaDelta = +2;

  // Critical flags have additional penalty
  const criticalCount = evaluation.flags.filter(f => f.severity === 'critical').length;
  quotaDelta -= criticalCount * 5;

  return {
    cloakQuotaDelta: quotaDelta,
    statChanges: deltas
  };
}

// Generate URL slug from community name/description
export async function generateCommunitySlug(
  displayName: string,
  description: string | undefined,
  env: Env
): Promise<string> {
  const prompt = `Generate a URL-friendly slug for this community:

DISPLAY NAME: "${displayName}"
DESCRIPTION: "${description || '(none)'}"

Requirements:
- 3-50 characters
- Only lowercase letters, numbers, and hyphens
- No leading/trailing hyphens
- Should be memorable and relevant to the community topic
- Prefer shorter slugs when possible (under 25 chars ideal)

Return ONLY the slug, nothing else. Example outputs:
- "ai-research"
- "book-club"
- "python-beginners"
- "cooking-tips"`;

  try {
    const rawResult = await callGemini(prompt, env.GEMINI_API_KEY, env.AI_MODEL);
    // Clean up the result - remove quotes, whitespace, ensure valid format
    let slug = rawResult.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');

    // Ensure length constraints
    if (slug.length < 3) {
      slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
    }
    if (slug.length > 50) {
      slug = slug.slice(0, 50).replace(/-+$/, '');
    }

    return slug || 'community';
  } catch (e) {
    // Fallback: generate from display name directly
    console.error('[SlugGen] AI failed, using fallback:', e);
    return displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'community';
  }
}

// Community creation moderation check
export async function evaluateCommunityCreation(
  name: string,
  displayName: string,
  description: string | undefined,
  env: Env
): Promise<{
  approved: boolean;
  reason?: string;
  suggestions?: string[];
}> {
  const prompt = `You are a content moderator for a family-friendly discussion platform.

Evaluate this community creation request:

COMMUNITY NAME (URL slug): "${name}"
DISPLAY NAME: "${displayName}"
DESCRIPTION: "${description || '(no description provided)'}"

Check for:
1. Profanity, slurs, or offensive language (including disguised/leetspeak versions)
2. Sexual or adult content references
3. Hate speech or discrimination
4. Violence or harmful content promotion
5. Spam or scam indicators
6. Impersonation of official entities

Return JSON in this exact format:
{
  "approved": true/false,
  "reason": "<if rejected, explain why briefly>",
  "suggestions": ["<if rejected, suggest how to fix>"]
}

Be strict about keeping the platform family-friendly, but don't reject legitimate communities.
Examples that should be APPROVED: "gardening-club", "Learn Python", "Book Lovers"
Examples that should be REJECTED: anything with profanity, slurs, sexual references, hate speech`;

  const rawResult = await callGemini(prompt, env.GEMINI_API_KEY, env.AI_MODEL);

  try {
    const parsed = JSON.parse(rawResult) as {
      approved: boolean;
      reason?: string;
      suggestions?: string[];
    };
    return {
      approved: parsed.approved ?? false,
      reason: parsed.reason,
      suggestions: parsed.suggestions
    };
  } catch (e) {
    // If parsing fails, reject to be safe
    console.error('[CommunityModeration] Failed to parse AI response:', e);
    return {
      approved: false,
      reason: 'Unable to verify content safety. Please try again.',
    };
  }
}

// Pre-submit check (evaluate before posting)
export async function preSubmitCheck(
  content: string,
  contentType: 'post' | 'comment',
  context: EvaluationContext,
  profileStats: ProfileStats,
  env: Env
): Promise<{
  evaluation: ContentEvaluation;
  canSubmit: boolean;
  warnings: EvaluationFlag[];
  suggestions: string[];
  predictedImpact: {
    cloakQuotaDelta: number;
    statChanges: Partial<ProfileStats>;
  };
}> {
  const evaluation = await evaluateContent(content, contentType, context, env);
  const impact = calculateStatImpact(evaluation, profileStats);

  const criticalFlags = evaluation.flags.filter(f => f.severity === 'critical');

  return {
    evaluation,
    canSubmit: true, // Always allow, but warn
    warnings: criticalFlags,
    suggestions: evaluation.suggestions,
    predictedImpact: impact
  };
}

// Generate community image using Gemini
export async function generateCommunityImage(
  displayName: string,
  description: string | undefined,
  env: Env
): Promise<{ imageData: ArrayBuffer; mimeType: string }> {
  const model = env.GEMINI_IMAGE_MODEL || IMAGE_MODEL;
  const url = `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const prompt = `Create a simple, iconic logo/emblem for a community called "${displayName}".
${description ? `The community is about: ${description}` : ''}

Requirements:
- Create a single centered icon or emblem (256x256 pixels)
- Use a minimalist, clean design style
- The background MUST be pure black (#000000) - this is critical for transparency
- Use vibrant colors for the icon itself
- No text or letters in the image
- Simple shapes, easily recognizable
- Style: flat vector, modern, clean lines`;

  console.log(`[CommunityImage] Generating image for: ${displayName}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[CommunityImage] API error: ${response.status} - ${errText}`);
    throw new Error(`Image generation failed: ${response.status}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType: string; data: string };
        }>;
      };
    }>;
  };

  const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!imagePart?.inlineData) {
    throw new Error('No image in response');
  }

  // Decode base64
  const base64 = imagePart.inlineData.data;
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  console.log(`[CommunityImage] Generated: ${bytes.length} bytes`);

  // Now generate a mask for transparency
  const maskResult = await generateImageMask(bytes.buffer, imagePart.inlineData.mimeType, env);

  // Simple alpha merge: where mask is white = opaque, black = transparent
  // For now, return the original image - we can enhance with proper PNG alpha later
  return {
    imageData: bytes.buffer,
    mimeType: imagePart.inlineData.mimeType,
  };
}

// Generate alpha mask from image
async function generateImageMask(
  imageData: ArrayBuffer,
  mimeType: string,
  env: Env
): Promise<{ imageData: ArrayBuffer; mimeType: string }> {
  const model = env.GEMINI_IMAGE_MODEL || IMAGE_MODEL;
  const url = `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const bytes = new Uint8Array(imageData);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const imageBase64 = btoa(binary);

  const maskPrompt = `Create a transparency mask for this icon. The icon/logo should be white (opaque). The black background should remain black (transparent). Output a grayscale mask image.`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: maskPrompt },
        ],
      }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Mask generation failed: ${response.status}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { mimeType: string; data: string };
        }>;
      };
    }>;
  };

  const maskPart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!maskPart?.inlineData) {
    throw new Error('No mask in response');
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

// ============================================
// MACRO SYSTEM - Inline AI content generation
// ============================================

// Regex to find {type: content} macros at START OF LINE only
// Must be: start of string OR newline, then {type: content}
const MACRO_REGEX = /(?:^|\n)(\{(\w+):\s*([^}]+)\})/g;

// Process a single macro
async function processMacro(
  type: string,
  content: string,
  env: Env
): Promise<string> {
  switch (type.toLowerCase()) {
    case 'haiku':
      return await generateHaiku(content, env);
    default:
      // Unknown macro - leave as-is
      return `{${type}: ${content}}`;
  }
}

// Generate a haiku about a topic
async function generateHaiku(topic: string, env: Env): Promise<string> {
  const prompt = `Write a haiku about: ${topic}

Requirements:
- Traditional 5-7-5 syllable structure
- Evocative and thoughtful
- Return ONLY the three lines of the haiku, nothing else
- No quotes, no explanation, just the haiku`;

  try {
    const result = await callGemini(prompt, env.GEMINI_API_KEY, env.AI_MODEL);
    // Format as a nice blockquote
    const lines = result.trim().split('\n').filter(l => l.trim());
    const formatted = lines.map(l => `> *${l.trim()}*`).join('\n');
    return `${formatted}\n> — *AI-generated haiku on "${topic}"*`;
  } catch (e) {
    console.error('[Macro:haiku] Failed:', e);
    return `{haiku: ${topic}} *(generation failed)*`;
  }
}

// Extract code blocks and inline code, returning placeholders
function protectCodeBlocks(content: string): { protected: string; blocks: string[] } {
  const blocks: string[] = [];

  // First protect fenced code blocks (```...```)
  let protected_ = content.replace(/```[\s\S]*?```/g, (match) => {
    blocks.push(match);
    return `__CODE_BLOCK_${blocks.length - 1}__`;
  });

  // Then protect inline code (`...`)
  protected_ = protected_.replace(/`[^`]+`/g, (match) => {
    blocks.push(match);
    return `__CODE_BLOCK_${blocks.length - 1}__`;
  });

  return { protected: protected_, blocks };
}

// Restore code blocks from placeholders
function restoreCodeBlocks(content: string, blocks: string[]): string {
  let result = content;
  for (let i = 0; i < blocks.length; i++) {
    result = result.replace(`__CODE_BLOCK_${i}__`, blocks[i]);
  }
  return result;
}

// Process all macros in content
export async function processMacros(
  content: string,
  env: Env
): Promise<{ processed: string; macrosFound: number }> {
  // Protect code blocks from macro expansion
  const { protected: protectedContent, blocks } = protectCodeBlocks(content);

  const matches = [...protectedContent.matchAll(MACRO_REGEX)];

  if (matches.length === 0) {
    return { processed: content, macrosFound: 0 };
  }

  let result = protectedContent;
  let macrosProcessed = 0;

  // Process each macro (in sequence to avoid race conditions with string replacement)
  for (const match of matches) {
    const [fullMatch, macroWithBraces, type, macroContent] = match;
    const replacement = await processMacro(type, macroContent.trim(), env);
    // Only replace the macro part, preserve the newline if present
    result = result.replace(macroWithBraces, replacement);
    macrosProcessed++;
  }

  // Restore code blocks
  result = restoreCodeBlocks(result, blocks);

  return { processed: result, macrosFound: macrosProcessed };
}
