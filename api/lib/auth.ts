import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifiedUser {
  id: string;
  email: string;
}

export function getAuthToken(req: { headers: { [key: string]: string | string[] | undefined } }): string | null {
  const header = req.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header ?? "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * Verify a Supabase JWT without calling the Auth server. In production this
 * should validate against Supabase's JWT secret; the implementation below
 * checks the signature using the configured secret and rejects expired tokens.
 */
export async function verifyUser(token: string): Promise<VerifiedUser | null> {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    // When no JWT secret is configured, fall back to the Supabase Auth server.
    const { data, error } = await import("./supabase.js").then((m) =>
      m.supabase.auth.getUser(token),
    );
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? "" };
  }

  const [headerB64, payloadB64, signatureB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !signatureB64) return null;

  const signature = Buffer.from(signatureB64.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const expected = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    return null;
  }

  const payload = JSON.parse(
    Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
  ) as { sub?: string; email?: string; exp?: number };
  if (!payload.sub || !payload.exp || payload.exp * 1000 < Date.now()) return null;
  return { id: payload.sub, email: payload.email ?? "" };
}
