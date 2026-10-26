import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config.ts";
import { userClient } from "./supabase/server.ts";
import type { Role } from "./access.ts";

export type SessionUser = { authId: string; id: string; email: string; name: string; role: Role; isPreview?: boolean; previewViewerId?: string; previewViewerRole?: Role };
export type Session =
  | { state: "not_configured"; missing: string[] }
  | { state: "anonymous" }
  | { state: "ok"; user: SessionUser };

/** The caller always comes from the verified session, never from form data. */
export async function getSession(): Promise<Session> {
  const cfg = supabaseConfig();
  if (!cfg.configured) return { state: "not_configured", missing: cfg.missing };
  const supabase = userClient();
  if (!supabase) return { state: "anonymous" };
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { state: "anonymous" };
  const { data: row } = await supabase
    .from("support_users")
    .select("id,email,name,role,is_active")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!row || !row.is_active) return { state: "anonymous" };
  const base = { authId: data.user.id, id: row.id, email: row.email, name: row.name, role: row.role as Role };
  const previewId = cookies().get("support_preview_user")?.value;
  if (!previewId || row.role !== "admin" || previewId === row.id) return { state: "ok", user: base };
  const { data: target } = await supabase.from("support_users").select("id,email,name,role,is_active").eq("id", previewId).eq("is_active", true).maybeSingle();
  if (!target) return { state: "ok", user: base };
  return { state: "ok", user: { authId: data.user.id, id: target.id, email: target.email, name: target.name, role: target.role as Role, isPreview: true, previewViewerId: row.id, previewViewerRole: row.role as Role } };
}

export async function requireUser(): Promise<
  { state: "ok"; user: SessionUser } | { state: "not_configured"; missing: string[] }
> {
  const s = await getSession();
  if (s.state === "anonymous") redirect("/login");
  return s;
}
