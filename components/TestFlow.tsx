"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Agency, Clip, Condition, Participant, PostSurvey, PreSurvey, TrialResponse } from "@/lib/types";
import VideoPlayer from "./VideoPlayer";
import Questionnaire, { Field, Scale, type Answers } from "./Questionnaire";
import { GlobalNav } from "./ui";

type Ev = TrialResponse["events"][number];
type Stage = "start" | "name" | "pre" | "intro" | "trial" | "questions" | "agencyIntro" | "agency" | "agencyQ" | "post" | "done";
const SITUATIONS = ["Commute / train", "Library / study", "Late at night", "Public places", "At work", "Never"];
const FREQ = ["Never", "Less than once a week", "A few times a week", "Daily", "Several times a day"];

/** small visual examples of the three styles for the preference question */
function Example({ c }: { c: Condition }) {
  const box = "rounded-[12px] bg-black px-3 py-4 text-center text-[15px] leading-snug text-white";
  if (c === "A") return <div className={box}>I told you not to<br />touch that!</div>;
  if (c === "B") return <div className={box}><span className="cm-tag">[shouting]</span> I told you not to<br />touch that!</div>;
  return (
    <div className={box} style={{ fontFamily: "var(--font-flex)" }}>
      <span style={{ fontVariationSettings: '"wght" 380' }}>I told you</span> <span style={{ fontVariationSettings: '"wght" 600' }}>not to</span><br />
      <span style={{ fontSize: "1.45em", fontVariationSettings: '"wght" 900, "wdth" 112' }}>touch that!</span>
    </div>
  );
}

