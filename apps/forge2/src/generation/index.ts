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
