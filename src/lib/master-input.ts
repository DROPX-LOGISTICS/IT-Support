import { normalizePrefix } from "./commits.ts";

/** Splits on new lines, commas or semicolons; trims, removes empties and duplicates (case-insensitive). */
export function parseList(value: string, opts: { lower?: boolean } = {}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value.split(/[\n,;]+/)) {
    const v = opts.lower ? raw.trim().toLowerCase() : raw.trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  }
  return out.slice(0, 50);
}

export const parsePrefixes = (value: string) => parseList(value).map(normalizePrefix).filter(Boolean);
export const isRepoName = (v: string) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v);
export const isPortalCode = (v: string) => /^[a-z0-9-]{2,40}$/.test(v);
export const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** Site address: empty is fine; otherwise it must be an http(s) address. */
export function cleanSiteUrl(v: string): { ok: true; value: string | null } | { ok: false } {
  const t = v.trim();
  if (!t) return { ok: true, value: null };
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false };
    return { ok: true, value: u.toString().replace(/\/$/, "") };
  } catch {
    return { ok: false };
  }
}
