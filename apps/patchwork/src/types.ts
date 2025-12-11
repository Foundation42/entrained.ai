export interface Bindings {
  DB: D1Database;
  ASSETS: R2Bucket;
  EXTRACTION_QUEUE: Queue<ExtractionJobMessage>;
  JWT_SECRET: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
  AUTH_DOMAIN: string;
}

export interface ExtractionJobMessage {
  jobId: string;
  userId: string;
  fileName: string;
  mimeType: string;
  r2Key: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

// Synth parameter types
export interface SynthParameter {
  name: string;
  category: string;
  type: 'continuous' | 'discrete' | 'switch' | 'enum';
  min?: number;
  max?: number;
  default?: number;
  values?: string[];  // For enum type
  description?: string;
  cc?: number;        // MIDI CC number if applicable
  nrpn?: number;      // NRPN if applicable
}

export interface SynthArchitectureModule {
  id?: string;
  label: string;
  type?: string;
  categories?: string[];
  shapes?: string[];
  modes?: string[];
  notes?: string;
  controls?: string[];
}

export interface SynthArchitecture {
  signal_flow?: string[]; // ordered list of module labels/ids
  modules?: SynthArchitectureModule[];
  ui_layout?: {
    sections?: string[];
    knob_groups?: Array<{
      title: string;
      controls: string[];
    }>;
  };
}

export interface SynthSchema {
  id: string;
  user_id: string;
  manufacturer: string;
  synth_name: string;
  schema_json: string;
  source_file_r2_key: string | null;
  extraction_model: string | null;
  is_public: number;
  created_at: number;
  updated_at: number;
}

export interface ParsedSchema {
  manufacturer: string;
  synth_name: string;
  description?: string;
  synth_type?: string;
  version?: string;
  voice_count?: number;
  parameters: SynthParameter[];
  categories: string[];
  midi_channel?: number;
  sysex_header?: number[];
   // Optional richer metadata for visualization/layout
  architecture?: SynthArchitecture;
}

export interface Patch {
  id: string;
  user_id: string;
  schema_id: string;
  name: string;
  description: string | null;
  patch_json: string;
  reasoning: string | null;
  generation_model: string | null;
  is_public: number;
  created_at: number;
  updated_at: number;
}

export interface PatchData {
  name: string;
  description?: string;
  parameters: Record<string, number | string | boolean>;
}
