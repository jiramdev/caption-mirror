import { NextResponse } from "next/server";
import { setClipSetting } from "@/lib/server/store";
import { DELIVERIES } from "@/lib/types";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const { name, intended } = await req.json();
  if (typeof name !== "string" || (intended && !(DELIVERIES as readonly string[]).includes(intended))) return NextResponse.json({ error: "bad input" }, { status: 400 });
  await setClipSetting(name, intended || null);
  return NextResponse.json({ ok: true });
}
