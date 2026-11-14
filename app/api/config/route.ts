import { NextResponse } from "next/server";
import { HOSTED } from "@/lib/server/store";
import { sb } from "@/lib/server/store";
export const dynamic = "force-dynamic";
const WORKER_STALE_MS = 60_000;
export async function GET() {
  let analysis = !HOSTED;
  if (HOSTED) {
    try {
      const rows = await sb<{ updated_at: string }[]>("cm_analysis_worker?select=updated_at&id=eq.main&limit=1");
      analysis = !!rows[0] && Date.now() - Date.parse(rows[0].updated_at) < WORKER_STALE_MS;
    }
    catch { analysis = false; }
  }
  return NextResponse.json({ hosted: HOSTED, analysis });
}
