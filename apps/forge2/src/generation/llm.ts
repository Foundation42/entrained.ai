/**
 * LLM Provider Abstraction
 *
 * Unified interface for code generation across providers.
 * Supports Anthropic (Claude), Google (Gemini), and OpenAI.
 */

import type { Env } from '../types';

export type LLMProvider = 'anthropic' | 'gemini' | 'openai';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: LLMProvider;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface LLMOptions {
  /** Override the default provider */
  provider?: LLMProvider;

  /** Override the default model */
  model?: string;

  /** Maximum tokens to generate */
  max_tokens?: number;

  /** Temperature (0-1) */
  temperature?: number;

  /** Stop sequences */
  stop?: string[];
}

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const OPENAI_API_BASE = 'https://api.openai.com/v1';

/**
 * Generate a completion from the configured LLM
 */
export async function generateCompletion(
  messages: LLMMessage[],
  options: LLMOptions,
  env: Env
): Promise<LLMResponse> {
  const provider = options.provider ?? (env.LLM_PROVIDER as LLMProvider) ?? 'anthropic';

  switch (provider) {
    case 'anthropic':
      return callAnthropic(messages, options, env);
    case 'gemini':
      return callGemini(messages, options, env);
    case 'openai':
      return callOpenAI(messages, options, env);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

// =============================================================================
// Anthropic (Claude)
// =============================================================================

async function callAnthropic(
  messages: LLMMessage[],
  options: LLMOptions,
  env: Env
): Promise<LLMResponse> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const model = options.model ?? env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250514';
  const maxTokens = options.max_tokens ?? 8192;

  // Separate system message from conversation
  const systemMessage = messages.find((m) => m.role === 'system');
  const conversationMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  const response = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemMessage?.content,
      messages: conversationMessages,
      temperature: options.temperature,
      stop_sequences: options.stop,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
    model: string;
    usage?: { input_tokens: number; output_tokens: number };
  };

  const textContent = data.content.find((c) => c.type === 'text');
  if (!textContent?.text) {
    throw new Error('No text content in Anthropic response');
  }

  return {
    content: textContent.text,
    model: data.model,
    provider: 'anthropic',
    usage: data.usage,
  };
}

// =============================================================================
// Google (Gemini)
// =============================================================================

async function callGemini(
  messages: LLMMessage[],
  options: LLMOptions,
  env: Env
): Promise<LLMResponse> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const model = options.model ?? env.GEMINI_MODEL ?? 'gemini-2.0-flash';

  // Convert messages to Gemini format
  const systemInstruction = messages.find((m) => m.role === 'system')?.content;
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      contents,
      generationConfig: {
        maxOutputTokens: options.max_tokens ?? 8192,
        temperature: options.temperature,
        stopSequences: options.stop,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    usageMetadata?: {
      promptTokenCount: number;
      candidatesTokenCount: number;
    };
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No text content in Gemini response');
  }

  return {
    content: text,
    model,
    provider: 'gemini',
    usage: data.usageMetadata
      ? {
          input_tokens: data.usageMetadata.promptTokenCount,
          output_tokens: data.usageMetadata.candidatesTokenCount,
        }
      : undefined,
  };
}

// =============================================================================
// OpenAI
// =============================================================================

async function callOpenAI(
  messages: LLMMessage[],
  options: LLMOptions,
  env: Env
): Promise<LLMResponse> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const model = options.model ?? 'gpt-4o';
  const maxTokens = options.max_tokens ?? 8192;

  const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature,
      stop: options.stop,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
    model: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  const content = data.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  return {
    content,
    model: data.model,
    provider: 'openai',
    usage: data.usage
      ? {
          input_tokens: data.usage.prompt_tokens,
          output_tokens: data.usage.completion_tokens,
        }
      : undefined,
  };
}
