import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export type Job = { id: string; status: "running" | "done" | "error"; stage: string; progress: number; name?: string; error?: string; log: string };
const g = globalThis as unknown as { __jobs?: Map<string, Job> };
export const jobs = (g.__jobs ??= new Map());

export const PY = process.env.PYTHON || "python3";
export const safeName = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 60) || "clip";

export function newJob(): Job {
  const j: Job = { id: Math.random().toString(36).slice(2, 10), status: "running", stage: "Starting", progress: 0, log: "" };
  jobs.set(j.id, j);
  return j;
}

function run(job: Job, args: string[], onLine: (l: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(PY, args, { cwd: process.cwd() });
    const feed = (d: Buffer) => {
      const s = String(d); job.log = (job.log + s).slice(-6000);
      s.split(/[\r\n]+/).forEach((l) => l && onLine(l));
    };
    p.stdout.on("data", feed); p.stderr.on("data", feed);
    p.on("close", (c) => resolve(c ?? 1));
    p.on("error", (e) => { job.log += String(e); resolve(1); });
  });
}

function lastErr(log: string) {
  const lines = log.split("\n").filter((l) => /error|Error|ERROR/.test(l));
  return (lines.pop() || log.trim().split("\n").pop() || "unknown error").slice(0, 400);
}

export async function analyze(job: Job, src: string, name: string, language?: string, base = 40, root?: string) {
  const args = [path.join(process.cwd(), "analyze.py"), src, "--name", name, "--model", process.env.WHISPER_MODEL || "small"];
  if (root) args.push("--root", root);
  if (language) args.push("--language", language);
  job.stage = "Transcribing"; job.progress = base;
  const code = await run(job, args, (l) => {
    if (l.includes("[1/3]")) { job.stage = "Transcribing speech (Whisper)"; job.progress = base + 5; }
    if (l.includes("[2/3]")) { job.stage = "Measuring loudness & pitch"; job.progress = base + (100 - base) * 0.6; }
    if (l.includes("[3/3]")) { job.stage = "Saving"; job.progress = 95; }
  });
  try { fs.rmSync(src, { force: true }); } catch {} // source download no longer needed
  if (code !== 0) { job.status = "error"; job.error = "Analysis failed: " + lastErr(job.log); return; }
  job.status = "done"; job.stage = "Done"; job.progress = 100; job.name = name;
}

export const DEMO_ROOT = () => path.join(process.cwd(), "public", "_tmp");
export async function youtube(job: Job, url: string, seconds: number, language?: string, target: "demo" | "library" = "library") {
  const dir = path.join(process.cwd(), "data", "uploads");
  fs.mkdirSync(dir, { recursive: true });
  // get id/title first for a readable name
  job.stage = "Looking up video"; job.progress = 3;
  let info = "";
  const c0 = await run(job, ["-m", "yt_dlp", "--no-playlist", "--print", "%(id)s|%(title)s", "--skip-download", url], (l) => { if (l.includes("|") && !info) info = l; });
  if (c0 !== 0 || !info) { job.status = "error"; job.error = "Could not read that YouTube link: " + lastErr(job.log); return; }
  const [id, ...t] = info.split("|");
  const name = target === "demo" ? "current" : safeName(`yt-${id}-${t.join(" ").slice(0, 30)}`);
  const title = t.join(" ").trim();
  const out = path.join(dir, name + ".mp4");
  job.stage = `Downloading first ${seconds}s`; job.progress = 8;
  const code = await run(job, ["-m", "yt_dlp", "--no-playlist", "-f", "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b",
    "--download-sections", `*0-${seconds}`, "--force-keyframes-at-cuts", "--merge-output-format", "mp4", "--force-overwrites", "--newline", "-o", out, url],
    (l) => { const m = /\[download\]\s+([\d.]+)%/.exec(l); if (m) job.progress = 8 + Math.min(30, (+m[1] / 100) * 30); });
  if (code !== 0 || !fs.existsSync(out)) { job.status = "error"; job.error = "Download failed: " + lastErr(job.log); return; }
  if (target === "demo") { fs.rmSync(DEMO_ROOT(), { recursive: true, force: true }); } // only keep the latest demo clip
  await analyze(job, out, name, language, 40, target === "demo" ? DEMO_ROOT() : undefined);
  if (job.status === "done") {
    const root = target === "demo" ? DEMO_ROOT() : path.join(process.cwd(), "public");
    try { const f = path.join(root, name + ".json"); const d = JSON.parse(fs.readFileSync(f, "utf8")); d.title = title; d.source = url; fs.writeFileSync(f, JSON.stringify(d, null, 1)); } catch {}
  }
}
