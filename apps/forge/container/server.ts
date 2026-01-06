/**
 * Forge Generation Engine - Bun + TypeScript
 *
 * Handles: Description -> Gemini -> Manifest -> TSX -> WebComponent JS
 * Uses esbuild for TSX transpilation.
 */

import { z } from 'zod';
import * as esbuild from 'esbuild';
import { PLANNER_PROMPT, GENERATOR_PROMPT, UPDATE_PROMPT } from './prompts';

const PORT = 8080;

// Provider selection: 'gemini' or 'anthropic'
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'gemini';

// Gemini configuration
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';

// Anthropic configuration
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_API_BASE = 'https://api.anthropic.com';

// Active model for logging/provenance
const MODEL = LLM_PROVIDER === 'anthropic' ? ANTHROPIC_MODEL : GEMINI_MODEL;

// ============================================
// Zod Schemas
// ============================================

const PropDefSchema = z.object({
  name: z.string(),
  type: z.enum(['String', 'Number', 'Boolean', 'Object', 'Array']),
  default: z.any().optional(),
  required: z.boolean().default(false),
  description: z.string().optional(),
});

const EventDefSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  detail: z.string().optional(),
});

const CSSVarDefSchema = z.object({
  name: z.string(),
  default: z.string(),
  description: z.string().optional(),
});

const PartDefSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

const ManifestSchema = z.object({
  tag: z.string(),
  className: z.string(),
  description: z.string(),
  props: z.array(PropDefSchema).default([]),
  events: z.array(EventDefSchema).default([]),
  cssVariables: z.array(CSSVarDefSchema).default([]),
  parts: z.array(PartDefSchema).default([]),
  storage: z.object({
    instance: z.boolean().default(true),
    class: z.boolean().default(true),
    global: z.boolean().default(true),
  }).default({}),
  imports: z.array(z.string()).default([]),
  category: z.enum(['ui', 'data', 'visualization', 'game', 'utility']).default('ui'),
});

type Manifest = z.infer<typeof ManifestSchema>;

// ============================================
// Logging
// ============================================

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function logStep(step: string, detail?: string): void {
  const ts = new Date().toISOString().slice(11, 23);
  const msg = detail ? `${step}: ${detail}` : step;
  console.log(`[${ts}] ⚡ ${msg}`);
}

// ============================================
// Gemini API Client (SSE Streaming)
// ============================================

