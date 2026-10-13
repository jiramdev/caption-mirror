"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Clip, Condition, Cue } from "@/lib/types";
import Caption from "./Caption";


function useVideoTime(ref: React.RefObject<HTMLVideoElement | null>, dep: unknown) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    let stop = false, id = 0;
    type RVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: (n: number, m: { mediaTime: number }) => void) => number; cancelVideoFrameCallback?: (h: number) => void };
    const vv = v as RVFC;
    const hasRVFC = typeof vv.requestVideoFrameCallback === "function";
    const loopRVFC = (_n: number, m: { mediaTime: number }) => { if (stop) return; setT(m.mediaTime); id = vv.requestVideoFrameCallback!(loopRVFC); };
    const loopRAF = () => { if (stop) return; setT(v.currentTime); id = requestAnimationFrame(loopRAF); };
    if (hasRVFC) id = vv.requestVideoFrameCallback!(loopRVFC); else id = requestAnimationFrame(loopRAF);
    const onSeek = () => setT(v.currentTime); // rVFC doesn't fire while paused
    v.addEventListener("seeked", onSeek); v.addEventListener("timeupdate", onSeek);
    return () => {
      stop = true;
      if (hasRVFC) vv.cancelVideoFrameCallback?.(id); else cancelAnimationFrame(id);
      v.removeEventListener("seeked", onSeek); v.removeEventListener("timeupdate", onSeek);
    };
  }, [ref, dep]);
  return t;
}

function activeCue(clip: Clip | null, t: number): Cue | null {
  if (!clip?.cues) return null;
  for (const c of clip.cues) if (t >= c.start - 0.08 && t <= c.showUntil) return c;
  return null;
}

/* ---- cross-browser fullscreen (Safari < 16.4 only has the webkit-prefixed API) ---- */
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };
const fsElement = () => document.fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;
const requestFs = (el: HTMLElement) => { const e = el as FsEl; if (e.requestFullscreen) return e.requestFullscreen().catch(() => {}); e.webkitRequestFullscreen?.(); };
const exitFs = () => { const d = document as FsDoc; if (d.exitFullscreen) return d.exitFullscreen().catch(() => {}); d.webkitExitFullscreen?.(); };

