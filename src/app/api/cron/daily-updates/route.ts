import { NextResponse, type NextRequest } from "next/server";
import { isDateString, previousIstDate } from "@/lib/commits";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { draftFromCommits } from "@/lib/daily-draft";
import { serviceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called by the scheduler with "Authorization: Bearer <CRON_SECRET>". Service role use:
// there is no signed-in person, so the secret is the only access check.
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) return NextResponse.json({ ok: false, reason: "CRON_SECRET is not configured" }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, reason: "Supabase service role is not configured" }, { status: 503 });
  const asked = request.nextUrl.searchParams.get("date");
  const date = asked && isDateString(asked) ? asked : previousIstDate(new Date());
  const run = await draftFromCommits({ db, date, recordUnmatched: true });
  if (!run.configured) return NextResponse.json({ ok: false, reason: "GITHUB_TOKEN is not configured" });
  return NextResponse.json({ ok: true, ...run });
}
