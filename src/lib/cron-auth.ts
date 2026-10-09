import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** "Authorization: Bearer <CRON_SECRET>", compared in constant time. No secret configured means nothing is authorised. */
export function isAuthorizedCron(header: string | null | undefined, secret: string | undefined): boolean {
  const s = secret?.trim();
  if (!s) return false;
  return timingSafeEqual(digest(header ?? ""), digest(`Bearer ${s}`));
}
