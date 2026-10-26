import { NextResponse } from "next/server";
import { canManageMaster } from "@/lib/access";
import { getSession } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const session = await getSession();
  const url = new URL(request.url);
  const response = NextResponse.redirect(new URL("/", request.url));
  if (session.state !== "ok") return NextResponse.redirect(new URL("/login", request.url));

  if (url.searchParams.get("exit") === "1") {
    if (!session.user.isPreview && !canManageMaster({ id: session.user.id, role: session.user.role, isActive: true })) return NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("support_preview_user");
    return response;
  }

  if (session.user.isPreview || !canManageMaster({ id: session.user.id, role: session.user.role, isActive: true })) return NextResponse.redirect(new URL("/my-tickets", request.url));
  const targetId = url.searchParams.get("user")?.trim() ?? "";
  if (!UUID.test(targetId)) return NextResponse.redirect(new URL("/master?tab=people&error=Choose%20a%20valid%20user", request.url));
  const db = userClient();
  const { data: target } = await db?.from("support_users").select("id").eq("id", targetId).eq("is_active", true).maybeSingle() ?? { data: null };
  if (!target) return NextResponse.redirect(new URL("/master?tab=people&error=User%20not%20found", request.url));
  response.cookies.set("support_preview_user", target.id, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 4 });
  return response;
}
