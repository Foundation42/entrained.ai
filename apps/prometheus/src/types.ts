export interface Env {
  PROMETHEUS_EDGE: string;
}

export interface Cell {
  id: string;
  type: 'code' | 'markdown';
  content: string;
  output?: CellOutput;
  status: 'idle' | 'running' | 'success' | 'error';
}

export interface CellOutput {
  type: 'result' | 'error' | 'stream';
  value: unknown;
  timing_ms?: number;
}

export interface CompileResult {
  hash: string;
  expanded_intent: string;
  signature: string;
  size: number;
  timing_ms: number;
  cached: boolean;
}

export interface EvalResult {
  result: unknown;
  timing_ms: number;
}

export interface SearchResult {
  query: string;
  results: Array<{
    hash: string;
    name: string;
    intent: string;
    signature: string;
    similarity: number;
    size: number;
  }>;
  total: number;
}
