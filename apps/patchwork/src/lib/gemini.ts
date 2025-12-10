import type { ParsedSchema, SynthParameter } from '../types';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const EXTRACTION_PROMPT = `You are a synthesizer parameter extraction expert. Analyze this synthesizer manual/documentation and extract a structured parameter schema.

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

Return a JSON object with this exact structure:
{
  "manufacturer": "string",
  "synth_name": "string",
  "version": "string or null",
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
  "sysex_header": [numbers] or null
}

Focus on sound-shaping parameters. Skip utility parameters like MIDI settings unless they include CC mappings.
Be thorough - extract ALL parameters you can find in the document.

Document content:
`;

export async function extractSchemaFromText(
  text: string,
  apiKey: string
): Promise<ParsedSchema> {
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
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

export async function extractSchemaFromPDF(
  pdfBase64: string,
  apiKey: string
): Promise<ParsedSchema> {
  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            text: EXTRACTION_PROMPT
          },
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: pdfBase64
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

  return schema;
}
