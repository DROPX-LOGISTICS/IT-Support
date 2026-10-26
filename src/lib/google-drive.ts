import "server-only";
import { googleOAuthAccessToken } from "./integrations.ts";

export const ATTACHMENTS_FOLDER_ID = process.env.GOOGLE_ATTACHMENTS_FOLDER_ID?.trim() || "1xdRl8br3fR2Gl_DRMvGXPJs5-EZygOQu";
export const ATTACHMENTS_FOLDER_URL = `https://drive.google.com/drive/folders/${ATTACHMENTS_FOLDER_ID}`;

async function driveFetch(url: string, init: RequestInit = {}) {
  const token = await googleOAuthAccessToken();
  if (!token) throw new Error("Google Workspace is not connected");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("accept", "application/json");
  return fetch(url, { ...init, headers, cache: "no-store", signal: init.signal ?? AbortSignal.timeout(30_000) });
}

export async function uploadDriveAttachment(input: { ticketNumber: string; name: string; mime: string; bytes: Uint8Array }) {
  const boundary = `support-${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: `${input.ticketNumber} - ${input.name}`.slice(0, 180), parents: [ATTACHMENTS_FOLDER_ID] });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${input.mime}\r\n\r\n`, input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer, `\r\n--${boundary}--\r\n`,
  ]);
  const res = await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await res.json().catch(() => ({})) as { id?: string; webViewLink?: string; error?: { message?: string } };
  if (!res.ok || !data.id) throw new Error(data.error?.message || `Google Drive returned ${res.status}`);
  return { id: data.id, webViewLink: data.webViewLink || `${ATTACHMENTS_FOLDER_URL}` };
}

export async function downloadDriveAttachment(fileId: string) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function deleteDriveAttachment(fileId: string) {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, { method: "DELETE" });
  return res.ok || res.status === 404;
}