async function callGemini(
  prompt: string,
  systemPrompt?: string,
  temperature = 0.3,
  maxRetries = 3
): Promise<string> {
  const url = `${GEMINI_API_BASE}/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const waitTime = Math.pow(2, attempt) * 1000;
      log(`   ↻ Retry ${attempt + 1}/${maxRetries} after ${waitTime}ms...`);
      await Bun.sleep(waitTime);
    }

    try {
      log(`   → Calling Gemini SSE (${GEMINI_MODEL})...`);
      const start = Date.now();

      const contents = [];
      if (systemPrompt) {
        contents.push({ role: 'user', parts: [{ text: systemPrompt }] });
        contents.push({ role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] });
      }
      contents.push({ role: 'user', parts: [{ text: prompt }] });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${error.slice(0, 200)}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      const chunks: string[] = [];
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        chunkCount++;

        if (chunkCount % 5 === 0) {
          log(`   ... streaming chunk ${chunkCount}`);
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim() === '[DONE]') continue;

            try {
              const data = JSON.parse(jsonStr) as {
                candidates?: Array<{
                  content?: { parts?: Array<{ text?: string }> };
                }>;
              };
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) chunks.push(text);
            } catch {}
          }
        }
      }

      const elapsed = Date.now() - start;
      const fullText = chunks.join('');

      if (!fullText) {
        throw new Error('No content in Gemini response');
      }

      log(`   ← Gemini responded: ${fullText.length} chars in ${elapsed}ms (${chunkCount} chunks)`);
      return fullText;
    } catch (error) {
      log(`   ✗ Attempt ${attempt + 1} failed: ${error}`);
      if (attempt === maxRetries - 1) throw error;
    }
  }

  throw new Error('All retries exhausted');
}

// ============================================
// Anthropic API Client (SSE Streaming)
// ============================================

async function callAnthropic(
  prompt: string,
  systemPrompt?: string,
  temperature = 0.3,
  maxRetries = 3
): Promise<string> {
  const url = `${ANTHROPIC_API_BASE}/v1/messages`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) {
      const waitTime = Math.pow(2, attempt) * 1000;
      log(`   ↻ Retry ${attempt + 1}/${maxRetries} after ${waitTime}ms...`);
      await Bun.sleep(waitTime);
    }

    try {
      log(`   → Calling Anthropic SSE (${ANTHROPIC_MODEL})...`);
      const start = Date.now();

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 16384,
          temperature,
          system: systemPrompt || undefined,
          messages: [{ role: 'user', content: prompt }],
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error.slice(0, 200)}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      const chunks: string[] = [];
      let chunkCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        chunkCount++;

        if (chunkCount % 10 === 0) {
          log(`   ... streaming chunk ${chunkCount}`);
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            if (jsonStr.trim() === '[DONE]') continue;

            try {
              const data = JSON.parse(jsonStr) as {
                type: string;
                delta?: { type: string; text?: string };
              };
              if (data.type === 'content_block_delta' && data.delta?.text) {
                chunks.push(data.delta.text);
              }
            } catch {}
          }
        }
      }

      const elapsed = Date.now() - start;
      const fullText = chunks.join('');

      if (!fullText) {
        throw new Error('No content in Anthropic response');
      }

      log(`   ← Anthropic responded: ${fullText.length} chars in ${elapsed}ms (${chunkCount} chunks)`);
      return fullText;
    } catch (error) {
      log(`   ✗ Attempt ${attempt + 1} failed: ${error}`);
      if (attempt === maxRetries - 1) throw error;
    }
  }

  throw new Error('All retries exhausted');
}

// ============================================
// Unified LLM Client (Routes to active provider)
// ============================================

async function callLLM(
  prompt: string,
  systemPrompt?: string,
  temperature = 0.3,
  maxRetries = 3
): Promise<string> {
  if (LLM_PROVIDER === 'anthropic') {
    return callAnthropic(prompt, systemPrompt, temperature, maxRetries);
  }
  return callGemini(prompt, systemPrompt, temperature, maxRetries);
}

// ============================================
// Manifest Generation (Planner)
// ============================================

async function generateManifest(description: string): Promise<Manifest> {
  log(`Planning component: "${description.slice(0, 50)}..."`);

  const response = await callLLM(
    `Create a manifest for this component:\n\n${description}`,
    PLANNER_PROMPT
  );

  // Extract JSON from response
  let jsonText = response.trim();
  if (jsonText.includes('```')) {
    const match = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      jsonText = match[1].trim();
    }
  }

  try {
    const parsed = JSON.parse(jsonText);
    const manifest = ManifestSchema.parse(parsed);
    log(`Generated manifest for <${manifest.tag}>`);
    return manifest;
  } catch (error) {
    log(`Manifest parsing failed: ${error}`);
    // Return minimal manifest
    const tag = description.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
    return {
      tag,
      className: tag.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(''),
      description,
      props: [],
      events: [],
      cssVariables: [],
      parts: [{ name: 'container', description: 'Main wrapper' }],
      storage: { instance: true, class: true, global: true },
      imports: [],
      category: 'ui',
    };
  }
}

// ============================================
// TSX Generation
// ============================================

async function generateTSX(
  manifest: Manifest,
  description: string,
  errorContext?: string
): Promise<string> {
  log(`Generating TSX for <${manifest.tag}>${errorContext ? ' (retry with error feedback)' : ''}...`);

  let prompt = `Generate a TSX WebComponent based on this manifest and description.

Manifest:
${JSON.stringify(manifest, null, 2)}

Original description: "${description}"`;

  // Add error context for retries
  if (errorContext) {
    prompt += `

IMPORTANT: The previous attempt had compilation errors. Please fix them:
${errorContext}

Common fixes:
- Ensure all JSX is properly closed
- Use proper TypeScript syntax
- Don't use features not supported by esbuild
- Ensure the @Component decorator is used correctly`;
  }

  prompt += `

Generate the complete TSX code:`;

  const response = await callLLM(prompt, GENERATOR_PROMPT);

  // Extract TSX from response
  let tsx = response.trim();
  if (tsx.includes('```')) {
    const match = tsx.match(/```(?:tsx|typescript)?\s*([\s\S]*?)```/);
    if (match) {
      tsx = match[1].trim();
    }
  }

  log(`Generated TSX: ${tsx.length} chars`);
  return tsx;
}

// ============================================
// TSX Generation with Retry on Compile Failure
// ============================================

interface TSXGenerationResult {
  tsx_source: string;
  component_js: string;
  attempts: number;
}

