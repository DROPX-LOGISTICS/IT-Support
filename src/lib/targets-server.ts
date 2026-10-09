import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_AUTO_CLOSE_DAYS, DEFAULT_REMINDER_DAYS, parseTargets, type Targets } from "./targets.ts";

/** Targets and reminder settings from Master, Settings; the spec defaults when nothing is stored. */
export async function loadSettings(db: SupabaseClient): Promise<{ targets: Targets; reminderDays: number; autoCloseDays: number; notify: Record<string, boolean>; raw: Record<string, unknown> | null }> {
  const { data } = await db.from("support_settings").select("*").limit(1).maybeSingle();
  return {
    targets: parseTargets(data?.response_hours, data?.fix_hours),
    reminderDays: data?.reminder_days ?? DEFAULT_REMINDER_DAYS,
    autoCloseDays: data?.auto_close_days ?? DEFAULT_AUTO_CLOSE_DAYS,
    notify: { raised: true, assigned: true, status: true, comment: true, confirmation: true, ...(data?.notify ?? {}) },
    raw: data ?? null,
  };
}
