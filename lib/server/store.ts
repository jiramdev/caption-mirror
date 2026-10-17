/**
 * Storage abstraction.
 *  - Local (default): files in ./data and ./public (analysis runs on this machine).
 *  - Hosted: if SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, sessions/responses/clip-settings live in Supabase tables
 *    and analyzed clips (json + mp4 + thumb) are served from the public storage bucket SUPABASE_BUCKET (default "clips").
 * Supabase is accessed through its REST APIs with fetch (no extra npm dependency). Server-side only.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ClipMeta, Condition, Participant, TrialResponse } from "@/lib/types";

const SB_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET || "clips";
export const HOSTED = !!(SB_URL && SB_KEY);

const DATA = path.join(process.cwd(), "data");
const PUB = path.join(process.cwd(), "public");
const readJson = <T,>(f: string, d: T): T => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { return d; } };
const writeJson = (f: string, v: unknown) => { fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 1)); };

export async function sb<T = unknown>(pathQ: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${SB_URL}/rest/v1/${pathQ}`, {
    ...init, cache: "no-store",
    headers: { apikey: SB_KEY!, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json", Prefer: "return=representation,resolution=merge-duplicates", ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  const txt = await r.text(); return (txt ? JSON.parse(txt) : null) as T;
}
export const publicUrl = (p: string) => `${SB_URL}/storage/v1/object/public/${BUCKET}/${p}`;

/* ---------- clips ---------- */
export async function listClips(): Promise<ClipMeta[]> {
  const settings = await getClipSettings();
  if (HOSTED) {
    const rows = await sb<ClipMeta[]>("cm_clips?select=name,title,words,duration&order=name");
    return rows.map((r) => ({ ...r, thumb: publicUrl(`thumbs/${r.name}.jpg`), intended: settings[r.name] ?? null }));
  }
  const out: (ClipMeta & { mtime: number })[] = [];
  for (const f of fs.readdirSync(PUB).filter((f) => f.endsWith(".json"))) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(PUB, f), "utf8"));
      if (!d.cues) continue;
      const words = d.cues.flatMap((c: { words: { w: string; end: number }[] }) => c.words);
      const thumb = path.join(PUB, "thumbs", d.name + ".jpg");
      out.push({ name: d.name, title: d.title || words.slice(0, 10).map((w: { w: string }) => w.w).join(" "), words: words.length,
        duration: words.length ? words[words.length - 1].end : 0, thumb: fs.existsSync(thumb) ? `/api/media/thumbs/${d.name}.jpg` : null,
        intended: settings[d.name] ?? null, mtime: fs.statSync(path.join(PUB, f)).mtimeMs });
    } catch {}
  }
  return out.sort((a, b) => b.mtime - a.mtime).map(({ mtime: _m, ...c }) => c); // eslint-disable-line @typescript-eslint/no-unused-vars
}

