import { googleAccessToken, googleCredentialsConfigured, type AuthDeps, type Env } from "./google-auth.ts";
import { isValidAddress } from "./mail/message.ts";
import { GoogleApiError } from "./google-calendar.ts";

export const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"];

export function sheetsStatus(env: Env = process.env): { configured: true; owner: string } | { configured: false; missing: string[] } {
  const owner = (env.GOOGLE_SHEETS_OWNER ?? env.GOOGLE_CALENDAR_ORGANIZER)?.trim();
  const missing: string[] = [];
  if (!googleCredentialsConfigured(env)) missing.push("GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON (or the GCP_* federation variables)");
  if (!owner) missing.push("GOOGLE_SHEETS_OWNER (or GOOGLE_CALENDAR_ORGANIZER)");
  return missing.length || !owner ? { configured: false, missing } : { configured: true, owner };
}

export type SheetCell = string | number | null | undefined;
const MAX_CELLS = 400_000;

async function api(deps: AuthDeps, owner: string, method: string, url: string, body?: unknown) {
  const token = await googleAccessToken(SHEETS_SCOPES, owner, deps);
  const res = await (deps.fetchFn ?? fetch)(url, {
    method, cache: "no-store", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok) throw new GoogleApiError(data.error?.message ?? `Google returned ${res.status}`, res.status);
  return data;
}

/**
 * Creates a new spreadsheet owned by the organiser mailbox and shares it with the person who asked.
 * Values are written as RAW text, so nothing in a ticket can run as a formula.
 */
export async function createSheetExport(owner: string, input: { title: string; tab: string; header: string[]; rows: SheetCell[][]; shareWith: string }, deps: AuthDeps = {}) {
  if (!isValidAddress(input.shareWith)) throw new GoogleApiError("Invalid recipient", 400);
  if ((input.rows.length + 1) * input.header.length > MAX_CELLS) throw new GoogleApiError("Too many rows for one sheet", 400);
  const tab = input.tab.replace(/[^\w ]/g, "").slice(0, 40) || "Export";
  const created = await api(deps, owner, "POST", "https://sheets.googleapis.com/v4/spreadsheets", {
    properties: { title: input.title.slice(0, 120) }, sheets: [{ properties: { title: tab } }],
  });
  const id = String(created.spreadsheetId ?? "");
  if (!id) throw new GoogleApiError("Google did not create the sheet", 502);
  const values = [input.header, ...input.rows].map((r) => r.map((c) => (c === null || c === undefined ? "" : c)));
  await api(deps, owner, "PUT", `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`, { range: `${tab}!A1`, majorDimension: "ROWS", values });
  await api(deps, owner, "POST", `https://www.googleapis.com/drive/v3/files/${id}/permissions?sendNotificationEmail=false`, { type: "user", role: "writer", emailAddress: input.shareWith });
  return { id, url: String(created.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${id}/edit`) };
}
