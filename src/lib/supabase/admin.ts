import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serviceRoleConfig } from "../config.ts";

/**
 * Service-role client. It bypasses row-level security, so every caller must check the
 * signed-in person first. Current uses are listed in the README ("Service role usage").
 */
export function serviceClient() {
  const cfg = serviceRoleConfig();
  if (!cfg.configured) return null;
  // Next.js caches GET requests made with fetch; database reads must always be live (the jobs act on them).
  return createClient(cfg.url, cfg.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
