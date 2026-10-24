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
    ["people", "nisar-dropx/dropx-hrms", []],
    ["opspulse", "nisar-dropx/dropx-partner-dashboard", ["src/app/ops-pulse", "src/lib/ops-pulse", "src/app/api/ops-pulse"]],
    ["dashboard", "nisar-dropx/dropx-partner-dashboard", []],
    ["connect", "nisar-dropx/dropx-partner-dashboard", ["apps/connect"]],
    ["dropx-one", "nisar-dropx/dropx-partner-dashboard", ["apps/dropx-tracker-android"]],
    ["opspulse", "DROPX-LOGISTICS/Amazon-EDD-Worker", []],
    ["opspulse", "DROPX-LOGISTICS/ops-worker", []],
    ["delivery-tracker", "DROPX-LOGISTICS/dropx-delivery-tracker", []],
  ] as const;
  for (const [code, repo, prefixes] of repos) {
    const portalId = ids.get(code);
    if (!portalId) continue;
    const { data: existing } = await supabase.from("support_portal_repos").select("id").eq("portal_id", portalId).eq("repo", repo).maybeSingle();
    const result = existing?.id
      ? await supabase.from("support_portal_repos").update({ path_prefixes: prefixes }).eq("id", existing.id)
      : await supabase.from("support_portal_repos").insert({ portal_id: portalId, repo, path_prefixes: prefixes });
    if (result.error) throw result.error;
  }
  const developers = [
    { display_name: "Joseph Mathew", github_logins: ["Josephmathew072"] },
    { display_name: "Nisar DropX", github_logins: ["nisar-dropx"] },
    { display_name: "Muhammed Jamsheer", github_logins: ["muhammedjamsheer"] },
  ];
  for (const developer of developers) {
    const { data: existing } = await supabase.from("support_developers").select("id").contains("github_logins", developer.github_logins).maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("support_developers").insert(developer);
      if (error) throw error;
    }
  }
  return { portals: KNOWN_PORTALS.length, repos: repos.length, developers: developers.length };
}
