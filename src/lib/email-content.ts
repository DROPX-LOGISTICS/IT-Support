import type { EmailContent } from "./mail/message.ts";

export type MailKind =
  | "raised" | "team_new" | "assigned" | "update" | "status" | "comment"
  | "confirmation" | "reminder" | "reopened" | "not_viable" | "meet";

export const MAIL_KINDS: MailKind[] = ["raised", "team_new", "assigned", "update", "status", "comment", "confirmation", "reminder", "reopened", "not_viable", "meet"];
export const isMailKind = (v: string): v is MailKind => (MAIL_KINDS as string[]).includes(v);

export type MailTicket = {
  id: string; number: string; title: string; type: string; priority: string; portal: string; reporterName: string;
  developerUpdate: string | null; viableReason: string | null; expectedDate: string | null; meetLink: string | null; meetAt: string | null; status: string;
};
export type MailExtra = { reason?: string; commentBody?: string; commentAuthor?: string; assigneeName?: string };

const TYPE_WORD: Record<string, string> = { bug: "bug", feature: "feature request", support: "support request" };
const when = (iso: string | null) => (iso ? `${new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST` : "");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Plain wording: the ticket number is always in the subject, there is a link to the ticket, and nothing technical
 * (no commit hashes) is ever added. User text is escaped later when the HTML part is rendered.
 */
export function buildEmail(kind: MailKind, t: MailTicket, link: string, x: MailExtra = {}): { subject: string; content: EmailContent } {
  const open = { label: "Open the ticket", url: link };
  const hello = `Hi ${t.reporterName},`;
  const num = `[${t.number}]`;
  switch (kind) {
    case "raised":
      return { subject: `${num} We received your ticket`, content: { heading: `We received your ticket ${t.number}`, paragraphs: [hello, `Thank you for telling us. We will look into "${t.title}" and keep you updated on the ticket page.`], link: { label: "Open your ticket", url: link } } };
    case "team_new":
      return { subject: `${num} New ${t.priority} ${TYPE_WORD[t.type] ?? "ticket"} in ${t.portal}: ${t.title}`, content: { heading: `${t.number} raised by ${t.reporterName}`, paragraphs: [`${t.priority} ${TYPE_WORD[t.type] ?? "ticket"} in ${t.portal}.`, t.title], link: open } };
    case "assigned":
      return { subject: `${num} Assigned to you: ${t.title}`, content: { heading: `${t.number} is assigned to you`, paragraphs: [`${t.priority} ${TYPE_WORD[t.type] ?? "ticket"} in ${t.portal}, raised by ${t.reporterName}.`, t.title], link: open } };
    case "update":
      return { subject: `${num} An update on your ticket`, content: { heading: `Update on ${t.number}`, paragraphs: [hello, `There is news on "${t.title}".`, ...(t.developerUpdate ? [`Our update: ${t.developerUpdate}`] : []), ...(t.expectedDate ? [`Expected by: ${new Date(`${t.expectedDate}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}`] : [])], link: open } };
    case "status":
      return { subject: `${num} Now ${t.status}`, content: { heading: `${t.number} is now ${t.status}`, paragraphs: [hello, `We moved "${t.title}" to ${t.status}.`, ...(x.reason ? [`Note: ${x.reason}`] : [])], link: open } };
    case "comment":
      return { subject: `${num} New comment on ${t.title}`, content: { heading: `New comment on ${t.number}`, paragraphs: [`${x.commentAuthor ?? "Someone"} wrote:`, clip(x.commentBody ?? "", 600)], link: open } };
    case "confirmation":
      return { subject: `${num} Please check if it works now`, content: { heading: `Does ${t.number} work now?`, paragraphs: [hello, `We have finished work on "${t.title}".`, ...(t.developerUpdate ? [`Our update: ${t.developerUpdate}`] : []), "Please open the ticket and tell us if it works. If it does not, tell us what you still see and we will pick it up again."], link: { label: "Check and confirm", url: link } } };
    case "reminder":
      return { subject: `${num} Reminder: does it work now?`, content: { heading: `Still waiting to hear about ${t.number}`, paragraphs: [hello, `We finished work on "${t.title}" a few days ago and are waiting for you to check it.`, "It takes a moment: open the ticket and tell us if it works. If we hear nothing, the ticket will be closed automatically."], link: { label: "Check and confirm", url: link } } };
    case "reopened":
      return { subject: `${num} Reopened: ${t.title}`, content: { heading: `${t.number} was reopened`, paragraphs: [`${t.reporterName} says it is still not working.`, ...(x.reason ? [`What they see: ${x.reason}`] : [])], link: open } };
    case "not_viable":
      return { subject: `${num} About your request`, content: { heading: `About ${t.number}`, paragraphs: [hello, `We looked at "${t.title}" and will not be able to do it.`, ...(t.viableReason ? [`Reason: ${t.viableReason}`] : []), "If something changes or you see it differently, add a comment on the ticket."], link: open } };
    case "meet":
      return { subject: `${num} A Meet session is scheduled`, content: { heading: `Meet session for ${t.number}`, paragraphs: [`A session about "${t.title}" is scheduled${t.meetAt ? ` for ${when(t.meetAt)}` : ""}.`, ...(t.meetLink ? [`Join: ${t.meetLink}`] : [])], link: open } };
  }
}

export type RecipientCtx = {
  reporterEmail: string; assigneeEmail: string | null; developers: string[]; managers: string[]; priority: string;
  actorEmail?: string | null; commenterIsReporter?: boolean;
};

/** Who gets each email. The person who did the action is never emailed about it (except the reporter's own acknowledgement). */
export function recipientsFor(kind: MailKind, c: RecipientCtx): string[] {
  const devsOrAssignee = c.assigneeEmail ? [c.assigneeEmail] : c.developers;
  let to: string[];
  switch (kind) {
    case "raised": to = [c.reporterEmail]; break;
    case "team_new": to = [...c.developers, ...(c.priority === "P0" ? c.managers : [])].filter((e) => e.toLowerCase() !== c.reporterEmail.toLowerCase()); break;
    case "assigned": to = c.assigneeEmail ? [c.assigneeEmail] : []; break;
    case "comment": to = c.commenterIsReporter ? devsOrAssignee : [c.reporterEmail]; break;
    case "reopened": to = devsOrAssignee; break;
    case "meet": to = [c.reporterEmail, ...(c.assigneeEmail ? [c.assigneeEmail] : [])]; break;
    default: to = [c.reporterEmail];
  }
  const actor = (kind === "raised" ? "" : c.actorEmail ?? "").toLowerCase();
  const seen = new Set<string>();
  return to.map((e) => e.trim()).filter((e) => {
    const k = e.toLowerCase();
    if (!e || k === actor || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
