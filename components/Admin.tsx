"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClipMeta, Participant, TrialResponse } from "@/lib/types";
import { Footer } from "./ui";

/** Researcher dashboard: state of the study in one screen, with the tools one click away. */
export default function Admin() {
  const router = useRouter();
  const [clips, setClips] = useState<ClipMeta[]>([]);
  const [people, setPeople] = useState<Participant[]>([]);
  const [rows, setRows] = useState<TrialResponse[]>([]);
  const [hosted, setHosted] = useState(true);
  const [analysis, setAnalysis] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetch("/api/clips", { cache: "no-store" }).then((r) => r.json()).then(setClips).catch(() => {});
    fetch("/api/responses", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).then((d: { participants?: Participant[]; responses?: TrialResponse[] }) => { setPeople(d.participants || []); setRows(d.responses || []); }).catch(() => {});
    fetch("/api/config").then((r) => r.json()).then((c) => { setHosted(c.hosted); setAnalysis(!!c.analysis); }).catch(() => {});
    setTimeout(() => setLoading(false), 400);
  };
  useEffect(load, []);

  const ready = clips.filter((c) => c.intended).length;
  const done = people.filter((p) => p.completedAt).length;
  const last = people.length ? [...people].sort((a, b) => +Date.parse(b.createdAt) - +Date.parse(a.createdAt))[0] : null;
  const keepUp = rows.length ? rows.reduce((s, r) => s + (r.keepUp ?? 0), 0) / rows.length : 0;

  const signOut = async () => {
    await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logout: true }) });
    router.push("/"); router.refresh();
  };

  const stats = [
    { k: "Test library", v: `${ready}/${clips.length}`, s: ready >= 3 ? "ready for a test" : `${3 - ready} more needed`, href: "/test/library" },
    { k: "Participants", v: loading ? "…" : String(people.length), s: done < people.length ? `${done} finished` : last ? `last ${new Date(last.createdAt).toLocaleDateString()}` : "none yet", href: "/results" },
    { k: "Trials recorded", v: loading ? "…" : String(rows.length), s: rows.length ? `mean keep-up ${keepUp.toFixed(1)}/7` : "no trials yet", href: "/results" },
    { k: "Link analysis", v: analysis ? "Online" : "Offline", s: hosted ? (analysis ? "worker running" : "worker not running") : "local mode", href: "/test/library" },
  ];

  return (
    <div className="flex min-h-[100vh] flex-col">
      <section className="bg-parchment px-[22px] pb-14 pt-16">
        <div className="mx-auto flex max-w-[980px] flex-wrap items-end justify-between gap-6">
          <div>
            <p className="t-fine text-ink-48">Caption Mirror · research</p>
            <h1 className="t-display mt-1">Admin.</h1>
            <p className="t-body mt-3 max-w-[640px] text-ink-80">Clips, participants and results for the study. The public site is the <Link href="/" className="link">demo page</Link>; participants start a test at <Link href="/test" className="link">/test</Link>.</p>
          </div>
          <button onClick={signOut} className="btn-secondary">Sign out</button>
        </div>
      </section>

      <div className="flex-1 bg-canvas px-[22px] pb-24 pt-12">
        <div className="mx-auto grid max-w-[980px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((c) => (
            <Link key={c.k} href={c.href} className="card transition hover:border-black/20">
              <p className="t-fine text-ink-48">{c.k}</p>
              <p className="t-display-md mt-2 tabular-nums">{c.v}</p>
              <p className="t-caption mt-1 text-ink-48">{c.s}</p>
            </Link>
          ))}
        </div>
        <div className="mx-auto mt-16 grid max-w-[980px] grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="card">
            <h2 className="t-body-strong">Run a test</h2>
            <p className="t-body mt-1 text-ink-80">Add clips and set their intended delivery in the test library, then hand over the laptop. Participants run the test at <code className="text-ink-80">/test</code>.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/test/library" className="btn-primary">Add clips</Link>
              <Link href="/test" className="btn-secondary">Start a test</Link>
            </div>
          </div>
          <div className="card">
            <h2 className="t-body-strong">Results &amp; exports</h2>
            <p className="t-body mt-1 text-ink-80">Per-condition charts, comprehension accuracy and agency stats, plus the raw data.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/results" className="btn-primary">Open results</Link>
              <a href="/api/responses?format=csv" className="btn-pearl">Trials CSV</a>
              <a href="/api/responses?format=participants" className="btn-pearl">Participants CSV</a>
              <a href="/api/responses?format=json" className="btn-pearl">JSON</a>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
