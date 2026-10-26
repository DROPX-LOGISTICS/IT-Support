import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { serviceClient } from "@/lib/supabase/admin";
import { userClient } from "@/lib/supabase/server";
import { downloadDriveAttachment } from "@/lib/google-drive";
import { canViewTicket } from "@/lib/access";

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
    .select("storage_path,file_name,mime_type,ticket_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!att) return new NextResponse("Not found", { status: 404 });
  const { data: ticket } = await supabase!.from("support_tickets").select("reporter_id,deleted_at").eq("id", att.ticket_id).maybeSingle<{ reporter_id: string | null; deleted_at: string | null }>();
  if (!ticket || !canViewTicket({ id: session.user.id, role: session.user.role, isActive: true }, { reporterId: ticket.reporter_id, deletedAt: ticket.deleted_at })) return new NextResponse("Not found", { status: 404 });
  let bytes: Uint8Array | null = null;
  if (att.storage_path.startsWith("drive:")) {
    bytes = await downloadDriveAttachment(att.storage_path.slice("drive:".length)).catch(() => null);
  } else {
    const admin = serviceClient();
    if (!admin) return new NextResponse("Not available", { status: 503 });
    const file = await admin.storage.from("support_attachments").download(att.storage_path);
    if (!file.error && file.data) bytes = new Uint8Array(await file.data.arrayBuffer());
  }
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  const safeName = att.file_name.replace(/[^\w.\- ]+/g, "_");
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new NextResponse(body, {
    headers: {
      "Content-Type": att.mime_type,
      "Content-Disposition": `${att.mime_type === "application/pdf" || att.mime_type.startsWith("image/") ? "inline" : "attachment"}; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