async function generateTSXWithRetry(
  manifest: Manifest,
  description: string,
  maxRetries = 3
): Promise<TSXGenerationResult> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    log(`TSX generation attempt ${attempt}/${maxRetries}`);

    try {
      // Generate TSX (with error context if retrying)
      const tsxSource = await generateTSX(manifest, description, lastError || undefined);

      // Try to transpile
      const componentJS = await transpileTSX(tsxSource);

      // Success!
      if (attempt > 1) {
        log(`✓ Compilation succeeded on attempt ${attempt}`);
      }

      return {
        tsx_source: tsxSource,
        component_js: componentJS,
        attempts: attempt,
      };

    } catch (error) {
      const errorMessage = (error as Error).message;
      log(`✗ Attempt ${attempt} failed: ${errorMessage}`);

      if (attempt >= maxRetries) {
        throw new Error(`Failed after ${maxRetries} attempts. Last error: ${errorMessage}`);
      }

      // Extract useful error info for feedback
      lastError = formatCompileError(errorMessage);
    }
  }

  throw new Error('Unexpected: retry loop exited without result');
}

function formatCompileError(error: string): string {
  // Clean up esbuild error messages for LLM consumption
  const lines = error.split('\n');
  const relevantLines = lines.filter(line =>
    line.includes('error:') ||
    line.includes('Error:') ||
    line.includes('expected') ||
    line.includes('unexpected') ||
    line.trim().startsWith('|') ||
    line.trim().startsWith('^')
  );

  if (relevantLines.length > 0) {
    return relevantLines.slice(0, 10).join('\n'); // Limit to first 10 relevant lines
  }

  // Fallback: return first 500 chars of error
  return error.slice(0, 500);
}

// ============================================
// TSX Update (for modifications)
// ============================================

async function updateTSX(
  currentSource: string,
  manifest: Manifest,
  changes: string,
  errorContext?: string
): Promise<string> {
  log(`Updating component with: "${changes.slice(0, 50)}..."${errorContext ? ' (retry)' : ''}`);

  let prompt = UPDATE_PROMPT
    .replace('{source}', currentSource)
    .replace('{manifest}', JSON.stringify(manifest, null, 2))
    .replace('{changes}', changes);

  // Add error context for retries
  if (errorContext) {
    prompt += `

IMPORTANT: The previous update had compilation errors. Please fix them:
${errorContext}`;
  }

  const response = await callLLM(prompt);

  let tsx = response.trim();
  if (tsx.includes('```')) {
    const match = tsx.match(/```(?:tsx|typescript)?\s*([\s\S]*?)```/);
    if (match) {
      tsx = match[1].trim();
    }
  }

  log(`Updated TSX: ${tsx.length} chars`);
  return tsx;
}

async function updateTSXWithRetry(
  currentSource: string,
  manifest: Manifest,
  changes: string,
  maxRetries = 3
): Promise<TSXGenerationResult> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    log(`TSX update attempt ${attempt}/${maxRetries}`);

    try {
      const tsxSource = await updateTSX(currentSource, manifest, changes, lastError || undefined);
      const componentJS = await transpileTSX(tsxSource);

      if (attempt > 1) {
        log(`✓ Update compilation succeeded on attempt ${attempt}`);
      }

      return {
        tsx_source: tsxSource,
        component_js: componentJS,
        attempts: attempt,
      };

    } catch (error) {
      const errorMessage = (error as Error).message;
      log(`✗ Update attempt ${attempt} failed: ${errorMessage}`);

      if (attempt >= maxRetries) {
        throw new Error(`Update failed after ${maxRetries} attempts. Last error: ${errorMessage}`);
      }

      lastError = formatCompileError(errorMessage);
    }
  }

  throw new Error('Unexpected: retry loop exited without result');
}

// ============================================
// TSX Transpilation (esbuild)
// ============================================

async function transpileTSX(tsxSource: string): Promise<string> {
  log(`Transpiling TSX to JavaScript...`);

  try {
    const result = await esbuild.transform(tsxSource, {
      loader: 'tsx',
      format: 'esm',
      target: 'es2022',
      jsxFactory: 'h',
      jsxFragment: 'Fragment',
      // Auto-inject h and Fragment imports for JSX
      banner: `import { h, Fragment } from 'forge';`,
      minify: false,
      sourcemap: false,
    });

    log(`Transpiled to ${result.code.length} chars JS`);
    return result.code;
  } catch (error) {
    log(`Transpilation failed: ${error}`);
    throw new Error(`TSX transpilation failed: ${error}`);
  }
}

// ============================================
// Full Generation Pipeline
// ============================================

interface GenerateResult {
  manifest: Manifest;
  tsx_source: string;
  component_js: string;
  provenance: {
    model: string;
    generated_at: string;
    container_version: string;
    generation_attempts: number;
  };
}

