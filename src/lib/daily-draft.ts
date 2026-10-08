import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDrafts, extractTicketNumbers, istDayRange, needsFiles, planUpserts,
  type Commit, type Dev, type ExistingRow, type PortalInfo, type RepoRow, type TicketInfo,
} from "./commits.ts";
import { commitFiles, githubConfigured, listCommits } from "./github.ts";

export type DraftRun =
  | { configured: false }
  | {
      configured: true; date: string; repos: number; commits: number; created: number; updated: number;
      unmatched: number; noPortal: number; skippedMerges: number; truncated: boolean; errors: { repo: string; error: string }[];
    };

const MAX_DETAIL_CALLS = 200;

/**
 * Builds draft rows for one IST day. `db` is the service client for the scheduled job, or the
 * developer's own client for the button (then row-level security limits writes to their rows).
 */
export async function draftFromCommits(opts: { db: SupabaseClient; date: string; onlyDeveloperId?: string; recordUnmatched: boolean }): Promise<DraftRun> {
  if (!githubConfigured()) return { configured: false };
  const { db, date } = opts;
  const { since, until } = istDayRange(date);

  const [repoRes, devRes, portalRes] = await Promise.all([
    db.from("support_portal_repos").select("repo,portal_id,path_prefixes"),
    db.from("support_developers").select("id,github_logins,commit_author_names,commit_author_emails").eq("is_active", true),
    db.from("support_portals").select("id,sort_order"),
  ]);
  const repoRows: RepoRow[] = (repoRes.data ?? []).map((r: { repo: string; portal_id: string; path_prefixes: string[] }) => ({ repo: r.repo, portalId: r.portal_id, prefixes: r.path_prefixes ?? [] }));
  const developers: Dev[] = (devRes.data ?? []).map((d: { id: string; github_logins: string[]; commit_author_names: string[]; commit_author_emails: string[] }) => ({
    id: d.id, logins: d.github_logins ?? [], names: d.commit_author_names ?? [], emails: d.commit_author_emails ?? [],
  }));
  const portals: PortalInfo[] = (portalRes.data ?? []).map((p: { id: string; sort_order: number }) => ({ id: p.id, sortOrder: p.sort_order }));

  const repos = [...new Set(repoRows.map((r) => r.repo))];
  const all: Commit[] = [];
  const errors: { repo: string; error: string }[] = [];
  let truncated = false;
  for (const repo of repos) {
    const res = await listCommits(repo, since, until);
    if (res.error) errors.push({ repo, error: res.error });
    if (res.truncated) truncated = true;
    let detail = 0;
    for (const c of res.commits) {
      if (c.parents <= 1 && needsFiles(repoRows, repo) && detail++ < MAX_DETAIL_CALLS) c.files = await commitFiles(repo, c.sha);
      all.push(c);
    }
  }

  // Which ticket numbers exist, and which commits were already logged for this day.
  const numbers = [...new Set(all.flatMap((c) => extractTicketNumbers(c.message)))];
  const tickets = new Map<string, TicketInfo>();
  if (numbers.length) {
    const { data } = await db.from("support_tickets").select("id,number,status").in("number", numbers);
    for (const t of data ?? []) tickets.set(t.number, { id: t.id, status: t.status });
  }
  const { data: existingRaw } = await db
    .from("support_daily_updates")
    .select("id,developer_id,portal_id,ticket_id,state,source,work_done,commit_shas")
    .eq("update_date", date);
  const existing: ExistingRow[] = (existingRaw ?? []).map((e: { id: string; developer_id: string; portal_id: string; ticket_id: string | null; state: string; source: string; work_done: string; commit_shas: string[] }) => ({
    id: e.id, developerId: e.developer_id, portalId: e.portal_id, ticketId: e.ticket_id, state: e.state, source: e.source, workDone: e.work_done, shas: e.commit_shas ?? [],
  }));
  const alreadyLogged = new Map<string, Set<string>>();
  for (const e of existing) {
    const set = alreadyLogged.get(e.developerId) ?? new Set<string>();
    e.shas.forEach((s) => set.add(s));
    alreadyLogged.set(e.developerId, set);
  }

  const built = buildDrafts({ commits: all, developers, repoRows, portals, tickets, alreadyLogged });
  const drafts = opts.onlyDeveloperId ? built.rows.filter((r) => r.developerId === opts.onlyDeveloperId) : built.rows;
  const plan = planUpserts(drafts, existing);

  let created = 0;
  let updated = 0;
  for (const r of plan.inserts) {
    const { error } = await db.from("support_daily_updates").insert({
      update_date: date, developer_id: r.developerId, portal_id: r.portalId, ticket_id: r.ticketId,
      work_done: r.workDone, status: r.status, commit_shas: r.shas, state: "draft", source: "commits",
    });
    if (!error) created++; // a duplicate from a concurrent run is rejected by the unique index and ignored
  }
  for (const u of plan.updates) {
    const { error } = await db.from("support_daily_updates").update({ work_done: u.workDone, commit_shas: u.shas }).eq("id", u.id).eq("state", "draft");
    if (!error) updated++;
  }

  if (opts.recordUnmatched) {
    if (built.unmatched.length) {
      await db.from("support_unmatched_commits").upsert(
        built.unmatched.map((c) => ({
          repo: c.repo, sha: c.sha, commit_date: date, author_login: c.authorLogin, author_name: c.authorName.slice(0, 200),
          author_email: c.authorEmail.slice(0, 200), subject: c.message.split("\n")[0].slice(0, 300),
        })),
        { onConflict: "repo,sha", ignoreDuplicates: true },
      );
    }
    // Commits that match a developer now (after an admin mapped them) are no longer unmatched.
    const matched = all.filter((c) => !built.unmatched.includes(c));
    for (const repo of repos) {
      const shas = matched.filter((c) => c.repo === repo).map((c) => c.sha);
      if (shas.length) await db.from("support_unmatched_commits").delete().eq("repo", repo).in("sha", shas);
    }
  }

  return {
    configured: true, date, repos: repos.length, commits: all.length, created, updated, unmatched: built.unmatched.length,
    noPortal: built.noPortal.length, skippedMerges: built.skippedMerges, truncated, errors,
  };
}
