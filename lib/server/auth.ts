/**
 * Admin gate for the researcher pages (/test/library, /results) and their mutating APIs.
 * Password lives in ADMIN_PASSWORD (Vercel + .env.local). The session is an HMAC cookie, so no database is needed.
 * When no password is configured (plain local `npm run dev`), everything stays open, like before.
 * Server-side only (node:crypto).
 */
import crypto from "node:crypto";

export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
export const ADMIN_COOKIE = "cm_admin";

const key = () => crypto.createHash("sha256").update("caption-mirror-admin|" + ADMIN_PASSWORD).digest();
export function adminToken(): string {
  return crypto.createHmac("sha256", key()).update("v1").digest("hex");
}
export function checkPassword(pw: string): boolean {
  if (!ADMIN_PASSWORD) return true;
  const a = crypto.createHash("sha256").update(String(pw)).digest();
  const b = crypto.createHash("sha256").update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
function valid(token: string | null | undefined): boolean {
  if (!ADMIN_PASSWORD) return true; // no password set → open (local development)
  if (!token) return false;
  const want = adminToken(), got = String(token);
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
export function cookieToken(req: Request): string | null {
  const m = new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;\\s]+)`).exec(req.headers.get("cookie") || "");
  return m ? decodeURIComponent(m[1]) : null;
}
/** Is this request an admin? */
export function isAdmin(req: Request): boolean {
  return valid(cookieToken(req));
}
/** Same check for a bare cookie value (pages read it via next/headers). */
export function isAdminToken(token: string | null | undefined): boolean {
  return valid(token);
}
