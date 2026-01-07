/**
 * File Generation
 *
 * Generates source files (TSX, TS, CSS, etc.) using LLM providers.
 * Each file type has specialized prompts and extraction logic.
 */

import type { Env, CreateFileRequest, FileType } from '../types';
import { generateCompletion, type LLMMessage, type LLMOptions } from './llm';

export interface FileGenerationHints {
  /** Dependencies that should be imported */
  dependencies?: string[];

  /** Style hints (e.g., "modern", "minimal", "dark") */
  style?: string;

  /** Reference file IDs or content samples */
  references?: string[];
}

export interface PropDefinition {
  name: string;
  type: string;
  required: boolean;
  default: unknown;
}

export interface GeneratedFile {
  /** The generated source code */
  content: string;

  /** Canonical name derived from description */
  canonical_name: string;

  /** The file type */
  file_type: FileType;

  /** Model used for generation */
  model: string;

  /** Provider used */
  provider: string;

  /** Demo props for rendering (TSX/JSX only) */
  demo_props?: Record<string, unknown>;

  /** Props interface (TSX/JSX only) */
  props?: PropDefinition[];

  /** CSS class names used (TSX/JSX only) */
  css_classes?: string[];

  /** Export names */
  exports?: string[];

  /** CSS classes defined (CSS only) */
  classes_defined?: string[];

  /** CSS variables defined (CSS only) */
  variables_defined?: string[];

  /** CSS keyframe animations defined (CSS only) */
  keyframes_defined?: string[];
}

// =============================================================================
// System Prompts by File Type
// =============================================================================

