import type { ParsedSchema, SynthParameter, SysexPatchNaming } from '../types';

const DEFAULT_MODEL = 'gemini-3-pro-preview';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const GEMINI_UPLOAD_URL = `${GEMINI_API_BASE}/upload/v1beta/files`;

function getGenerateUrl(model: string): string {
  return `${GEMINI_API_BASE}/v1beta/models/${model}:streamGenerateContent`;
}

function getGenerateContentUrl(model: string): string {
  return `${GEMINI_API_BASE}/v1beta/models/${model}:generateContent`;
}

// Simple non-streaming Gemini call for quick Q&A
interface GeminiConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
}

async function callGemini(
  prompt: string,
  apiKey: string,
  model: string = DEFAULT_MODEL,
  config: GeminiConfig = {}
): Promise<string> {
  const response = await fetch(`${getGenerateContentUrl(model)}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: config.temperature ?? 0.3,
        maxOutputTokens: config.maxOutputTokens ?? 2048,
        responseMimeType: config.responseMimeType ?? 'application/json'
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

const EXTRACTION_PROMPT = `You are a synthesizer parameter extraction expert. Analyze this synthesizer manual/documentation and extract a structured parameter schema with metadata and architecture.

Metadata to extract:
- manufacturer (vendor)
- synth_name (product/model)
- description: short phrase e.g. "Paraphonic analog synth" or "Hybrid wavetable/analog mono synth"
- synth_type: e.g. "monophonic", "paraphonic", "polyphonic", "drum machine", "module"
- version: firmware/manual version if stated
- voice_count: number of voices if stated

For each parameter, identify:
- name: The parameter name as shown on the synth
- category: Group it belongs to (e.g., "Oscillator 1", "Filter", "LFO", "Envelope", "Effects", "Global")
- type: One of "continuous" (knobs/faders), "discrete" (stepped values), "switch" (on/off), or "enum" (named options)
- min/max: For continuous and discrete types
- default: Default value if mentioned
- values: For enum types, list all possible values
- description: Brief description of what it does
- cc: MIDI CC number if documented
- nrpn: NRPN number if documented

Architecture / layout:
- architecture.signal_flow: ordered list of major blocks in the signal path (e.g., ["Oscillator 1", "Oscillator 2", "Mixer", "Filter", "VCA", "FX"])
- architecture.modules: list of modules with labels and optional details (type, categories, shapes, modes, controls)
- architecture.ui_layout.sections: UI/grouping sections in the panel
- architecture.ui_layout.knob_groups: group title + list of controls within it

Return a JSON object with this exact structure:
{
  "manufacturer": "string",
  "synth_name": "string",
  "description": "string or null",
  "synth_type": "string or null",
  "version": "string or null",
  "voice_count": number or null,
  "parameters": [
    {
      "name": "string",
      "category": "string",
      "type": "continuous|discrete|switch|enum",
      "min": number or null,
      "max": number or null,
      "default": number or null,
      "values": ["string"] or null,
      "description": "string",
      "cc": number or null,
      "nrpn": number or null
    }
  ],
  "categories": ["list of all unique categories"],
  "midi_channel": number or null,
  "sysex_header": [numbers] or null,
  "architecture": {
    "signal_flow": ["string"] or null,
    "modules": [
      {
        "id": "string or null",
        "label": "string",
        "type": "string or null",
        "categories": ["string"] or null,
        "shapes": ["string"] or null,
        "modes": ["string"] or null,
        "notes": "string or null",
        "controls": ["string"] or null
      }
    ],
    "ui_layout": {
      "sections": ["string"] or null,
      "knob_groups": [
        {
          "title": "string",
          "controls": ["string"]
        }
      ]
    }
  }
}

Focus on sound-shaping parameters. Skip utility parameters like MIDI settings unless they include CC mappings.
Be thorough - extract ALL parameters you can find in the document.

Document content:
`;

export async function extractSchemaFromText(
  text: string,
  apiKey: string,
  model: string = DEFAULT_MODEL
): Promise<ParsedSchema> {
  const response = await fetch(`${getGenerateUrl(model)}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: EXTRACTION_PROMPT + text
        }]
      }],
      generationConfig: {
        temperature: 0.1,
        topK: 1,
        topP: 0.8,
        maxOutputTokens: 32768,
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
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error('No content in Gemini response');
  }

  try {
    const schema = JSON.parse(content) as ParsedSchema;
    return validateSchema(schema);
  } catch (e) {
    throw new Error(`Failed to parse Gemini response as JSON: ${e}`);
  }
}

