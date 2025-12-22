// Entrained API - Central Registry and EAP Protocol
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, AppManifest, RegisteredApp, CapabilityLookupResponse, RegistryResponse } from './types';

const app = new Hono<{ Bindings: Env }>();

// CORS for cross-origin requests from entrained.ai subdomains
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return 'https://api.entrained.ai';
    if (origin.endsWith('.entrained.ai') || origin === 'https://entrained.ai') {
      return origin;
    }
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return origin;
    }
    return null;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/health', (c) => c.json({ status: 'ok', service: 'api-registry' }));

// =================================
// Registry Routes
// =================================

// GET /registry - List all registered apps
app.get('/registry', async (c) => {
  const apps = await getRegisteredApps(c.env);

  const response: RegistryResponse = {
    version: '1.0',
    apps,
  };

  return c.json(response);
});

// GET /registry/apps/:domain - Get specific app info
app.get('/registry/apps/:domain', async (c) => {
  const domain = c.req.param('domain');
  const apps = await getRegisteredApps(c.env);
  const app = apps.find(a => a.domain === domain);

  if (!app) {
    return c.json({ error: 'App not found' }, 404);
  }

  return c.json({ data: app });
});

// GET /registry/capabilities/:id - Find providers for a capability
app.get('/registry/capabilities/:id', async (c) => {
  const capabilityId = c.req.param('id');
  const apps = await getRegisteredApps(c.env);

  const providers: CapabilityLookupResponse['providers'] = [];

  for (const registeredApp of apps) {
    if (!registeredApp.manifest) continue;

    for (const cap of registeredApp.manifest.capabilities) {
      if (cap.id === capabilityId) {
        providers.push({
          app: registeredApp.domain,
          endpoint: `https://${registeredApp.domain}${cap.endpoint}`,
          name: cap.name,
          description: cap.description,
        });
      }
    }
  }

  const response: CapabilityLookupResponse = {
    capability: capabilityId,
    providers,
  };

  return c.json(response);
});

// GET /registry/capabilities - List all capabilities across all apps
app.get('/registry/capabilities', async (c) => {
  const apps = await getRegisteredApps(c.env);
  const capabilities: Record<string, { providers: string[]; description: string }> = {};

  for (const app of apps) {
    if (!app.manifest) continue;

    for (const cap of app.manifest.capabilities) {
      if (!capabilities[cap.id]) {
        capabilities[cap.id] = {
          providers: [],
          description: cap.description,
        };
      }
      capabilities[cap.id].providers.push(app.domain);
    }
  }

  return c.json({ capabilities });
});

// POST /registry/refresh - Force refresh manifests from all apps
app.post('/registry/refresh', async (c) => {
  const apps = await refreshAllManifests(c.env);
  return c.json({ message: 'Refreshed', apps: apps.length });
});

// POST /registry/refresh/:domain - Refresh specific app manifest
app.post('/registry/refresh/:domain', async (c) => {
  const domain = c.req.param('domain');
  const result = await refreshManifest(c.env, domain);

  if (result.error) {
    return c.json({ error: result.error }, 500);
  }

  return c.json({ message: 'Refreshed', app: result.app });
});

// =================================
// Helper Functions
// =================================

async function getRegisteredApps(env: Env): Promise<RegisteredApp[]> {
  // Try to get from cache first
  const cached = await env.REGISTRY.get('apps', 'json') as RegisteredApp[] | null;

  if (cached && cached.length > 0) {
    return cached;
  }

  // Bootstrap from known apps
  return await refreshAllManifests(env);
}

async function refreshAllManifests(env: Env): Promise<RegisteredApp[]> {
  const knownApps = env.KNOWN_APPS.split(',').map(s => s.trim());
  const apps: RegisteredApp[] = [];

  for (const domain of knownApps) {
    const result = await fetchManifest(domain);
    apps.push(result);
  }

  // Cache the results
  await env.REGISTRY.put('apps', JSON.stringify(apps), {
    expirationTtl: 300, // 5 minutes
  });

  return apps;
}

