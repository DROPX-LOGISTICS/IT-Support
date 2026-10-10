export type Env = Record<string, string | undefined>;

/**
 * The repos sit under two owners, so a token can be set per owner:
 * GITHUB_TOKEN_NISAR_DROPX and GITHUB_TOKEN_DROPX_LOGISTICS (owner in capitals, anything but letters and digits as "_").
 * A repo uses its owner's token if there is one, otherwise the shared GITHUB_TOKEN.
 */
export function ownerTokenName(repo: string): string {
  return `GITHUB_TOKEN_${repo.split("/")[0].toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

export function tokenForRepo(repo: string, env: Env = process.env): string | null {
  return env[ownerTokenName(repo)]?.trim() || env.GITHUB_TOKEN?.trim() || null;
}

/** True when at least one GitHub token is set (shared or per owner). */
export function anyGithubToken(env: Env = process.env): boolean {
  return Object.entries(env).some(([k, v]) => /^GITHUB_TOKEN(_[A-Z0-9_]+)?$/.test(k) && Boolean(v?.trim()));
}
