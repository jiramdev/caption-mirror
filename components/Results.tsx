"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Condition, Participant, TrialResponse } from "@/lib/types";
import { SCALES } from "./Questionnaire";
import { Footer, pretty } from "./ui";

const CONDS: Condition[] = ["A", "B", "C"];
const CNAME: Record<Condition, string> = { A: "Plain", B: "Tags", C: "Expressive" };
// Single accent: conditions are shown as steps of ink → Action Blue (no second brand colour).
const FILL: Record<Condition, string> = { A: "#d2d2d7", B: "#7a7a7a", C: "#0066cc" };
const NICE: Record<string, string> = { emotionClarity: "Emotion clarity", readability: "Readability", keepUp: "Keeping up", comfort: "Comfort", distraction: "Distraction" };
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sd = (xs: number[]) => { if (xs.length < 2) return NaN; const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
const f1 = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : "–");

function Bars({ values, max, fmtv = (v: number) => f1(v), n }: { values: Record<Condition, number>; max: number; fmtv?: (v: number) => string; n: Record<Condition, number> }) {
  const W = 280, H = 140, bw = 56, gap = (W - bw * 3) / 4;
  return (
    <svg viewBox={`0 0 ${W} ${H + 56}`} className="w-full" role="img"><g transform="translate(0,20)">
      <line x1={0} x2={W} y1={H} y2={H} stroke="#e0e0e0" />
      {CONDS.map((c, i) => {
        const v = values[c], h = Number.isFinite(v) ? Math.max(2, (v / max) * H) : 0, x = gap + i * (bw + gap);
        return (
          <g key={c}>
            <rect x={x} y={H - h} width={bw} height={h} rx={8} fill={FILL[c]} />
            <text x={x + bw / 2} y={H - h - 8} textAnchor="middle" fontSize="14" fill="#1d1d1f" fontWeight={600}>{fmtv(v)}</text>
            <text x={x + bw / 2} y={H + 18} textAnchor="middle" fontSize="12" fill="#333">{c} · {CNAME[c]}</text>
            <text x={x + bw / 2} y={H + 33} textAnchor="middle" fontSize="11" fill="#7a7a7a">n = {n[c]}</text>
          </g>
        );
      })}
    </g></svg>
  );
}

