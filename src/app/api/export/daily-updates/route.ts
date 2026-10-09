import { NextResponse, type NextRequest } from "next/server";
import { isStaff } from "@/lib/access";
import { isDateString, previousIstDate } from "@/lib/commits";
import { dailyCsv } from "@/lib/export-columns";
import { exportRange, loadDailyExport } from "@/lib/export-data";
import { getSession } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Published updates only, for a date range (default: the last 30 days, at most a year). Staff only.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (session.state !== "ok") return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!isStaff(session.user.role)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const sp = request.nextUrl.searchParams;
  const range = exportRange(isDateString, previousIstDate(new Date()), sp.get("from"), sp.get("to"));
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });
  const rows = await loadDailyExport(userClient()!, range.from, range.to, sp.get("dev") ?? "");
  if (!rows) return NextResponse.json({ error: "Could not export" }, { status: 500 });
  return new NextResponse(dailyCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="daily-updates-${range.from}-to-${range.to}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
