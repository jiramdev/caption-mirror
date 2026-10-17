"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Footer } from "@/components/ui";

/** Admin sign-in for /test/library and /results. The password comes from ADMIN_PASSWORD (Vercel env). */
function Login() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/admin";
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [admin, setAdmin] = useState<boolean | null>(null);

  useEffect(() => { fetch("/api/login").then((r) => r.json()).then((d) => setAdmin(!!d.admin)).catch(() => setAdmin(false)); }, []);
  const go = () => { setAdmin(true); router.push(next); router.refresh(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
      if (!r.ok) setErr("Wrong password — try again.");
      else go();
    } catch { setErr("Couldn't reach the server."); } finally { setBusy(false); }
  };
  const signOut = async () => {
    await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ logout: true }) });
    setAdmin(false); router.refresh();
  };

  return (
    <>
      <section className="bg-parchment px-[22px] py-24">
        <div className="mx-auto w-full max-w-[420px] rounded-[18px] border border-hairline bg-white p-8">
          <h1 className="t-display-md">Researcher sign-in</h1>
          <p className="t-body mt-2 text-ink-48">The test library and results are protected. Participants taking the test don&apos;t need this.</p>
          {admin === true ? (
            <div className="mt-6 space-y-3">
              <p className="t-body text-ink">You&apos;re signed in.</p>
              <div className="flex gap-3">
                <button onClick={() => router.push(next)} className="btn-primary">Continue</button>
                <button onClick={signOut} className="btn-secondary">Sign out</button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6">
              <label className="t-caption block text-ink-80" htmlFor="pw">Password</label>
              <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password"
                className="mt-1.5 h-11 w-full rounded-[10px] border border-hairline px-3 text-[17px] outline-none focus:border-primary-focus" />
              {err && <p className="t-caption mt-2 text-red-600">{err}</p>}
              <button disabled={busy || !pw} className="btn-primary mt-4 w-full">Sign in</button>
            </form>
          )}
        </div>
      </section>
      <Footer />
    </>
  );
}

export default function Page() { return <Suspense fallback={null}><Login /></Suspense>; }
