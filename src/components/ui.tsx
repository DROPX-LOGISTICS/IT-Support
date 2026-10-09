import { AlertTriangle, LifeBuoy } from "lucide-react";
import type { Priority, Status } from "@/lib/tickets";
import { PRIORITY_LABEL } from "@/lib/tickets";

export function StatusBadge({ status }: { status: Status }) {
  const key = (status.startsWith("Done") ? "Done" : status).replace(/\s+/g, "-");
  const label = status.startsWith("Done") ? "Done · please confirm" : status;
  return <span className={`badge b-${key}`}>{label}</span>;
}

export function PriorityPill({ priority }: { priority: Priority }) {
  return <span className={`pill p-${priority}`} title={PRIORITY_LABEL[priority]}>{priority}</span>;
}

export function NotConfigured({ missing }: { missing: string[] }) {
  return (
    <div className="container">
      <div className="banner warn" role="status">
        <AlertTriangle size={18} aria-hidden />
        <div>
          <strong>Not configured yet.</strong> This site needs these environment variables before it can run:{" "}
          <code>{missing.join(", ")}</code>. See the README for how to set them.
        </div>
      </div>
    </div>
  );
}

export function BrandMark({ size = 16 }: { size?: number }) {
  return (
    <span className="brand-mark" aria-hidden>
      <LifeBuoy size={size} />
    </span>
  );
}

export function OverdueBadge({ hours }: { hours: number }) {
  const label = hours >= 48 ? `${Math.round(hours / 24)} d overdue` : `${Math.max(1, Math.round(hours))} h overdue`;
  return <span className="badge b-overdue" title="Past its response or fix target">{label}</span>;
}
