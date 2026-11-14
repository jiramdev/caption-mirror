import { NextResponse } from "next/server";
import { HOSTED, sb } from "@/lib/server/store";
import { jobs } from "@/lib/server/jobs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!/^[a-z0-9]{1,16}$/.test(id)) return NextResponse.json({ error: "unknown job" }, { status: 404 });

  if (!HOSTED) {
    const j = jobs.get(id);
    if (!j) return NextResponse.json({ error: "unknown job (server restarted?)" }, { status: 404 });
    const { log, ...rest } = j;
    return NextResponse.json({ ...rest, log: j.status === "error" ? log.slice(-1500) : undefined });
  }

  try {
    const rows = await sb<{ id: string; status: string; stage: string; progress: number; name: string | null; error: string | null }[]>(
      `cm_analysis_jobs?select=id,status,stage,progress,name,error&id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    return rows[0] ? NextResponse.json(rows[0]) : NextResponse.json({ error: "unknown job" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Analysis status is unavailable because Supabase could not be reached." }, { status: 503 });
  }
}
