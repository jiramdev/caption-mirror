#!/usr/bin/env node
/**
 * Caption Mirror — analysis worker (runs on YOUR MACHINE, never on Vercel).
 *
 *   npm run worker
 *
 * What it does:
 *   1. Serves a tiny internal API:  POST /analyze {url,seconds,language,target}  and  GET /jobs/:id
 *      (yt-dlp download → analyze.py = Whisper transcription + loudness/pitch/rate features).
 *   2. Uploads finished clips to Supabase (storage bucket `clips` + cm_clips / cm_clip_settings),
 *      so the Vercel site can play them — demo clips go to _tmp/, library clips to the library.
 *   3. Starts a free Cloudflare quick tunnel and publishes its URL to the Supabase table cm_worker
 *      every 30 s (heartbeat). The Vercel site reads that URL to reach this worker; when the heartbeat
 *      is older than 2.5 min the site tells visitors "analysis is offline".
 *
 * Requires .env.local with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and WORKER_SECRET (same secret is
 * set in Vercel). Needs ffmpeg, deno and .venv (see README).
 * Everything the site can reach is authenticated with WORKER_SECRET; the tunnel URL alone is not enough.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";

const ROOT = process.cwd();

/* ---- environment: .env.local first (same parser as scripts/publish-clips.mjs) ---- */
if (fs.existsSync(".env.local")) for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
// jobs.ts reads PYTHON when it is imported, so set it before the dynamic import below.
process.env.PYTHON ||= fs.existsSync(path.join(ROOT, ".venv", "bin", "python"))
  ? path.join(ROOT, ".venv", "bin", "python") : "python3";

const SB_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || "clips";
const SECRET = process.env.WORKER_SECRET || "";
const PORT = Number(process.env.WORKER_PORT || 8791);
const MAX_ACTIVE = 2;

if (!SB_URL || !SB_KEY) { console.error("✗ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"); process.exit(1); }
if (!SECRET) { console.error("✗ Set WORKER_SECRET in .env.local (the same value is configured in Vercel)"); process.exit(1); }

const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const YT = /^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//;

const { newJob, youtube, jobs } = await import("../lib/server/jobs");
type Job = { id: string; status: "running" | "done" | "error"; stage: string; progress: number; name?: string; error?: string; log: string };

let active = 0;

/* ----------------------------- Supabase helpers ----------------------------- */
async function sb(pathQ: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${pathQ}`, {
    ...init, cache: "no-store",
    headers: { ...H, "content-type": "application/json", Prefer: "return=representation,resolution=merge-duplicates", ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const txt = await r.text(); return txt ? JSON.parse(txt) : null;
}
async function put(rel: string, file: string, type: string, cache = "3600") {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${rel}`, {
    method: "POST", headers: { ...H, "content-type": type, "x-upsert": "true", "cache-control": cache },
    body: fs.readFileSync(file),
  });
  if (!r.ok) throw new Error(`${rel}: ${r.status} ${(await r.text()).slice(0, 300)}`);
}

/** A finished job → Supabase. Demo clips land in _tmp/ (latest one wins), library clips in the library. */
async function publish(job: Job, target: "demo" | "library") {
  if (job.status !== "done" || !job.name) return;
  const name = job.name;
  job.status = "running"; job.stage = "Uploading"; job.progress = 97; // not "done" until Supabase has the files
  try {
    const pub = path.join(ROOT, "public");
    if (target === "demo") {
      const root = path.join(pub, "_tmp");
      await put("_tmp/current.json", path.join(root, "current.json"), "application/json", "no-store");
      await put("_tmp/videos/current.mp4", path.join(root, "videos", "current.mp4"), "video/mp4", "no-store");
      const th = path.join(root, "thumbs", "current.jpg");
      if (fs.existsSync(th)) await put("_tmp/thumbs/current.jpg", th, "image/jpeg", "no-store");
    } else {
      const d = JSON.parse(fs.readFileSync(path.join(pub, `${name}.json`), "utf8"));
      const words = d.cues?.flatMap((c: { words: { w: string }[] }) => c.words) ?? [];
      await put(`${name}.json`, path.join(pub, `${name}.json`), "application/json");
      await put(`videos/${name}.mp4`, path.join(pub, "videos", `${name}.mp4`), "video/mp4");
      const th = path.join(pub, "thumbs", `${name}.jpg`);
      if (fs.existsSync(th)) await put(`thumbs/${name}.jpg`, th, "image/jpeg");
      await sb("cm_clips", { method: "POST", body: JSON.stringify({
        name, title: d.title || words.slice(0, 10).map((w: { w: string }) => w.w).join(" "),
        words: words.length, duration: words.at(-1)?.end ?? 0,
      }) });
      const sf = path.join(ROOT, "data", "clip-settings.json"); // carry intended-delivery settings along
      if (fs.existsSync(sf)) {
        const rows = Object.entries(JSON.parse(fs.readFileSync(sf, "utf8"))).map(([n, intended]) => ({ name: n, intended }));
        if (rows.length) await sb("cm_clip_settings", { method: "POST", body: JSON.stringify(rows) });
      }
    }
    console.log(`✓ published ${target} clip "${name}" to Supabase`);
    job.status = "done"; job.stage = "Done"; job.progress = 100;
  } catch (e) {
    job.status = "error";
    job.error = "Analysis finished, but uploading to Supabase failed: " + String(e).slice(0, 300);
    console.error("publish failed:", e);
  }
}

