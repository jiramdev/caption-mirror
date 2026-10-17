import { NextResponse } from "next/server";
import { HOSTED, sb } from "@/lib/server/store";
import { workerUrl, WORKER_SECRET } from "@/lib/server/worker";
import { isAdmin } from "@/lib/server/auth";
import { newJob, youtube } from "@/lib/server/jobs";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const YT = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//;
const HOUR = 3_600_000, DAY = 86_400_000;
const PER_IP_HOURLY = 4, PER_DAY = 60;

/** Hosted abuse protection: 4 analyses/hour per IP, 60/day overall. */
async function rateLimit(ip: string): Promise<NextResponse | null> {
  try {
    const since = new Date(Date.now() - HOUR).toISOString();
    const mine = await sb<{ id: string }[]>(`cm_job_log?select=id&ip=eq.${encodeURIComponent(ip)}&created_at=gt.${since}`);
    if (mine.length >= PER_IP_HOURLY) return NextResponse.json({ error: "You've analyzed a few videos in the last hour — please try again later." }, { status: 429 });
    const day = new Date(Date.now() - DAY).toISOString();
    const all = await sb<{ id: string }[]>(`cm_job_log?select=id&created_at=gt.${day}`);
    if (all.length >= PER_DAY) return NextResponse.json({ error: "The site reached today's analysis limit — please try again tomorrow." }, { status: 429 });
    await sb("cm_job_log", { method: "POST", body: JSON.stringify({ ip }) });
  } catch (e) { console.error("rate limit check failed", e); } // fail open: analysis matters more than the counter
  return null;
}

// body: { url, seconds?, language?, target: "demo" | "library" }
export async function POST(req: Request) {
  const { url, seconds, language, target } = await req.json().catch(() => ({}));
  if (typeof url !== "string" || !YT.test(url.trim()))
    return NextResponse.json({ error: "Please paste a valid YouTube link (youtube.com/… or youtu.be/…)." }, { status: 400 });
  const secs = Math.max(5, Math.min(120, Number(seconds) || 30));
  const library = target === "library";

  if (library && !isAdmin(req)) return NextResponse.json({ error: "Sign in to add clips to the test library." }, { status: 401 });

  // Local mode: analysis runs in this very process (unchanged behaviour).
  if (!HOSTED) {
    const job = newJob();
    youtube(job, url.trim(), secs, language || undefined, library ? "library" : "demo").catch((e) => { job.status = "error"; job.error = String(e); });
    return NextResponse.json({ job: job.id });
  }

  // Hosted mode: forward to the analysis worker on the researcher's machine.
  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim() || "unknown";
  const limited = await rateLimit(ip);
  if (limited) return limited;
  const w = await workerUrl();
  if (!w) return NextResponse.json({ error: "Link analysis is offline right now — the analysis machine isn't running. Try again later." }, { status: 503 });
  try {
    const r = await fetch(`${w}/analyze`, {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json", "x-worker-secret": WORKER_SECRET },
      body: JSON.stringify({ url: url.trim(), seconds: secs, language, target: library ? "library" : "demo" }),
    });
    const j = await r.json().catch(() => ({}) as { job?: string; error?: string });
    if (!r.ok || !j.job) return NextResponse.json({ error: j.error || `Analysis worker error (${r.status}).` }, { status: r.status });
    return NextResponse.json({ job: j.job });
  } catch {
    return NextResponse.json({ error: "Couldn't reach the analysis machine — try again in a moment." }, { status: 503 });
  }
}
