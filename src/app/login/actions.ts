"use server";
import { redirect } from "next/navigation";
import { allowedDomain, appUrl } from "@/lib/config";
import { safeNext } from "@/lib/identity";
import { userClient } from "@/lib/supabase/server";

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(String(formData.get("next") ?? "/"));
  const supabase = userClient();
  if (!supabase) redirect("/login?error=unconfigured");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      // "hd" only pre-selects the company accounts; the domain is enforced again on the server.
      queryParams: { hd: allowedDomain(), prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=failed");
  redirect(data.url);
}

export async function signOut() {
  const supabase = userClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
