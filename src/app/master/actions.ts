"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageMaster } from "@/lib/access";
import { cleanSiteUrl, isPortalCode, isRepoName, parseList, parsePrefixes, slugify } from "@/lib/master-input";
import { validateSettingsInput } from "@/lib/targets";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// Every action re-checks the admin role on the server. The writes use the person's own session, so row-level security checks it again.
async function admin() {
  const s = await requireUser();
  const supabase = userClient();
  if (s.state !== "ok" || !supabase || !canManageMaster({ id: s.user.id, role: s.user.role, isActive: true })) redirect("/my-tickets");
  return { supabase, user: s.user };
}
function done(tab: string, msg: string, ok = true): never {
  revalidatePath("/master");
  redirect(`/master?tab=${tab}&${ok ? "saved" : "error"}=${encodeURIComponent(msg)}`);
}

export async function addPortal(fd: FormData) {
  const { supabase } = await admin();
  const name = str(fd, "name").slice(0, 60);
  const code = str(fd, "code") || slugify(name);
  const url = cleanSiteUrl(str(fd, "siteUrl"));
  if (!name || !isPortalCode(code)) done("portals", "Enter a name (and a code using letters, numbers and dashes).", false);
  if (!url.ok) done("portals", "The site address must start with https://", false);
  const { error } = await supabase.from("support_portals").insert({ name, code, site_url: url.ok ? url.value : null, sort_order: Number(str(fd, "sortOrder")) || 100 });
  done("portals", error ? "Could not add the portal. The name or code may already exist." : "Portal added.", !error);
}

export async function updatePortal(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, "id");
  const url = cleanSiteUrl(str(fd, "siteUrl"));
  const name = str(fd, "name").slice(0, 60);
  if (!UUID.test(id) || !name) done("portals", "Enter a name.", false);
  if (!url.ok) done("portals", "The site address must start with https://", false);
  const { error } = await supabase.from("support_portals").update({
    name, site_url: url.ok ? url.value : null, is_active: fd.get("active") === "on", sort_order: Number(str(fd, "sortOrder")) || 100,
  }).eq("id", id);
  done("portals", error ? "Could not save the portal." : "Portal saved.", !error);
}

export async function addRepo(fd: FormData) {
  const { supabase } = await admin();
  const portalId = str(fd, "portalId");
  const repo = str(fd, "repo");
  if (!UUID.test(portalId) || !isRepoName(repo)) done("repos", "Enter the repository as owner/name and choose a portal.", false);
  const { error } = await supabase.from("support_portal_repos").insert({ portal_id: portalId, repo, path_prefixes: parsePrefixes(str(fd, "prefixes")) });
  done("repos", error ? "Could not add the repository." : "Repository added.", !error);
}

export async function updateRepo(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, "id");
  const portalId = str(fd, "portalId");
  if (!UUID.test(id) || !UUID.test(portalId)) done("repos", "Choose a portal.", false);
  const { error } = await supabase.from("support_portal_repos").update({ portal_id: portalId, path_prefixes: parsePrefixes(str(fd, "prefixes")) }).eq("id", id);
  done("repos", error ? "Could not save the repository." : "Repository saved.", !error);
}

export async function deleteRepo(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, "id");
  if (!UUID.test(id)) done("repos", "Repository not found.", false);
  const { error } = await supabase.from("support_portal_repos").delete().eq("id", id);
  done("repos", error ? "Could not remove the repository." : "Repository removed.", !error);
}

function identities(fd: FormData) {
  return {
    github_logins: parseList(str(fd, "logins"), { lower: true }).map((l) => l.replace(/^@/, "")),
    commit_author_names: parseList(str(fd, "names")),
    commit_author_emails: parseList(str(fd, "emails"), { lower: true }),
  };
}

export async function addDeveloper(fd: FormData) {
  const { supabase } = await admin();
  const displayName = str(fd, "displayName").slice(0, 80);
  const userId = str(fd, "userId");
  if (!displayName) done("developers", "Enter the developer's name.", false);
  if (userId && !UUID.test(userId)) done("developers", "Choose a valid person.", false);
  const { error } = await supabase.from("support_developers").insert({ display_name: displayName, user_id: userId || null, ...identities(fd) });
  done("developers", error ? "Could not add the developer." : "Developer added.", !error);
}

