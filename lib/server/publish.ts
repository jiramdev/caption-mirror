import fs from "node:fs";
import path from "node:path";
import { sb } from "./store";

type PublishJob = { status: "running" | "done" | "error"; stage: string; progress: number; name?: string; error?: string };
const BUCKET = process.env.SUPABASE_BUCKET || "clips";
const SB_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function put(rel: string, file: string, type: string, cache = "3600") {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${rel}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": type, "x-upsert": "true", "cache-control": cache },
    body: fs.readFileSync(file),
  });
  if (!r.ok) throw new Error(`${rel}: ${r.status} ${(await r.text()).slice(0, 300)}`);
}

/** Uploads the analyzed video and metadata so the site can play it from Supabase Storage. */
export async function publish(job: PublishJob, target: "demo" | "library") {
  if (job.status !== "done" || !job.name) return;
  const name = job.name;
  job.status = "running";
  job.stage = "Uploading";
  job.progress = 97;
  try {
    const pub = path.join(process.cwd(), "public");
    if (target === "demo") {
      const root = path.join(pub, "_tmp");
      await put("_tmp/current.json", path.join(root, "current.json"), "application/json", "no-store");
      await put("_tmp/videos/current.mp4", path.join(root, "videos", "current.mp4"), "video/mp4", "no-store");
      const thumb = path.join(root, "thumbs", "current.jpg");
      if (fs.existsSync(thumb)) await put("_tmp/thumbs/current.jpg", thumb, "image/jpeg", "no-store");
    } else {
      const file = path.join(pub, `${name}.json`);
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      const words = data.cues?.flatMap((cue: { words: { w: string }[] }) => cue.words) ?? [];
      await put(`${name}.json`, file, "application/json");
      await put(`videos/${name}.mp4`, path.join(pub, "videos", `${name}.mp4`), "video/mp4");
      const thumb = path.join(pub, "thumbs", `${name}.jpg`);
      if (fs.existsSync(thumb)) await put(`thumbs/${name}.jpg`, thumb, "image/jpeg");
      await sb("cm_clips", { method: "POST", body: JSON.stringify({
        name, title: data.title || words.slice(0, 10).map((word: { w: string }) => word.w).join(" "),
        words: words.length, duration: words.at(-1)?.end ?? 0,
      }) });
      const settings = path.join(process.cwd(), "data", "clip-settings.json");
      if (fs.existsSync(settings)) {
        const rows = Object.entries(JSON.parse(fs.readFileSync(settings, "utf8"))).map(([clip, intended]) => ({ name: clip, intended }));
        if (rows.length) await sb("cm_clip_settings", { method: "POST", body: JSON.stringify(rows) });
      }
    }
    console.log(`✓ published ${target} clip "${name}" to Supabase`);
    job.status = "done";
    job.stage = "Done";
    job.progress = 100;
  } catch (e) {
    job.status = "error";
    job.error = "Analysis finished, but uploading to Supabase failed: " + String(e).slice(0, 300);
    console.error("publish failed:", e);
  }
}
