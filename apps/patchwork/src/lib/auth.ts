import type { Context, Next } from 'hono';
import type { Bindings, AuthUser } from '../types';

interface JWTPayload {
  sub: string;
  email: string;
  exp: number;
  iat: number;
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    const encoder = new TextEncoder();
    const data = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = Uint8Array.from(
      atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );
    const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(data));

    if (!valid) return null;

    const payload: JWTPayload = JSON.parse(atob(payloadB64));

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// Middleware that requires authentication
export function requireAuth() {
  return async (c: Context<{ Bindings: Bindings; Variables: { user: AuthUser } }>, next: Next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.slice(7);
    const payload = await verifyJWT(token, c.env.JWT_SECRET);

    if (!payload) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    c.set('user', {
      id: payload.sub,
      email: payload.email,
    });

    await next();
  };
}

// Middleware that optionally extracts user (for public endpoints that may have auth)
export function optionalAuth() {
  return async (c: Context<{ Bindings: Bindings; Variables: { user?: AuthUser } }>, next: Next) => {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = await verifyJWT(token, c.env.JWT_SECRET);

      if (payload) {
        c.set('user', {
          id: payload.sub,
          email: payload.email,
        });
      }
    }

    await next();
  };
}