const SYSTEM_PROMPTS: Record<string, string> = {
  tsx: `You are an expert React TypeScript developer. Generate clean, modern React components using TypeScript.

Rules:
- Use functional components with hooks
- Use TypeScript for all type annotations
- Export the main component as the default export
- Use modern React patterns (hooks, composition)
- Keep components focused and single-purpose
- Use descriptive prop names with TypeScript interfaces
- Include JSDoc comments for the main component
- Use semantic CSS class names (not Tailwind) for styling - these will be matched to a CSS file
- Handle loading and error states when appropriate

Output a JSON object with these keys:
1. "code": The complete TypeScript/React code (as a string)
2. "demo_props": Example prop values for a nice demo render
3. "props": Array of prop definitions: [{"name": "title", "type": "string", "required": true, "default": null}, ...]
4. "css_classes": Array of CSS class names used in the component (e.g., ["card", "card-title", "btn"])
5. "exports": Array of export names (e.g., ["default", "CardProps"])

Example:
{"code": "import React from 'react';\\n\\ninterface CardProps {\\n  title: string;\\n  subtitle?: string;\\n}\\n\\nconst Card: React.FC<CardProps> = ({ title, subtitle }) => {\\n  return <div className=\\"card\\"><h2 className=\\"card-title\\">{title}</h2>{subtitle && <p className=\\"card-subtitle\\">{subtitle}</p>}</div>;\\n};\\n\\nexport default Card;", "demo_props": {"title": "Hello", "subtitle": "World"}, "props": [{"name": "title", "type": "string", "required": true, "default": null}, {"name": "subtitle", "type": "string", "required": false, "default": null}], "css_classes": ["card", "card-title", "card-subtitle"], "exports": ["default", "CardProps"]}

Output ONLY valid JSON. No markdown fences, no explanations.`,

  ts: `You are an expert TypeScript developer. Generate clean, well-typed TypeScript code.

Rules:
- Use strict TypeScript with explicit types
- Export functions and types appropriately
- Include JSDoc comments for public APIs
- Use modern ES features (async/await, destructuring)
- Handle errors appropriately
- Keep functions focused and composable

Output ONLY the TypeScript code. No explanations, no markdown fences. Just pure code.`,

  css: `You are an expert CSS developer. Generate clean, modern CSS.

Rules:
- Use modern CSS features (custom properties, flexbox, grid)
- Use semantic class names that describe purpose (e.g., "card", "card-title", "btn-primary")
- Include responsive design considerations
- Use relative units (rem, em) over pixels where appropriate
- Group related properties logically
- Include helpful comments for sections

Output a JSON object with these keys:
1. "code": The complete CSS code (as a string)
2. "classes": Array of class names defined (without the dot, e.g., ["card", "card-title", "btn"])
3. "variables": Array of CSS custom property names defined (e.g., ["--primary-color", "--spacing"])
4. "keyframes": Array of keyframe animation names (e.g., ["fadeIn", "pulse"])

Example:
{"code": ".card { padding: 1rem; }\\n.card-title { font-size: 1.5rem; }", "classes": ["card", "card-title"], "variables": [], "keyframes": []}

Output ONLY valid JSON. No markdown fences, no explanations.`,

  js: `You are an expert JavaScript developer. Generate clean, modern JavaScript.

Rules:
- Use ES6+ features (arrow functions, destructuring, async/await)
- Keep functions focused and composable
- Include JSDoc comments for public APIs
- Handle errors appropriately
- Use descriptive variable names

Output ONLY the JavaScript code. No explanations, no markdown fences. Just pure code.`,

  jsx: `You are an expert React JavaScript developer. Generate clean React components.

Rules:
- Use functional components with hooks
- Use PropTypes for type checking
- Export the main component as the default export
- Use modern React patterns (hooks, composition)
- Keep components focused and single-purpose

Output ONLY the JavaScript code. No explanations, no markdown fences. Just pure code.`,

  json: `You are generating a JSON configuration or data file.

Rules:
- Output valid JSON only
- Use meaningful key names
- Include comments as "_comment" fields if needed
- Structure data logically

Output ONLY valid JSON. No explanations, no markdown fences. Just pure JSON.`,

  html: `You are an expert HTML developer. Generate semantic, accessible HTML.

Rules:
- Use semantic HTML5 elements
- Include proper accessibility attributes
- Use appropriate meta tags
- Follow best practices for structure

Output ONLY the HTML code. No explanations, no markdown fences. Just pure code.`,

  py: `You are an expert Python developer. Generate clean, Pythonic code.

Rules:
- Follow PEP 8 style guidelines
- Use type hints for function signatures
- Include docstrings for modules, classes, and functions
- Use modern Python 3.10+ features where appropriate
- Handle exceptions appropriately

Output ONLY the Python code. No explanations, no markdown fences. Just pure code.`,

  go: `You are an expert Go developer. Generate clean, idiomatic Go code.

Rules:
- Follow Go conventions and style
- Use proper error handling
- Include comments for exported functions
- Use meaningful package names
- Keep functions focused

Output ONLY the Go code. No explanations, no markdown fences. Just pure code.`,

  rs: `You are an expert Rust developer. Generate clean, safe Rust code.

Rules:
- Follow Rust conventions and style
- Use proper error handling with Result types
- Include documentation comments for public items
- Prefer safe Rust over unsafe when possible
- Use descriptive variable names

Output ONLY the Rust code. No explanations, no markdown fences. Just pure code.`,

  sql: `You are an expert SQL developer. Generate clean, efficient SQL.

Rules:
- Use standard SQL syntax (or specify dialect if needed)
- Include comments for complex queries
- Use meaningful table and column aliases
- Optimize for readability and performance

Output ONLY the SQL code. No explanations, no markdown fences. Just pure code.`,

  md: `You are generating Markdown documentation.

Rules:
- Use proper heading hierarchy
- Include code blocks with language specifiers
- Use lists and tables where appropriate
- Keep content well-organized

Output ONLY the Markdown content. No explanations, no extra fences.`,
};

// Default prompt for unknown file types
const DEFAULT_PROMPT = `You are an expert developer. Generate clean, well-structured code.

Rules:
- Follow best practices for the language/format
- Include appropriate comments
- Use descriptive names
- Keep the code focused and readable

Output ONLY the code. No explanations, no markdown fences. Just pure code.`;

// =============================================================================
// Generation Functions
// =============================================================================

/**
 * Generate a file from a natural language description
 */
