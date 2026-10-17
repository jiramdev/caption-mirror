"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DELIVERIES, type ClipMeta } from "@/lib/types";
import LinkBar from "./LinkBar";
import { Footer, GlobalNav, fmt, pretty } from "./ui";

export default function Library() {
  const [clips, setClips] = useState<ClipMeta[]>([]);
  const [analysis, setAnalysis] = useState(true); // can a pasted link be analyzed right now?
  const load = useCallback(() => fetch("/api/clips", { cache: "no-store" }).then((r) => r.json()).then(setClips).catch(() => {}), []);
  useEffect(() => { load(); fetch("/api/config").then((r) => r.json()).then((c) => setAnalysis(c.analysis !== false)).catch(() => {}); }, [load]);
  const setIntended = async (name: string, v: string) => {
    await fetch("/api/clip-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, intended: v || null }) });
    load();
  };
  const del = async (c: ClipMeta) => {
    if (!confirm(`Delete “${c.title || pretty(c.name)}” from the test library? Its video and analysis are removed.`)) return;
    await fetch(`/api/clips?name=${encodeURIComponent(c.name)}`, { method: "DELETE" }); load();
  };
  const ready = clips.filter((c) => c.intended).length;

  return (
    <div className="flex min-h-[100vh] flex-col">
      <section className="flex-1 bg-parchment px-[22px] py-16">
        <div className="mx-auto max-w-[980px]">
          <p className="t-fine text-ink-48"><Link href="/admin" className="link">Admin dashboard</Link></p>
          <h1 className="t-display">Test library</h1>
          <p className="t-body mt-2 max-w-[680px] text-ink-80">Clips used in the test. Each participant gets 3 random clips with an intended delivery set (one per caption condition A, B, C) and one extra random clip for the final round.</p>
          <p className="t-body-strong mt-4">{ready} of {clips.length} clips ready{ready < 3 ? <span className="font-normal text-ink-48"> · at least 3 needed to start a test</span> : <> · <Link href="/test" className="link">Start test</Link></>}</p>
          {analysis && <div className="mt-8"><LinkBar target="library" label="Add clip" onDone={() => load()} /></div>}
        </div>
      </section>
      <section className="bg-canvas px-[22px] py-16">
        <div className="mx-auto grid max-w-[980px] grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
          {clips.length === 0 && <p className="t-body text-ink-48">The library is empty. Paste a YouTube link above to add a clip.</p>}
          {clips.map((c) => (
            <div key={c.name} className="card !p-4">
              <div className="relative aspect-video overflow-hidden rounded-[8px] bg-parchment">
                {c.thumb && <img src={c.thumb} alt="" className="h-full w-full object-cover" />}
                <span className="t-fine absolute bottom-2 right-2 rounded-[5px] bg-black/75 px-1.5 py-1 tabular-nums text-white">{fmt(c.duration)}</span>
              </div>
              <div className="t-body-strong mt-3 truncate" title={c.title}>{c.title || pretty(c.name)}</div>
              <div className="t-caption text-ink-48">{c.words} words</div>
              <div className="mt-3 flex items-center gap-2">
                <select value={c.intended ?? ""} onChange={(e) => setIntended(c.name, e.target.value)} aria-label={`Intended delivery for ${c.name}`}
                  className={`t-caption h-9 min-w-0 flex-1 rounded-full border px-3 capitalize outline-none ${c.intended ? "border-black/[0.08] bg-canvas" : "border-primary-focus bg-canvas text-primary"}`}>
                  <option value="">Set intended delivery…</option>
                  {DELIVERIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <button onClick={() => del(c)} className="btn-utility h-9 !px-3" aria-label={`Delete ${c.name}`}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <Footer />
    </div>
  );
}
