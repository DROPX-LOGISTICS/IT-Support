import { NextResponse, type NextRequest } from "next/server";
import { isStaff } from "@/lib/access";
import { ticketsCsv } from "@/lib/export-columns";
import { loadTicketExport } from "@/lib/export-data";
import { parseQueueFilters } from "@/lib/queue-filters";
import { getSession } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Staff only, and it runs as the person, so row-level security applies as well. Same filters as the queue screen.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (session.state !== "ok") return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!isStaff(session.user.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const f = parseQueueFilters(Object.fromEntries(request.nextUrl.searchParams));
  const rows = await loadTicketExport(userClient()!, f, session.user.id);
  if (!rows) return NextResponse.json({ error: "Could not export" }, { status: 500 });
  return new NextResponse(ticketsCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
