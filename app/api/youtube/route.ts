import { NextResponse } from "next/server";
import { HOSTED, sb } from "@/lib/server/store";
import { isAdmin } from "@/lib/server/auth";
import { newJob, youtube } from "@/lib/server/jobs";
import crypto from "node:crypto";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const YT = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//;
const HOUR = 3_600_000, DAY = 86_400_000;
const PER_IP_HOURLY = 4, PER_DAY = 60;
const WORKER_STALE_MS = 60_000;

async function workerOnline() {
  if (!HOSTED) return true;
  try {
    const rows = await sb<{ updated_at: string }[]>("cm_analysis_worker?select=updated_at&id=eq.main&limit=1");
    return !!rows[0] && Date.now() - Date.parse(rows[0].updated_at) < WORKER_STALE_MS;
  } catch { return false; }
}

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
  if (!(await workerOnline())) return NextResponse.json({ error: "Analysis is offline. The researcher needs to start the laptop worker first." }, { status: 503 });

  // Local mode: analysis runs in this very process (unchanged behaviour).
  if (!HOSTED) {
    const job = newJob();
    youtube(job, url.trim(), secs, language || undefined, library ? "library" : "demo").catch((e) => { job.status = "error"; job.error = String(e); });
    return NextResponse.json({ job: job.id });
  }

  // Hosted mode: the researcher’s laptop polls this queue while its worker is running.
  const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim() || "unknown";
  const limited = await rateLimit(ip);
  if (limited) return limited;
  try {
    const id = crypto.randomBytes(8).toString("hex");
    await sb("cm_analysis_jobs", {
      method: "POST",
      body: JSON.stringify({ id, url: url.trim(), seconds: secs, language: language || null, target: library ? "library" : "demo" }),
    });
    return NextResponse.json({ job: id });
  } catch {
    return NextResponse.json({ error: "Analysis could not be queued. Check the Supabase connection and apply migration 0003_analysis_queue.sql." }, { status: 503 });
  }
}