export async function updateDeveloper(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, "id");
  const userId = str(fd, "userId");
  const displayName = str(fd, "displayName").slice(0, 80);
  if (!UUID.test(id) || !displayName || (userId && !UUID.test(userId))) done("developers", "Check the name and the linked person.", false);
  const { error } = await supabase.from("support_developers").update({
    display_name: displayName, user_id: userId || null, is_active: fd.get("active") === "on", ...identities(fd),
  }).eq("id", id);
  done("developers", error ? "Could not save the developer." : "Developer saved.", !error);
}

export async function setUserAccess(fd: FormData) {
  const { supabase, user } = await admin();
  const id = str(fd, "id");
  const role = str(fd, "role");
  if (!UUID.test(id) || !["reporter", "developer", "manager", "admin"].includes(role)) done("people", "Choose a role.", false);
  // Nobody can lock themselves out by changing their own role or switching themselves off.
  if (id === user.id) done("people", "You cannot change your own access. Ask another admin.", false);
  const { error } = await supabase.from("support_users").update({ role, is_active: fd.get("active") === "on" }).eq("id", id);
  done("people", error ? "Could not save access." : "Access saved.", !error);
}

export async function mapUnmatched(fd: FormData) {
  const { supabase } = await admin();
  const commitId = str(fd, "commitId");
  const devId = str(fd, "developerId");
  if (!UUID.test(commitId) || !UUID.test(devId)) done("unmatched", "Choose a developer.", false);
  const { data: c } = await supabase.from("support_unmatched_commits").select("author_login,author_email,author_name").eq("id", commitId).maybeSingle();
  const { data: d } = await supabase.from("support_developers").select("github_logins,commit_author_emails,commit_author_names").eq("id", devId).maybeSingle();
  if (!c || !d) done("unmatched", "Not found.", false);
  // The most specific identity is added: login, else email, else name. The admin chose the developer; nothing is guessed.
  const patch = { ...d! };
  if (c!.author_login) patch.github_logins = [...new Set([...(d!.github_logins ?? []), c!.author_login.toLowerCase()])];
  else if (c!.author_email) patch.commit_author_emails = [...new Set([...(d!.commit_author_emails ?? []), c!.author_email.toLowerCase()])];
  else if (c!.author_name) patch.commit_author_names = [...new Set([...(d!.commit_author_names ?? []), c!.author_name])];
  const { error } = await supabase.from("support_developers").update(patch).eq("id", devId);
  if (!error) await supabase.from("support_unmatched_commits").delete().eq("id", commitId);
  done("unmatched", error ? "Could not map the commit." : "Mapped. Press “Draft from commits” on the Daily updates page for that date to include it.", !error);
}

export async function dismissUnmatched(fd: FormData) {
  const { supabase } = await admin();
  const id = str(fd, "commitId");
  if (!UUID.test(id)) done("unmatched", "Not found.", false);
  const { error } = await supabase.from("support_unmatched_commits").delete().eq("id", id);
  done("unmatched", error ? "Could not dismiss it." : "Dismissed.", !error);
}

export async function updateSettings(fd: FormData) {
  const { supabase } = await admin();
  const v = validateSettingsInput(Object.fromEntries([...fd.entries()].map(([k, x]) => [k, String(x)])));
  if (!v.ok) done("settings", v.error, false);
  const { error } = await supabase.from("support_settings").update({
    response_hours: v.ok ? v.value.response_hours : undefined, fix_hours: v.ok ? v.value.fix_hours : undefined,
    reminder_days: v.ok ? v.value.reminder_days : undefined, auto_close_days: v.ok ? v.value.auto_close_days : undefined,
    notify: v.ok ? v.value.notify : undefined,
  }).eq("singleton", true);
  done("settings", error ? "Could not save the settings." : "Settings saved.", !error);
}
