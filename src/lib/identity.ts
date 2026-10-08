import type { Role } from "./access.ts";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The email must be verified by Google and sit on the company domain. */
export function isAllowedEmail(email: string | null | undefined, domain: string, verified: boolean): boolean {
  if (!email || !domain || !verified) return false;
  const e = normalizeEmail(email);
  const at = e.lastIndexOf("@");
  if (at < 1 || e.indexOf("@") !== at) return false;
  return e.slice(at + 1) === domain.trim().toLowerCase();
}

export function parseAdminEmails(value: string | undefined): string[] {
  return (value ?? "").split(/[,\s;]+/).map(normalizeEmail).filter(Boolean);
}

/** A new person starts as a reporter; only the configured bootstrap admins start as admin. */
export function initialRole(email: string, adminEmails: string[]): Role {
  return adminEmails.includes(normalizeEmail(email)) ? "admin" : "reporter";
}

/** Only same-site paths are allowed after sign-in; anything else becomes "/". */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  if (/[\u0000-\u001f]/.test(next)) return "/";
  return next;
}
