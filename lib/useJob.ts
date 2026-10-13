"use client";
import { useState } from "react";

export type JobState = { status: "running" | "done" | "error"; stage: string; progress: number; name?: string; error?: string };

export function useJob(onDone: (name: string) => void) {
  const [job, setJob] = useState<JobState | null>(null);
  async function poll(id: string) {
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      const r = await fetch(`/api/jobs/${id}`);
      const j = await r.json();
      if (!r.ok) { setJob({ status: "error", stage: "", progress: 0, error: j.error }); return; }
      setJob(j);
      if (j.status === "done") { onDone(j.name); setTimeout(() => setJob(null), 3000); return; }
      if (j.status === "error") return;
    }
  }
  async function start(req: Promise<Response>) {
    setJob({ status: "running", stage: "Starting…", progress: 1 });
    try {
      const r = await req; const j = await r.json();
      if (!r.ok) { setJob({ status: "error", stage: "", progress: 0, error: j.error }); return; }
      poll(j.job);
    } catch (e) { setJob({ status: "error", stage: "", progress: 0, error: String(e) }); }
  }
  return { job, start, clear: () => setJob(null) };
}