export default function TestFlow() {
  const [stage, setStage] = useState<Stage>("start");
  const [ready, setReady] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [idx, setIdx] = useState(0);
  const [clip, setClip] = useState<Clip | null>(null);
  const [ended, setEnded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pre, setPre] = useState<PreSurvey>({ situations: [], otherSituation: "", frequency: "", miss: "" });
  const [otherOn, setOtherOn] = useState(false);
  const [post, setPost] = useState<PostSurvey>({ preferred: "", why: "", wouldUse: 0 });
  const [intensity, setIntensity] = useState(100);
  const [on, setOn] = useState(true);
  const [best, setBest] = useState(-1);
  const [agencyComment, setAgencyComment] = useState("");
  const events = useRef<Ev[]>([]);
  const t0 = useRef(0);
  const playingSince = useRef<number | null>(null);
  const watch = useRef(0);
  const intTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { fetch("/api/clips", { cache: "no-store" }).then((r) => r.json()).then((c: { intended?: string }[]) => setReady(c.filter((x) => x.intended).length)).catch(() => setReady(0)); }, []);
  const plan = participant?.trials ?? [];
  const trial = plan[idx];
  const clipToLoad = stage === "trial" ? trial?.clip : stage === "agency" ? participant?.agencyClip : undefined;

  useEffect(() => {
    if (!clipToLoad) return;
    setClip(null); setEnded(false); events.current = []; watch.current = 0; playingSince.current = null; t0.current = performance.now();
    fetch(`/api/clip/${clipToLoad}`).then((r) => r.json()).then(setClip);
  }, [stage, idx, clipToLoad]);

  const onEvent = useCallback((type: string, data?: Record<string, unknown>) => {
    const now = performance.now();
    events.current.push({ type, at: Math.round(now - t0.current), ...data });
    if (type === "play" || type === "replay") playingSince.current = now;
    if ((type === "pause" || type === "ended") && playingSince.current) { watch.current += (now - playingSince.current) / 1000; playingSince.current = null; }
    if (type === "ended") setEnded(true);
  }, []);
  const stopWatch = () => { if (playingSince.current) { watch.current += (performance.now() - playingSince.current) / 1000; playingSince.current = null; } document.querySelector("video")?.pause(); };
  const patch = (body: Record<string, unknown>) => fetch("/api/participants", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: participant?.id, ...body }) });

  async function register(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().split(/\s+/).length < 2) { setNameErr("Please enter the participant's first and last name."); return; }
    const r = await fetch("/api/participants", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json();
    if (!r.ok) { setNameErr(j.error); return; }
    setParticipant(j); setIdx(0); setStage("pre");
  }
  async function submitPre(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await patch({ pre: { ...pre, otherSituation: otherOn ? pre.otherSituation : "" } }); setSaving(false); setStage("intro"); window.scrollTo({ top: 0 });
  }
  function toQuestions() { stopWatch(); setStage("questions"); window.scrollTo({ top: 0 }); }

  async function submit(a: Answers) {
    if (!participant || !trial) return;
    setSaving(true);
    const ev = events.current, c = (t: string) => ev.filter((x) => x.type === t).length;
    const body: TrialResponse = {
      participantId: participant.id, participant: participant.name, pnum: participant.pnum, trialIndex: idx, clip: trial.clip, condition: trial.condition, ...a,
      intended: null, correct: null,
      metrics: { watchTime: +watch.current.toFixed(1), pauses: c("pause"), seeks: c("seek") + c("rewind"), rewinds: c("rewind"), replays: c("replay"),
        captionToggles: c("captions"), fullscreen: ev.filter((x) => x.type === "fullscreen" && x.on).length, intensityChanges: c("intensity"), ended: c("ended") > 0 },
      events: ev,
    };
    const r = await fetch("/api/responses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!r.ok) { alert("Saving failed. Please tell the researcher."); return; }
    if (idx + 1 >= plan.length) setStage("agencyIntro"); else { setIdx(idx + 1); setStage("trial"); }
    window.scrollTo({ top: 0 });
  }

  // agency round controls (logged in addition to the player's own events)
  const changeIntensity = (n: number) => { setIntensity(n); if (intTimer.current) clearTimeout(intTimer.current); intTimer.current = setTimeout(() => onEvent("intensity", { value: n }), 400); };
  const toggleOn = () => { const v = !on; setOn(v); onEvent("off", { on: v, intensity }); };
  function toAgencyQ() { stopWatch(); setBest(intensity); setStage("agencyQ"); window.scrollTo({ top: 0 }); }
  async function submitAgency(e: React.FormEvent) {
    e.preventDefault(); if (!participant) return; setSaving(true);
    const ev = events.current;
    const agency: Agency = { clip: participant.agencyClip, finalIntensity: intensity, finalOn: on, bestIntensity: best, comment: agencyComment,
      intensityChanges: ev.filter((x) => x.type === "intensity").length, offToggles: ev.filter((x) => x.type === "off").length, events: ev.slice(0, 2000), watchTime: +watch.current.toFixed(1) };
    await patch({ agency }); setSaving(false); setStage("post"); window.scrollTo({ top: 0 });
  }
  async function submitPost(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    await patch({ post, completedAt: new Date().toISOString() }); setSaving(false); setStage("done"); window.scrollTo({ top: 0 });
  }

  const steps = plan.length + 1; // 3 clips + agency round
  const cur = stage === "agency" || stage === "agencyQ" || stage === "agencyIntro" ? plan.length : stage === "post" || stage === "done" ? steps : idx;
  const inTest = !["start", "name"].includes(stage);
  const Progress = () => (
    <div className="flex items-center gap-3">
      <div className="flex gap-1.5">{Array.from({ length: steps }).map((_, i) => <span key={i} className={`h-1 w-7 rounded-full ${i < cur || stage === "done" ? "bg-white" : i === cur && !["pre", "intro", "agencyIntro"].includes(stage) ? "bg-primary-on-dark" : "bg-white/25"}`} />)}</div>
      <span className="t-fine tabular-nums text-white/70">{stage === "done" ? "Done" : stage === "pre" ? "Before we start" : stage === "post" ? "Last questions" : cur >= plan.length ? "Final round" : stage === "intro" ? `${steps} clips` : `Clip ${idx + 1} of ${steps}`}</span>
    </div>
  );

  return (
    <>
      <GlobalNav minimal={inTest} right={inTest ? <Progress /> : undefined} />

      {stage === "start" && (
        <section className="min-h-[calc(100vh-44px)] bg-parchment px-[22px] py-16">
          <div className="mx-auto max-w-[640px]">
            <h1 className="t-display">Start a test.</h1>
            <p className="t-body mt-3 text-ink-80">Each participant answers a short survey, watches 3 random library clips without sound (one in each caption condition A, B and C, in a balanced random order), tries a final clip where they control the captions themselves, and answers a few last questions. It takes about 10 minutes.</p>
            {ready === null ? null : ready < 3 ? (
              <div className="card mt-8"><p className="t-body-strong">The library needs at least 3 clips with an intended delivery.</p><p className="t-body mt-1 text-ink-80">Now: {ready}. Add clips and set their intended delivery first.</p><Link href="/test/library" className="btn-primary mt-5 inline-flex">Open test library</Link></div>
            ) : (
              <div className="mt-8 flex gap-3"><button onClick={() => setStage("name")} className="btn-primary">Continue</button><Link href="/test/library" className="btn-secondary">Test library</Link></div>
            )}
          </div>
        </section>
      )}

      {stage === "name" && (
        <section className="min-h-[calc(100vh-44px)] bg-parchment px-[22px] py-16">
          <form onSubmit={register} className="mx-auto max-w-[560px]">
            <h1 className="t-display">Who is taking the test?</h1>
            <p className="t-body mt-2 text-ink-80">Enter the participant&apos;s full name. It&apos;s stored with their answers on this laptop.</p>
            <label htmlFor="pname" className="t-body-strong mt-10 block">Full name</label>
            <input id="pname" value={name} onChange={(e) => { setName(e.target.value); setNameErr(""); }} autoFocus required placeholder="First and last name" autoComplete="off" className="field mt-3" />
            {nameErr && <p className="t-caption mt-2 text-ink-80">{nameErr}</p>}
            <div className="mt-8 flex gap-3">
              <button type="button" onClick={() => setStage("start")} className="btn-secondary">Back</button>
              <button disabled={!name.trim()} className="btn-primary">Start test</button>
            </div>
          </form>
        </section>
      )}

      {stage === "pre" && (
        <section className="bg-canvas px-[22px] py-16">
          <form onSubmit={submitPre} className="mx-auto max-w-[692px] space-y-12">
            <div><p className="t-caption-strong text-ink-48">Before we start</p><h1 className="t-display mt-1">How do you watch without sound?</h1></div>
            <fieldset>
              <legend className="t-body-strong mb-2">In which situations do you watch videos with the sound off?</legend>
              <p className="t-caption mb-5 text-ink-48">Select all that apply.</p>
              <div className="flex flex-wrap gap-3">
                {SITUATIONS.map((s) => {
                  const sel = pre.situations.includes(s);
                  return <button type="button" key={s} aria-pressed={sel} className="chip" onClick={() => setPre({ ...pre, situations: s === "Never" ? (sel ? [] : ["Never"]) : sel ? pre.situations.filter((x) => x !== s) : [...pre.situations.filter((x) => x !== "Never"), s] })}>{s}</button>;
                })}
                <button type="button" aria-pressed={otherOn} className="chip" onClick={() => { setOtherOn(!otherOn); setPre({ ...pre, situations: otherOn ? pre.situations.filter((x) => x !== "Other") : [...pre.situations.filter((x) => x !== "Never"), "Other"] }); }}>Other</button>
              </div>
              {otherOn && <input value={pre.otherSituation} onChange={(e) => setPre({ ...pre, otherSituation: e.target.value })} placeholder="Which situation?" aria-label="Other situation" className="field mt-4" />}
            </fieldset>
            <fieldset>
              <legend className="t-body-strong mb-4">How often do you watch videos with the sound off?</legend>
              <div className="flex flex-wrap gap-3">{FREQ.map((f) => <button type="button" key={f} aria-pressed={pre.frequency === f} onClick={() => setPre({ ...pre, frequency: f })} className="chip">{f}</button>)}</div>
            </fieldset>
            <Field id="pre-miss" label="What do you miss in standard subtitles?" value={pre.miss} set={(v) => setPre({ ...pre, miss: v })} />
            <button disabled={saving || !pre.situations.length || !pre.frequency} className="btn-primary">Continue</button>
          </form>
        </section>
      )}

      {stage === "intro" && participant && (
        <section className="on-dark flex min-h-[calc(100vh-44px)] items-center bg-tile-1 px-[22px] py-16 text-white">
          <div className="mx-auto max-w-[640px] text-center">
            <h1 className="t-hero">Hi {participant.name.split(" ")[0]}.</h1>
            <p className="t-lead-airy mt-5 text-body-muted">You&apos;ll watch {steps} short clips <span className="font-semibold text-white">without sound</span>. Read the captions, then answer a few quick questions after each clip.</p>
            <p className="t-body mt-4 text-body-muted">You can pause, rewind or go fullscreen. There are no wrong answers about how it felt.</p>
            <button onClick={() => setStage("trial")} className="btn-primary btn-hero mt-10">Begin</button>
          </div>
        </section>
      )}

      {stage === "trial" && trial && (
        <section className="on-dark min-h-[calc(100vh-44px)] bg-tile-3 px-[22px] py-12 text-white">
          <div className="mx-auto max-w-[980px]">
            <h1 className="t-tagline mb-6">Clip {idx + 1} of {steps}</h1>
            <VideoPlayer key={idx} clip={clip} err="" condition={trial.condition} setCondition={() => {}} intensity={100} setIntensity={() => {}} on setOn={() => {}} study onEvent={onEvent} />
            <div className="mt-8 flex items-center justify-end gap-5">
              {!ended && <span className="t-caption text-body-muted">Continue becomes available when the clip ends.</span>}
              <button onClick={toQuestions} disabled={!ended} className="btn-primary">Continue to questions</button>
            </div>
          </div>
        </section>
      )}

      {stage === "questions" && (
        <section className="bg-canvas px-[22px] py-16">
          <div className="mx-auto max-w-[692px]">
            <p className="t-caption-strong text-ink-48">Clip {idx + 1} of {steps}</p>
            <h1 className="t-display mt-1 mb-12">About this clip.</h1>
            <Questionnaire key={idx} onSubmit={submit} submitting={saving} />
          </div>
        </section>
      )}

      {stage === "agencyIntro" && (
        <section className="on-dark flex min-h-[calc(100vh-44px)] items-center bg-tile-1 px-[22px] py-16 text-white">
          <div className="mx-auto max-w-[640px] text-center">
            <h1 className="t-display">One last clip. You&apos;re in control.</h1>
            <p className="t-lead-airy mt-5 text-body-muted">This time the captions are expressive, and you can change how strong the effect is with the <span className="font-semibold text-white">intensity slider</span>, or switch the effect off. Set it the way you like it best.</p>
            <button onClick={() => { setIntensity(100); setOn(true); setStage("agency"); }} className="btn-primary btn-hero mt-10">Begin</button>
          </div>
        </section>
      )}

      {stage === "agency" && participant && (
        <section className="on-dark min-h-[calc(100vh-44px)] bg-tile-3 px-[22px] py-12 text-white">
          <div className="mx-auto max-w-[980px]">
            <h1 className="t-tagline mb-6">Final clip</h1>
            <VideoPlayer clip={clip} err="" condition="C" setCondition={() => {}} intensity={intensity} setIntensity={changeIntensity} on={on} setOn={toggleOn} study onEvent={onEvent} />
            <div className="mt-6 flex flex-wrap items-center gap-6 rounded-[18px] bg-tile-1 px-6 py-4">
              <label className="t-body flex items-center gap-3">Expressive effect
                <button role="switch" aria-checked={on} aria-label="Expressive effect" onClick={toggleOn} className={`relative h-7 w-12 rounded-full transition ${on ? "bg-[#2997ff]" : "bg-white/30"}`}>
                  <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </label>
              <label className={`t-body flex flex-1 items-center gap-3 ${on ? "" : "opacity-40"}`}>Intensity
                <input type="range" min={0} max={100} value={intensity} disabled={!on} onChange={(e) => changeIntensity(+e.target.value)} aria-label="Intensity" className="min-w-[140px] flex-1 accent-[#2997ff]" />
                <span className="w-12 tabular-nums text-body-muted">{intensity}%</span>
              </label>
            </div>
            <div className="mt-8 flex items-center justify-end gap-5">
              {!ended && <span className="t-caption text-body-muted">Continue becomes available when the clip ends.</span>}
              <button onClick={toAgencyQ} disabled={!ended} className="btn-primary">Continue</button>
            </div>
          </div>
        </section>
      )}

      {stage === "agencyQ" && (
        <section className="bg-canvas px-[22px] py-16">
          <form onSubmit={submitAgency} className="mx-auto max-w-[692px] space-y-12">
            <div><p className="t-caption-strong text-ink-48">Final clip</p><h1 className="t-display mt-1">Your settings.</h1>
              <p className="t-body mt-2 text-ink-80">You ended with the effect {on ? <>on at <b>{intensity}%</b></> : <b>off</b>}.</p></div>
            <fieldset>
              <legend className="t-body-strong mb-4">Which intensity felt best to you?</legend>
              <div className="flex items-center gap-4"><input type="range" min={0} max={100} step={5} value={best < 0 ? 0 : best} onChange={(e) => setBest(+e.target.value)} aria-label="Best intensity" className="flex-1 accent-[#0066cc]" /><span className="t-body-strong w-14 tabular-nums">{best}%</span></div>
              <div className="t-fine mt-2 flex justify-between text-ink-48"><span>0% (plain)</span><span>100% (full effect)</span></div>
            </fieldset>
            <Field id="agency-c" label="Why?" value={agencyComment} set={setAgencyComment} optional />
            <button disabled={saving || best < 0} className="btn-primary">Continue</button>
          </form>
        </section>
      )}

      {stage === "post" && (
        <section className="bg-canvas px-[22px] py-16">
          <form onSubmit={submitPost} className="mx-auto max-w-[780px] space-y-12">
            <div><p className="t-caption-strong text-ink-48">Last questions</p><h1 className="t-display mt-1">Which style did you prefer?</h1></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" role="radiogroup" aria-label="Preferred style">
              {(["A", "B", "C"] as Condition[]).map((c) => (
                <button type="button" role="radio" key={c} aria-checked={post.preferred === c} onClick={() => setPost({ ...post, preferred: c })}
                  className={`card !p-4 text-left transition active:scale-[0.98] ${post.preferred === c ? "!border-2 !border-primary-focus !p-[15px]" : ""}`}>
                  <Example c={c} />
                  <div className="t-body-strong mt-3">Style {c}</div>
                  <div className="t-caption text-ink-48">{c === "A" ? "Plain subtitles" : c === "B" ? "Subtitles with tags" : "Expressive typography"}</div>
                </button>
              ))}
            </div>
            <Field id="post-why" label="Why did you prefer this style?" value={post.why} set={(v) => setPost({ ...post, why: v })} />
            <Scale q="Would you use captions like this in daily life?" lo="Definitely not" hi="Definitely" value={post.wouldUse || undefined} set={(n) => setPost({ ...post, wouldUse: n })} />
            <button disabled={saving || !post.preferred || !post.wouldUse} className="btn-primary">Finish</button>
          </form>
        </section>
      )}

      {stage === "done" && participant && (
        <section className="flex min-h-[calc(100vh-44px)] items-center bg-parchment px-[22px] py-16">
          <div className="mx-auto max-w-[640px] text-center">
            <h1 className="t-hero">Thank you, {participant.name.split(" ")[0]}.</h1>
            <p className="t-lead-airy mt-5 text-ink-80">Your answers have been saved. Please hand the laptop back to the researcher.</p>
            <Link href="/" className="btn-primary btn-hero mt-10">Back to home</Link>
          </div>
        </section>
      )}
    </>
  );
}
