import { googleAccessToken, googleCredentialsConfigured, type AuthDeps, type Env } from "./google-auth.ts";
import { isValidAddress } from "./mail/message.ts";
import { GoogleApiError } from "./google-calendar.ts";
import { integrationSummaries, runtimeGoogleAccessToken } from "./integrations.ts";

// The attachment folder is an existing Drive folder owned by the connected
// mailbox. drive.file cannot reliably write to an existing folder created
// outside this OAuth app, so the OAuth grant must include full Drive access.
export const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"];

export function sheetsStatus(env: Env = process.env): { configured: true; owner: string } | { configured: false; missing: string[] } {
  const owner = (env.GOOGLE_SHEETS_OWNER ?? env.GOOGLE_CALENDAR_ORGANIZER)?.trim();
  const missing: string[] = [];
  if (!googleCredentialsConfigured(env)) missing.push("GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON (or the GCP_* federation variables)");
  if (!owner) missing.push("GOOGLE_SHEETS_OWNER (or GOOGLE_CALENDAR_ORGANIZER)");
  return missing.length || !owner ? { configured: false, missing } : { configured: true, owner };
}
export async function sheetsRuntimeStatus(): Promise<{ configured: true; owner: string } | { configured: false; missing: string[] }> {
  const env = sheetsStatus();
  if (env.configured) return env;
  const google = (await integrationSummaries()).google;
  const owner = google.account || process.env.GOOGLE_SHEETS_OWNER?.trim() || process.env.GOOGLE_CALENDAR_ORGANIZER?.trim();
  if (!google.connected || !owner) return { configured: false, missing: ["Connect Google Workspace in Master → Integrations"] };
  return { configured: true, owner };
}

export function sheetsErrorMessage(e: unknown): string {
  if (e instanceof GoogleApiError) {
    const detail = e.message.toLowerCase();
    if (/missing oauth scopes?:.*gmail\.send/.test(detail)) return "Google OAuth is missing Gmail send permission. Reconnect Google and approve Gmail access.";
    if (/missing oauth scopes?:.*calendar\.events/.test(detail)) return "Google OAuth is missing Calendar permission. Reconnect Google and approve Calendar access.";
    if (/missing oauth scopes?:.*drive(?:\.file)?/.test(detail)) return "Google OAuth is missing Drive permission. Reconnect Google and approve Drive access for attachments and exports.";
    if (/missing oauth scopes?:.*spreadsheets/.test(detail)) return "Google OAuth is missing Sheets permission. Reconnect Google and approve Sheets access for exports.";
    if (/insufficient authentication scope|insufficient permission|missing.*(spreadsheet|drive).*scope/.test(detail)) return "The Google OAuth grant is missing Sheets or Drive permission. Use Reconnect Google, approve every requested permission, then test again.";
    if (/gmail/.test(detail) && (e.status === 401 || e.status === 403)) return "Gmail API or Gmail send permission is missing. Enable Gmail API, reconnect Google, and grant Gmail send access.";
    if (/service_disabled|has not been used in project|api.*disabled|accessnotconfigured/.test(detail)) return "Enable both Google Sheets API and Google Drive API in the Google Cloud project used by this OAuth app, then reconnect Google.";
    if (/admin.*policy|domain.*policy|org.?policy|not allowed by administrator/.test(detail)) return "Your Google Workspace administrator is blocking Sheets or Drive access for this app. Ask the admin to allow the OAuth app, then reconnect Google.";
    if (e.status === 401 || e.status === 403) return "Google Sheets or Drive access is missing for the organiser mailbox. Reconnect Google Workspace under Master → Integrations and grant Sheets and Drive access.";
    if (e.status === 429) return "Google Sheets rate limit reached. Wait briefly and try again.";
    if (e.status === 400) return "Google did not accept the sheet export. Try exporting CSV instead.";
  }
  if (e instanceof Error && /credentials|delegated access|reconnect/i.test(e.message)) return "Google Workspace access is not ready. Reconnect Google Workspace under Master → Integrations.";
  return "Could not reach Google Sheets. Please try again.";
}

export type SheetCell = string | number | null | undefined;
const MAX_CELLS = 400_000;

async function api(deps: AuthDeps, owner: string, method: string, url: string, body?: unknown) {
  const token = deps.env ? await googleAccessToken(SHEETS_SCOPES, owner, deps) : await runtimeGoogleAccessToken(SHEETS_SCOPES, owner, deps);
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
