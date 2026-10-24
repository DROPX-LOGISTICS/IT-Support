import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { serviceClient } from "@/lib/supabase/admin";
import { syncKnownSystems } from "@/lib/system-registry";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.SETUP_SECRET)) return NextResponse.json({ ok: false }, { status: 401 });
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, reason: "database unavailable" }, { status: 503 });
  try { return NextResponse.json({ ok: true, ...(await syncKnownSystems(db)) }); }
  catch { return NextResponse.json({ ok: false, reason: "sync failed" }, { status: 500 }); }
}
