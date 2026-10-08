import "server-only";
import type { Commit } from "./commits.ts";

const API = "https://api.github.com";
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN?.trim());
}

async function gh(path: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN!.trim()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dropx-it-support",
    },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
}

type ApiCommit = {
  sha: string;
  commit: { message: string; author?: { name?: string; email?: string; date?: string } };
  author?: { login?: string } | null;
  parents?: unknown[];
};

const MAX_PAGES = 10;

/** Commits on the default branch inside the window, newest first. Errors are returned, never thrown, and never include the token. */
export async function listCommits(repo: string, since: string, until: string): Promise<{ commits: Commit[]; truncated: boolean; error?: string }> {
  if (!REPO.test(repo)) return { commits: [], truncated: false, error: "invalid repository name" };
  const commits: Commit[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await gh(`/repos/${repo}/commits?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&per_page=100&page=${page}`);
      if (res.status === 404) return { commits, truncated: false, error: "not found or no access" };
      if (res.status === 401) return { commits, truncated: false, error: "token rejected" };
      if (res.status === 403 || res.status === 429) return { commits, truncated: false, error: "rate limited or forbidden" };
      if (!res.ok) return { commits, truncated: false, error: `GitHub returned ${res.status}` };
      const items = (await res.json()) as ApiCommit[];
      for (const it of items) {
        commits.push({
          repo, sha: it.sha, message: it.commit.message, date: it.commit.author?.date ?? since,
          authorLogin: it.author?.login ?? null, authorName: it.commit.author?.name ?? "", authorEmail: it.commit.author?.email ?? "",
          parents: it.parents?.length ?? 1, files: null,
        });
      }
      if (items.length < 100) return { commits, truncated: false };
    }
    return { commits, truncated: true };
  } catch {
    return { commits, truncated: false, error: "request failed" };
  }
}

/** Changed file paths of one commit (needed only to pick a portal when a repo is shared). */
export async function commitFiles(repo: string, sha: string): Promise<string[] | null> {
  if (!REPO.test(repo) || !/^[0-9a-f]{7,64}$/i.test(sha)) return null;
  try {
    const res = await gh(`/repos/${repo}/commits/${sha}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { files?: { filename: string }[] };
    return (data.files ?? []).map((f) => f.filename);
  } catch {
    return null;
  }
}
