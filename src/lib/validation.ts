import { PRIORITIES, TICKET_TYPES, type Priority, type TicketType } from "./tickets.ts";

export type TicketInput = {
  type: TicketType;
  portal: string;
  title: string;
  description: string;
  steps: string;
  priority: Priority;
  page: string;
  raisedByName: string;
  raisedByPhone: string;
};

export type FieldErrors = Partial<Record<keyof TicketInput | "files", string>>;

const clean = (v: unknown) => String(v ?? "").replace(/\r\n/g, "\n").trim();
// Control characters are stripped from single-line text.
const oneLine = (v: unknown) => clean(v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ");

export function validateTicketInput(
  raw: Record<string, unknown>,
): { ok: true; value: TicketInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const type = clean(raw.type) as TicketType;
  const priority = clean(raw.priority) as Priority;
  const portal = clean(raw.portal);
  const title = oneLine(raw.title);
  const description = clean(raw.description);
  const steps = clean(raw.steps);
  const page = oneLine(raw.page).slice(0, 2000);
  const raisedByName = oneLine(raw.raisedByName);
  const raisedByPhone = oneLine(raw.raisedByPhone);

  if (!TICKET_TYPES.includes(type)) errors.type = "Choose what you are reporting.";
  if (!portal) errors.portal = "Choose the portal.";
  if (!title) errors.title = "Add a short summary.";
  else if (title.length > 150) errors.title = "Keep the summary under 150 characters.";
  if (!description) errors.description = "Please describe it so we can help.";
  else if (description.length > 5000) errors.description = "That is too long. Keep it under 5000 characters.";
  if (steps.length > 5000) errors.steps = "That is too long. Keep it under 5000 characters.";
  if (!PRIORITIES.includes(priority)) errors.priority = "Choose how urgent it is.";
  if (!raisedByName) errors.raisedByName = "Tell us your name.";
  else if (raisedByName.length > 100) errors.raisedByName = "Name is too long.";
  if (raisedByPhone && !/^[0-9+()\-. ]{7,20}$/.test(raisedByPhone)) errors.raisedByPhone = "Enter a valid phone number or leave it empty.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { type, portal, title, description, steps, priority, page, raisedByName, raisedByPhone } };
}
