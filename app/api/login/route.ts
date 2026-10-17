import { NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_PASSWORD, adminToken, checkPassword, isAdmin } from "@/lib/server/auth";
export const dynamic = "force-dynamic";

const cookie = (maxAge: number) =>
  `${ADMIN_COOKIE}=${maxAge ? adminToken() : ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.VERCEL ? "; Secure" : ""}`;

export async function GET(req: Request) {
  return NextResponse.json({ admin: isAdmin(req), configured: !!ADMIN_PASSWORD });
}
// POST { password } → sets the admin cookie. POST { logout: true } → clears it.
export async function POST(req: Request) {
  const { password, logout } = await req.json().catch(() => ({}));
  if (logout) return NextResponse.json({ ok: true }, { headers: { "set-cookie": cookie(0) } });
  if (!checkPassword(String(password ?? ""))) return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  return NextResponse.json({ ok: true }, { headers: { "set-cookie": cookie(30 * 86_400) } });
}
