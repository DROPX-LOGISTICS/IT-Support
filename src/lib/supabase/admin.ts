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
  return createClient(cfg.url, cfg.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
