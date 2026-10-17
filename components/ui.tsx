"use client";
import Link from "next/link";

/** Global nav: true black, 44px, 12px nav links (DESIGN.md global-nav). */
export function GlobalNav({ minimal = false, right }: { minimal?: boolean; right?: React.ReactNode }) {
  return (
    <nav className="sticky top-0 z-50 h-11 bg-black text-white">
      <div className="mx-auto flex h-full max-w-[1024px] items-center justify-between px-[22px]">
        {minimal ? <span className="t-fine font-semibold tracking-normal">Caption Mirror</span> : <Link href="/" className="t-fine font-semibold">Caption Mirror</Link>}
        {!minimal && (
          <div className="flex items-center gap-7 text-[12px] tracking-[-0.12px] text-white/80">
            <Link href="/" className="hover:text-white">Demo</Link>
            <Link href="/test/library" className="hover:text-white">Test library</Link>
            <Link href="/test" className="hover:text-white">Start test</Link>
            <Link href="/results" className="hover:text-white">Results</Link>
          </div>
        )}
        {right}
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="bg-parchment px-[22px] py-16 text-ink-80">
      <div className="mx-auto flex max-w-[980px] flex-wrap items-center justify-between gap-3 t-fine text-ink-48">
        <span>Caption Mirror · research prototype · Fontys ICT. Videos start muted for sound-off viewing.</span>
        <Link href="/login" className="hover:text-ink-80">Researcher access</Link>
      </div>
    </footer>
  );
}

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
export const pretty = (n: string) => { const s = n.replace(/^yt-[\w-]{11}-/, "").replace(/[-_]+/g, " ").trim() || n; return s.charAt(0).toUpperCase() + s.slice(1); };
