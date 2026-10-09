import { parseMeetLink } from "./meet.ts";
import { googleAccessToken, googleCredentialsConfigured, type AuthDeps, type Env } from "./google-auth.ts";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export function calendarStatus(env: Env = process.env): { configured: true; organizer: string } | { configured: false; missing: string[] } {
  const organizer = env.GOOGLE_CALENDAR_ORGANIZER?.trim();
  const missing: string[] = [];
  if (!googleCredentialsConfigured(env)) missing.push("GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON (or the GCP_* federation variables)");
  if (!organizer) missing.push("GOOGLE_CALENDAR_ORGANIZER");
  return missing.length || !organizer ? { configured: false, missing } : { configured: true, organizer };
}

export class GoogleApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.name = "GoogleApiError"; this.status = status; }
}
/** A short, safe message for the person; the raw Google text is never shown. */
export function calendarErrorMessage(e: unknown): string {
  if (e instanceof GoogleApiError) {
    if (e.status === 403 || e.status === 401) return "Calendar access is missing or not allowed for the organiser mailbox.";
    if (e.status === 404) return "The calendar event was not found.";
    if (e.status === 400) return "Google did not accept the date and time.";
  }
  if (e instanceof Error && /refused the delegated access|not configured/i.test(e.message)) return "Calendar access is not set up for this site yet.";
  return "Could not reach Google Calendar. Please try again.";
}

type CalDeps = AuthDeps & { sleep?: (ms: number) => Promise<void> };
const call = async (deps: CalDeps, organizer: string, method: string, url: string, body?: unknown) => {
  const token = await googleAccessToken([CALENDAR_SCOPE], organizer, deps);
  const res = await (deps.fetchFn ?? fetch)(url, {
    method, cache: "no-store", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 204 || (method === "DELETE" && res.status === 410)) return null;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!res.ok) throw new GoogleApiError(data.error?.message ?? `Google returned ${res.status}`, res.status);
  return data;
};

export type EventInput = { number: string; title: string; ticketUrl: string; guests: string[]; startIso: string; minutes: number };
export const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

export function buildEventBody(i: EventInput, requestId: string) {
  const start = new Date(i.startIso);
  const end = new Date(start.getTime() + i.minutes * 60_000);
  return {
    summary: clean(`${i.number}: ${i.title}`).slice(0, 200),
    description: `Ticket ${i.number}\n${/^https?:\/\//i.test(i.ticketUrl) ? i.ticketUrl : ""}`.trim(),
    start: { dateTime: start.toISOString(), timeZone: "Asia/Kolkata" },
    end: { dateTime: end.toISOString(), timeZone: "Asia/Kolkata" },
    attendees: i.guests.map((email) => ({ email })),
    conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
  };
}

const meetLinkOf = (ev: Record<string, unknown>): string | null => {
  const direct = typeof ev.hangoutLink === "string" ? parseMeetLink(ev.hangoutLink) : null;
  if (direct) return direct;
  const points = ((ev.conferenceData as { entryPoints?: { entryPointType?: string; uri?: string }[] } | undefined)?.entryPoints) ?? [];
  const video = points.find((p) => p.entryPointType === "video" && p.uri);
  return video?.uri ? parseMeetLink(video.uri) : null;
};

/** Creates the event with a Meet link and invites the guests. Returns the event id and the Meet link. */
export async function createMeetEvent(organizer: string, i: EventInput, requestId: string, deps: CalDeps = {}) {
  const url = `${BASE}?conferenceDataVersion=1&sendUpdates=all`;
  let ev = await call(deps, organizer, "POST", url, buildEventBody(i, requestId));
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  // The Meet room can be added a moment after creation.
  for (let n = 0; ev && !meetLinkOf(ev) && n < 3; n++) { await sleep(1000); ev = await call(deps, organizer, "GET", `${BASE}/${encodeURIComponent(String(ev.id))}`); }
  const link = ev ? meetLinkOf(ev) : null;
  if (!ev || !ev.id || !link) throw new GoogleApiError("Google did not return a Meet link", 502);
  return { eventId: String(ev.id), meetLink: link };
}

/** Moves the event; Google emails the guests the new time. */
export async function rescheduleEvent(organizer: string, eventId: string, startIso: string, minutes: number, deps: CalDeps = {}) {
  const start = new Date(startIso);
  await call(deps, organizer, "PATCH", `${BASE}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    start: { dateTime: start.toISOString(), timeZone: "Asia/Kolkata" },
    end: { dateTime: new Date(start.getTime() + minutes * 60_000).toISOString(), timeZone: "Asia/Kolkata" },
  });
}

/** Cancels the event and tells the guests. An event that is already gone counts as cancelled. */
export async function cancelEvent(organizer: string, eventId: string, deps: CalDeps = {}) {
  await call(deps, organizer, "DELETE", `${BASE}/${encodeURIComponent(eventId)}?sendUpdates=all`);
}
