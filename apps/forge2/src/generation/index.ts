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
  generateCssForComponent,
  hashFileRequest,
  requestToHints as fileRequestToHints,
  getMimeType,
} from './files';
export type { FileGenerationHints, GeneratedFile, PropDefinition } from './files';

export { generateCompletion } from './llm';
export type { LLMProvider, LLMMessage, LLMResponse, LLMOptions } from './llm';

export { planApp, generateApp } from './apps';
export type { AppPlan, ComponentPlan, ImageAssetPlan, SpeechAssetPlan, GeneratedComponent, GeneratedAsset, GeneratedApp } from './apps';

export {
  parseSource,
  parseTSXSource,
  parseCSSSource,
  generateCanonicalName,
} from './source-parser';
export type { ParsedSourceMetadata, ParsedTSXMetadata, ParsedCSSMetadata } from './source-parser';

export { resolveReferences } from './references';
