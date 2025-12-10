export interface Bindings {
  DB: D1Database;
  JWT_SECRET: string;
  MAILGUN_API_KEY: string;
  CORS_ORIGINS: string;
}

export interface User {
  id: string;
  email: string;
  email_verified_at: number | null;
  password_hash: string;
  display_name: string | null;
  created_at: number;
  updated_at: number;
}

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  created_at: number;
  last_seen_at: number | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface JWTPayload {
  sub: string;  // user_id
  email: string;
  exp: number;
  iat: number;
}
