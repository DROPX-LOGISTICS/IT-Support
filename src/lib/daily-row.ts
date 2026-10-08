export type DailyRowInput = {
  portalId: string; ticketNumber: string; workDone: string; hours: number | null;
  status: "In progress" | "Done" | "Blocked"; blocker: string; nextStep: string; targetDate: string | null;
};
export type DailyRowErrors = Partial<Record<keyof DailyRowInput, string>>;

const clean = (v: unknown) => String(v ?? "").replace(/\r\n/g, "\n").trim();

export function validateDailyRow(raw: Record<string, unknown>, publishing: boolean): { ok: true; value: DailyRowInput } | { ok: false; errors: DailyRowErrors } {
  const errors: DailyRowErrors = {};
  const portalId = clean(raw.portalId);
  const ticketNumber = clean(raw.ticketNumber).toUpperCase();
  const workDone = clean(raw.workDone);
  const hoursText = clean(raw.hours);
  const status = clean(raw.status) as DailyRowInput["status"];
  const blocker = clean(raw.blocker);
  const nextStep = clean(raw.nextStep);
  const targetText = clean(raw.targetDate);

  if (!/^[0-9a-f-]{36}$/i.test(portalId)) errors.portalId = "Choose a portal.";
  if (ticketNumber && !/^(BUG|FR|SUP)-0*\d{1,9}$/.test(ticketNumber)) errors.ticketNumber = "Use a ticket number like BUG-12, or leave it empty.";
  if (workDone.length > 5000) errors.workDone = "Keep it under 5000 characters.";
  if (publishing && !workDone) errors.workDone = "Write what was done before publishing.";
  let hours: number | null = null;
  if (hoursText) {
    hours = Number(hoursText);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) errors.hours = "Hours must be between 0 and 24.";
    else hours = Math.round(hours * 10) / 10;
  }
  if (!["In progress", "Done", "Blocked"].includes(status)) errors.status = "Choose a status.";
  if (publishing && status === "Blocked" && !blocker) errors.blocker = "Say what is blocking you.";
  if (blocker.length > 2000) errors.blocker = "Keep it under 2000 characters.";
  if (nextStep.length > 2000) errors.nextStep = "Keep it under 2000 characters.";
  let targetDate: string | null = null;
  if (targetText) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetText)) errors.targetDate = "Enter a valid date.";
    else targetDate = targetText;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { portalId, ticketNumber, workDone, hours, status, blocker, nextStep, targetDate } };
}
