import { NextResponse, type NextRequest } from "next/server";
import { isStaff } from "@/lib/access";
import { isDateString, previousIstDate } from "@/lib/commits";
import { dailyCsv, type DailyExportRow } from "@/lib/export-columns";
import { getSession } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const LIMIT = 10000;
const DAY = 86_400_000;

type Row = { update_date: string; work_done: string; hours: number | null; status: string; blocker: string | null; next_step: string | null; target_date: string | null; portal: { name: string } | null; ticket: { number: string } | null; developer: { display_name: string } | null };

// Published updates only, for a date range (default: the last 30 days, at most a year). Staff only.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (session.state !== "ok") return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!isStaff(session.user.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const sp = request.nextUrl.searchParams;
  const to = sp.get("to") && isDateString(sp.get("to")!) ? sp.get("to")! : previousIstDate(new Date());
  let from = sp.get("from") && isDateString(sp.get("from")!) ? sp.get("from")! : new Date(new Date(`${to}T00:00:00Z`).getTime() - 29 * DAY).toISOString().slice(0, 10);
  if (from > to) from = to;
  if (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime() > 366 * DAY) return NextResponse.json({ error: "Choose a range of at most one year" }, { status: 400 });
  const dev = sp.get("dev") ?? "";

  const supabase = userClient()!;
  let q = supabase
    .from("support_daily_updates")
    .select("update_date,work_done,hours,status,blocker,next_step,target_date,portal:support_portals(name),ticket:support_tickets(number),developer:support_developers(display_name)")
    .eq("state", "published").gte("update_date", from).lte("update_date", to);
  if (/^[0-9a-f-]{36}$/i.test(dev)) q = q.eq("developer_id", dev);
  const { data, error } = await q.order("update_date").order("created_at").range(0, LIMIT - 1).returns<Row[]>();
  if (error) return NextResponse.json({ error: "Could not export" }, { status: 500 });
  const rows: DailyExportRow[] = (data ?? []).map((r) => ({
    update_date: r.update_date, developer: r.developer?.display_name ?? "", portal: r.portal?.name ?? "", ticket: r.ticket?.number ?? null,
    work_done: r.work_done, hours: r.hours, status: r.status, blocker: r.blocker, next_step: r.next_step, target_date: r.target_date,
  }));
  return new NextResponse(dailyCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="daily-updates-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
