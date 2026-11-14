import fs from "node:fs";
import path from "node:path";
import type { Job } from "../lib/server/jobs";

// tsx does not load Next.js' .env.local automatically. Read it for the laptop worker.
if (fs.existsSync(".env.local")) for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
  if (!match || process.env[match[1]]) continue;
  process.env[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
}
process.env.PYTHON ||= fs.existsSync(path.join(process.cwd(), ".venv", "bin", "python"))
  ? path.join(process.cwd(), ".venv", "bin", "python") : "python3";
const { youtube } = await import("../lib/server/jobs");
const { publish } = await import("../lib/server/publish");

const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const watch = process.argv.includes("--watch");
if (!base || !key) throw new Error("Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local before starting the laptop worker.");

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

async function heartbeat() {
  await sb("cm_analysis_worker", {
    method: "POST",
    body: JSON.stringify({ id: "main", updated_at: new Date().toISOString() }),
  });
}

async function markOffline() {
  await sb("cm_analysis_worker?id=eq.main", { method: "DELETE" });
}

async function update(id: string, job: Job) {
  await sb(`cm_analysis_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: job.status, stage: job.stage, progress: job.progress, name: job.name ?? null, error: job.error ?? null, updated_at: new Date().toISOString() }),
  });
}

let failed = false;
let stopping = false;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let stopPromise: Promise<void> | undefined;

async function processQueue() {
  await recoverInterruptedJobs();
  for (;;) {
    if (stopping) break;
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
      failed = true;
      job.status = "error";
      job.error = String(e).slice(0, 500);
    } finally {
      clearInterval(timer);
      await update(row.id, job);
    }
  }
}

if (!watch) {
  await processQueue();
  if (failed) process.exitCode = 1;
} else {
  await heartbeat();
  heartbeatTimer = setInterval(() => {
    void heartbeat().catch((error) => console.error("Worker heartbeat failed:", String(error)));
  }, 15_000);

  const stop = () => {
    if (stopping) return;
    stopping = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    console.log("Stopping laptop worker after the current analysis…");
    stopPromise ??= markOffline().then(() => console.log("Analysis is now offline on the website."))
      .catch((error) => console.error("Could not clear worker status; it will expire automatically:", String(error)));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  console.log("Laptop analysis is online. Leave this terminal open; press Ctrl+C to stop.");

  while (!stopping) {
    try {
      await processQueue();
      if (!stopping) await new Promise((resolve) => setTimeout(resolve, 3_000));
    } catch (error) {
      console.error("Queue check failed:", String(error));
      if (!stopping) await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  await stopPromise;
}
