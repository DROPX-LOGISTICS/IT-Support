export type Missing = { configured: false; missing: string[] };

function pick(names: string[]): Missing | { configured: true; values: Record<string, string> } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const n of names) {
    const v = process.env[n]?.trim();
    if (v) values[n] = v;
    else missing.push(n);
  }
  return missing.length ? { configured: false, missing } : { configured: true, values };
}

export function supabaseConfig(): Missing | { configured: true; url: string; anonKey: string } {
  const r = pick(["SUPABASE_URL", "SUPABASE_ANON_KEY"]);
  if (!r.configured) return r;
  return { configured: true, url: r.values.SUPABASE_URL, anonKey: r.values.SUPABASE_ANON_KEY };
}

export function serviceRoleConfig(): Missing | { configured: true; url: string; serviceKey: string } {
  const r = pick(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (!r.configured) return r;
  return { configured: true, url: r.values.SUPABASE_URL, serviceKey: r.values.SUPABASE_SERVICE_ROLE_KEY };
}

export function allowedDomain(): string {
  return (process.env.ALLOWED_EMAIL_DOMAIN ?? "").trim().toLowerCase();
}

export function appUrl(fallbackOrigin?: string): string {
  return (process.env.APP_URL?.trim() || fallbackOrigin || "http://localhost:3000").replace(/\/+$/, "");
}