async function refreshManifest(env: Env, domain: string): Promise<{ app?: RegisteredApp; error?: string }> {
  const result = await fetchManifest(domain);

  // Update cache
  const apps = await getRegisteredApps(env);
  const index = apps.findIndex(a => a.domain === domain);

  if (index >= 0) {
    apps[index] = result;
  } else {
    apps.push(result);
  }

  await env.REGISTRY.put('apps', JSON.stringify(apps), {
    expirationTtl: 300,
  });

  if (result.status === 'error') {
    return { error: result.lastError };
  }

  return { app: result };
}

async function fetchManifest(domain: string): Promise<RegisteredApp> {
  const manifestUrl = `https://${domain}/manifest.json`;

  try {
    const response = await fetch(manifestUrl, {
      headers: { 'Accept': 'application/json' },
      cf: { cacheTtl: 60 }, // Cache for 1 minute at edge
    });

    if (!response.ok) {
      return {
        domain,
        manifestUrl,
        status: 'error',
        lastSeen: new Date().toISOString(),
        lastError: `HTTP ${response.status}`,
      };
    }

    const manifest = await response.json() as AppManifest;

    return {
      domain,
      manifestUrl,
      manifest,
      status: 'active',
      lastSeen: new Date().toISOString(),
    };
  } catch (error) {
    return {
      domain,
      manifestUrl,
      status: 'error',
      lastSeen: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =================================
// EAP.js - Serve the client library
// =================================

app.get('/eap.js', (c) => {
  const js = `
// Entrained App Protocol (EAP) Client Library v1.0
// https://api.entrained.ai/eap.js

class EntrainedApp {
  constructor(config = {}) {
    this.appDomain = config.appDomain || window.location.hostname;
    this.registryUrl = config.registryUrl || 'https://api.entrained.ai';
  }

  async invoke(capability, parameters = {}, options = {}) {
    // Find provider for this capability
    const providers = await this.findProviders(capability);
    if (providers.length === 0) {
      throw new Error(\`No provider found for capability: \${capability}\`);
    }

    const provider = providers[0];

    // Build intent
    const intent = {
      intent: capability,
      source: this.appDomain,
      target: new URL(provider.endpoint).hostname,
      requestId: this.generateId(),
      timestamp: new Date().toISOString(),
      parameters,
      returnTo: options.returnTo || window.location.href,
      returnMethod: options.returnMethod || 'postMessage'
    };

    // Invoke based on method
    if (options.returnMethod === 'redirect') {
      return this.invokeRedirect(provider.endpoint, intent);
    } else {
      return this.invokePostMessage(provider.endpoint, intent, options);
    }
  }

  invokeRedirect(endpoint, intent) {
    const url = \`\${endpoint}?intent=\${encodeURIComponent(JSON.stringify(intent))}\`;
    window.location.href = url;
  }

  invokePostMessage(endpoint, intent, options = {}) {
    return new Promise((resolve, reject) => {
      const url = \`\${endpoint}?intent=\${encodeURIComponent(JSON.stringify(intent))}\`;
      const width = options.width || 900;
      const height = options.height || 700;
      const left = (screen.width - width) / 2;
      const top = (screen.height - height) / 2;

      const popup = window.open(
        url,
        'eap-intent',
        \`width=\${width},height=\${height},left=\${left},top=\${top}\`
      );

      if (!popup) {
        reject(new Error('Popup blocked. Please allow popups for this site.'));
        return;
      }

      const handler = (event) => {
        // Verify origin is from entrained.ai
        if (!event.origin.endsWith('.entrained.ai') && !event.origin.includes('localhost')) {
          return;
        }

        const data = event.data;
        if (data && data.requestId === intent.requestId) {
          window.removeEventListener('message', handler);

          if (data.status === 'success') {
            resolve(data.result);
          } else if (data.status === 'cancelled') {
            reject(new Error('User cancelled'));
          } else {
            reject(new Error(data.error?.message || 'Intent failed'));
          }

          popup.close();
        }
      };

      window.addEventListener('message', handler);

      // Check if popup was closed without responding
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', handler);
          reject(new Error('Popup closed without completing'));
        }
      }, 500);

      // Timeout after specified duration (default 5 minutes)
      const timeout = options.timeout || 5 * 60 * 1000;
      setTimeout(() => {
        clearInterval(checkClosed);
        window.removeEventListener('message', handler);
        if (!popup.closed) {
          popup.close();
        }
        reject(new Error('Intent timeout'));
      }, timeout);
    });
  }

  async findProviders(capability) {
    const response = await fetch(\`\${this.registryUrl}/registry/capabilities/\${capability}\`);
    if (!response.ok) {
      throw new Error(\`Registry lookup failed: \${response.status}\`);
    }
    const data = await response.json();
    return data.providers || [];
  }

  async getRegistry() {
    const response = await fetch(\`\${this.registryUrl}/registry\`);
    if (!response.ok) {
      throw new Error(\`Registry fetch failed: \${response.status}\`);
    }
    return response.json();
  }

  generateId() {
    return \`\${Date.now()}-\${Math.random().toString(36).substr(2, 9)}\`;
  }

  // Helper to parse intent from URL (for provider apps)
  static parseIntent() {
    const params = new URLSearchParams(window.location.search);
    const intentJson = params.get('intent');
    if (!intentJson) return null;

    try {
      return JSON.parse(decodeURIComponent(intentJson));
    } catch {
      return null;
    }
  }

  // Helper to send result back (for provider apps)
  static sendResult(intent, result) {
    const response = {
      requestId: intent.requestId,
      status: 'success',
      timestamp: new Date().toISOString(),
      result
    };

    if (window.opener && intent.returnMethod === 'postMessage') {
      window.opener.postMessage(response, \`https://\${intent.source}\`);
    } else if (intent.returnTo) {
      const url = \`\${intent.returnTo}?result=\${encodeURIComponent(JSON.stringify(response))}\`;
      window.location.href = url;
    }
  }

  // Helper to send error back (for provider apps)
  static sendError(intent, code, message) {
    const response = {
      requestId: intent.requestId,
      status: 'error',
      timestamp: new Date().toISOString(),
      error: { code, message }
    };

    if (window.opener && intent.returnMethod === 'postMessage') {
      window.opener.postMessage(response, \`https://\${intent.source}\`);
    } else if (intent.returnTo) {
      const url = \`\${intent.returnTo}?error=\${encodeURIComponent(JSON.stringify(response))}\`;
      window.location.href = url;
    }
  }

  // Helper to send cancel back (for provider apps)
  static sendCancel(intent) {
    const response = {
      requestId: intent.requestId,
      status: 'cancelled',
      timestamp: new Date().toISOString()
    };

    if (window.opener && intent.returnMethod === 'postMessage') {
      window.opener.postMessage(response, \`https://\${intent.source}\`);
    } else if (intent.returnTo) {
      const url = \`\${intent.returnTo}?cancelled=1\`;
      window.location.href = url;
    }
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EntrainedApp };
} else if (typeof window !== 'undefined') {
  window.EntrainedApp = EntrainedApp;
}
`.trim();

  return c.text(js, 200, {
    'Content-Type': 'application/javascript',
    'Cache-Control': 'public, max-age=3600',
  });
});

// Landing page
app.get('/', (c) => {
  return c.json({
    name: 'Entrained API',
    description: 'Central registry and EAP protocol for the Entrained platform',
    version: '1.0.0',
    endpoints: {
      registry: '/registry',
      capabilities: '/registry/capabilities',
      capabilityLookup: '/registry/capabilities/:id',
      appLookup: '/registry/apps/:domain',
      refresh: '/registry/refresh',
      clientLibrary: '/eap.js',
    },
    documentation: 'https://entrained.ai/docs/eap',
  });
});

export default app;
