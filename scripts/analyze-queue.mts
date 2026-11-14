import { youtube, type Job } from "../lib/server/jobs";
import { publish } from "../lib/server/publish";

const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

const headers = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json", Prefer: "return=representation,resolution=merge-duplicates" };
type QueueRow = { id: string; url: string; seconds: number; language: string | null; target: "demo" | "library" };

async function sb<T>(query: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${base}/rest/v1/${query}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const text = await r.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function claim(): Promise<QueueRow | null> {
  const rows = await sb<QueueRow[]>("cm_analysis_jobs?select=id,url,seconds,language,target&status=eq.queued&order=created_at.asc&limit=1");
  const row = rows[0];
  if (!row) return null;
  const claimed = await sb<QueueRow[]>(`cm_analysis_jobs?id=eq.${encodeURIComponent(row.id)}&status=eq.queued`, {
    method: "PATCH", body: JSON.stringify({ status: "running", stage: "Starting", progress: 1, updated_at: new Date().toISOString() }),
  });
  return claimed.length ? row : null;
}

async function recoverInterruptedJobs() {
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const stale = await sb<{ id: string }[]>(`cm_analysis_jobs?select=id&status=eq.running&updated_at=lt.${cutoff}&limit=100`);
  for (const row of stale) await sb(`cm_analysis_jobs?id=eq.${encodeURIComponent(row.id)}&status=eq.running`, {
    method: "PATCH", body: JSON.stringify({ status: "queued", stage: "Requeued after an interrupted run", progress: 0, updated_at: new Date().toISOString() }),
  });
}

async function update(id: string, job: Job) {
  await sb(`cm_analysis_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: job.status, stage: job.stage, progress: job.progress, name: job.name ?? null, error: job.error ?? null, updated_at: new Date().toISOString() }),
  });
}

await recoverInterruptedJobs();
let failed = false;
for (;;) {
  const row = await claim();
  if (!row) break;
  const job: Job = { id: row.id, status: "running", stage: "Starting", progress: 1, log: "" };
  const timer = setInterval(() => { void update(row.id, job).catch((e) => console.error("job progress update failed", e)); }, 5_000);
  console.log(`Starting ${row.target} analysis ${row.id}`);
  try {
    await youtube(job, row.url, row.seconds, row.language || undefined, row.target);
    if (job.status === "done") await publish(job, row.target);
    if (job.status === "error") {
      failed = true;
      console.error(job.error || "Analysis failed");
    }
  } catch (e) {
    job.status = "error";
    job.error = String(e).slice(0, 500);
  } finally {
    clearInterval(timer);
    await update(row.id, job);
  }
}

if (failed) process.exitCode = 1;
