/**
 * Speech Generation
 *
 * Generates speech using OpenAI TTS API (gpt-4o-mini-tts).
 * Ported from Forge 1.0 and adapted for the unified asset model.
 */

import type { Env, CreateSpeechRequest } from '../types';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

export type TTSVoice =
  | 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo'
  | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer'
  | 'verse' | 'marin' | 'cedar';

export type TTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

export interface SpeechOptions {
  voice?: TTSVoice;
  speed?: number;
  format?: TTSFormat;
  instructions?: string;
}

export interface GeneratedSpeech {
  data: ArrayBuffer;
  mimeType: string;
  format: TTSFormat;
}

/**
 * Resolve options with defaults
 */
function resolveOptions(options: SpeechOptions = {}): Required<Omit<SpeechOptions, 'instructions'>> & { instructions?: string } {
  return {
    voice: options.voice || 'alloy',
    speed: Math.max(0.25, Math.min(4.0, options.speed || 1.0)),
    format: options.format || 'mp3',
    instructions: options.instructions,
  };
}

/**
 * Get MIME type for audio format
 */
function getMimeType(format: TTSFormat): string {
  switch (format) {
    case 'mp3': return 'audio/mpeg';
    case 'opus': return 'audio/opus';
    case 'aac': return 'audio/aac';
    case 'flac': return 'audio/flac';
    case 'wav': return 'audio/wav';
    case 'pcm': return 'audio/pcm';
    default: return 'audio/mpeg';
  }
}

/**
 * Generate speech using OpenAI TTS
 */
export async function generateSpeech(
  text: string,
  options: SpeechOptions,
  env: Env
): Promise<GeneratedSpeech> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const resolved = resolveOptions(options);

  console.log(`[SpeechGen] Generating speech with voice: ${resolved.voice}, speed: ${resolved.speed}`);
  if (resolved.instructions) {
    console.log(`[SpeechGen] Instructions: ${resolved.instructions.slice(0, 50)}...`);
  }
  console.log(`[SpeechGen] Text: ${text.slice(0, 100)}...`);

  // Build request body
  const body: Record<string, unknown> = {
    model: 'gpt-4o-mini-tts',
    input: text,
    voice: resolved.voice,
    speed: resolved.speed,
    response_format: resolved.format,
  };

  // Add instructions if provided (only works with gpt-4o-mini-tts)
  if (resolved.instructions) {
    body.instructions = resolved.instructions;
  }

  const response = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[SpeechGen] API error: ${response.status} - ${errText}`);
    throw new Error(`OpenAI TTS error: ${response.status} - ${errText.slice(0, 200)}`);
  }

  const audioData = await response.arrayBuffer();

  console.log(`[SpeechGen] Generated audio: ${audioData.byteLength} bytes, format: ${resolved.format}`);

  return {
    data: audioData,
    mimeType: getMimeType(resolved.format),
    format: resolved.format,
  };
}

/**
 * Generate a deterministic hash for caching
 */
export function hashSpeechRequest(text: string, options: SpeechOptions): string {
  const resolved = resolveOptions(options);
  const input = JSON.stringify({
    text: text.toLowerCase().trim(),
    voice: resolved.voice,
    speed: resolved.speed,
    format: resolved.format,
    instructions: resolved.instructions?.toLowerCase().trim(),
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
export function requestToOptions(request: CreateSpeechRequest): SpeechOptions {
  return {
    voice: request.options?.voice as TTSVoice | undefined,
    speed: request.options?.speed,
    format: request.options?.format as TTSFormat | undefined,
    instructions: request.options?.instructions,
  };
}

/**
 * Voice descriptions for documentation/UI
 */
export const VOICE_DESCRIPTIONS: Record<TTSVoice, string> = {
  alloy: 'Neutral, balanced voice',
  ash: 'Warm and conversational',
  ballad: 'Soft and melodic',
  coral: 'Clear and friendly',
  echo: 'Warm, conversational male',
  fable: 'Expressive, British-accented',
  onyx: 'Deep, authoritative male',
  nova: 'Friendly, upbeat female',
  sage: 'Calm and wise',
  shimmer: 'Clear, professional female',
  verse: 'Dramatic and expressive',
  marin: 'Smooth and professional',
  cedar: 'Deep and resonant',
};

/**
 * All available voices
 */
export const AVAILABLE_VOICES: TTSVoice[] = [
  'alloy', 'ash', 'ballad', 'coral', 'echo',
  'fable', 'onyx', 'nova', 'sage', 'shimmer',
  'verse', 'marin', 'cedar',
];

/**
 * All available formats
 */
export const AVAILABLE_FORMATS: TTSFormat[] = [
  'mp3', 'opus', 'aac', 'flac', 'wav', 'pcm',
];
