import { isValidAddress } from "./mail/message.ts";

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * A pre-filled Google Calendar "new event" link: title is the ticket number and title, guests are the
 * reporter and assignee, the description links to the ticket. The person picks the time and saves it in Calendar.
 */
export function buildCalendarUrl(i: { number: string; title: string; ticketUrl: string; guests: (string | null | undefined)[] }): string {
  const seen = new Set<string>();
  const guests: string[] = [];
  for (const g of i.guests) {
    const e = (g ?? "").trim();
    if (e && isValidAddress(e) && !seen.has(e.toLowerCase())) { seen.add(e.toLowerCase()); guests.push(e); }
  }
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", clean(`${i.number}: ${i.title}`).slice(0, 200));
  url.searchParams.set("details", `Ticket ${i.number}\n${/^https?:\/\//i.test(i.ticketUrl) ? i.ticketUrl : ""}`.trim());
  if (guests.length) url.searchParams.set("add", guests.join(","));
  return url.toString();
}
