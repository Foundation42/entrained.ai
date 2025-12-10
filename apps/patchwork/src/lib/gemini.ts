import type { ParsedSchema, SynthParameter } from '../types';

const MODEL_NAME = 'gemini-3-pro-preview';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
// Use streamGenerateContent to keep the connection alive during long inference
const GEMINI_GENERATE_URL = `${GEMINI_API_BASE}/v1beta/models/${MODEL_NAME}:streamGenerateContent`;
const GEMINI_UPLOAD_URL = `${GEMINI_API_BASE}/upload/v1beta/files`;

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
  apiKey: string
): Promise<ParsedSchema> {
  const response = await fetch(`${GEMINI_GENERATE_URL}?key=${apiKey}`, {
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
  apiKey: string
): Promise<ParsedSchema> {
  console.log(`[Gemini] Starting PDF extraction for ${fileName}`);

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
  const response = await fetch(`${GEMINI_GENERATE_URL}?key=${apiKey}&alt=sse`, {
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
