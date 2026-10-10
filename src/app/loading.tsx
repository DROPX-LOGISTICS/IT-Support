/** Shown while a page's data loads: the outline of the page, so nothing jumps when it arrives. */
export default function Loading() {
  return (
    <div className="app" aria-busy="true">
      <aside className="side" aria-hidden>
        <div className="skeleton" style={{ height: 30, width: 150, margin: "2px 6px 24px" }} />
        <div className="skeleton" style={{ height: 40, margin: "0 2px 18px" }} />
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 30, margin: "0 2px 8px", opacity: 0.7 }} />)}
      </aside>
      <div className="main">
        <main className="container w-mid">
          <span className="sr-only" role="status">Loading…</span>
          <div className="skeleton" style={{ height: 30, width: "38%", marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 16, width: "56%", marginBottom: 26 }} />
          <div className="kpis" style={{ marginBottom: 18 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 96, borderRadius: 14 }} />)}</div>
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 64, marginBottom: 10, borderRadius: 14 }} />)}
        </main>
      </div>
    </div>
  );
}