// Upload file to Gemini File API and return file URI
async function uploadToGeminiFileAPI(
  pdfData: ArrayBuffer,
  fileName: string,
  apiKey: string
): Promise<string> {
  console.log(`[Gemini File API] Uploading ${fileName} (${pdfData.byteLength} bytes)...`);

  // Step 1: Initiate resumable upload
  const initResponse = await fetch(`${GEMINI_UPLOAD_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': pdfData.byteLength.toString(),
      'X-Goog-Upload-Header-Content-Type': 'application/pdf',
    },
    body: JSON.stringify({
      file: {
        display_name: fileName
      }
    })
  });

  if (!initResponse.ok) {
    const error = await initResponse.text();
    throw new Error(`File API init failed: ${initResponse.status} - ${error}`);
  }

  const uploadUrl = initResponse.headers.get('X-Goog-Upload-URL');
  if (!uploadUrl) {
    throw new Error('No upload URL returned from File API');
  }

  console.log(`[Gemini File API] Got upload URL, uploading binary data...`);

  // Step 2: Upload the actual file data
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': pdfData.byteLength.toString(),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: pdfData
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`File upload failed: ${uploadResponse.status} - ${error}`);
  }

  const fileInfo = await uploadResponse.json() as {
    file?: {
      name?: string;
      uri?: string;
      state?: string;
    };
  };

  const fileUri = fileInfo.file?.uri;
  const fileName2 = fileInfo.file?.name;
  if (!fileUri || !fileName2) {
    throw new Error(`No file URI in response: ${JSON.stringify(fileInfo)}`);
  }

  console.log(`[Gemini File API] File uploaded: ${fileName2}, state: ${fileInfo.file?.state}`);

  // Step 3: Poll for ACTIVE state (file processing)
  let attempts = 0;
  const maxAttempts = 30; // 60 seconds max
  while (attempts < maxAttempts) {
    const statusResponse = await fetch(
      `${GEMINI_API_BASE}/v1beta/${fileName2}?key=${apiKey}`
    );

    if (!statusResponse.ok) {
      throw new Error(`File status check failed: ${statusResponse.status}`);
    }

    const status = await statusResponse.json() as {
      state?: string;
      uri?: string;
    };

    console.log(`[Gemini File API] File state: ${status.state} (attempt ${attempts + 1})`);

    if (status.state === 'ACTIVE') {
      return status.uri || fileUri;
    }

    if (status.state === 'FAILED') {
      throw new Error('File processing failed');
    }

    // Wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;
  }

  throw new Error('File processing timed out');
}

export async function extractSchemaFromPDF(
  pdfData: ArrayBuffer,
  fileName: string,
  apiKey: string,
  model: string = DEFAULT_MODEL
): Promise<ParsedSchema> {
  console.log(`[Gemini] Starting PDF extraction for ${fileName} using model ${model}`);

  // Step 1: Upload file via File API
  const fileUri = await uploadToGeminiFileAPI(pdfData, fileName, apiKey);
  console.log(`[Gemini] File ready: ${fileUri}`);

  // Step 2: Generate content using file reference
  console.log(`[Gemini] Calling generateContent with file reference...`);

  const requestBody = {
    contents: [{
      parts: [
        { text: EXTRACTION_PROMPT },
        {
          fileData: {
            mimeType: 'application/pdf',
            fileUri: fileUri
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      topK: 1,
      topP: 0.8,
      maxOutputTokens: 32768,
      responseMimeType: 'application/json'
    }
  };

  // Use alt=sse for server-sent events streaming
  const response = await fetch(`${getGenerateUrl(model)}?key=${apiKey}&alt=sse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  console.log(`[Gemini] Response status: ${response.status}`);

  if (!response.ok) {
    const error = await response.text();
    console.error(`[Gemini] API Error: ${response.status} - ${error}`);
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  // Read the streaming response and accumulate content
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  let fullContent = '';
  const decoder = new TextDecoder();
  let chunkCount = 0;
  let buffer = ''; // Buffer for incomplete SSE messages across chunks

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Prepend any buffered content from previous chunk
    const chunk = buffer + decoder.decode(value, { stream: true });
    chunkCount++;

    // Parse SSE format: "data: {...}\n\n"
    // Split by newline, but keep last incomplete line in buffer
    const lines = chunk.split('\n');
    // If chunk doesn't end with \n, last element is incomplete
    buffer = lines.pop() || ''; // Save incomplete line for next chunk

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const jsonStr = line.slice(6);
          if (jsonStr.trim() === '[DONE]') continue;

          const data = JSON.parse(jsonStr) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{ text?: string }>;
              };
            }>;
          };

          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullContent += text;
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    // Log progress every 10 chunks
    if (chunkCount % 10 === 0) {
      console.log(`[Gemini] Received ${chunkCount} chunks, content length: ${fullContent.length}`);
    }
  }

  // Process any remaining buffered content
  if (buffer.startsWith('data: ')) {
    try {
      const jsonStr = buffer.slice(6);
      if (jsonStr.trim() !== '[DONE]') {
        const data = JSON.parse(jsonStr) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
          }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullContent += text;
        }
      }
    } catch {
      // Skip malformed final chunk
    }
  }

  console.log(`[Gemini] Stream complete. Total chunks: ${chunkCount}, content length: ${fullContent.length}`);

  const content = fullContent;
  if (!content) {
    throw new Error('No content in Gemini response');
  }

  console.log(`[Gemini] Got content (${content.length} chars), parsing JSON...`);

  try {
    const schema = JSON.parse(content) as ParsedSchema;
    console.log(`[Gemini] Parsed schema: ${schema.manufacturer} ${schema.synth_name}, ${schema.parameters?.length ?? 0} params`);
    return validateSchema(schema);
  } catch (e) {
    console.error(`[Gemini] JSON parse error. Content preview: ${content.substring(0, 500)}`);
    throw new Error(`Failed to parse Gemini response as JSON: ${e}`);
  }
}

