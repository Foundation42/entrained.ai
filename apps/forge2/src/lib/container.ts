/**
 * Forge 2.0 Bundler Container
 *
 * Durable Object that wraps the container running the esbuild bundler.
 */

import { Container } from '@cloudflare/containers';

export class ForgeBundler extends Container {
  // Port the Bun server listens on
  defaultPort = 8080;

  // Sleep after 10 minutes of inactivity
  sleepAfter = '600s';

  // Timeout configuration for container spin-up
  containerTimeouts = {
    instanceGetTimeoutMS: 60000,   // 60s - allow for traffic spikes
    portReadyTimeoutMS: 60000,     // 60s - Bun + esbuild startup (faster than AI container)
  };
}
