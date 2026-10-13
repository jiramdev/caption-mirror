import { NextResponse } from "next/server";
import { listResponses, saveResponse, getClipSettings, listParticipants } from "@/lib/server/store";
import type { TrialResponse } from "@/lib/types";
export const dynamic = "force-dynamic";

const COLS = ["createdAt", "participantId", "participant", "pnum", "trialIndex", "clip", "condition", "emotionClarity", "readability", "keepUp", "comfort", "distraction",
  "perceived", "intended", "correct", "comment", "watchTime", "pauses", "seeks", "rewinds", "replays", "captionToggles", "fullscreen", "intensityChanges", "ended"] as const;
const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function POST(req: Request) {
  const r = (await req.json()) as TrialResponse;
  if (!r.participantId || !r.participant || !r.clip) return NextResponse.json({ error: "missing fields" }, { status: 400 });
  const intended = (await getClipSettings())[r.clip] ?? null; // scored server-side
  const saved = await saveResponse({ ...r, intended, correct: intended ? r.perceived === intended : null, events: (r.events || []).slice(0, 2000) });
  return NextResponse.json({ ok: true, id: saved.id });
}

const PCOLS = ["pnum", "id", "name", "createdAt", "completedAt", "trial1", "trial2", "trial3", "pre_situations", "pre_other", "pre_frequency", "pre_miss",
  "agency_clip", "agency_finalIntensity", "agency_finalOn", "agency_bestIntensity", "agency_intensityChanges", "agency_offToggles", "agency_watchTime", "agency_comment", "agency_events",
  "post_preferred", "post_why", "post_wouldUse"];

export async function GET(req: Request) {
  const u = new URL(req.url);
  const rows = await listResponses();
  const parts = await listParticipants();
  const fmt = u.searchParams.get("format");
  const csv = (body: string, fn: string) => new NextResponse(body, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename=${fn}` } });
  if (fmt === "csv") {
    // one row per trial, joined with that participant's survey answers
    const cols = [...COLS, "pre_situations", "pre_frequency", "post_preferred", "post_wouldUse", "agency_finalIntensity", "agency_finalOn", "agency_bestIntensity"];
    const lines = rows.map((r) => {
      const p = parts.find((x) => x.id === r.participantId);
      const extra: Record<string, unknown> = { pre_situations: p?.pre?.situations.join("; "), pre_frequency: p?.pre?.frequency, post_preferred: p?.post?.preferred, post_wouldUse: p?.post?.wouldUse,
        agency_finalIntensity: p?.agency?.finalIntensity, agency_finalOn: p?.agency?.finalOn, agency_bestIntensity: p?.agency?.bestIntensity };
      return cols.map((c) => esc(c in extra ? extra[c] : (r as unknown as Record<string, unknown>)[c] ?? (r.metrics as unknown as Record<string, unknown>)?.[c])).join(",");
    });
    return csv([cols.join(","), ...lines].join("\n") + "\n", "caption-mirror-trials.csv");
  }
  if (fmt === "participants") {
    const lines = parts.map((p) => {
      const v: Record<string, unknown> = { pnum: p.pnum, id: p.id, name: p.name, createdAt: p.createdAt, completedAt: p.completedAt,
        trial1: p.trials[0] && `${p.trials[0].clip}:${p.trials[0].condition}`, trial2: p.trials[1] && `${p.trials[1].clip}:${p.trials[1].condition}`, trial3: p.trials[2] && `${p.trials[2].clip}:${p.trials[2].condition}`,
        pre_situations: p.pre?.situations.join("; "), pre_other: p.pre?.otherSituation, pre_frequency: p.pre?.frequency, pre_miss: p.pre?.miss,
        agency_clip: p.agencyClip, agency_finalIntensity: p.agency?.finalIntensity, agency_finalOn: p.agency?.finalOn, agency_bestIntensity: p.agency?.bestIntensity,
        agency_intensityChanges: p.agency?.intensityChanges, agency_offToggles: p.agency?.offToggles, agency_watchTime: p.agency?.watchTime, agency_comment: p.agency?.comment,
        agency_events: p.agency ? JSON.stringify(p.agency.events) : "", post_preferred: p.post?.preferred, post_why: p.post?.why, post_wouldUse: p.post?.wouldUse };
      return PCOLS.map((c) => esc(v[c])).join(",");
    });
    return csv([PCOLS.join(","), ...lines].join("\n") + "\n", "caption-mirror-participants.csv");
  }
  if (fmt === "json")
    return new NextResponse(JSON.stringify({ participants: parts, responses: rows }, null, 1), { headers: { "content-type": "application/json", "content-disposition": "attachment; filename=caption-mirror-results.json" } });
  return NextResponse.json({ participants: parts, responses: rows });
}
