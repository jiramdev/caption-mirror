import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
export const dynamic = "force-dynamic";
// The home page demo: a single temporary clip in public/_tmp (replaced on every new link; never part of the library).
export async function GET() {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "_tmp", "current.json"), "utf8"));
    return NextResponse.json({ ...d, videoUrl: `/api/media/_tmp/videos/current.mp4?v=${d.cues?.[0]?.start ?? 0}-${d.cues?.length ?? 0}` });
  } catch { return NextResponse.json({ error: "no demo clip yet" }, { status: 404 }); }
}