async function generate(description: string): Promise<GenerateResult> {
  const startTime = Date.now();
  const elapsed = () => `${Date.now() - startTime}ms`;

  // Step 1: Generate manifest
  logStep('STEP 1/2', 'Generating manifest (planning)...');
  const manifest = await generateManifest(description);
  logStep('STEP 1/2 DONE', `<${manifest.tag}> planned [${elapsed()}]`);

  // Step 2: Generate TSX and transpile (with retry on compile failure)
  logStep('STEP 2/2', 'Generating TSX + transpiling (with retry)...');
  const result = await generateTSXWithRetry(manifest, description);
  logStep('STEP 2/2 DONE', `${result.tsx_source.length} chars TSX → ${result.component_js.length} chars JS [${elapsed()}]`);

  if (result.attempts > 1) {
    log(`⚠ Required ${result.attempts} attempts to generate valid code`);
  }

  const totalTime = Date.now() - startTime;
  logStep('COMPLETE', `Total time: ${totalTime}ms`);

  return {
    manifest,
    tsx_source: result.tsx_source,
    component_js: result.component_js,
    provenance: {
      model: MODEL,
      generated_at: new Date().toISOString(),
      container_version: '0.2.0',
      generation_attempts: result.attempts,
    },
  };
}

// ============================================
// HTTP Server
// ============================================

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Health check
    if (path === '/health' || path === '/') {
      return Response.json({
        status: 'ok',
        service: 'forge-generator',
        runtime: 'bun',
        model: MODEL,
      });
    }

    // POST /generate - Full generation pipeline
    if (path === '/generate' && req.method === 'POST') {
      try {
        const body = await req.json() as { description: string };
        const { description } = body;

        if (!description) {
          return Response.json({ error: 'Missing description' }, { status: 400 });
        }

        log(`=== Generating: "${description.slice(0, 50)}..." ===`);
        const result = await generate(description);

        return Response.json({
          manifest: result.manifest,
          tsx_source: result.tsx_source,
          component_js: result.component_js,
          provenance: result.provenance,
        });
      } catch (error) {
        log(`ERROR: ${error}`);
        return Response.json(
          { error: `Generation failed: ${error}` },
          { status: 500 }
        );
      }
    }

    // POST /update - Update existing component
    if (path === '/update' && req.method === 'POST') {
      try {
        const body = await req.json() as {
          source: string;
          manifest: Manifest;
          changes: string;
        };

        if (!body.source || !body.changes) {
          return Response.json(
            { error: 'Missing source or changes' },
            { status: 400 }
          );
        }

        log(`=== Updating component: "${body.changes.slice(0, 50)}..." ===`);

        const result = await updateTSXWithRetry(
          body.source,
          body.manifest,
          body.changes
        );

        if (result.attempts > 1) {
          log(`⚠ Update required ${result.attempts} attempts`);
        }

        return Response.json({
          tsx_source: result.tsx_source,
          component_js: result.component_js,
          provenance: {
            model: MODEL,
            generated_at: new Date().toISOString(),
            container_version: '0.2.0',
            generation_attempts: result.attempts,
          },
        });
      } catch (error) {
        log(`ERROR: ${error}`);
        return Response.json(
          { error: `Update failed: ${error}` },
          { status: 500 }
        );
      }
    }

    // POST /manifest - Generate manifest only
    if (path === '/manifest' && req.method === 'POST') {
      try {
        const body = await req.json() as { description: string };
        const { description } = body;

        if (!description) {
          return Response.json({ error: 'Missing description' }, { status: 400 });
        }

        log(`=== Planning: "${description.slice(0, 50)}..." ===`);
        const manifest = await generateManifest(description);

        return Response.json({ manifest });
      } catch (error) {
        log(`ERROR: ${error}`);
        return Response.json(
          { error: `Planning failed: ${error}` },
          { status: 500 }
        );
      }
    }

    // POST /transpile - Transpile TSX to JS only
    if (path === '/transpile' && req.method === 'POST') {
      try {
        const body = await req.json() as { source: string };
        const { source } = body;

        if (!source) {
          return Response.json({ error: 'Missing source' }, { status: 400 });
        }

        log(`=== Transpiling TSX... ===`);
        const componentJS = await transpileTSX(source);

        return Response.json({ component_js: componentJS });
      } catch (error) {
        log(`ERROR: ${error}`);
        return Response.json(
          { error: `Transpilation failed: ${error}` },
          { status: 500 }
        );
      }
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
});

log(`Server running on http://localhost:${PORT}`);
log(`Model: ${MODEL}`);
log(`Runtime: Bun ${Bun.version}`);
