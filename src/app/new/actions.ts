"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { MAX_FILES, sniffMime, storagePath, validateFiles } from "@/lib/attachments";
import { notifyRaised } from "@/lib/notifications";
import { requireUser } from "@/lib/session";
import { serviceClient } from "@/lib/supabase/admin";
import { userClient } from "@/lib/supabase/server";
import { validateTicketInput, type FieldErrors } from "@/lib/validation";

export type RaiseState = { ok: boolean; message: string; errors?: FieldErrors };

export async function raiseTicket(_prev: RaiseState, formData: FormData): Promise<RaiseState> {
  const session = await requireUser();
  if (session.state !== "ok") return { ok: false, message: "This site is not configured yet." };
  const supabase = userClient();
  if (!supabase) return { ok: false, message: "This site is not configured yet." };

  // Identity comes from the session; the form never supplies who the reporter is.
  const parsed = validateTicketInput({
    type: formData.get("type"), portal: formData.get("portal"), title: formData.get("title"),
    description: formData.get("description"), steps: formData.get("steps"), priority: formData.get("priority"),
    page: formData.get("page"), raisedByName: formData.get("raisedByName"), raisedByPhone: formData.get("raisedByPhone"),
  });
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const fileError = validateFiles(files.map((f) => ({ name: f.name, type: f.type, size: f.size })));
  if (!parsed.ok || fileError) {
    return {
      ok: false,
      message: "Please check the highlighted fields.",
      errors: { ...(parsed.ok ? {} : parsed.errors), ...(fileError ? { files: fileError } : {}) },
    };
  }
  const v = parsed.value;

  const { data, error } = await supabase.rpc("support_create_ticket", {
    p_type: v.type, p_portal_code: v.portal, p_title: v.title, p_description: v.description,
    p_steps: v.steps, p_priority: v.priority, p_page: v.page,
    p_raised_by_name: v.raisedByName, p_raised_by_phone: v.raisedByPhone,
  });
  const created = Array.isArray(data) ? data[0] : data;
  if (error || !created) {
    return { ok: false, message: error?.message?.includes("Unknown portal") ? "That portal is not available." : "We could not save your ticket. Please try again." };
  }

  let filesFailed = false;
  if (files.length) {
    // Service role use #2: storage upload only, after the ticket was created for this very person.
    const admin = serviceClient();
    if (!admin) filesFailed = true;
    else {
      for (const file of files.slice(0, MAX_FILES)) {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const mime = sniffMime(bytes);
          if (!mime) { filesFailed = true; continue; }
          const path = storagePath(created.id, randomUUID(), file.name);
          const up = await admin.storage.from("support_attachments").upload(path, bytes, { contentType: mime, upsert: false });
          if (up.error) { filesFailed = true; continue; }
          const rec = await supabase.rpc("support_add_attachment", {
            p_ticket: created.id, p_path: path, p_name: file.name.slice(0, 200), p_mime: mime, p_size: bytes.byteLength,
          });
          if (rec.error) { filesFailed = true; await admin.storage.from("support_attachments").remove([path]); }
        } catch {
          filesFailed = true;
        }
      }
    }
  }

  await notifyRaised(created.id);
  revalidatePath("/my-tickets");
  revalidatePath("/queue");
  redirect(`/my-tickets?raised=${encodeURIComponent(created.number)}${filesFailed ? "&files=failed" : ""}`);
}
