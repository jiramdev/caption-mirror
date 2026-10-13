"use client";
import type { Condition, Cue, Word } from "@/lib/types";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
function lines(c: Cue): Word[][] { return c.br ? [c.words.slice(0, c.br), c.words.slice(c.br)] : [c.words]; }

/* ---------------- Condition B: plain text + styled bracket tags ---------------- */
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="cm-tag">{children}</span>;
}

/* ---------------- Condition C: expressive kinetic typography ----------------
 * Level per word = 65% phrase loudness + 35% the word's own loudness (dB re. clip baseline).
 *   whisper  (≈ -12 dB): 0.62em, weight 150, opacity .5, wide tracking
 *   normal   (   0 dB): 1em, weight 400
 *   loud     (  +6 dB): ~1.45em, weight 800
 *   shout    (  +9 dB+): ~1.75em, weight 1000 + scale-pop when the word is spoken
 * Emphasis words: +250 weight, ×1.15 size. Pauses: visible "…" gap. Rising end: final word lifted + tilted.
 * Fast phrases: condensed width axis + tight tracking. Slow: expanded width, wider tracking.
 * Karaoke: spoken words are full strength, upcoming words are dimmed. Intensity k (0–1) blends everything back to plain. */
function level(w: Word, c: Cue) {
  const db = 0.65 * c.level + 0.35 * w.relDb;
  return clamp(db >= 0 ? db / 9 : db / 12, -1, 1); // -1 whisper … 0 normal … +1 shout
}

function wordStyle(w: Word, c: Cue, k: number, spoken: boolean, active: boolean, isLast: boolean, rateN: number): React.CSSProperties {
  const L = level(w, c);
  const up = Math.max(0, L), dn = Math.max(0, -L);
  let size = 1 + up * 0.9 - dn * 0.25;           // 0.75 … 1.9
  let wght = 400 + up * 600 - dn * 150;          // 250 … 1000
  if (w.emph) { wght += 250; size *= 1.15; }
  const wdth = 100 - rateN * 22;                 // fast → 78 (condensed), slow → 122 (expanded)
  const track = dn * 0.14 - Math.max(0, rateN) * 0.02 + Math.max(0, -rateN) * 0.05;
  const opacity = 1 - dn * 0.38;                 // whisper stays readable (≥ .62)
  const rising = isLast && (w.rise >= 2.5 || (w.w.endsWith("?") && w.rise > 1));
  const tf = rising ? `translateY(${(-0.32 * k).toFixed(3)}em) rotate(${(-5 * k).toFixed(2)}deg)` : undefined;
  return {
    fontSize: `${lerp(1, size, k).toFixed(3)}em`,
    fontWeight: Math.round(clamp(lerp(400, wght, k), 100, 1000)),
    fontVariationSettings: `"wdth" ${lerp(100, wdth, k).toFixed(0)}`,
    letterSpacing: `${(track * k).toFixed(3)}em`,
    opacity: lerp(1, spoken ? opacity : Math.max(0.35, opacity * 0.5), k), // karaoke: upcoming words dimmed
    transform: tf,
    transformOrigin: "left bottom",
    animation: active && up > 0.75 && k > 0.4 ? "cm-pop 220ms cubic-bezier(.2,.9,.3,1.3)" : undefined,
  };
}

export default function Caption({ cue, condition, k, t }: { cue: Cue; condition: Condition; k: number; t: number }) {
  if (condition === "A" || (condition === "C" && k === 0)) {
    return <div className="cm-plain">{lines(cue).map((l, i) => <div key={i}>{l.map((w) => w.w).join(" ")}</div>)}</div>;
  }
  if (condition === "B") {
    return (
      <div className="cm-plain">
        {lines(cue).map((l, li) => (
          <div key={li}>
            {li === 0 && cue.tags.map((tg) => <Tag key={tg}>{tg}</Tag>)}
            {l.map((w, i) => (
              <span key={i}>{i > 0 || li > 0 ? " " : ""}{(i > 0 || li > 0) && w.pauseBefore >= 0.8 && <Tag>[pause]</Tag>}{w.w}</span>
            ))}
          </div>
        ))}
      </div>
    );
  }
  const rateN = clamp(Math.log2(cue.rate || 1) / 0.6, -1, 1); // -1 slow … +1 fast
  const all = lines(cue);
  const lastLine = all.length - 1;
  return (
    <div className="caption-flex">
      {all.map((l, li) => (
        <div key={li} className="cm-line">
          {l.map((w, i) => {
            const gap = (i > 0 || li > 0) && w.pauseBefore >= 0.3 ? clamp(w.pauseBefore, 0.3, 2) : 0;
            const spoken = t >= w.start - 0.02;
            const active = spoken && t < w.end + 0.05;
            const isLast = li === lastLine && i === l.length - 1;
            return (
              <span key={`${cue.start}-${li}-${i}`} className="inline-flex items-baseline">
                {i > 0 && (gap > 0
                  ? <span className="cm-gap" style={{ width: `${(0.3 + gap * 0.9 * k).toFixed(2)}em` }} aria-hidden>{gap >= 0.5 && k > 0.25 ? "…" : ""}</span>
                  : <span style={{ width: "0.28em" }} />)}
                <span className="pw" style={wordStyle(w, cue, k, spoken, active, isLast, rateN)}>{w.w}</span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
