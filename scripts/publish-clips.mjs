#!/usr/bin/env node
// Upload locally analyzed clips (public/<name>.json, public/videos/<name>.mp4, public/thumbs/<name>.jpg)
// to the Supabase storage bucket and register them in cm_clips.
// Usage: npm run publish-clips [-- name1 name2 ...]   (reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from env or .env.local)
import fs from "node:fs";
import path from "node:path";

if (fs.existsSync(".env.local")) for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(l); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, ""), KEY = process.env.SUPABASE_SERVICE_ROLE_KEY, BUCKET = process.env.SUPABASE_BUCKET || "clips";
if (!URL_ || !KEY) { console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (e.g. in .env.local)"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const pub = path.join(process.cwd(), "public");
const only = process.argv.slice(2);
const names = fs.readdirSync(pub).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter((n) => !only.length || only.includes(n));

async function put(rel, file, type) {
  const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${rel}`, { method: "POST", headers: { ...H, "content-type": type, "x-upsert": "true", "cache-control": "3600" }, body: fs.readFileSync(file) });
  if (!r.ok) throw new Error(`${rel}: ${r.status} ${await r.text()}`);
}
for (const n of names) {
  const d = JSON.parse(fs.readFileSync(path.join(pub, n + ".json"), "utf8"));
  if (!d.cues) { console.log(`skip ${n} (old format, re-run analyze.py)`); continue; }
  const words = d.cues.flatMap((c) => c.words);
  process.stdout.write(`publishing ${n} ... `);
  await put(`${n}.json`, path.join(pub, n + ".json"), "application/json");
  await put(`videos/${n}.mp4`, path.join(pub, "videos", n + ".mp4"), "video/mp4");
  const th = path.join(pub, "thumbs", n + ".jpg"); if (fs.existsSync(th)) await put(`thumbs/${n}.jpg`, th, "image/jpeg");
  const r = await fetch(`${URL_}/rest/v1/cm_clips`, { method: "POST", headers: { ...H, "content-type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ name: n, title: words.slice(0, 10).map((w) => w.w).join(" "), words: words.length, duration: words.at(-1)?.end ?? 0 }) });
  if (!r.ok) throw new Error(`cm_clips: ${r.status} ${await r.text()}`);
  console.log("ok");
}
// also push local clip settings (intended delivery)
const sf = path.join("data", "clip-settings.json");
if (fs.existsSync(sf)) {
  const rows = Object.entries(JSON.parse(fs.readFileSync(sf, "utf8"))).map(([name, intended]) => ({ name, intended }));
  if (rows.length) await fetch(`${URL_}/rest/v1/cm_clip_settings`, { method: "POST", headers: { ...H, "content-type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(rows) });
  console.log(`clip settings: ${rows.length}`);
}
