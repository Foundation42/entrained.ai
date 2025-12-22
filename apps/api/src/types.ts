// Entrained API types - Registry and EAP Protocol

export interface Env {
  REGISTRY: KVNamespace;
  KNOWN_APPS: string;
}

// =================================
// EAP Manifest Types
// =================================

export interface AppManifest {
  app: string;           // e.g., "sprites.entrained.ai"
  version: string;       // semver
  name: string;          // Human-readable name
  description: string;   // What this app does

  capabilities: Capability[];

  permissions?: string[];  // What this app needs access to

  queues?: {
    produces?: string[];   // Events this app emits
    consumes?: string[];   // Events this app handles
  };

  introspection?: {
    health?: string;       // Health check endpoint
    metrics?: string;      // Metrics endpoint
    logs?: string;         // Logs endpoint
  };

  ai?: {
    apiEndpoint?: string;  // Base API endpoint for AI access
    instructions?: {
      summary: string;
      capabilities?: string[];
      bestPractices?: string[];
    };
  };
}

export interface Capability {
  id: string;              // e.g., "avatar.create"
  name: string;            // Human-readable name
  description: string;     // What this capability does
  endpoint: string;        // Path to invoke (e.g., "/create")
  method?: 'GET' | 'POST'; // HTTP method (default: GET)

  parameters?: Record<string, ParameterDef>;

  returns?: {
    type: string;
    schema?: Record<string, string>;
  };

  aiInstructions?: {
    summary: string;
    examples?: Array<{
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }>;
    constraints?: string[];
    tips?: string[];
  };
}

export interface ParameterDef {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'url';
  required?: boolean;
  optional?: boolean;
  description?: string;
  default?: unknown;
  enum?: string[];
}

// =================================
// Intent Types
// =================================

export interface Intent {
  intent: string;          // Capability ID (e.g., "avatar.create")
  source: string;          // Origin app domain
  target: string;          // Target app domain
  requestId: string;       // Unique request ID
  timestamp: string;       // ISO timestamp

  parameters: Record<string, unknown>;

  context?: {
    sessionId?: string;
    referrer?: string;
    userId?: string;
    [key: string]: unknown;
  };

  returnTo: string;        // URL to return to
  returnMethod?: 'postMessage' | 'redirect' | 'callback';
}

export interface IntentResult {
  requestId: string;
  status: 'success' | 'error' | 'cancelled';
  timestamp: string;

  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
}

// =================================
// Registry Types
// =================================

export interface RegisteredApp {
  domain: string;
  manifestUrl: string;
  manifest?: AppManifest;
  status: 'active' | 'inactive' | 'error';
  lastSeen: string;
  lastError?: string;
}

export interface CapabilityProvider {
  app: string;
  endpoint: string;
  capability: Capability;
}

export interface RegistryResponse {
  version: string;
  apps: RegisteredApp[];
}

export interface CapabilityLookupResponse {
  capability: string;
  providers: Array<{
    app: string;
    endpoint: string;
    name: string;
    description: string;
  }>;
}
