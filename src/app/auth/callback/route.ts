import { NextResponse, type NextRequest } from "next/server";
import { allowedDomain, appUrl } from "@/lib/config";
import { isAllowedEmail, parseAdminEmails, safeNext } from "@/lib/identity";
import { serviceClient } from "@/lib/supabase/admin";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const base = appUrl(request.nextUrl.origin);
  const to = (path: string) => NextResponse.redirect(`${base}${path}`);
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const supabase = userClient();
  if (!supabase) return to("/login?error=unconfigured");
  if (!code) return to("/login?error=failed");

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const user = data?.user;
  if (error || !user) return to("/login?error=failed");

  // Domain is checked here on the server, on the verified email, whatever the account picker showed.
  const verified = Boolean(user.email_confirmed_at) || user.user_metadata?.email_verified === true;
  if (!isAllowedEmail(user.email, allowedDomain(), verified)) {
    await supabase.auth.signOut();
    return to("/login?error=domain");
  }

  const meta = user.user_metadata ?? {};
  const name = String(meta.full_name ?? meta.name ?? "").slice(0, 100);
  const { data: row, error: regError } = await supabase.rpc("support_register_user", { p_name: name });
  if (regError || !row) {
    await supabase.auth.signOut();
    return to("/login?error=failed");
  }
  if (!row.is_active) {
    await supabase.auth.signOut();
    return to("/login?error=inactive");
  }

  // Service role use #1: bootstrap the first admin(s) listed in ADMIN_EMAILS.
  // Only the matching, already verified, company-domain email is promoted.
  if (row.role !== "admin" && parseAdminEmails(process.env.ADMIN_EMAILS).includes(String(row.email).toLowerCase())) {
    const admin = serviceClient();
    if (admin) await admin.from("support_users").update({ role: "admin" }).eq("id", row.id);
  }
  return to(next);
}