/** WebVTT fallback track, used only if the browser fullscreens the bare <video> (e.g. iOS Safari, native menus). */
function toVtt(clip: Clip, cond: Condition) {
  const ts = (x: number) => { const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = (x % 60).toFixed(3).padStart(6, "0"); return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s}`; };
  return "WEBVTT\n\n" + clip.cues.map((c) => {
    const ls = c.br ? [c.words.slice(0, c.br), c.words.slice(c.br)] : [c.words];
    const txt = ls.map((l) => l.map((w) => w.w).join(" ")).join("\n");
    return `${ts(c.start)} --> ${ts(c.showUntil)}\n${cond === "B" && c.tags.length ? c.tags.join(" ") + " " : ""}${txt}`;
  }).join("\n\n");
}

const fmt = (s: number) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const Icon = ({ d, className = "h-6 w-6" }: { d: string; className?: string }) => <svg viewBox="0 0 24 24" className={className} fill="currentColor"><path d={d} /></svg>;
const I = {
  play: "M8 5v14l11-7z", pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  vol: "M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1A9 9 0 0 0 14 3.2z",
  mute: "M16.5 12A4.5 4.5 0 0 0 14 8v2.2l2.45 2.45c.03-.2.05-.42.05-.65zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12a9 9 0 0 0-7-8.8v2.1A7 7 0 0 1 19 12zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.1a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z",
  gear: "M19.4 13c.04-.33.06-.66.06-1s-.02-.67-.06-1l2.1-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.3 7.3 0 0 0-1.73-1l-.38-2.65A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.49.42l-.38 2.65c-.63.26-1.2.6-1.73 1l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.49.49 0 0 0 .12.64L4.57 11c-.04.33-.07.66-.07 1s.03.67.07 1l-2.1 1.65a.5.5 0 0 0-.12.64l2 3.46c.12.22.38.3.6.22l2.49-1c.52.4 1.1.74 1.73 1l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.63-.26 1.2-.6 1.73-1l2.49 1c.23.08.48 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64L19.4 13zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z",
  fs: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
  fsExit: "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z",
  cc: "M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1z",
};
const COND: Record<Condition, string> = { A: "A · Plain subtitles", B: "B · Subtitles + tags", C: "C · Prosody typography" };

export default function VideoPlayer(p: {
  clip: Clip | null; err: string; condition: Condition; setCondition: (c: Condition) => void;
  intensity: number; setIntensity: (n: number) => void; on: boolean; setOn: (b: boolean) => void; study: boolean;
  onEvent?: (type: string, data?: Record<string, unknown>) => void;
}) {
  const { clip, condition, intensity, on } = p;
  const vref = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(true); // always start muted (sound-off viewing)
  const [fs, setFs] = useState(false);
  const [menu, setMenu] = useState(false);
  const [idle, setIdle] = useState(false);
  const [ccOn, setCcOnRaw] = useState(true);
  const emitRef = useRef(p.onEvent); emitRef.current = p.onEvent;
  const emit = (type: string, data?: Record<string, unknown>) => emitRef.current?.(type, { t: +(vref.current?.currentTime ?? 0).toFixed(2), ...data });
  const ccRef = useRef(true); ccRef.current = ccOn;
  const setCcOn = (fn: boolean | ((x: boolean) => boolean)) => { const v = typeof fn === "function" ? fn(ccRef.current) : fn; setCcOnRaw(v); emit("captions", { on: v }); };
  const intTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setIntensityLogged = (n: number) => { p.setIntensity(n); if (intTimer.current) clearTimeout(intTimer.current); intTimer.current = setTimeout(() => emit("intensity", { value: n }), 400); };
  // interaction logging from the media element itself
  useEffect(() => {
    const v = vref.current; if (!v) return;
    let last = 0, ended = false, from = 0;
    const tu = () => { if (!v.seeking && !v.paused) last = v.currentTime; };
    const onSeeking = () => { from = last; };
    const onPlay = () => { emit(ended ? "replay" : "play"); ended = false; };
    const onPause = () => { last = v.currentTime; if (!v.ended) emit("pause"); };
    const onSeeked = () => { const to = v.currentTime; if (Math.abs(to - from) > 0.3) emit(to < from ? "rewind" : "seek", { from: +from.toFixed(2), to: +to.toFixed(2) }); last = to; };
    const onEnded = () => { ended = true; emit("ended"); };
    v.addEventListener("timeupdate", tu); v.addEventListener("play", onPlay); v.addEventListener("pause", onPause); v.addEventListener("seeking", onSeeking); v.addEventListener("seeked", onSeeked); v.addEventListener("ended", onEnded);
    return () => { v.removeEventListener("timeupdate", tu); v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause); v.removeEventListener("seeking", onSeeking); v.removeEventListener("seeked", onSeeked); v.removeEventListener("ended", onEnded); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip]);
  const idleT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = useVideoTime(vref, clip);
  const cue = ccOn ? activeCue(clip, t) : null;
  const [capPx, setCapPx] = useState(24);
  const vtt = useMemo(() => (clip?.cues ? URL.createObjectURL(new Blob([toVtt(clip, condition)], { type: "text/vtt" })) : null), [clip, condition]);
  const k = on ? intensity / 100 : 0;

  // caption size is measured from the PLAYER box (not the viewport) and re-measured on resize + fullscreen changes
  useEffect(() => {
    const el = box.current; if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); setCapPx(Math.round(Math.max(15, Math.min(r.width * 0.034, r.height * 0.065, 76)))); };
    const onFs = () => {
      const fe = fsElement();
      setFs(fe === el); emit("fullscreen", { on: fe === el });
      // native fallback: if something fullscreened the bare <video>, show the VTT track instead
      const v = vref.current; const tr = v?.textTracks?.[0];
      if (tr) tr.mode = fe === v ? "showing" : "hidden";
      requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    document.addEventListener("fullscreenchange", onFs); document.addEventListener("webkitfullscreenchange", onFs);
    window.addEventListener("resize", measure);
    const v = vref.current;
    const iosOn = () => { const tr = v?.textTracks?.[0]; if (tr) tr.mode = "showing"; };
    const iosOff = () => { const tr = v?.textTracks?.[0]; if (tr) tr.mode = "hidden"; };
    v?.addEventListener("webkitbeginfullscreen", iosOn); v?.addEventListener("webkitendfullscreen", iosOff);
    return () => { ro.disconnect(); document.removeEventListener("fullscreenchange", onFs); document.removeEventListener("webkitfullscreenchange", onFs); window.removeEventListener("resize", measure);
      v?.removeEventListener("webkitbeginfullscreen", iosOn); v?.removeEventListener("webkitendfullscreen", iosOff); };
  }, [clip]);
  useEffect(() => { const tr = vref.current?.textTracks?.[0]; if (tr && fsElement() !== vref.current) tr.mode = "hidden"; }, [vtt]);
  useEffect(() => { setPlaying(false); setMenu(false); }, [clip]);

  const toggle = () => { const v = vref.current; if (!v) return; if (v.paused) v.play(); else v.pause(); };
  const toggleFs = () => { if (fsElement()) exitFs(); else if (box.current) requestFs(box.current); };
  const poke = () => { setIdle(false); if (idleT.current) clearTimeout(idleT.current); idleT.current = setTimeout(() => setIdle(true), 2500); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
      else if (e.key === "f") toggleFs();
      else if (e.key === "c") setCcOn((x) => !x);
      else if (e.key === "ArrowRight" && vref.current) vref.current.currentTime += 5;
      else if (e.key === "ArrowLeft" && vref.current) vref.current.currentTime -= 5;
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  const caption = useMemo(() => (cue ? <Caption cue={cue} condition={condition} k={k} t={t} /> : null), [cue, condition, k, t]);

  const showUI = !playing || !idle || menu;
  const pct = dur ? (t / dur) * 100 : 0;

  return (
    <div ref={box} onMouseMove={poke} onMouseLeave={() => playing && setIdle(true)}
      className={`player-box group relative overflow-hidden bg-black select-none ${fs ? "" : "rounded-[18px]"} ${showUI ? "" : "cursor-none"}`}>
      <div className={`cm-stage relative w-full ${fs ? "h-full" : "aspect-video"}`}>
        {clip ? (
          <video key={clip.video} ref={vref} muted autoPlay={!p.study} src={clip.videoUrl || "/api/media" + clip.video} playsInline disablePictureInPicture controls={false}
            className="absolute inset-0 z-0 h-full w-full object-contain" onClick={toggle} onDoubleClick={toggleFs}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); e.currentTarget.muted = p.study ? true : muted; }}>
            {vtt && <track key={vtt} kind="captions" srcLang="en" label="Captions" src={vtt} />}
          </video>
        ) : <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/60">{p.err || "Loading…"}</div>}

        {/* anchored caption line; sits above control bar, moves up a bit when bar is visible */}
        <div className="cm-overlay pointer-events-none absolute inset-x-0 flex justify-center px-[4%] transition-[bottom] duration-200" style={{ bottom: showUI ? `calc(${fs ? 64 : 56}px + 3%)` : "6%" }}>
          {caption && <div className="cap-text rounded-[8px] bg-black/75 px-[0.55em] py-[0.18em] text-center leading-[1.3] text-white" style={{ fontSize: capPx }}>{caption}</div>}
        </div>

        {/* control bar */}
        <div className={`cm-controls absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pt-10 pb-1 text-white transition-opacity duration-200 ${showUI ? "opacity-100" : "opacity-0"}`}>
          <div className="relative h-4 flex items-center group/s">
            <div className="absolute inset-x-0 h-[3px] rounded bg-white/30 group-hover/s:h-[5px] transition-all"><div className="h-full rounded bg-[#2997ff]" style={{ width: `${pct}%` }} /></div>
            <input type="range" min={0} max={dur || 0} step={0.01} value={Math.min(t, dur || 0)} aria-label="Seek"
              onChange={(e) => { if (vref.current) vref.current.currentTime = +e.target.value; }} className="yt-range absolute inset-x-0 w-full cursor-pointer opacity-0 group-hover/s:opacity-100 [&::-webkit-slider-thumb]:bg-[#2997ff] [&::-webkit-slider-thumb]:h-[13px] [&::-webkit-slider-thumb]:w-[13px]" />
          </div>
          <div className="flex h-11 items-center gap-1">
            <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="p-2"><Icon d={playing ? I.pause : I.play} className="h-7 w-7" /></button>
            <div className="group/v flex items-center">
              <button onClick={() => { if (p.study) return; if (vref.current) { vref.current.muted = !muted; setMuted(!muted); emit("mute", { on: !muted }); } }} aria-label={muted ? "Unmute" : "Mute"} title={p.study ? "Sound is off for this test" : undefined} className={`p-2 ${p.study ? "opacity-60 cursor-default" : ""}`}><Icon d={muted || vol === 0 ? I.mute : I.vol} /></button>
              {!p.study && <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : vol} aria-label="Volume"
                onChange={(e) => { const v = +e.target.value; setVol(v); setMuted(v === 0); if (vref.current) { vref.current.volume = v; vref.current.muted = v === 0; } }}
                className="yt-range w-0 opacity-0 group-hover/v:w-16 group-hover/v:opacity-100 transition-all duration-200 [&::-webkit-slider-runnable-track]:bg-white/40" />}
            </div>
            <span className="ml-2 text-[13px] tabular-nums">{fmt(t)} / {fmt(dur)}</span>
            <div className="flex-1" />
            {!p.study && <span className="mr-1 hidden rounded bg-white/15 px-1.5 py-0.5 text-[11px] sm:inline">{condition}</span>}
            <button onClick={() => setCcOn(!ccOn)} aria-label="Captions" aria-pressed={ccOn} className="relative p-2">
              <Icon d={I.cc} /><span className={`absolute bottom-1 left-2 right-2 h-[3px] rounded bg-[#2997ff] ${ccOn ? "" : "hidden"}`} />
            </button>
            {!p.study && (
              <button onClick={() => setMenu(!menu)} aria-label="Settings" aria-expanded={menu} className="p-2"><Icon d={I.gear} className={`h-6 w-6 transition-transform ${menu ? "rotate-45" : ""}`} /></button>
            )}
            <button onClick={toggleFs} aria-label="Fullscreen" className="p-2"><Icon d={fs ? I.fsExit : I.fs} className="h-7 w-7" /></button>
          </div>
        </div>

        {menu && !p.study && (
          <div className="cm-menu absolute bottom-16 right-3 w-72 rounded-[18px] bg-[rgba(39,39,41,.86)] py-2 text-[14px] text-white backdrop-blur-xl backdrop-saturate-[1.8]">
            <div className="px-4 pb-1 pt-1 text-[11px] uppercase tracking-wider text-white/50">Caption condition</div>
            {(["A", "B", "C"] as Condition[]).map((c) => (
              <button key={c} onClick={() => { p.setCondition(c); emit("condition", { value: c }); }} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-white/10">
                <span className="w-4">{condition === c ? "✓" : ""}</span>{COND[c]}
              </button>
            ))}
            <div className={`mt-1 border-t border-white/10 px-4 pt-3 ${condition !== "C" ? "opacity-40 pointer-events-none" : ""}`}>
              <div className="flex items-center justify-between"><span>Expressive styling</span>
                <button role="switch" aria-checked={on} onClick={() => { p.setOn(!on); emit("styling", { on: !on }); }} className={`relative h-5 w-9 rounded-full ${on ? "bg-[#2997ff]" : "bg-white/30"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} /></button>
              </div>
              <div className="mt-3 flex items-center justify-between"><span>Intensity</span><span className="tabular-nums text-white/70">{intensity}%</span></div>
              <input type="range" min={0} max={100} value={intensity} onChange={(e) => setIntensityLogged(+e.target.value)} disabled={!on} aria-label="Intensity" className="mb-2 mt-1 w-full accent-[#2997ff]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
