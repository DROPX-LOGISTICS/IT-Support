"use client";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

/** A page failed to load. The details stay in the server log; the person gets a way forward. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="center-page">
      <div className="card empty" role="alert">
        <div className="icon"><TriangleAlert size={26} aria-hidden /></div>
        <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
        <p className="muted" style={{ margin: "6px 0 18px" }}>This page could not be loaded. Nothing you entered elsewhere was changed. Please try again.</p>
        <div className="actions" style={{ justifyContent: "center" }}>
          <button className="btn" type="button" onClick={reset}>Try again</button>
          <Link className="btn ghost" href="/">Go to home</Link>
        </div>
        {error.digest && <p className="hint" style={{ margin: "16px 0 0" }}>If it keeps happening, give the tech team this reference: <code>{error.digest}</code></p>}
      </div>
    </main>
  );
}
