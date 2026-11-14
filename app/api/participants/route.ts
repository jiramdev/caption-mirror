import { NextResponse } from "next/server";
import { createParticipant, deleteParticipant, listParticipants, updateParticipant, HOSTED, sb } from "@/lib/server/store";
import { isAdmin } from "@/lib/server/auth";
export const dynamic = "force-dynamic";
const WORKER_STALE_MS = 60_000;
async function workerOnline() {
  if (!HOSTED) return true;
  try {
    const rows = await sb<{ updated_at: string }[]>("cm_analysis_worker?select=updated_at&id=eq.main&limit=1");
    return !!rows[0] && Date.now() - Date.parse(rows[0].updated_at) < WORKER_STALE_MS;
  } catch { return false; }
}
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  return NextResponse.json(await listParticipants());
}
export async function POST(req: Request) {
  if (!(await workerOnline())) return NextResponse.json({ error: "The researcher has paused testing. Please try again later." }, { status: 503 });
  const { name } = await req.json();
  if (typeof name !== "string" || name.trim().split(/\s+/).length < 2) return NextResponse.json({ error: "Please enter the participant's full name (first and last name)." }, { status: 400 });
  const p = await createParticipant(name.trim());
  if ("error" in p) return NextResponse.json(p, { status: 400 });
  return NextResponse.json(p);
}
// PATCH { id, pre? | post? | agency? | completedAt? }
export async function PATCH(req: Request) {
  const { id, pre, post, agency, completedAt } = await req.json();
  const patch = Object.fromEntries(Object.entries({ pre, post, agency, completedAt }).filter(([, v]) => v !== undefined));
  const p = await updateParticipant(String(id), patch);
  return p ? NextResponse.json(p) : NextResponse.json({ error: "not found" }, { status: 404 });
}
export async function DELETE(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id"); if (id) await deleteParticipant(id);
  return NextResponse.json({ ok: true });
}
