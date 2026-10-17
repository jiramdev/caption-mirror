"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Clip, Condition } from "@/lib/types";
import VideoPlayer from "./VideoPlayer";
import LinkBar from "./LinkBar";
import { Footer } from "./ui";

const CNAME: Record<Condition, string> = { A: "Plain subtitles", B: "Subtitles with tags", C: "Expressive typography" };

/** Home = demo only. One temporary clip (public/_tmp), replaced by every new link and never added to the test library. */
export default function Home() {
  const [condition, setCondition] = useState<Condition>("C");
  const [clip, setClip] = useState<Clip | null>(null);
  const [has, setHas] = useState<boolean | null>(null);
  const [intensity, setIntensity] = useState(100);
  const [on, setOn] = useState(true);
  const [hosted, setHosted] = useState(true);
  const [analysis, setAnalysis] = useState(true); // can a pasted link be analyzed right now?
  const load = useCallback(() => fetch("/api/demo", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { setClip(d); setHas(!!d); }).catch(() => setHas(false)), []);
  useEffect(() => {
    load();
    fetch("/api/config").then((r) => r.json()).then((c) => { setHosted(c.hosted); setAnalysis(c.analysis !== false); }).catch(() => {});
  }, [load]);

  return (
    <>
      <section className="bg-canvas px-[22px] pb-24 pt-16">
        <div className="mx-auto max-w-[980px] text-center">
          <h1 className="t-hero">Caption Mirror</h1>
          <p className="t-lead mx-auto mt-3 max-w-[640px] text-ink">Captions that show how it&apos;s said.</p>
          <div className="mt-7 flex justify-center gap-4">
            <Link href="/test" className="btn-primary btn-hero">Start test</Link>
          </div>
        </div>
        <div className="mx-auto mt-14 max-w-[980px]">
          {has === false ? (
            <div className="grid aspect-video place-items-center rounded-[18px] bg-parchment text-center">
              <div><p className="t-tagline">Try it with any video.</p><p className="t-body mt-2 text-ink-48">Paste a YouTube link below to see the captions in action.</p></div>
            </div>
          ) : (
            <VideoPlayer clip={clip} err="" condition={condition} setCondition={setCondition} intensity={intensity} setIntensity={setIntensity} on={on} setOn={setOn} study={false} />
          )}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-5">
            <div className="flex rounded-full bg-parchment p-1" role="radiogroup" aria-label="Condition">
              {(["A", "B", "C"] as Condition[]).map((c) => (
                <button key={c} role="radio" aria-checked={condition === c} onClick={() => setCondition(c)}
                  className={`t-caption h-9 min-w-[52px] rounded-full px-4 transition ${condition === c ? "bg-ink text-white" : "text-ink-80"}`}>{c}</button>
              ))}
              <span className="t-caption self-center px-3 text-ink-48">{CNAME[condition]}</span>
            </div>
            <div className={`flex items-center gap-4 ${condition === "C" ? "" : "opacity-40"}`}>
              <label className="t-caption flex items-center gap-2 text-ink-80">Expression
                <button role="switch" aria-checked={on} aria-label="Expressive styling" disabled={condition !== "C"} onClick={() => setOn(!on)} className={`relative h-6 w-10 rounded-full transition ${on ? "bg-primary" : "bg-black/20"}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                </button>
              </label>
              <label className="t-caption flex items-center gap-2 text-ink-80">Intensity
                <input type="range" min={0} max={100} value={intensity} disabled={!on || condition !== "C"} onChange={(e) => setIntensity(+e.target.value)} aria-label="Intensity" className="w-32 accent-[#0066cc]" />
                <span className="w-10 tabular-nums text-ink-48">{intensity}%</span>
              </label>
            </div>
          </div>
          {analysis ? (
            <div className="mt-10"><LinkBar target="demo" onDone={() => load()} /><p className="t-fine mt-3 text-center text-ink-48">Demo clips are temporary: only the latest one is kept and it is never added to the test library.</p></div>
          ) : hosted ? (
            <p className="t-fine mt-10 text-center text-ink-48">Link analysis is offline right now — check back in a bit.</p>
          ) : null}
        </div>
      </section>
      <Footer />
    </>
  );
}
