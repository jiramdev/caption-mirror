import { NextResponse } from "next/server";
import { HOSTED } from "@/lib/server/store";
import { workerUrl, WORKER_SECRET } from "@/lib/server/worker";
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

  const w = await workerUrl();
  if (!w) return NextResponse.json({ error: "The analysis machine is offline — the job can't be tracked." }, { status: 503 });
  try {
    const r = await fetch(`${w}/jobs/${id}`, { headers: { "x-worker-secret": WORKER_SECRET }, signal: AbortSignal.timeout(8_000) });
    const j = await r.json().catch(() => ({}));
    return NextResponse.json(j, { status: r.status });
  } catch {
    return NextResponse.json({ error: "The analysis machine is offline — the job can't be tracked." }, { status: 503 });
  }
}
