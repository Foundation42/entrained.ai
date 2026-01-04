/**
 * Forge Generation Container
 *
 * Durable Object that wraps the container running the generation engine.
 */

import { Container } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

export class ForgeGenerator extends Container {
  // Port the Bun server listens on
  defaultPort = 8080;

  // Sleep after 5 minutes of inactivity (reduces cold starts)
  sleepAfter = '300s';

  // Timeout configuration for container spin-up
  containerTimeouts = {
    instanceGetTimeoutMS: 60000,   // 60s - allow for traffic spikes
    portReadyTimeoutMS: 120000,    // 120s - Bun + deps startup
  };

  // Pass secrets to container as environment variables
  envVars = {
    GEMINI_API_KEY: (env as Record<string, string>).GEMINI_API_KEY,
    GEMINI_MODEL: (env as Record<string, string>).GEMINI_MODEL || 'gemini-3-flash-preview',
  };
}
