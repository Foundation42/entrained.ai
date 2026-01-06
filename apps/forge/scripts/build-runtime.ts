#!/usr/bin/env bun
/**
 * Build script for Forge runtime
 *
 * Reads the runtime JavaScript and exports it as a string constant
 * that can be imported by the worker.
 *
 * Source of truth: src/runtime/runtime.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

function buildRuntime() {
  const inputPath = resolve(rootDir, 'src/runtime/runtime.js');
  const outputPath = resolve(rootDir, 'src/runtime/runtime.generated.ts');

  console.log('Building runtime from:', inputPath);

  const jsCode = readFileSync(inputPath, 'utf-8');

  // Write as an exported string constant
  const output = `// AUTO-GENERATED - Do not edit directly!
// Source: src/runtime/runtime.js
// Run: bun run build:runtime

export const RUNTIME_JS = ${JSON.stringify(jsCode)};
`;

  writeFileSync(outputPath, output);
  console.log('Runtime built successfully:', outputPath);
  console.log(`Size: ${jsCode.length} bytes`);
}

buildRuntime();
