import type { TicketType } from "./tickets.ts";

const PREFIX: Record<TicketType, string> = { bug: "BUG", feature: "FR", support: "SUP" };
const TYPE_BY_PREFIX: Record<string, TicketType> = { BUG: "bug", FR: "feature", SUP: "support" };

export function prefixFor(type: TicketType): string {
  return PREFIX[type];
}

export function formatTicketNumber(type: TicketType, n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error("Ticket sequence must be a positive integer");
  return `${PREFIX[type]}-${String(n).padStart(3, "0")}`;
}

/** Accepts any case and any zero padding: "bug-2", "FR-0007". Returns null if not a ticket number. */
export function parseTicketNumber(input: string): { type: TicketType; n: number } | null {
  const m = /^\s*(BUG|FR|SUP)-0*(\d{1,9})\s*$/i.exec(input);
  if (!m) return null;
  const n = Number(m[2]);
  if (n < 1) return null;
  return { type: TYPE_BY_PREFIX[m[1].toUpperCase()], n };
}

/** Highest imported sequence per type, so new numbering continues after it (phase 4 import). */
export function highestPerType(numbers: string[]): Record<TicketType, number> {
  const out: Record<TicketType, number> = { bug: 0, feature: 0, support: 0 };
  for (const raw of numbers) {
    const p = parseTicketNumber(raw);
    if (p && p.n > out[p.type]) out[p.type] = p.n;
  }
  return out;
}