export async function generateFile(
  description: string,
  fileType: FileType,
  hints: FileGenerationHints | undefined,
  env: Env
): Promise<GeneratedFile> {
  const systemPrompt = SYSTEM_PROMPTS[fileType] ?? DEFAULT_PROMPT;

  // Build user prompt with hints
  let userPrompt = `Generate: ${description}`;

  if (hints?.dependencies?.length) {
    userPrompt += `\n\nUse these dependencies: ${hints.dependencies.join(', ')}`;
  }

  if (hints?.style) {
    userPrompt += `\n\nStyle: ${hints.style}`;
  }

  if (hints?.references?.length) {
    userPrompt += `\n\nReference examples:\n${hints.references.join('\n\n---\n\n')}`;
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const options: LLMOptions = {
    max_tokens: 8192,
    temperature: 0.3, // Lower temperature for more consistent code
  };

  console.log(`[FileGen] Generating ${fileType} file: ${description.slice(0, 100)}...`);

  const response = await generateCompletion(messages, options, env);

  // Clean up the response (remove any markdown fences that might have slipped through)
  let rawContent = response.content.trim();
  rawContent = stripMarkdownFences(rawContent);

  // Generate canonical name from description
  const canonical_name = descriptionToCanonicalName(description);

  // Parse JSON output for file types that use structured responses
  let content: string;
  let demo_props: Record<string, unknown> | undefined;
  let props: PropDefinition[] | undefined;
  let css_classes: string[] | undefined;
  let exports: string[] | undefined;
  let classes_defined: string[] | undefined;
  let variables_defined: string[] | undefined;
  let keyframes_defined: string[] | undefined;

  if (fileType === 'tsx' || fileType === 'jsx') {
    try {
      const parsed = JSON.parse(rawContent);
      content = parsed.code || rawContent;
      demo_props = parsed.demo_props;
      props = parsed.props;
      css_classes = parsed.css_classes;
      exports = parsed.exports;
      console.log(`[FileGen] Parsed TSX - props: ${props?.length || 0}, css_classes: ${css_classes?.length || 0}`);
    } catch {
      console.warn(`[FileGen] Failed to parse TSX JSON, using raw content`);
      content = rawContent;
    }
  } else if (fileType === 'css') {
    try {
      const parsed = JSON.parse(rawContent);
      content = parsed.code || rawContent;
      classes_defined = parsed.classes;
      variables_defined = parsed.variables;
      keyframes_defined = parsed.keyframes;
      console.log(`[FileGen] Parsed CSS - classes: ${classes_defined?.length || 0}, variables: ${variables_defined?.length || 0}`);
    } catch {
      console.warn(`[FileGen] Failed to parse CSS JSON, using raw content`);
      content = rawContent;
    }
  } else {
    content = rawContent;
  }

  console.log(`[FileGen] Generated ${content.length} chars, name: ${canonical_name}`);

  return {
    content,
    canonical_name,
    file_type: fileType,
    model: response.model,
    provider: response.provider,
    demo_props,
    props,
    css_classes,
    exports,
    classes_defined,
    variables_defined,
    keyframes_defined,
  };
}

/**
 * Update an existing file based on a change description
 */
export async function updateFile(
  existingContent: string,
  changeDescription: string,
  fileType: FileType,
  env: Env
): Promise<GeneratedFile> {
  const systemPrompt = SYSTEM_PROMPTS[fileType] ?? DEFAULT_PROMPT;

  const updatePrompt = `Here is existing code:

\`\`\`
${existingContent}
\`\`\`

Apply this change: ${changeDescription}

Output the complete updated code.`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: updatePrompt },
  ];

  const options: LLMOptions = {
    max_tokens: 8192,
    temperature: 0.2, // Even lower for updates to be more precise
  };

  console.log(`[FileGen] Updating ${fileType} file: ${changeDescription.slice(0, 100)}...`);

  const response = await generateCompletion(messages, options, env);

  let content = response.content.trim();
  content = stripMarkdownFences(content);

  const canonical_name = descriptionToCanonicalName(changeDescription);

  return {
    content,
    canonical_name,
    file_type: fileType,
    model: response.model,
    provider: response.provider,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Strip markdown code fences from content
 */
function stripMarkdownFences(content: string): string {
  // Remove opening fence with optional language
  let cleaned = content.replace(/^```[\w-]*\n?/i, '');
  // Remove closing fence
  cleaned = cleaned.replace(/\n?```$/i, '');
  return cleaned.trim();
}

/**
 * Convert a description to a canonical name (slug)
 */
function descriptionToCanonicalName(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Spaces to hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, '') // Trim hyphens
    .slice(0, 50); // Limit length
}

/**
 * Hash a file generation request for caching
 */
