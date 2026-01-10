/**
 * InstanceLive Durable Object
 *
 * Manages real-time SSE connections for a single instance.
 * When props are updated, broadcasts to all connected clients.
 *
 * Flow:
 * 1. Browser connects to /api/instances/:id/events (SSE)
 * 2. Worker routes to InstanceLive DO (idFromName = instance_id)
 * 3. DO holds connection, sends "connected" event
 * 4. When API updates props, it notifies DO
 * 5. DO broadcasts "props" event to all connected clients
 */

interface Env {
  CACHE: KVNamespace;
}

interface SSEConnection {
  stream: WritableStreamDefaultWriter<Uint8Array>;
  connectedAt: number;
}

export class InstanceLive {
  private state: DurableObjectState;
  private env: Env;
  private connections: Map<string, SSEConnection> = new Map();
  private encoder = new TextEncoder();
  private instanceId: string | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Initialize with instance ID if provided
    const instanceIdParam = url.searchParams.get('instance_id');
    if (instanceIdParam) {
      this.instanceId = instanceIdParam;
    }

    // SSE connection request
    if (url.pathname === '/connect' && request.method === 'GET') {
      return this.handleSSEConnect(request);
    }

    // Broadcast props update (called by API when props change)
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      return this.handleBroadcast(request);
    }

    // Health check / connection count
    if (url.pathname === '/status') {
      const startedAt = await this.state.storage.get('started_at') as number | undefined;
      return Response.json({
        instance_id: this.instanceId,
        connections: this.connections.size,
        uptime_ms: Date.now() - (startedAt || Date.now()),
      });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  /**
   * Handle new SSE connection
   */
  private async handleSSEConnect(_request: Request): Promise<Response> {
    const connectionId = crypto.randomUUID();

    // Create transform stream for SSE
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    // Store connection
    this.connections.set(connectionId, {
      stream: writer,
      connectedAt: Date.now(),
    });

    console.log(`[InstanceLive] New connection ${connectionId}, total: ${this.connections.size}`);

    // Send initial connected event
    const connectedEvent = this.formatSSE('connected', {
      connection_id: connectionId,
      instance_id: this.instanceId,
      timestamp: new Date().toISOString(),
    });

    // Write initial event and set up keepalive
    this.state.waitUntil((async () => {
      try {
        await writer.write(this.encoder.encode(connectedEvent));

        // Fetch and send current props
        if (this.instanceId) {
          const propsKey = `instance:${this.instanceId}:props`;
          const props = await this.env.CACHE.get(propsKey, { type: 'json' });
          if (props) {
            const propsEvent = this.formatSSE('props', {
              props,
              timestamp: new Date().toISOString(),
            });
            await writer.write(this.encoder.encode(propsEvent));
          }
        }

        // Keep connection alive with periodic pings
        let pingCount = 0;
        const maxPings = 7200; // ~1 hour at 500ms intervals

        while (pingCount < maxPings && this.connections.has(connectionId)) {
          await new Promise(resolve => setTimeout(resolve, 30000)); // 30s ping

          try {
            if (!this.connections.has(connectionId)) break;
            await writer.write(this.encoder.encode(': ping\n\n'));
            pingCount++;
          } catch {
            console.log(`[InstanceLive] Ping failed for ${connectionId}, removing`);
            break;
          }
        }
      } catch (error) {
        console.log(`[InstanceLive] Connection error for ${connectionId}:`, error);
      } finally {
        this.connections.delete(connectionId);
        try { await writer.close(); } catch {}
        console.log(`[InstanceLive] Connection ${connectionId} closed, remaining: ${this.connections.size}`);
      }
    })());

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  /**
   * Broadcast props update to all connected clients
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    const body = await request.json() as {
      type: 'props' | 'event';
      data: unknown;
    };

    const event = this.formatSSE(body.type, {
      ...body.data as object,
      timestamp: new Date().toISOString(),
    });

    const eventBytes = this.encoder.encode(event);
    let successCount = 0;
    const failedConnections: string[] = [];

    // Broadcast to all connections
    for (const [connId, conn] of this.connections) {
      try {
        await conn.stream.write(eventBytes);
        successCount++;
      } catch {
        console.log(`[InstanceLive] Failed to send to ${connId}`);
        failedConnections.push(connId);
      }
    }

    // Clean up failed connections
    for (const connId of failedConnections) {
      this.connections.delete(connId);
    }

    console.log(`[InstanceLive] Broadcast ${body.type} to ${successCount}/${this.connections.size + failedConnections.length} clients`);

    return Response.json({
      broadcast: true,
      sent: successCount,
      failed: failedConnections.length,
      total_connections: this.connections.size,
    });
  }

  /**
   * Format data as SSE event
   */
  private formatSSE(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  }
}
