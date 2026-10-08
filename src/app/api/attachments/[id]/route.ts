import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { serviceClient } from "@/lib/supabase/admin";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Served only after a ticket access check. The lookup uses the person's own session, so
// row-level security decides; the service role then reads the private file (service role use #5).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (session.state !== "ok") return new NextResponse("Not found", { status: 404 });
  if (!UUID.test(params.id)) return new NextResponse("Not found", { status: 404 });
  const supabase = userClient();
  const { data: att } = await supabase!
    .from("support_attachments")
    .select("storage_path,file_name,mime_type")
    .eq("id", params.id)
    .maybeSingle();
  if (!att) return new NextResponse("Not found", { status: 404 });
  const admin = serviceClient();
  if (!admin) return new NextResponse("Not available", { status: 503 });
  const file = await admin.storage.from("support_attachments").download(att.storage_path);
  if (file.error || !file.data) return new NextResponse("Not found", { status: 404 });
  const safeName = att.file_name.replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(file.data, {
    headers: {
      "Content-Type": att.mime_type,
      "Content-Disposition": `${att.mime_type === "application/pdf" || att.mime_type.startsWith("image/") ? "inline" : "attachment"}; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