/* ------------------------------- HTTP server ------------------------------- */
const json = (res: http.ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body));
};
const readBody = (req: http.IncomingMessage) => new Promise<string>((resolve) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => resolve(b));
});

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (u.pathname === "/health") return json(res, 200, { ok: true, active, jobs: jobs.size });
  if ((req.headers["x-worker-secret"] || "") !== SECRET) return json(res, 401, { error: "unauthorized" });

  if (req.method === "POST" && u.pathname === "/analyze") {
    let body: { url?: string; seconds?: number; language?: string; target?: string } = {};
    try { body = JSON.parse(await readBody(req) || "{}"); } catch { /* fallthrough */ }
    const url = String(body.url || "").trim();
    if (!YT.test(url)) return json(res, 400, { error: "Please paste a valid YouTube link (youtube.com/… or youtu.be/…)." });
    if (active >= MAX_ACTIVE) return json(res, 429, { error: "The analysis machine is busy right now — try again in a minute." });
    const target: "demo" | "library" = body.target === "library" ? "library" : "demo";
    const secs = Math.max(5, Math.min(120, Number(body.seconds) || 30));
    const job = newJob() as Job;
    active++;
    youtube(job, url, secs, body.language || undefined, target)
      .then(() => publish(job, target))
      .catch((e) => { job.status = "error"; job.error = String(e).slice(0, 400); })
      .finally(() => { active--; console.log(`job ${job.id} → ${job.status}${job.error ? ` (${job.error})` : ""}`); });
    console.log(`▶ job ${job.id} ${target} ${secs}s ${url}`);
    return json(res, 200, { job: job.id });
  }

  const m = /^\/jobs\/([a-z0-9]{1,16})$/.exec(u.pathname);
  if (req.method === "GET" && m) {
    const j = jobs.get(m[1]) as Job | undefined;
    if (!j) return json(res, 404, { error: "unknown job (worker restarted?)" });
    const { log, ...rest } = j;
    return json(res, 200, { ...rest, log: j.status === "error" ? log.slice(-1500) : undefined });
  }
  return json(res, 404, { error: "not found" });
});

/* ------------------------- tunnel + Supabase heartbeat ------------------------- */
let beatTimer: NodeJS.Timeout | null = null;
async function heartbeat(url: string) {
  try { await sb("cm_worker", { method: "POST", body: JSON.stringify({ id: "main", url, updated_at: new Date().toISOString() }) }); }
  catch (e) { console.error("heartbeat failed:", e); }
}
function startHeartbeat(url: string) {
  console.log(`✓ analysis reachable at ${url}`);
  heartbeat(url);
  if (!beatTimer) beatTimer = setInterval(() => heartbeat(url), 30_000);
}
function startTunnel() {
  const fixed = process.env.WORKER_URL?.trim(); // e.g. a static ngrok/tailscale URL
  if (fixed) return startHeartbeat(fixed.replace(/\/$/, ""));
  const cf = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"] });
  let buf = "", found = "";
  const feed = (d: Buffer) => {
    buf += String(d);
    if (!found) {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(buf);
      if (m) { found = m[0]; startHeartbeat(found); }
    }
  };
  cf.stdout.on("data", feed); cf.stderr.on("data", feed);
  cf.on("error", (e) => console.error("✗ cloudflared couldn't start (brew install cloudflared):", e.message));
  cf.on("close", (c) => { if (beatTimer) { clearInterval(beatTimer); beatTimer = null; } console.error(`✗ tunnel exited (${c}) — public link analysis is offline until the worker is restarted`); });
  return cf;
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Caption Mirror analysis worker → http://127.0.0.1:${PORT} (python: ${process.env.PYTHON})`);
  startTunnel();
});

const shutdown = async () => {
  console.log("\nworker stopping…");
  if (beatTimer) clearInterval(beatTimer);
  try { await sb("cm_worker?id=eq.main", { method: "DELETE" }); } catch { /* stale heartbeat is handled anyway */ }
  server.close(); process.exit(0);
};
process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
