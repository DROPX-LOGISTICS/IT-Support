import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const KNOWN_PORTALS = [
  { code: "people", name: "People", site_url: "https://people.dropxlogistics.com", sort_order: 10 },
  { code: "opspulse", name: "OpsPulse", site_url: "https://ops.dropxlogistics.com", sort_order: 20 },
  { code: "fleet", name: "Fleet", site_url: "https://fleet.dropxlogistics.com", sort_order: 30 },
  { code: "recruit", name: "Recruit", site_url: "https://recruit.dropxlogistics.com", sort_order: 40 },
  { code: "dashboard", name: "Dashboard", site_url: "https://dashboard.dropxlogistics.com", sort_order: 50 },
  { code: "dropx-one", name: "DropX One", site_url: "https://one.dropxlogistics.com", sort_order: 60 },
  { code: "connect", name: "Connect", site_url: "https://dropx-connect.vercel.app", sort_order: 70 },
  { code: "delivery-tracker", name: "Delivery Tracker", site_url: "https://dropx-delivery-tracker.pages.dev", sort_order: 80 },
] as const;

export async function syncKnownSystems(supabase: SupabaseClient) {
  const { error: portalError } = await supabase.from("support_portals").upsert(KNOWN_PORTALS.map((p) => ({ ...p, is_active: true })), { onConflict: "code" });
  if (portalError) throw portalError;
  const { data: rows, error: readError } = await supabase.from("support_portals").select("id,code").in("code", KNOWN_PORTALS.map((p) => p.code));
  if (readError) throw readError;
  const ids = new Map((rows ?? []).map((p) => [p.code, p.id]));
  const repos = [
    { code: "people", repo: "nisar-dropx/dropx-hrms", gitRef: null, prefixes: [] },
    { code: "opspulse", repo: "nisar-dropx/dropx-partner-dashboard", gitRef: null, prefixes: ["src/app/ops-pulse", "src/lib/ops-pulse", "src/app/api/ops-pulse"] },
    { code: "fleet", repo: "nisar-dropx/dropx-partner-dashboard", gitRef: "feat/fleet-control-20260926", prefixes: [] },
    { code: "dashboard", repo: "nisar-dropx/dropx-partner-dashboard", gitRef: null, prefixes: [] },
    { code: "connect", repo: "nisar-dropx/dropx-partner-dashboard", gitRef: null, prefixes: ["apps/connect"] },
    { code: "dropx-one", repo: "nisar-dropx/dropx-partner-dashboard", gitRef: null, prefixes: ["apps/dropx-tracker-android"] },
    { code: "opspulse", repo: "DROPX-LOGISTICS/Amazon-EDD-Worker", gitRef: null, prefixes: [] },
    { code: "opspulse", repo: "DROPX-LOGISTICS/ops-worker", gitRef: null, prefixes: [] },
    { code: "delivery-tracker", repo: "DROPX-LOGISTICS/dropx-delivery-tracker", gitRef: null, prefixes: [] },
  ] as const;
  for (const mapping of repos) {
    const portalId = ids.get(mapping.code);
    if (!portalId) continue;
    let existingQuery = supabase.from("support_portal_repos").select("id").eq("portal_id", portalId).eq("repo", mapping.repo);
    existingQuery = mapping.gitRef ? existingQuery.eq("git_ref", mapping.gitRef) : existingQuery.is("git_ref", null);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) throw existingError;
    const result = existing?.id
      ? await supabase.from("support_portal_repos").update({ git_ref: mapping.gitRef, path_prefixes: mapping.prefixes }).eq("id", existing.id)
      : await supabase.from("support_portal_repos").insert({ portal_id: portalId, repo: mapping.repo, git_ref: mapping.gitRef, path_prefixes: mapping.prefixes });
    if (result.error) throw result.error;
  }
  const developers = [
    { display_name: "Joseph Mathew", github_logins: ["Josephmathew072"] },
    { display_name: "Nisar DropX", github_logins: ["nisar-dropx"] },
    { display_name: "Muhammed Jamsheer", github_logins: ["muhammedjamsheer"] },
  ];
  for (const developer of developers) {
    const login = developer.github_logins[0].toLowerCase();
    const { data: all, error: developerReadError } = await supabase.from("support_developers").select("id,user_id,github_logins,created_at").order("created_at");
    if (developerReadError) throw developerReadError;
    const matches = (all ?? []).filter((row) => (row.github_logins ?? []).some((value: string) => value.toLowerCase() === login));
    const canonical = matches.find((row) => row.user_id) ?? matches[0];
    if (!canonical) {
      const { error } = await supabase.from("support_developers").insert(developer);
      if (error) throw error;
      continue;
    }
    // Earlier seed runs could create a second unlinked row when login casing differed. Preserve the linked row and its updates.
    for (const duplicate of matches.filter((row) => row.id !== canonical.id)) {
      const { error: moveError } = await supabase.from("support_daily_updates").update({ developer_id: canonical.id }).eq("developer_id", duplicate.id);
      if (moveError) throw moveError;
      const { count, error: countError } = await supabase.from("support_daily_updates").select("id", { head: true, count: "exact" }).eq("developer_id", duplicate.id);
      if (countError) throw countError;
      if (!count) {
        const { error: deleteError } = await supabase.from("support_developers").delete().eq("id", duplicate.id);
        if (deleteError) throw deleteError;
      }
    }
  }
  return { portals: KNOWN_PORTALS.length, repos: repos.length, developers: developers.length };
}
