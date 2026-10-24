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

export type RepoLocator = { repo: string; gitRef: string | null };

/** GitHub branch/tag names are passed to the API as data, but still reject malformed or dangerous ref syntax. */
export function cleanGitRef(value: string): { ok: true; value: string | null } | { ok: false } {
  const ref = value.trim().replace(/^refs\/heads\//, "");
  if (!ref) return { ok: true, value: null };
  const parts = ref.split("/");
  const forbidden = ["~", "^", ":", "?", "*", "[", "\\"];
  if (
    ref.length > 255 || /[\x00-\x20\x7f]/.test(ref) || ref === "@" || ref.includes("..") || ref.includes("@{") ||
    forbidden.some((character) => ref.includes(character)) || parts.some((part) => !part || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock"))
  ) return { ok: false };
  return { ok: true, value: ref };
}

/** Accepts owner/repo, owner/repo/tree/branch, or the equivalent github.com URL. */
export function parseRepoLocator(value: string): { ok: true; value: RepoLocator } | { ok: false } {
  let path = value.trim();
  if (!path) return { ok: false };
  try {
    if (/^https?:\/\//i.test(path)) {
      const url = new URL(path);
      if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) return { ok: false };
      path = url.pathname;
    } else {
      path = path.replace(/^github\.com\//i, "").split(/[?#]/, 1)[0];
    }
    const raw = path.replace(/^\/+|\/+$/g, "").split("/").map((part) => decodeURIComponent(part));
    if (raw.length < 2) return { ok: false };
    const owner = raw[0], name = raw[1].replace(/\.git$/i, "");
    const repo = `${owner}/${name}`;
    if (!isRepoName(repo)) return { ok: false };
    if (raw.length === 2) return { ok: true, value: { repo, gitRef: null } };
    if (raw[2] !== "tree" || raw.length < 4) return { ok: false };
    const gitRef = cleanGitRef(raw.slice(3).join("/"));
    return gitRef.ok && gitRef.value ? { ok: true, value: { repo, gitRef: gitRef.value } } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export function githubRepoUrl(repo: string, gitRef?: string | null): string {
  const base = `https://github.com/${repo}`;
  return gitRef ? `${base}/tree/${gitRef.split("/").map(encodeURIComponent).join("/")}` : base;
}
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
