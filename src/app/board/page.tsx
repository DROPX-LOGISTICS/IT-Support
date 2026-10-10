import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { FilterForm } from "@/components/filter-form";
import { Board, type BoardCard, type BoardColumn } from "@/components/board";
import { NotConfigured } from "@/components/ui";
import { canChangeTicket, isStaff } from "@/lib/access";
import { parseQueueFilters } from "@/lib/queue-filters";
import { applyQueueFilters } from "@/lib/queue-query";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { allowedNextStatuses } from "@/lib/status-flow";
import { loadSettings } from "@/lib/targets-server";
import { overdueInfo } from "@/lib/targets";
import { PRIORITIES, PRIORITY_LABEL, type Priority, type Status, type TicketType } from "@/lib/tickets";

export const dynamic = "force-dynamic";
const COLUMNS: { status: Status; label: string }[] = [
  { status: "New", label: "New" }, { status: "Viable check", label: "Viable check" }, { status: "In progress", label: "In progress" },
  { status: "Blocked", label: "Blocked" }, { status: "Reopened", label: "Reopened" },
  { status: "Done – awaiting confirmation", label: "Awaiting confirmation" }, { status: "Closed", label: "Closed (14 days)" }, { status: "Not viable", label: "Not viable (14 days)" },
];
type Row = { id: string; number: string; type: TicketType; title: string; priority: Priority; status: Status; assignee_id: string | null; created_at: string; first_response_at: string | null; confirmed_at: string | null; portal: { name: string } | null };
const SELECT = "id,number,type,title,priority,status,assignee_id,created_at,first_response_at,confirmed_at,portal:support_portals(name)";

export default async function BoardPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const session = await requireUser();
  if (session.state === "not_configured") return <NotConfigured missing={session.missing} />;
  const { user } = session;
  if (!isStaff(user.role)) redirect("/my-tickets");
  const supabase = userClient()!;
  const f = parseQueueFilters(searchParams);

  const [{ data: portals }, { data: devs }, settings] = await Promise.all([
    supabase.from("support_portals").select("id,code,name").order("sort_order").returns<{ id: string; code: string; name: string }[]>(),
    supabase.from("support_users").select("id,name").in("role", ["developer", "admin"]).eq("is_active", true).order("name").returns<{ id: string; name: string }[]>(),
    loadSettings(supabase),
  ]);
  const portalId = (portals ?? []).find((p) => p.code === f.portal)?.id;
  const ctx = { portalId, userId: user.id };
  const open = applyQueueFilters(supabase.from("support_tickets").select(SELECT), { ...f, status: "all", q: "" }, ctx).in("status", ["New", "Viable check", "In progress", "Blocked", "Reopened", "Done – awaiting confirmation"]).order("priority").order("created_at").limit(600);
  const recent = applyQueueFilters(supabase.from("support_tickets").select(SELECT), { ...f, status: "all", q: "" }, ctx).in("status", ["Closed", "Not viable"]).gte("updated_at", new Date(Date.now() - 14 * 86_400_000).toISOString()).order("updated_at", { ascending: false }).limit(100);
  const [{ data: a }, { data: b }] = (await Promise.all([open, recent])) as { data: Row[] | null }[];
  const now = new Date();
  const nameOf = (id: string | null) => (devs ?? []).find((d) => d.id === id)?.name ?? "";
  const cards: BoardCard[] = [...(a ?? []), ...(b ?? [])].map((t) => {
    const o = overdueInfo(t, settings.targets, now);
    return { id: t.id, number: t.number, title: t.title, priority: t.priority, status: t.status, portal: t.portal?.name ?? "", assignee: nameOf(t.assignee_id), overdueHours: o.overdue ? o.hoursOver : null, next: allowedNextStatuses(t.type, t.status) };
  });
  const columns: BoardColumn[] = COLUMNS.map((c) => ({ ...c, cards: cards.filter((x) => x.status === c.status) }));
  const canMove = canChangeTicket({ id: user.id, role: user.role, isActive: true });

  return (
    <AppShell user={user} width="wide">
      <div className="page-head">
        <div>
          <p className="eyebrow">Team</p>
          <h1>Board</h1>
          <p className="muted">{canMove ? "Drag a card to a highlighted column, or use “Move to…”. The same rules as the ticket page apply." : "Tickets by status. Managers can look but not move."}</p>
        </div>
        <span className="muted" role="status">{cards.length} ticket{cards.length === 1 ? "" : "s"}</span>
      </div>
      <FilterForm key={`${f.portal}|${f.assignee}|${f.priority}`} action="/board" className="filters" style={{ marginBottom: 16 }}>
        <div className="filter-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 240px))", alignItems: "center" }}>
          <select name="portal" defaultValue={f.portal} aria-label="Portal"><option value="">Any portal</option>{(portals ?? []).map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
          <select name="assignee" defaultValue={f.assignee} aria-label="Assignee"><option value="">Anyone</option><option value="me">Assigned to me</option><option value="none">Unassigned</option>{(devs ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <select name="priority" defaultValue={f.priority} aria-label="Priority"><option value="">Any priority</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p} · {PRIORITY_LABEL[p]}</option>)}</select>
          {(f.portal || f.assignee || f.priority) && <Link className="btn ghost sm" href="/board" style={{ justifySelf: "start" }}>Clear filters</Link>}
        </div>
      </FilterForm>
      <Board columns={columns} canMove={canMove} />
    </AppShell>
  );
}
