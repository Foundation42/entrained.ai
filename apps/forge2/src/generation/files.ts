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
- Prefer Tailwind CSS classes for styling when applicable
- Handle loading and error states when appropriate

Output a JSON object with exactly two keys:
1. "code": The complete TypeScript/React code (as a string)
2. "demo_props": An object with example prop values that would render a nice demo of the component

Example output format:
{"code": "import React from 'react';\\n\\ninterface Props {\\n  title: string;\\n}\\n\\nconst MyComponent: React.FC<Props> = ({ title }) => {\\n  return <h1>{title}</h1>;\\n};\\n\\nexport default MyComponent;", "demo_props": {"title": "Hello World"}}

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
- Follow BEM naming convention for classes
- Include responsive design considerations
- Use relative units (rem, em) over pixels where appropriate
- Group related properties logically
- Include helpful comments for sections

Output ONLY the CSS code. No explanations, no markdown fences. Just pure code.`,

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

  // For TSX/JSX, parse JSON to extract code and demo_props
  let content: string;
  let demo_props: Record<string, unknown> | undefined;

  if (fileType === 'tsx' || fileType === 'jsx') {
    try {
      const parsed = JSON.parse(rawContent);
      content = parsed.code || rawContent;
      demo_props = parsed.demo_props;
      console.log(`[FileGen] Parsed TSX with demo_props: ${JSON.stringify(demo_props)}`);
    } catch {
      // Fallback if JSON parsing fails - use raw content
      console.warn(`[FileGen] Failed to parse JSON, using raw content`);
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
