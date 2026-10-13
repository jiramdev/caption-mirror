"use client";
import { useState } from "react";
import { DELIVERIES } from "@/lib/types";

export const SCALES = [
  ["emotionClarity", "How clearly could you tell how things were said?", "Not at all", "Very clearly"],
  ["readability", "How easy were the captions to read?", "Very hard", "Very easy"],
  ["keepUp", "I could keep up with reading the captions.", "Strongly disagree", "Strongly agree"],
  ["comfort", "How comfortable were the captions on your eyes?", "Very uncomfortable", "Very comfortable"],
  ["distraction", "The text was tiring or distracting.", "Strongly disagree", "Strongly agree"],
] as const;
export type Answers = { emotionClarity: number; readability: number; keepUp: number; comfort: number; distraction: number; perceived: string; comment: string };

export function Scale({ q, lo, hi, value, set }: { q: string; lo: string; hi: string; value?: number; set: (n: number) => void }) {
  return (
    <fieldset>
      <legend className="t-body-strong mb-4">{q}</legend>
      <div className="grid max-w-[520px] grid-cols-7 gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button type="button" key={n} onClick={() => set(n)} aria-pressed={value === n}
            className={`chip !h-11 !justify-center !p-0 tabular-nums ${value === n ? "!bg-primary !text-white !border-primary" : ""}`}>{n}</button>
        ))}
      </div>
      <div className="t-fine mt-2 flex max-w-[520px] justify-between text-ink-48"><span>{lo}</span><span>{hi}</span></div>
    </fieldset>
  );
}
export const Field = ({ id, label, value, set, rows = 3, optional }: { id: string; label: string; value: string; set: (s: string) => void; rows?: number; optional?: boolean }) => (
  <div>
    <label className="t-body-strong mb-3 block" htmlFor={id}>{label} {optional && <span className="font-normal text-ink-48">Optional</span>}</label>
    <textarea id={id} value={value} onChange={(e) => set(e.target.value)} rows={rows}
      className="w-full rounded-[18px] border border-black/[0.08] bg-canvas px-5 py-3 text-[17px] outline-none focus:border-primary-focus" />
  </div>
);

export default function Questionnaire({ onSubmit, submitting }: { onSubmit: (a: Answers) => void; submitting?: boolean }) {
  const [v, setV] = useState<Record<string, number>>({});
  const [perceived, setPerceived] = useState("");
  const [comment, setComment] = useState("");
  const ready = SCALES.every(([k]) => v[k]) && perceived;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (ready) onSubmit({ ...(v as unknown as Answers), perceived, comment }); }} className="space-y-12">
      <fieldset>
        <legend className="t-tagline mb-2">How did the speaker sound?</legend>
        <p className="t-caption mb-5 text-ink-48">Choose the one that fits best.</p>
        <div className="flex flex-wrap gap-3">
          {DELIVERIES.map((d) => (
            <button type="button" key={d} onClick={() => setPerceived(d)} aria-pressed={perceived === d} className="chip capitalize">{d}</button>
          ))}
        </div>
      </fieldset>
      {SCALES.map(([key, q, lo, hi]) => (
        <fieldset key={key}>
          <legend className="t-body-strong mb-4">{q}</legend>
          <div className="grid max-w-[520px] grid-cols-7 gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button type="button" key={n} onClick={() => setV({ ...v, [key]: n })} aria-pressed={v[key] === n}
                className={`chip !h-11 !justify-center !p-0 tabular-nums ${v[key] === n ? "!bg-primary !text-white !border-primary" : ""}`}>{n}</button>
            ))}
          </div>
          <div className="t-fine mt-2 flex max-w-[520px] justify-between text-ink-48"><span>{lo}</span><span>{hi}</span></div>
        </fieldset>
      ))}
      <div>
        <label className="t-body-strong mb-3 block" htmlFor="cm-comment">Anything else you noticed? <span className="font-normal text-ink-48">Optional</span></label>
        <textarea id="cm-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
          className="w-full rounded-[18px] border border-black/[0.08] bg-canvas px-5 py-3 text-[17px] outline-none focus:border-primary-focus" />
      </div>
      <button disabled={!ready || submitting} className="btn-primary">{submitting ? "Saving…" : "Continue"}</button>
    </form>
  );
}
