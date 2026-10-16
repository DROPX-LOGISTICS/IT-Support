import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="center-page">
      <div className="card empty">
        <div className="icon"><SearchX size={26} aria-hidden /></div>
        <h1 style={{ fontSize: 22 }}>We could not find that</h1>
        <p className="muted" style={{ margin: "6px 0 18px" }}>The page or ticket does not exist, or you do not have access to it. Staff can open only the tickets they raised.</p>
        <div className="actions" style={{ justifyContent: "center" }}>
          <Link className="btn" href="/">Go to home</Link>
          <Link className="btn ghost" href="/my-tickets">My tickets</Link>
        </div>
      </div>
    </main>
  );
}
