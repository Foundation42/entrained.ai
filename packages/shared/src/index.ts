// Shared types and utilities for Entrained.ai platform

export interface AuthUser {
  id: string;
  email: string;
  display_name: string | null;
  email_verified: boolean;
}

export interface JWTPayload {
  sub: string;
  email: string;
  exp: number;
  iat: number;
}

// Verify JWT using Web Crypto (can be used by any worker)
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

// Extract user from Authorization header
export async function getUserFromAuth(
  authHeader: string | undefined,
  jwtSecret: string
): Promise<AuthUser | null> {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  const payload = await verifyJWT(token, jwtSecret);

  if (!payload) {
    return null;
  }

  return {
    id: payload.sub,
    email: payload.email,
    display_name: null, // Would need to fetch from DB for full profile
    email_verified: true, // Assume verified if token is valid
  };
}

// Generate nanoid-compatible IDs
export function generateId(length = 21): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = '';
  for (let i = 0; i < length; i++) {
    id += alphabet[bytes[i] % 64];
  }
  return id;
}
