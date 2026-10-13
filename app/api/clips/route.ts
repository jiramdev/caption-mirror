import { NextResponse } from "next/server";
import { deleteClip, listClips } from "@/lib/server/store";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(await listClips()); }
export async function DELETE(req: Request) {
  const name = new URL(req.url).searchParams.get("name"); if (name) await deleteClip(name);
  return NextResponse.json({ ok: true });
}