// ========================================
// PATCH GENERATION
// ========================================

export interface GeneratedPatchParameter {
  cc?: number;
  nrpn?: number;
  name: string;
  value: number | string;
}

export interface GeneratedPatch {
  patch_name: string;
  explanation: string;
  parameters: GeneratedPatchParameter[];
}

// Slim schema for AI - only fields needed for patch generation
interface SlimParameter {
  name: string;
  category: string;
  type: string;
  min?: number;
  max?: number;
  values?: string[];
  cc?: number;
  nrpn?: number;
}

function buildPatchDesignPrompt(
  synthName: string,
  synthDescription: string | undefined,
  signalFlow: string[] | undefined,
  slimParams: SlimParameter[]
): string {
  const flowText = signalFlow?.length
    ? `Signal Flow: ${signalFlow.join(' -> ')}`
    : '';

  return `You are an expert Synthesizer Programmer and Sound Designer.
Your goal is to configure a specific hardware synthesizer to match a user's abstract sound description.

### 1. THE INSTRUMENT
You are currently programming the: **${synthName}**
${synthDescription ? `Description: ${synthDescription}` : ''}
${flowText}

### 2. THE PARAMETER SCHEMA (PHYSICS)
You must **strictly** adhere to the following parameter definitions.
This defines every knob, slider, and switch available to you.
Do not hallucinate parameters that are not in this list.

**Parameter List:**
${JSON.stringify(slimParams)}

*Format of Parameter List:*
\`[{"name": "Osc 1 Octave", "category": "Oscillator 1", "min": -2, "max": 2, "type": "discrete", "cc": 66}, ...]\`

### 3. GENERATION RULES
1.  **Valid Ranges:** You must strictly respect the \`min\` and \`max\` values for every parameter.
    * *Example:* If \`Osc 1 Octave\` is \`min: -2, max: 2\`, do NOT output \`64\` or \`127\`. Output \`1\` or \`-1\`.
2.  **Discrete vs Continuous:**
    * If \`type\` is "discrete", output whole integers only within the min/max range.
    * If \`type\` is "continuous", output integers within the min/max range.
    * If \`type\` is "switch", output 0 (off) or 1 (on).
    * If \`type\` is "enum" and \`values\` is provided, output one of the listed string values.
3.  **Signal Flow Awareness:**
    * Use the \`category\` field to understand the synth structure.
    * If the user wants "Grit," look for parameters in \`Distortion\`, \`Drive\`, or \`Feedback\` categories.
    * If the user wants "Warmth," think about filter resonance, oscillator detune, and saturation.
4.  **Sparse Output:** You do not need to list every parameter. Assume a sensible "Init Patch" state (Sawtooth wave, Open Filter, medium ADSR). Only list the values that *change* to create the requested sound.
5.  **Creative Naming:** Give the patch a creative, evocative name that captures the essence of the sound.

### 4. OUTPUT FORMAT
Return valid, parseable JSON only. No markdown formatting, no code blocks.

{
  "patch_name": "Creative Name",
  "explanation": "Brief explanation of sound design choices and why specific parameters were chosen.",
  "parameters": [
    {
      "cc": 66,
      "name": "Osc 1 Octave",
      "value": 1
    },
    {
      "cc": 33,
      "name": "Filter Cutoff",
      "value": 45
    }
  ]
}`;
}