export async function getClip(name: string) {
  if (!/^[\w-]+$/.test(name)) return null;
  if (HOSTED) {
    const r = await fetch(publicUrl(`${name}.json`), { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json(); return { ...d, videoUrl: publicUrl(`videos/${name}.mp4`) };
  }
  try { const d = JSON.parse(fs.readFileSync(path.join(PUB, name + ".json"), "utf8")); return { ...d, videoUrl: `/api/media/videos/${name}.mp4` }; } catch { return null; }
}

/* ---------- clip settings (intended delivery) ---------- */
export async function getClipSettings(): Promise<Record<string, string>> {
  if (HOSTED) { const rows = await sb<{ name: string; intended: string }[]>("cm_clip_settings?select=name,intended"); return Object.fromEntries(rows.map((r) => [r.name, r.intended])); }
  return readJson("clip-settings.json", {});
}
export async function setClipSetting(name: string, intended: string | null) {
  if (HOSTED) {
    if (intended) await sb("cm_clip_settings", { method: "POST", body: JSON.stringify({ name, intended }) });
    else await sb(`cm_clip_settings?name=eq.${encodeURIComponent(name)}`, { method: "DELETE" });
    return;
  }
  const s = readJson<Record<string, string>>("clip-settings.json", {});
  if (intended) s[name] = intended; else delete s[name];
  writeJson("clip-settings.json", s);
}

/* ---------- participants (one per test run) ---------- */
type Row = { id: string; name: string; pnum: number; created_at: string; data: Participant };
export async function listParticipants(): Promise<Participant[]> {
  if (HOSTED) return (await sb<Row[]>("cm_participants?select=*&order=created_at")).map((r) => r.data);
  return readJson<Participant[]>("participants.json", []);
}
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const PERMS: Condition[][] = [["A", "B", "C"], ["A", "C", "B"], ["B", "A", "C"], ["B", "C", "A"], ["C", "A", "B"], ["C", "B", "A"]];

/**
 * Random but balanced assignment:
 *  - 3 clips drawn at random from the library clips that have an intended delivery set.
 *  - Condition order: each participant gets A, B and C exactly once. Within every block of 6 participants each of the
 *    6 possible orders is used once (order of the 6 is shuffled per block), so conditions are balanced over positions.
 *  - Agency round: one more random library clip (a 4th clip if available, otherwise one of the three).
 */
export async function createParticipant(name: string): Promise<Participant | { error: string }> {
  const settings = await getClipSettings();
  const lib = (await listClips()).map((c) => c.name);
  const eligible = lib.filter((n) => settings[n]);
  if (eligible.length < 3) return { error: `The test needs at least 3 library clips with an intended delivery (now ${eligible.length}).` };
  const prior = await listParticipants();
  const pnum = prior.length ? Math.max(...prior.map((p) => p.pnum)) + 1 : 0;
  const block = Math.floor(pnum / 6);
  const blockOrder = prior.filter((p) => Math.floor(p.pnum / 6) === block).map((p) => p.trials.map((t) => t.condition).join(""));
  const remaining = PERMS.filter((pm) => !blockOrder.includes(pm.join("")));
  const perm = shuffle(remaining.length ? remaining : PERMS)[0];
  const clips = shuffle(eligible).slice(0, 3);
  const others = lib.filter((n) => !clips.includes(n));
  const agencyClip = shuffle(others.length ? others : clips)[0];
  const p: Participant = { id: crypto.randomUUID(), name, pnum, createdAt: new Date().toISOString(), trials: clips.map((clip, i) => ({ clip, condition: perm[i] })), agencyClip };
  if (HOSTED) await sb("cm_participants", { method: "POST", body: JSON.stringify({ id: p.id, name, pnum, created_at: p.createdAt, data: p }) });
  else writeJson("participants.json", [...prior, p]);
  return p;
}
export async function updateParticipant(id: string, patch: Partial<Participant>) {
  const all = await listParticipants();
  const p = all.find((x) => x.id === id); if (!p) return null;
  const next = { ...p, ...patch, id: p.id, pnum: p.pnum, trials: p.trials, name: p.name };
  if (HOSTED) await sb(`cm_participants?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ data: next }) });
  else writeJson("participants.json", all.map((x) => (x.id === id ? next : x)));
  return next;
}
export async function deleteParticipant(id: string) {
  if (HOSTED) { await sb(`cm_responses?participant_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }); await sb(`cm_participants?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }); return; }
  writeJson("participants.json", readJson<Participant[]>("participants.json", []).filter((p) => p.id !== id));
  const f = path.join(DATA, "responses.jsonl");
  if (fs.existsSync(f)) fs.writeFileSync(f, fs.readFileSync(f, "utf8").split("\n").filter((l) => l && JSON.parse(l).participantId !== id).map((l) => l + "\n").join(""));
}

/* ---------- library clip deletion ---------- */
export async function deleteClip(name: string) {
  if (!/^[\w-]+$/.test(name)) return;
  await setClipSetting(name, null);
  if (HOSTED) { await sb(`cm_clips?name=eq.${encodeURIComponent(name)}`, { method: "DELETE" }); return; }
  for (const f of [`${name}.json`, `videos/${name}.mp4`, `thumbs/${name}.jpg`]) fs.rmSync(path.join(PUB, f), { force: true });
}

/* ---------- responses (trial data incl. interaction logs) ---------- */
export async function saveResponse(r: TrialResponse) {
  const row = { ...r, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  if (HOSTED) { await sb("cm_responses", { method: "POST", body: JSON.stringify({ id: row.id, created_at: row.createdAt, participant_id: r.participantId, participant: r.participant, data: row }) }); return row; }
  fs.mkdirSync(DATA, { recursive: true });
  fs.appendFileSync(path.join(DATA, "responses.jsonl"), JSON.stringify(row) + "\n");
  return row;
}
export async function listResponses(): Promise<TrialResponse[]> {
  if (HOSTED) return (await sb<{ data: TrialResponse }[]>("cm_responses?select=data&order=created_at")).map((r) => r.data);
  try {
    return fs.readFileSync(path.join(DATA, "responses.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
      ;
  } catch { return []; }
}
