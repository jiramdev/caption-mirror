import { NextResponse } from "next/server";
import { HOSTED } from "@/lib/server/store";
import { newJob, youtube } from "@/lib/server/jobs";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// body: { url, seconds?, language?, target: "demo" | "library" }
export async function POST(req: Request) {
  if (HOSTED) return NextResponse.json({ error: "Analysis is only available when running locally." }, { status: 403 });
  const { url, seconds, language, target } = await req.json().catch(() => ({}));
  if (typeof url !== "string" || !/^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//.test(url.trim()))
    return NextResponse.json({ error: "Please paste a valid YouTube link (youtube.com/… or youtu.be/…)." }, { status: 400 });
  const secs = Math.max(5, Math.min(120, Number(seconds) || 30));
  const job = newJob();
  youtube(job, url.trim(), secs, language || undefined, target === "demo" ? "demo" : "library").catch((e) => { job.status = "error"; job.error = String(e); });
  return NextResponse.json({ job: job.id });
}
