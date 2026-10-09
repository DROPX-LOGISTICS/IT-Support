const IST_MS = 330 * 60_000;

/** Accepts "meet.google.com/abc-defg-hij" with or without https and query text; returns the clean link or null. */
export function parseMeetLink(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== "https:" || u.hostname.toLowerCase() !== "meet.google.com") return null;
    return /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(u.pathname) ? `https://meet.google.com${u.pathname}` : null;
  } catch {
    return null;
  }
}

/** "2026-10-12T15:30" typed in IST (datetime-local) to a UTC ISO string; null if it is not a real date. */
export function istLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const utc = Date.UTC(y, mo - 1, d, h, mi) - IST_MS;
  const back = new Date(utc + IST_MS);
  const same = back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d && back.getUTCHours() === h && back.getUTCMinutes() === mi;
  return same ? new Date(utc).toISOString() : null;
}

/** UTC ISO to the "YYYY-MM-DDTHH:mm" form a datetime-local input shows, in IST. */
export function isoToIstLocal(iso: string): string {
  return new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 16);
}