const count = (xs: string[]) => xs.filter(Boolean).reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {});
function Dist({ counts, total }: { counts: Record<string, number>; total: number }) {
  const e = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!e.length) return <p className="t-caption mt-4 text-ink-48">No answers yet.</p>;
  return (
    <div className="mt-4 space-y-2.5">
      {e.map(([k, v]) => (
        <div key={k} className="t-caption">
          <div className="flex justify-between"><span className="text-ink-80">{k}</span><span className="tabular-nums text-ink-48">{v} · {total ? Math.round((v / total) * 100) : 0}%</span></div>
          <div className="mt-1 h-1.5 rounded-full bg-parchment"><div className="h-full rounded-full bg-primary" style={{ width: `${total ? (v / total) * 100 : 0}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
function Quotes({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="card"><div className="t-body-strong">{title}</div>
      {items.length ? <ul className="mt-3 space-y-3">{items.map(([who, q], i) => <li key={i} className="t-caption"><span className="text-ink-80">“{q}”</span> <span className="text-ink-48">— {who}</span></li>)}</ul> : <p className="t-caption mt-3 text-ink-48">No answers yet.</p>}
    </div>
  );
}

export default function Results() {
  const [rows, setRows] = useState<TrialResponse[]>([]);
  const [people, setPeople] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => fetch("/api/responses", { cache: "no-store" }).then((r) => r.json()).then((d) => { setRows(d.responses); setPeople(d.participants); setLoading(false); });
  useEffect(() => { load(); }, []);

  const by = useMemo(() => Object.fromEntries(CONDS.map((c) => [c, rows.filter((r) => r.condition === c)])) as Record<Condition, TrialResponse[]>, [rows]);
  const per = (fn: (r: TrialResponse) => number) => Object.fromEntries(CONDS.map((c) => [c, mean(by[c].map(fn).filter(Number.isFinite))])) as Record<Condition, number>;
  const nBy = Object.fromEntries(CONDS.map((c) => [c, by[c].length])) as Record<Condition, number>;
  const acc = Object.fromEntries(CONDS.map((c) => { const s = by[c].filter((r) => r.correct !== null); return [c, s.length ? (s.filter((r) => r.correct).length / s.length) * 100 : NaN]; })) as Record<Condition, number>;
  const metricRows: [string, (r: TrialResponse) => number][] = [
    ["Watch time (s)", (r) => r.metrics.watchTime], ["Pauses", (r) => r.metrics.pauses], ["Seeks", (r) => r.metrics.seeks], ["Rewinds", (r) => r.metrics.rewinds],
    ["Replays", (r) => r.metrics.replays], ["Caption toggles", (r) => r.metrics.captionToggles], ["Fullscreen", (r) => r.metrics.fullscreen],
  ];
  const pre = people.flatMap((p) => (p.pre ? [p.pre] : []));
  const post = people.flatMap((p) => (p.post ? [p.post] : []));
  const ag = people.flatMap((p) => (p.agency ? [p.agency] : []));
  const del = async (p: Participant) => {
    if (!confirm(`Delete ${p.name} and all of their answers? This can't be undone.`)) return;
    await fetch(`/api/participants?id=${p.id}`, { method: "DELETE" }); load();
  };

  return (
    <div className="flex min-h-[100vh] flex-col">
      <section className="bg-parchment px-[22px] pb-14 pt-16">
        <div className="mx-auto flex max-w-[980px] flex-wrap items-end justify-between gap-6">
          <div>
            <p className="t-fine text-ink-48"><Link href="/admin" className="link">Admin dashboard</Link></p>
            <h1 className="t-hero">Results.</h1>
            <p className="t-lead mt-3 text-ink-80">{people.length} participants · {rows.length} trials{loading ? " · loading" : ""}</p>
          </div>
          <div className="flex gap-3">
            <a href="/api/responses?format=csv" className="btn-primary">Trials CSV</a>
            <a href="/api/responses?format=participants" className="btn-secondary">Participants CSV</a>
            <a href="/api/responses?format=json" className="btn-secondary">Export JSON</a>
          </div>
        </div>
      </section>

      {rows.length === 0 && people.length === 0 && !loading ? (
        <section className="flex-1 bg-canvas px-[22px] py-20 text-center"><p className="t-lead-airy text-ink-48">No responses yet. Run a test from the admin dashboard.</p></section>
      ) : (
        <>
          <section className="flex-1 bg-canvas px-[22px] py-20">
            <div className="mx-auto max-w-[980px]">
              <h2 className="t-display-md">By condition</h2>
              <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="card"><div className="t-body-strong">Comprehension</div><div className="t-caption text-ink-48">Perceived = intended delivery</div><Bars values={acc} max={100} fmtv={(v) => (Number.isFinite(v) ? `${Math.round(v)}%` : "–")} n={nBy} /></div>
                {SCALES.map(([k, q]) => (
                  <div key={k} className="card"><div className="t-body-strong">{NICE[k]}</div><div className="t-caption truncate text-ink-48">{q} (1–7)</div><Bars values={per((r) => (r as unknown as Record<string, number>)[k])} max={7} n={nBy} /></div>
                ))}
                <div className="card"><div className="t-body-strong">Watch time</div><div className="t-caption text-ink-48">Seconds of playback per trial</div>
                  <Bars values={per((r) => r.metrics.watchTime)} max={Math.max(10, ...CONDS.map((c) => per((r) => r.metrics.watchTime)[c] || 0)) * 1.2} n={nBy} /></div>
              </div>

              <div className="card mt-5 overflow-x-auto">
                <div className="t-body-strong mb-3">Mean ± SD</div>
                <table className="t-caption w-full">
                  <thead><tr className="text-left text-ink-48"><th className="py-2 font-normal">Measure</th>{CONDS.map((c) => <th key={c} className="py-2 font-semibold text-ink">{c} · {CNAME[c]}</th>)}</tr></thead>
                  <tbody>
                    {SCALES.map(([k]) => (
                      <tr key={k} className="border-t border-divider-soft"><td className="py-2.5 text-ink-80">{NICE[k]}</td>{CONDS.map((c) => { const xs = by[c].map((r) => (r as unknown as Record<string, number>)[k]); return <td key={c} className="py-2.5 tabular-nums">{f1(mean(xs), 2)} <span className="text-ink-48">± {f1(sd(xs), 2)}</span></td>; })}</tr>
                    ))}
                    <tr className="border-t border-divider-soft"><td className="py-2.5 text-ink-80">Comprehension correct</td>{CONDS.map((c) => { const s = by[c].filter((r) => r.correct !== null); return <td key={c} className="py-2.5 tabular-nums">{s.filter((r) => r.correct).length} / {s.length}</td>; })}</tr>
                    {metricRows.map(([nm, fn]) => (
                      <tr key={nm} className="border-t border-divider-soft"><td className="py-2.5 text-ink-80">{nm}</td>{CONDS.map((c) => <td key={c} className="py-2.5 tabular-nums">{f1(mean(by[c].map(fn)))}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="bg-parchment px-[22px] py-20">
            <div className="mx-auto max-w-[980px]">
              <h2 className="t-display-md">Surveys &amp; control</h2>
              <div className="mt-8 grid gap-5 md:grid-cols-2">
                <div className="card">
                  <div className="t-body-strong">Muted viewing situations (RQ1)</div><div className="t-caption text-ink-48">{pre.length} answered · multiple answers allowed</div>
                  <Dist counts={count(pre.flatMap((p) => p.situations))} total={pre.length} />
                </div>
                <div className="card">
                  <div className="t-body-strong">How often sound-off (RQ1)</div><div className="t-caption text-ink-48">{pre.length} answered</div>
                  <Dist counts={count(pre.map((p) => p.frequency))} total={pre.length} />
                </div>
                <div className="card">
                  <div className="t-body-strong">Preferred style</div><div className="t-caption text-ink-48">{post.length} answered · would use (1–7): {f1(mean(post.map((p) => p.wouldUse)), 2)} ± {f1(sd(post.map((p) => p.wouldUse)), 2)}</div>
                  <Dist counts={Object.fromEntries(CONDS.map((c) => [`${c} · ${CNAME[c]}`, post.filter((p) => p.preferred === c).length]))} total={post.length} />
                </div>
                <div className="card">
                  <div className="t-body-strong">Agency round (Condition C, user control)</div><div className="t-caption text-ink-48">{ag.length} completed</div>
                  <table className="t-caption mt-4 w-full"><tbody>
                    {([["Mean final intensity", `${f1(mean(ag.filter((a) => a.finalOn).map((a) => a.finalIntensity)), 0)}% (effect on)`], ["Turned the effect off at the end", ag.length ? `${Math.round((ag.filter((a) => !a.finalOn).length / ag.length) * 100)}%` : "–"],
                      ["Ever switched off", ag.length ? `${Math.round((ag.filter((a) => a.offToggles > 0).length / ag.length) * 100)}%` : "–"], ["Mean “best” intensity", `${f1(mean(ag.map((a) => a.bestIntensity)), 0)}%`],
                      ["Mean intensity changes", f1(mean(ag.map((a) => a.intensityChanges)))]] as [string, string][]).map(([k, v]) => <tr key={k} className="border-t border-divider-soft"><td className="py-2 text-ink-80">{k}</td><td className="py-2 text-right tabular-nums">{v}</td></tr>)}
                  </tbody></table>
                </div>
              </div>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <Quotes title="What do you miss in standard subtitles?" items={people.filter((p) => p.pre?.miss).map((p) => [p.name, p.pre!.miss])} />
                <Quotes title="Why this style?" items={people.filter((p) => p.post?.why).map((p) => [`${p.name} (${p.post!.preferred})`, p.post!.why])} />
              </div>
            </div>
          </section>

          <section className="bg-canvas px-[22px] py-20">
            <div className="mx-auto max-w-[980px]">
              <h2 className="t-display-md">Participants</h2>
              <div className="mt-8 space-y-5">
                {people.slice().reverse().map((p) => {
                  const rs = rows.filter((r) => r.participantId === p.id).sort((a, b) => a.trialIndex - b.trialIndex);
                  return (
                    <div key={p.id} className="card overflow-x-auto">
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <div><span className="t-tagline">{p.name}</span><span className="t-caption ml-3 text-ink-48">#{p.pnum + 1} · {new Date(p.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} · {rs.length}/3 trials{p.agency ? ` · final: ${p.agency.finalOn ? p.agency.finalIntensity + "%" : "off"}, best ${p.agency.bestIntensity}%` : ""}{p.post ? ` · prefers ${p.post.preferred}` : ""}</span></div>
                        <button onClick={() => del(p)} className="t-caption link">Delete participant</button>
                      </div>
                      {rs.length > 0 && (
                        <table className="t-caption mt-4 w-full">
                          <thead><tr className="text-left text-ink-48">{["#", "Clip", "Cond.", "Clarity", "Read.", "Keep up", "Comfort", "Distr.", "Perceived", "Intended", "", "Watch", "Pauses", "Rewinds"].map((h, i) => <th key={i} className="whitespace-nowrap py-1.5 pr-3 font-normal">{h}</th>)}</tr></thead>
                          <tbody>
                            {rs.map((r) => (
                              <tr key={r.id} className="border-t border-divider-soft">
                                <td className="py-2 pr-3 tabular-nums">{r.trialIndex + 1}</td><td className="pr-3">{pretty(r.clip)}</td>
                                <td className="pr-3"><span className="t-fine rounded-[5px] px-1.5 py-1 font-semibold" style={{ background: FILL[r.condition], color: r.condition === "A" ? "#1d1d1f" : "#fff" }}>{r.condition}</span></td>
                                <td className="pr-3 tabular-nums">{r.emotionClarity}</td><td className="pr-3 tabular-nums">{r.readability}</td><td className="pr-3 tabular-nums">{r.keepUp}</td><td className="pr-3 tabular-nums">{r.comfort}</td><td className="pr-3 tabular-nums">{r.distraction}</td>
                                <td className="pr-3 capitalize">{r.perceived}</td><td className="pr-3 capitalize text-ink-48">{r.intended ?? "–"}</td>
                                <td className="pr-3 font-semibold">{r.correct === null ? "" : r.correct ? "✓" : "✗"}</td>
                                <td className="pr-3 tabular-nums">{r.metrics.watchTime}s</td><td className="pr-3 tabular-nums">{r.metrics.pauses}</td><td className="tabular-nums">{r.metrics.rewinds}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      )}
      <Footer />
    </div>
  );
}