export async function generatePatch(
  schema: ParsedSchema,
  userPrompt: string,
  apiKey: string,
  model: string = DEFAULT_MODEL
): Promise<GeneratedPatch> {
  // Build slim schema - only fields the AI needs
  const slimParams: SlimParameter[] = schema.parameters.map(p => ({
    name: p.name,
    category: p.category,
    type: p.type,
    min: p.min,
    max: p.max,
    values: p.values,
    cc: p.cc,
    nrpn: p.nrpn,
  }));

  const systemPrompt = buildPatchDesignPrompt(
    `${schema.manufacturer} ${schema.synth_name}`,
    schema.description,
    schema.architecture?.signal_flow,
    slimParams
  );

  const fullPrompt = `${systemPrompt}

### USER REQUEST
${userPrompt}`;

  console.log(`[Gemini Patch] Generating patch for ${schema.synth_name} using model ${model}, prompt: "${userPrompt.substring(0, 50)}..."`);

  // Use alt=sse for server-sent events streaming (same as PDF extraction)
  const response = await fetch(`${getGenerateUrl(model)}?key=${apiKey}&alt=sse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: fullPrompt
        }]
      }],
      generationConfig: {
        temperature: 0.7, // Slightly creative
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json'
      }
    })
  });

  console.log(`[Gemini Patch] Response status: ${response.status}`);

  if (!response.ok) {
    const error = await response.text();
    console.error(`[Gemini Patch] API error: ${response.status} - ${error}`);
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  // Handle streaming response
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  let fullContent = '';
  const decoder = new TextDecoder();
  let buffer = '';
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunkCount++;
    const chunk = buffer + decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const jsonStr = line.slice(6);
          if (jsonStr.trim() === '[DONE]') continue;

          const data = JSON.parse(jsonStr) as {
            candidates?: Array<{
              content?: {
                parts?: Array<{ text?: string }>;
              };
            }>;
          };

          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullContent += text;
          }
        } catch (parseErr) {
          console.warn(`[Gemini Patch] Chunk parse error: ${parseErr}`);
        }
      }
    }
  }

  console.log(`[Gemini Patch] Stream complete. Chunks: ${chunkCount}, content length: ${fullContent.length}`);

  // Process remaining buffer
  if (buffer.startsWith('data: ')) {
    try {
      const jsonStr = buffer.slice(6);
      if (jsonStr.trim() !== '[DONE]') {
        const data = JSON.parse(jsonStr) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
          }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          fullContent += text;
        }
      }
    } catch {
      // Skip malformed final chunk
    }
  }

  if (!fullContent) {
    throw new Error('No content in Gemini response');
  }

  console.log(`[Gemini Patch] Got response (${fullContent.length} chars)`);

  try {
    const patch = JSON.parse(fullContent) as GeneratedPatch;

    // Validate the response structure
    if (!patch.patch_name || typeof patch.patch_name !== 'string') {
      throw new Error('Missing or invalid patch_name');
    }
    if (!patch.explanation || typeof patch.explanation !== 'string') {
      throw new Error('Missing or invalid explanation');
    }
    if (!Array.isArray(patch.parameters)) {
      throw new Error('Missing or invalid parameters array');
    }

    // Validate each parameter against the schema
    const schemaParamMap = new Map(schema.parameters.map(p => [p.name.toLowerCase(), p]));

    for (const param of patch.parameters) {
      const schemaParam = schemaParamMap.get(param.name.toLowerCase());
      if (!schemaParam) {
        console.warn(`[Gemini Patch] Parameter "${param.name}" not found in schema, skipping validation`);
        continue;
      }

      // Validate range for numeric values
      if (typeof param.value === 'number') {
        if (schemaParam.min !== undefined && param.value < schemaParam.min) {
          console.warn(`[Gemini Patch] Clamping ${param.name} from ${param.value} to min ${schemaParam.min}`);
          param.value = schemaParam.min;
        }
        if (schemaParam.max !== undefined && param.value > schemaParam.max) {
          console.warn(`[Gemini Patch] Clamping ${param.name} from ${param.value} to max ${schemaParam.max}`);
          param.value = schemaParam.max;
        }
      }
    }

    console.log(`[Gemini Patch] Generated patch "${patch.patch_name}" with ${patch.parameters.length} parameters`);
    return patch;
  } catch (e) {
    console.error(`[Gemini Patch] JSON parse error. Content: ${fullContent.substring(0, 500)}`);
    throw new Error(`Failed to parse Gemini response as JSON: ${e}`);
  }
}

// ========================================
// SYSEX PATCH NAMING LOOKUP
// TODO: REMOVE - This approach doesn't work reliably. Most synths require
// full patch dump read-modify-write for naming, not a simple SysEx command.
// Gemini often hallucinates incorrect SysEx formats. Needs proper Patch Librarian.
// ========================================

const SYSEX_NAMING_PROMPT = `You are a synthesizer MIDI expert with deep knowledge of synthesizer MIDI implementations.

I need to know how to send a patch name via MIDI to be displayed on a specific synthesizer's screen/display.

USE YOUR KNOWLEDGE of synthesizer MIDI implementations. Most modern synthesizers from manufacturers like Sequential, Moog, Novation, Arturia, Korg, Roland, Yamaha, etc. support SysEx patch naming. You likely know the exact SysEx format from their MIDI implementation charts.

For the synthesizer specified, provide the MIDI method to set the patch name that appears on the synth's display.

**Common patterns you should know:**
- Sequential/Dave Smith synths (Prophet, Pro 3, OB-6, etc.): Use SysEx with manufacturer ID 0x01 (Sequential)
- Moog synths: Use SysEx with manufacturer ID 0x04
- Novation synths: Use SysEx with manufacturer ID 0x00 0x20 0x29
- Many synths use: F0 [mfr] [device] [command] [name bytes] F7

Provide:

1. **method**: One of:
   - "sysex" - Uses System Exclusive messages (most common for modern synths)
   - "nrpn" - Uses NRPN messages for name characters
   - "cc_sequence" - Uses a sequence of CC messages
   - "unsupported" - ONLY if you are certain the synth has no display or truly cannot receive names

2. **sysex_template** (if method is "sysex"): An array of bytes for the SysEx message.
   - Use decimal numbers for fixed bytes (e.g., 240 for 0xF0, 247 for 0xF7)
   - Use the string "NAME" as a placeholder where the ASCII character bytes should be inserted
   - Example: [240, 1, 44, 1, 0, "NAME", 247]

3. **max_length**: Maximum characters for the patch name (typically 8-20 characters)

4. **description**: Brief explanation of the SysEx format

Return ONLY valid JSON, no markdown:

{
  "method": "sysex",
  "description": "Brief explanation of the format",
  "sysex_template": [240, ...bytes..., "NAME", ...bytes..., 247],
  "max_length": 16,
  "encoding": "ascii"
}

IMPORTANT: Default to assuming the synth DOES support patch naming unless you know for certain it doesn't (e.g., vintage analog with no display).

SYNTHESIZER:`;

export async function lookupSysexPatchNaming(
  manufacturer: string,
  synthName: string,
  apiKey: string,
  model: string = DEFAULT_MODEL
): Promise<SysexPatchNaming> {
  const fullPrompt = `${SYSEX_NAMING_PROMPT} ${manufacturer} ${synthName}`;

  console.log(`[Gemini SysEx] Looking up patch naming for ${manufacturer} ${synthName}`);

  try {
    const content = await callGemini(fullPrompt, apiKey, model, {
      temperature: 0.3,
      maxOutputTokens: 1024
    });

    console.log(`[Gemini SysEx] Response: ${content.substring(0, 300)}`);

    const result = JSON.parse(content) as SysexPatchNaming;
    console.log(`[Gemini SysEx] Got method: ${result.method}`);
    return result;
  } catch (e) {
    console.error(`[Gemini SysEx] Error: ${e}`);
    return { method: 'unsupported', description: 'Failed to look up patch naming method' };
  }
}

function validateSchema(schema: ParsedSchema): ParsedSchema {
  if (!schema.manufacturer || typeof schema.manufacturer !== 'string') {
    throw new Error('Schema missing manufacturer');
  }
  if (!schema.synth_name || typeof schema.synth_name !== 'string') {
    throw new Error('Schema missing synth_name');
  }
  if (!Array.isArray(schema.parameters)) {
    throw new Error('Schema missing parameters array');
  }

  // Validate and normalize parameters
  schema.parameters = schema.parameters.map((param, idx) => {
    if (!param.name) {
      throw new Error(`Parameter ${idx} missing name`);
    }
    if (!param.category) {
      param.category = 'Uncategorized';
    }
    if (!['continuous', 'discrete', 'switch', 'enum'].includes(param.type)) {
      param.type = 'continuous'; // Default to continuous
    }
    return param as SynthParameter;
  });

  // Build categories list if not provided
  if (!schema.categories || !Array.isArray(schema.categories)) {
    schema.categories = [...new Set(schema.parameters.map(p => p.category))];
  }

  // Normalize optional fields
  if (schema.description && typeof schema.description !== 'string') {
    delete (schema as any).description;
  }
  if (schema.synth_type && typeof schema.synth_type !== 'string') {
    delete (schema as any).synth_type;
  }
  if (schema.voice_count !== undefined && typeof schema.voice_count !== 'number') {
    delete (schema as any).voice_count;
  }

  return schema;
}
