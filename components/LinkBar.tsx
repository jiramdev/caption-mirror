"use client";
import { useState } from "react";
import { useJob } from "@/lib/useJob";

export default function LinkBar({ onDone, target, label = "Analyze" }: { onDone: (n: string) => void; target: "demo" | "library"; label?: string }) {
  const [url, setUrl] = useState("");
  const [seconds, setSeconds] = useState(30);
  const { job, start, clear } = useJob(onDone);
  const busy = job?.status === "running";
  const submit = (e: React.FormEvent) => {
    e.preventDefault(); if (!url.trim() || busy) return;
    start(fetch("/api/youtube", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, seconds, target }) }));
  };

  return (
    <div className="mx-auto w-full max-w-[692px]">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-black/[0.08] bg-canvas pl-5 pr-1.5 focus-within:border-primary-focus">
          <svg viewBox="0 0 24 24" className="h-[14px] w-[14px] shrink-0 text-ink-48" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" strokeLinecap="round" /></svg>
          <input value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} placeholder="Paste a YouTube link" aria-label="YouTube link"
            className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-ink-48" />
          <select value={seconds} onChange={(e) => setSeconds(+e.target.value)} disabled={busy} aria-label="Length" className="t-caption bg-transparent text-ink-80 outline-none">
            {[15, 30, 45, 60].map((s) => <option key={s} value={s}>First {s}s</option>)}
          </select>
          <button disabled={busy || !url.trim()} className="btn-primary !min-h-[34px] !px-4 !py-2 !text-[14px]">{label}</button>
        </div>
      </form>
      {job && (
        <div className="mt-3 px-5" role="status" aria-live="polite">
          {job.status === "error" ? (
            <p className="t-caption text-ink-80"><span className="font-semibold">Couldn&apos;t analyze this video.</span> {job.error} <button onClick={clear} className="link">Dismiss</button></p>
          ) : (
            <div className="t-caption text-ink-48">
              <div className="mb-1.5 flex justify-between"><span>{job.status === "done" ? target === "demo" ? "Ready. Now playing." : "Added to the library." : job.stage}</span><span className="tabular-nums">{Math.round(job.progress)}%</span></div>
              <div className="h-[3px] overflow-hidden rounded-full bg-hairline"><div className="h-full bg-primary transition-all duration-500" style={{ width: `${job.progress}%` }} /></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
