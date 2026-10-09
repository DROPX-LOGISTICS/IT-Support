import { createSign } from "node:crypto";

// Same credential pattern as dropx-hrms / the dashboard (src/lib/google-workspace-client.ts):
// a service account key, or Vercel OIDC workload identity federation, with domain-wide delegation.
export type Env = Record<string, string | undefined>;
export type ServiceAccount = { client_email: string; private_key: string };
export type Federation = { projectNumber: string; poolId: string; providerId: string; serviceAccountEmail: string };

const fixKey = (v: string) => v.replace(/\\n/g, "\n").trim();

export function serviceAccountFromEnv(env: Env = process.env): ServiceAccount | null {
  const raw = env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8")) as Partial<ServiceAccount>;
      if (parsed.client_email && parsed.private_key) return { client_email: parsed.client_email.trim(), private_key: fixKey(parsed.private_key) };
    } catch { /* fall through to the two-variable form */ }
  }
  const email = env.GOOGLE_WORKSPACE_CLIENT_EMAIL?.trim();
  const key = env.GOOGLE_WORKSPACE_PRIVATE_KEY?.trim();
  return email && key ? { client_email: email, private_key: fixKey(key) } : null;
}

export function federationFromEnv(env: Env = process.env): Federation | null {
  const projectNumber = env.GCP_PROJECT_NUMBER?.trim(), poolId = env.GCP_WORKLOAD_IDENTITY_POOL_ID?.trim();
  const providerId = env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID?.trim(), serviceAccountEmail = env.GCP_SERVICE_ACCOUNT_EMAIL?.trim();
  return projectNumber && poolId && providerId && serviceAccountEmail ? { projectNumber, poolId, providerId, serviceAccountEmail } : null;
}

export function googleCredentialsConfigured(env: Env = process.env): boolean {
  return Boolean(serviceAccountFromEnv(env) || federationFromEnv(env));
}

const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");
export function signJwtRs256(claims: Record<string, unknown>, privateKey: string): string {
  const unsigned = `${b64(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64(JSON.stringify(claims))}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  return `${unsigned}.${b64(sig)}`;
}

export type AuthDeps = { fetchFn?: typeof fetch; oidcToken?: () => Promise<string>; now?: () => number; env?: Env };
const cache = new Map<string, { token: string; expiresAt: number }>();

async function json<T>(res: Response, what: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } | string; error_description?: string };
  if (!res.ok) {
    const msg = typeof body.error === "string" ? body.error_description ?? body.error : body.error?.message;
    throw new Error(`${what}${msg ? `: ${msg}` : ` (${res.status})`}`);
  }
  return body;
}

/** An access token for `scopes`, acting as `subject` (domain-wide delegation). Cached until shortly before it expires. */
export async function googleAccessToken(scopes: string[], subject: string, deps: AuthDeps = {}): Promise<string> {
  const env = deps.env ?? process.env;
  const f = deps.fetchFn ?? fetch;
  const nowMs = deps.now ?? Date.now;
  const key = `${subject}|${scopes.join(" ")}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt - 60_000 > nowMs()) return hit.token;

  const iat = Math.floor(nowMs() / 1000);
  const sa = serviceAccountFromEnv(env);
  const fed = federationFromEnv(env);
  let assertion: string;
  if (sa) {
    assertion = signJwtRs256({ iss: sa.client_email, sub: subject, scope: scopes.join(" "), aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3300 }, sa.private_key);
  } else if (fed) {
    const oidc = deps.oidcToken ?? (async () => (await import("@vercel/oidc")).getVercelOidcToken());
    const sts = await json<{ access_token: string }>(await f("https://sts.googleapis.com/v1/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, cache: "no-store",
      body: new URLSearchParams({
        audience: `//iam.googleapis.com/projects/${fed.projectNumber}/locations/global/workloadIdentityPools/${fed.poolId}/providers/${fed.providerId}`,
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange", requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        scope: "https://www.googleapis.com/auth/cloud-platform", subject_token_type: "urn:ietf:params:oauth:token-type:jwt", subject_token: await oidc(),
      }),
    }), "Google could not accept the Vercel identity");
    const claim = JSON.stringify({ iss: fed.serviceAccountEmail, sub: subject, scope: scopes.join(" "), aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3300 });
    const signed = await json<{ signedJwt: string }>(await f(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(fed.serviceAccountEmail)}:signJwt`, {
      method: "POST", headers: { authorization: `Bearer ${sts.access_token}`, "content-type": "application/json" }, body: JSON.stringify({ payload: claim }), cache: "no-store",
    }), "Google could not sign the delegated request");
    assertion = signed.signedJwt;
  } else throw new Error("Google credentials are not configured");

  const tok = await json<{ access_token: string; expires_in?: number }>(await f("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, cache: "no-store",
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  }), "Google Workspace refused the delegated access (check domain-wide delegation and the scopes)");
  cache.set(key, { token: tok.access_token, expiresAt: nowMs() + (tok.expires_in ?? 3300) * 1000 });
  return tok.access_token;
}
export const clearGoogleTokenCache = () => cache.clear();
