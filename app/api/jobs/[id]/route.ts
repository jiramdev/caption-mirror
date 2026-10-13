import { NextResponse } from "next/server";
import { jobs } from "@/lib/server/jobs";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const j = jobs.get((await params).id);
  if (!j) return NextResponse.json({ error: "unknown job (server restarted?)" }, { status: 404 });
  const { log, ...rest } = j;
  return NextResponse.json({ ...rest, log: j.status === "error" ? log.slice(-1500) : undefined });
}
