import { AlertTriangle } from "lucide-react";
import type { Priority, Status } from "@/lib/tickets";
import { PRIORITY_LABEL } from "@/lib/tickets";
import { initials } from "@/lib/format";

export function StatusBadge({ status }: { status: Status }) {
  const key = (status.startsWith("Done") ? "Done" : status).replace(/\s+/g, "-");
  const label = status.startsWith("Done") ? "Done · please confirm" : status;
  return <span className={`badge led b-${key}`}>{label}</span>;
}

export function PriorityPill({ priority }: { priority: Priority }) {
  return <span className={`pill p-${priority}`} title={PRIORITY_LABEL[priority]}>{priority}<span className="sr-only"> {PRIORITY_LABEL[priority]}</span></span>;
}

export function NotConfigured({ missing }: { missing: string[] }) {
  return (
    <main className="center-page">
      <div className="card" style={{ textAlign: "left" }}>
        <Logo />
        <div className="banner warn" role="status" style={{ margin: "18px 0 0" }}>
          <AlertTriangle size={18} aria-hidden />
          <div>
            <strong>Not configured yet.</strong> This site needs these environment variables before it can run:{" "}
            <code>{missing.join(", ")}</code>. See the README for how to set them.
          </div>
        </div>
      </div>
    </main>
  );
}

/** The DropX logo, the same file People and OpsPulse use. */
export function Logo() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="logo" src="/dropx-logo.png" alt="DropX" width={89} height={30} />;
}

export function Avatar({ name, small, neutral }: { name: string | null | undefined; small?: boolean; neutral?: boolean }) {
  return <span className={`avatar${small ? " sm" : ""}${neutral ? " neutral" : ""}`} aria-hidden>{initials(name)}</span>;
}

export function OverdueBadge({ hours }: { hours: number }) {
  const label = hours >= 48 ? `${Math.round(hours / 24)} d overdue` : `${Math.max(1, Math.round(hours))} h overdue`;
  return <span className="badge b-overdue" title="Past its response or fix target">{label}</span>;
}

const STEPS = ["Raised", "In progress", "Please confirm", "Closed"];
/** Where a ticket stands, in the four steps a reporter cares about. */
export function StatusSteps({ status }: { status: Status }) {
  if (status === "Not viable") {
    return <ol className="steps" aria-label="Progress"><li className="done">Raised</li><li className="stop" aria-current="step">Not viable</li></ol>;
  }
  const at = status === "Closed" ? 4 : status.startsWith("Done") ? 2 : status === "In progress" || status === "Blocked" ? 1 : 0;
  return (
    <ol className="steps" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} className={i < at ? "done" : i === at ? "now" : ""} aria-current={i === at ? "step" : undefined}>
          {i === 0 && status === "Reopened" ? "Reopened" : i === 1 && status === "Blocked" ? "Blocked" : i === 0 && status === "Viable check" ? "Being assessed" : s}
        </li>
      ))}
    </ol>
  );
}
