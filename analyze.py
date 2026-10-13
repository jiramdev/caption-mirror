#!/usr/bin/env python3
"""Caption Mirror analysis: video -> public/<name>.json (cues + per-word prosody + phrase tags).

Usage: python analyze.py VIDEO [--name NAME] [--model small] [--language en]
Requires ffmpeg. Copies the video to public/videos/<name>.mp4 and writes public/thumbs/<name>.jpg.

All prosody values are RELATIVE TO THE CLIP'S OWN SPEECH BASELINE, so normal speech maps to ~0:
  relDb  = word loudness (dB) minus median loudness of voiced speech frames
  relSt  = word pitch (semitones) minus median speech pitch
  rate   = phrase syllables/sec divided by the clip's median phrase rate
"""
import argparse, json, os, re, shutil, subprocess, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SR, HOP = 16000, 160  # 10 ms frames
MAX_LINE, MAX_CUE_DUR, MIN_CUE_DUR, HOLD = 42, 6.0, 1.0, 0.6
PAUSE_SPLIT, PAUSE_TAG = 0.5, 1.2


def syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w: return 0
    n = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and n > 1 and not w.endswith(("le", "ee")): n -= 1
    return max(1, n)


def smooth(x, n=5):
    if len(x) < n: return x
    k = np.ones(n) / n
    return np.convolve(np.pad(x, (n // 2, n - 1 - n // 2), mode="edge"), k, mode="valid")


def segment(words):
    """Split word stream into caption cues (<=2 lines of ~42 chars), breaking at pauses & punctuation."""
    cues, cur = [], []
    def text(ws): return " ".join(w["w"] for w in ws)
    for i, w in enumerate(words):
        if cur:
            gap = w["start"] - cur[-1]["end"]
            prev = cur[-1]["w"]
            t = text(cur)
            dur = w["end"] - cur[0]["start"]
            brk = (gap >= PAUSE_SPLIT
                   or len(t) + 1 + len(w["w"]) > 2 * MAX_LINE
                   or dur > MAX_CUE_DUR
                   or (prev[-1:] in ".?!" and len(t) >= 12)
                   or (prev[-1:] in ",;:" and len(t) >= MAX_LINE and gap >= 0.15))
            if brk: cues.append(cur); cur = []
        cur.append(w)
    if cur: cues.append(cur)
    # merge tiny orphan cues (1 short word, no pause) into previous
    out = []
    for c in cues:
        if out and len(c) == 1 and len(c[0]["w"]) <= 4 and c[0]["start"] - out[-1][-1]["end"] < 0.3 \
           and len(text(out[-1])) + len(c[0]["w"]) < 2 * MAX_LINE:
            out[-1] += c
        else:
            out.append(c)
    return out


def line_break(ws):
    """index where the 2nd line starts (or None), balancing the two lines."""
    t = " ".join(w["w"] for w in ws)
    if len(t) <= MAX_LINE: return None
    best, bi = 1e9, None
    for i in range(1, len(ws)):
        a = len(" ".join(w["w"] for w in ws[:i])); b = len(t) - a - 1
        if a > MAX_LINE + 4 or b > MAX_LINE + 4: continue
        score = abs(a - b) - (8 if ws[i - 1]["w"][-1:] in ",.;:?!" else 0)
        if score < best: best, bi = score, i
    return bi


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video"); p.add_argument("--name"); p.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "small"))
    p.add_argument("--language", default=None)
    p.add_argument("--root", default=None, help="output root (default ./public; the home demo uses public/_tmp)")
    a = p.parse_args()
    name = a.name or os.path.splitext(os.path.basename(a.video))[0]
    name = "".join(c if c.isalnum() or c in "-_" else "-" for c in name)
    pub = os.path.abspath(a.root) if a.root else os.path.join(HERE, "public")
    for d in ("videos", "thumbs"): os.makedirs(os.path.join(pub, d), exist_ok=True)

    tmp = tempfile.mkdtemp()
    wav = os.path.join(tmp, "a.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", a.video, "-ac", "1", "-ar", str(SR), wav], check=True)

    print(f"[1/3] transcribing (faster-whisper {a.model})...", flush=True)
    import soundfile as sf
    from faster_whisper import WhisperModel
    audio, _ = sf.read(wav, dtype="float32")
    model = WhisperModel(a.model, device="cpu", compute_type="int8")
    segs, info = model.transcribe(audio, word_timestamps=True, language=a.language, beam_size=5,
                                  vad_filter=True, vad_parameters=dict(min_silence_duration_ms=300),
                                  condition_on_previous_text=False)
    words = []
    for s in segs:
        for w in s.words or []:
            t = w.word.strip()
            if t and w.end > w.start: words.append(dict(w=t, start=round(w.start, 3), end=round(w.end, 3), p=w.probability))

    print("[2/3] prosody (RMS loudness + Praat pitch)...", flush=True)
    import librosa
    y = audio
    rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=HOP)[0]
    db = smooth(librosa.amplitude_to_db(rms + 1e-10, ref=1.0), 5)  # 50 ms smoothing
    nF = len(db)
    try:  # Praat autocorrelation pitch: robust on noisy / old recordings, and fast
        import parselmouth
        pt = parselmouth.Sound(y.astype(np.float64), SR).to_pitch_ac(time_step=HOP / SR, pitch_floor=65, pitch_ceiling=600)
        pf = pt.selected_array["frequency"]; px = pt.xs()
        idx = np.clip(np.searchsorted(px, np.arange(nF) * HOP / SR), 0, len(pf) - 1)
        f0 = pf[idx].astype(float); f0[f0 <= 0] = np.nan
    except ImportError:
        f0, _, _ = librosa.pyin(y, fmin=65, fmax=600, sr=SR, frame_length=1024, hop_length=HOP)
        f0 = np.resize(f0, nF)
    voiced = ~np.isnan(f0)
    st = 12 * np.log2(f0 / 100.0)
    fr = lambda t: min(nF - 1, max(0, int(round(t * SR / HOP))))

    inword = np.zeros(nF, bool)
    for w in words: inword[fr(w["start"]):fr(w["end"]) + 1] = True
    sp_v = inword & voiced[:nF] if len(voiced) >= nF else inword
    db_ref = float(np.median(db[sp_v])) if sp_v.sum() > 20 else float(np.median(db[inword])) if inword.any() else -30.0
    stv = st[:nF][sp_v & ~np.isnan(st[:nF])]
    st_ref = float(np.median(stv)) if len(stv) > 20 else 0.0
    st_sd = float(np.std(stv)) if len(stv) > 20 else 3.0

    # snap word boundaries to actual sound: Whisper often stretches a word across a silence,
    # which hides real pauses. Shrink each word to the frames above (speech median - 22 dB).
    thr = db_ref - 22
    for w in words:
        i, j = fr(w["start"]), fr(w["end"])
        loud_idx = np.where(db[i:j + 1] > thr)[0]
        if len(loud_idx) and j - i > 4:
            ns, ne = (i + loud_idx[0]) * HOP / SR, (i + loud_idx[-1] + 1) * HOP / SR
            if ne - ns >= 0.08: w["start"], w["end"] = round(ns, 3), round(ne, 3)
    prev_end = None
    for w in words:
        i, j = fr(w["start"]), max(fr(w["end"]), fr(w["start"]) + 2)
        seg = db[i:j]; v = voiced[i:j]; ps = st[i:j]; ps = ps[~np.isnan(ps)]
        w["relDb"] = round(float(np.percentile(seg, 90)) - db_ref, 1)
        w["voicedRatio"] = round(float(np.mean(v)) if len(v) else 0.0, 2)
        w["relSt"] = round(float(np.median(ps)) - st_ref, 1) if len(ps) >= 3 else None
        w["slope"] = round(float(np.polyfit(np.arange(len(ps)) / 100.0, ps, 1)[0]), 1) if len(ps) >= 5 else 0.0  # st/s
        if len(ps) >= 6:
            q = max(2, len(ps) // 3); w["rise"] = round(float(np.mean(ps[-q:]) - np.mean(ps[:q])), 1)
        else: w["rise"] = 0.0
        w["pauseBefore"] = round(w["start"] - prev_end, 2) if prev_end is not None else 0.0
        w["syl"] = syllables(w["w"])
        prev_end = w["end"]

    # re-centre loudness so the typical WORD of this clip is 0 dB (word peaks sit above frame median)
    if words:
        off = float(np.median([w["relDb"] for w in words]))
        for w in words: w["relDb"] = round(w["relDb"] - off, 1)
        db_ref += off
    cues_w = segment(words)
    # phrase features
    cues = []
    for ws in cues_w:
        dur_speech = sum(w["end"] - w["start"] for w in ws)
        span = ws[-1]["end"] - ws[0]["start"] - sum(max(0.0, w["pauseBefore"] - 0.25) for w in ws[1:])
        wts = np.array([w["end"] - w["start"] for w in ws])
        rel = np.array([w["relDb"] for w in ws])
        level = float(np.average(rel, weights=wts))
        pitches = [w["relSt"] for w in ws if w["relSt"] is not None]
        cues.append(dict(ws=ws, level=level, voiced=float(np.average([w["voicedRatio"] for w in ws], weights=wts)),
                         pitch=float(np.median(pitches)) if pitches else 0.0,
                         sylrate=sum(w["syl"] for w in ws) / max(span, 0.3), nsyl=sum(w["syl"] for w in ws)))
    vr_ref = float(np.median([w["voicedRatio"] for w in words])) if words else 0.5
    rates = [c["sylrate"] for c in cues if c["nsyl"] >= 4]
    rate_ref = float(np.median(rates)) if rates else 4.5

    # emphasis: local peaks inside the phrase (only if phrase has >=3 words)
    for c in cues:
        ws = c["ws"]
        for w in ws: w["emph"] = False
        if len(ws) < 3: continue
        scores = []
        for w in ws:
            if len(re.sub(r"\W", "", w["w"])) < 3: scores.append(-9); continue
            dl = w["relDb"] - c["level"]
            dp = ((w["relSt"] if w["relSt"] is not None else c["pitch"]) - c["pitch"]) / max(st_sd, 1.5)
            scores.append(dl / 3.0 + dp)
        order = np.argsort(scores)[::-1]
        for k_, idx in enumerate(order[: max(1, len(ws) // 6)]):
            if scores[idx] >= 1.2: ws[idx]["emph"] = True

    # ---- tags with hysteresis on phrase level ----
    state, last_tag_t = "normal", -99
    for ci, c in enumerate(cues):
        ws, tags = c["ws"], []
        L = c["level"]
        # loudness state machine (enter thresholds / exit thresholds in dB rel. speech median)
        enter = {"shouting": 9, "loudly": 5.5, "quietly": -6, "whispering": -10}
        stay = {"shouting": 7, "loudly": 3.5, "quietly": -4, "whispering": -8}
        whisper_like = c["voiced"] < 0.5 * vr_ref
        if len(ws) < 2 or sum(w["end"] - w["start"] for w in ws) < 0.4:
            L = 0.0  # too short to judge level reliably
            c["level"] = 0.0
        new = state
        if L >= enter["shouting"]: new = "shouting"
        elif L >= enter["loudly"] and state != "shouting": new = "loudly"
        elif state == "shouting" and L >= stay["shouting"]: new = "shouting"
        elif state == "shouting" and L >= stay["loudly"]: new = "loudly"
        elif state == "loudly" and L >= stay["loudly"]: new = "loudly"
        elif L <= enter["whispering"] and whisper_like: new = "whispering"
        elif L <= enter["quietly"]: new = "quietly" if state != "whispering" else "whispering"
        elif state == "whispering" and L <= stay["whispering"]: new = "whispering"
        elif state in ("quietly", "whispering") and L <= stay["quietly"]: new = "quietly"
        else: new = "normal"
        gap = ws[0]["start"] - (cues[ci - 1]["ws"][-1]["end"] if ci else 0)
        if new != "normal":  # state persists -> keep labelling every phrase spoken in that state
            tags.append(f"[{new}]")
        state = new
        if ci > 0 and gap >= PAUSE_TAG + 0.8: tags.insert(0, "[pause]")
        # rate (only phrases with enough syllables)
        r = c["sylrate"] / rate_ref
        c["rate"] = round(r, 2)
        if c["nsyl"] >= 6 and r >= 1.45: tags.append("[fast]")
        elif c["nsyl"] >= 4 and r <= 0.6: tags.append("[slowly]")
        # ending: questioning rise / trailing off
        last = ws[-1]
        end_p = last["relSt"] if last["relSt"] is not None else c["pitch"]
        if (last["rise"] >= 3.5 and last["slope"] >= 12 and end_p - c["pitch"] >= 2.5) or (last["w"].endswith("?") and last["rise"] >= 2.5):
            tags.append("[questioning]")
        elif len(ws) >= 3 and last["relDb"] - L <= -7 and last["slope"] <= 0 and not last["w"].endswith(("!", "?")):
            tags.append("[trailing off]")
        c["tags"] = tags[:2]

    # timing: min duration + short hold, never overlapping the next cue
    out_cues = []
    for ci, c in enumerate(cues):
        ws = c["ws"]
        s, e = ws[0]["start"], ws[-1]["end"]
        nxt = cues[ci + 1]["ws"][0]["start"] if ci + 1 < len(cues) else e + 5
        show = min(max(e + HOLD, s + MIN_CUE_DUR), nxt - 0.04)
        for w in ws:  # inner pauses (first word of cue has pause outside)
            w.pop("p", None); w.pop("syl", None)
        ws[0]["pauseBefore"] = 0.0 if ws[0] is ws[0] else ws[0]["pauseBefore"]
        out_cues.append(dict(start=round(s, 3), end=round(e, 3), showUntil=round(max(show, e), 3), br=line_break(ws),
                             level=round(c["level"], 1), pitch=round(c["pitch"], 1), rate=c["rate"], tags=c["tags"], words=ws))

    print("[3/3] writing output...", flush=True)
    dst = os.path.join(pub, "videos", name + ".mp4")
    if os.path.abspath(a.video) != os.path.abspath(dst):
        if a.video.lower().endswith(".mp4"): shutil.copy(a.video, dst)
        else: subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", a.video, "-c:v", "libx264", "-c:a", "aac", dst], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", "1", "-i", dst, "-frames:v", "1", "-vf", "scale=320:-2",
                    os.path.join(pub, "thumbs", name + ".jpg")], check=False)
    out = dict(version=2, name=name, video=f"/videos/{name}.mp4", language=info.language, model=a.model,
               baseline=dict(db=round(db_ref, 1), pitchSt=round(st_ref, 1), pitchSd=round(st_sd, 1), sylRate=round(rate_ref, 2)),
               cues=out_cues)
    with open(os.path.join(pub, name + ".json"), "w") as f: json.dump(out, f, indent=1)
    shutil.rmtree(tmp, ignore_errors=True)
    print(f"done: {os.path.relpath(pub)}/{name}.json ({len(words)} words, {len(out_cues)} cues)")


if __name__ == "__main__":
    main()
