import Link from "next/link";
import { fmtDate, timeAgo } from "@/lib/format";
import { TYPE_LABEL, type Priority, type Status, type TicketType } from "@/lib/tickets";
import { Avatar, OverdueBadge, PriorityPill, StatusBadge } from "./ui";

export type TicketRowData = {
  id: string; number: string; title: string; priority: Priority; status: Status; type: TicketType; createdAt: string;
  portal?: string | null; reporter?: string | null; assignee?: string | null; expectedDate?: string | null; overdueHours?: number | null;
};

/** One ticket as a compact line. `team` adds who raised it and who has it. */
export function TicketRow({ t, team = false, now }: { t: TicketRowData; team?: boolean; now: Date }) {
  const overdue = t.overdueHours !== null && t.overdueHours !== undefined;
  return (
    <Link href={`/tickets/${t.id}`} className={`row${overdue ? " over" : ""}`}>
      <PriorityPill priority={t.priority} />
      <span style={{ minWidth: 0 }}>
        <span className="row-title">{t.title}</span>
        <span className="row-sub">
          <span className="num">{t.number}</span>
          <span>{TYPE_LABEL[t.type]}</span>
          {t.portal && <span>{t.portal}</span>}
          {team && t.reporter && <span>By {t.reporter}</span>}
          {t.expectedDate && <span>Expected {fmtDate(t.expectedDate)}</span>}
        </span>
      </span>
      <span className="row-side">
        {overdue && <OverdueBadge hours={t.overdueHours!} />}
        <StatusBadge status={t.status} />
        {team && (t.assignee
          ? <span className="person" title={`Assigned to ${t.assignee}`}><Avatar name={t.assignee} small /><span className="sr-only">Assigned to {t.assignee}</span></span>
          : <span className="person" title="Unassigned"><Avatar name="?" small neutral /><span className="sr-only">Unassigned</span></span>)}
        <span className="row-age" title={`Raised ${fmtDate(t.createdAt)}`}>{timeAgo(t.createdAt, now)}</span>
      </span>
    </Link>
  );
}

export function TicketRows({ tickets, team, now }: { tickets: TicketRowData[]; team?: boolean; now: Date }) {
  return <div className="rows">{tickets.map((t) => <TicketRow key={t.id} t={t} team={team} now={now} />)}</div>;
}