export function hashFileRequest(
  description: string,
  fileType: FileType,
  hints?: FileGenerationHints
): string {
  const input = JSON.stringify({
    description: description.toLowerCase().trim(),
    fileType,
    hints: hints ?? null,
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
export function requestToHints(request: CreateFileRequest): FileGenerationHints | undefined {
  if (!request.hints) return undefined;

  return {
    dependencies: request.hints.dependencies,
    style: request.hints.style,
    references: request.hints.references,
  };
}

/**
 * Generate CSS that matches a component's css_classes
 * This is the key to AI-assisted composition - generating CSS that exactly matches
 * the class names used by a component.
 */
export async function generateCssForComponent(
  cssClasses: string[],
  componentDescription: string,
  styleHints: string | undefined,
  env: Env
): Promise<GeneratedFile> {
  const systemPrompt = `You are an expert CSS developer. Generate CSS that implements exactly the class names provided.

Rules:
- Define CSS rules for EXACTLY the class names given - no more, no less
- Use modern CSS features (custom properties, flexbox, grid)
- Include responsive design considerations
- Use relative units (rem, em) over pixels where appropriate
- Group related properties logically
- Make the styles visually appealing and professional

Output a JSON object with these keys:
1. "code": The complete CSS code (as a string)
2. "classes": Array of class names defined (should match the input exactly)
3. "variables": Array of CSS custom property names defined
4. "keyframes": Array of keyframe animation names

Output ONLY valid JSON. No markdown fences, no explanations.`;

  const userPrompt = `Generate CSS for a component described as: "${componentDescription}"

The component uses these CSS classes (you MUST define all of them):
${cssClasses.map(c => `- .${c}`).join('\n')}

${styleHints ? `Style hints: ${styleHints}` : ''}

Generate CSS that makes this component look polished and professional.`;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const options: LLMOptions = {
    max_tokens: 8192,
    temperature: 0.3,
  };

  console.log(`[FileGen] Generating CSS for ${cssClasses.length} classes: ${cssClasses.slice(0, 5).join(', ')}...`);

  const response = await generateCompletion(messages, options, env);

  let rawContent = response.content.trim();
  rawContent = stripMarkdownFences(rawContent);

  const canonical_name = descriptionToCanonicalName(componentDescription + '-styles');

  let content: string;
  let classes_defined: string[] | undefined;
  let variables_defined: string[] | undefined;
  let keyframes_defined: string[] | undefined;

  try {
    const parsed = JSON.parse(rawContent);
    content = parsed.code || rawContent;
    classes_defined = parsed.classes;
    variables_defined = parsed.variables;
    keyframes_defined = parsed.keyframes;
    console.log(`[FileGen] Parsed CSS - classes: ${classes_defined?.length || 0}, variables: ${variables_defined?.length || 0}`);
  } catch {
    console.warn(`[FileGen] Failed to parse CSS JSON, using raw content`);
    content = rawContent;
  }

  // Verify that all requested classes were defined
  // Normalize by removing leading dots for comparison
  const normalizedDefined = classes_defined?.map(c => c.replace(/^\./, '')) ?? [];
  const missingClasses = cssClasses.filter(c => !normalizedDefined.includes(c));
  if (missingClasses.length > 0) {
    console.warn(`[FileGen] Warning: ${missingClasses.length} classes may be missing: ${missingClasses.slice(0, 5).join(', ')}`);
  }
  // Also normalize classes_defined for storage (store without dots)
  classes_defined = normalizedDefined;

  return {
    content,
    canonical_name,
    file_type: 'css',
    model: response.model,
    provider: response.provider,
    classes_defined,
    variables_defined,
    keyframes_defined,
  };
}

/**
 * Get the MIME type for a file type
 */
export function getMimeType(fileType: FileType): string {
  const mimeMap: Record<string, string> = {
    tsx: 'text/typescript',
    ts: 'text/typescript',
    jsx: 'text/javascript',
    js: 'text/javascript',
    css: 'text/css',
    scss: 'text/x-scss',
    html: 'text/html',
    json: 'application/json',
    yaml: 'text/yaml',
    toml: 'text/toml',
    md: 'text/markdown',
    txt: 'text/plain',
    py: 'text/x-python',
    go: 'text/x-go',
    rs: 'text/x-rust',
    sql: 'text/x-sql',
  };

  return mimeMap[fileType] ?? 'text/plain';
}
