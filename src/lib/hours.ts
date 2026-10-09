/** "3.5 h" under two days, "4.2 days" above. */
export function fmtHours(h: number | null): string {
  if (h === null) return "No data";
  return h < 48 ? `${h} h` : `${Math.round((h / 24) * 10) / 10} days`;
}
