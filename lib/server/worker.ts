/**
 * The analysis worker: yt-dlp + ffmpeg + Whisper run on a real machine (`npm run worker`), never on Vercel.
 * The worker starts a free Cloudflare tunnel and publishes its current URL to the Supabase table `cm_worker`
 * (heartbeat every 30 s). This module resolves that URL for the API routes; a stale heartbeat (> 2.5 min)
 * means "analysis is offline". ANALYSIS_WORKER_URL overrides the heartbeat (e.g. a fixed ngrok domain).
 * Server-side only.
 */
import { sb } from "./store";

export const WORKER_SECRET = process.env.WORKER_SECRET || "";
const STALE_MS = 150_000;
let cache: { url: string; at: number } = { url: "", at: 0 };

export async function workerUrl(): Promise<string | null> {
  const env = process.env.ANALYSIS_WORKER_URL?.trim();
  if (env) return env.replace(/\/$/, "");
  const now = Date.now();
  if (now - cache.at < 10_000) return cache.url || null; // also caches "offline"
  cache = { url: "", at: now };
  try {
    const rows = await sb<{ url: string; updated_at: string }[]>("cm_worker?select=url,updated_at&id=eq.main");
    const r = rows?.[0];
    if (r && now - Date.parse(r.updated_at) < STALE_MS) cache.url = r.url.replace(/\/$/, "");
  } catch { /* offline */ }
  return cache.url || null;
}
