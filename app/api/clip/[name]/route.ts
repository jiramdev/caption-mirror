import { NextResponse } from "next/server";
import { getClip } from "@/lib/server/store";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const c = await getClip((await params).name);
  return c ? NextResponse.json(c) : NextResponse.json({ error: "not found" }, { status: 404 });
}
