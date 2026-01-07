/**
 * Generation Module Exports
 */

export {
  generateImage,
  hashImageRequest,
  requestToOptions as imageRequestToOptions,
} from './images';
export type { ImageOptions, ImageStyle, ImagePreset, GeneratedImage } from './images';

export {
  generateSpeech,
  hashSpeechRequest,
  requestToOptions as speechRequestToOptions,
  VOICE_DESCRIPTIONS,
  AVAILABLE_VOICES,
  AVAILABLE_FORMATS,
} from './speech';
export type { SpeechOptions, TTSVoice, TTSFormat, GeneratedSpeech } from './speech';

export { decodePNG, encodePNG, mergeWithMask } from './png';

export {
  generateFile,
  updateFile,
  hashFileRequest,
  requestToHints as fileRequestToHints,
  getMimeType,
} from './files';
export type { FileGenerationHints, GeneratedFile } from './files';

export { generateCompletion } from './llm';
export type { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from './llm';
