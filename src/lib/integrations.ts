import { getCloudflareContext } from "@opennextjs/cloudflare";
import { googleAccessToken, googleCredentialsConfigured, type AuthDeps } from "./google-auth.ts";
import { tokenForRepo } from "./github-token.ts";

export type IntegrationProvider = "google" | "github";
export type IntegrationRecord = {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  account?: string;
  scopes?: string[];
  updatedAt: string;
  lastCheckedAt?: string;
  lastError?: string;
};
export type IntegrationSummary = {
  provider: IntegrationProvider;
  appConfigured: boolean;
  connected: boolean;
  account: string | null;
  scopes: string[];
  updatedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  source: "dashboard" | "environment" | "none";
  storageReady: boolean;
};

const enc = new TextEncoder();
const dec = new TextDecoder();
const keyName = (provider: IntegrationProvider) => `oauth:${provider}:v1`;

async function bindings(): Promise<{ kv: IntegrationKvNamespace | null; secret: string }> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return { kv: env.INTEGRATIONS ?? null, secret: String(env.INTEGRATION_ENCRYPTION_KEY ?? process.env.INTEGRATION_ENCRYPTION_KEY ?? "").trim() };
  } catch {
    return { kv: null, secret: String(process.env.INTEGRATION_ENCRYPTION_KEY ?? "").trim() };
  }
}

const b64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};
async function aesKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(value: IntegrationRecord, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), enc.encode(JSON.stringify(value)));
  return `${b64(iv)}.${b64(new Uint8Array(data))}`;
}
async function open(value: string, secret: string): Promise<IntegrationRecord | null> {
  try {
    const [iv, data] = value.split(".");
    if (!iv || !data) return null;
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await aesKey(secret), unb64(data));
    return JSON.parse(dec.decode(plain)) as IntegrationRecord;
  } catch {
    return null;
  }
}

export async function integrationStorageReady() {
  const { kv, secret } = await bindings();
  return Boolean(kv && secret);
}
export async function readIntegration(provider: IntegrationProvider): Promise<IntegrationRecord | null> {
  const { kv, secret } = await bindings();
  if (!kv || !secret) return null;
  const stored = await kv.get(keyName(provider));
  return stored ? open(stored, secret) : null;
}
export async function writeIntegration(provider: IntegrationProvider, value: IntegrationRecord) {
  const { kv, secret } = await bindings();
  if (!kv || !secret) throw new Error("Secure integration storage is not configured");
  await kv.put(keyName(provider), await seal(value, secret));
}
export async function saveOAuthApp(provider: IntegrationProvider, clientId: string, clientSecret: string) {
  const existing = await readIntegration(provider);
  await writeIntegration(provider, {
    ...(existing ?? {}), clientId, clientSecret,
    updatedAt: new Date().toISOString(), lastError: undefined,
  });
}
export async function saveOAuthConnection(provider: IntegrationProvider, patch: Partial<IntegrationRecord>) {
  const existing = await readIntegration(provider);
  if (!existing?.clientId || !existing.clientSecret) throw new Error("OAuth app is not configured");
  const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<IntegrationRecord>;
  await writeIntegration(provider, { ...existing, ...defined, clientId: existing.clientId, clientSecret: existing.clientSecret, updatedAt: new Date().toISOString() });
}
export async function disconnectIntegration(provider: IntegrationProvider) {
  const existing = await readIntegration(provider);
  if (!existing) return;
  const { clientId, clientSecret } = existing;
  await writeIntegration(provider, { clientId, clientSecret, updatedAt: new Date().toISOString() });
}
export async function noteIntegrationCheck(provider: IntegrationProvider, error?: string) {
  const existing = await readIntegration(provider);
  if (!existing) return;
  await writeIntegration(provider, { ...existing, lastCheckedAt: new Date().toISOString(), lastError: error });
}

function envGoogleRecord(): IntegrationRecord | null {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim(), clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken, account: process.env.MAIL_FROM?.trim(), updatedAt: "environment" };
}

export async function integrationSummaries(): Promise<Record<IntegrationProvider, IntegrationSummary>> {
  const [storageReady, googleStored, githubStored] = await Promise.all([integrationStorageReady(), readIntegration("google"), readIntegration("github")]);
  const googleEnv = envGoogleRecord();
  const githubEnv = tokenForRepo("any/any") || process.env.GITHUB_TOKEN_NISAR_DROPX?.trim() || process.env.GITHUB_TOKEN_DROPX_LOGISTICS?.trim();
  const summary = (provider: IntegrationProvider, stored: IntegrationRecord | null, envConnected: boolean): IntegrationSummary => ({
    provider,
    appConfigured: Boolean(stored?.clientId && stored.clientSecret),
    connected: provider === "google" ? Boolean(stored?.refreshToken || googleEnv || googleCredentialsConfigured(process.env)) : Boolean(stored?.accessToken || envConnected),
    account: stored?.account ?? (provider === "google" ? googleEnv?.account ?? null : null),
    scopes: stored?.scopes ?? [], updatedAt: stored?.updatedAt ?? null, lastCheckedAt: stored?.lastCheckedAt ?? null,
    lastError: stored?.lastError ?? null, source: stored?.[provider === "google" ? "refreshToken" : "accessToken"] ? "dashboard" : envConnected || (provider === "google" && Boolean(googleEnv || googleCredentialsConfigured(process.env))) ? "environment" : "none",
    storageReady,
  });
  return { google: summary("google", googleStored, Boolean(googleEnv || googleCredentialsConfigured(process.env))), github: summary("github", githubStored, Boolean(githubEnv)) };
}

export async function oauthApp(provider: IntegrationProvider) {
  const record = await readIntegration(provider);
  if (!record?.clientId || !record.clientSecret) return null;
  return { clientId: record.clientId, clientSecret: record.clientSecret };
}

export async function googleOAuthAccessToken(): Promise<string | null> {
  const stored = await readIntegration("google");
  const cfg = stored?.refreshToken ? stored : envGoogleRecord();
  if (!cfg?.refreshToken) return null;
  if (cfg.accessToken && cfg.expiresAt && cfg.expiresAt > Date.now() + 60_000) return cfg.accessToken;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, cache: "no-store",
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) { if (stored) await noteIntegrationCheck("google", `Token refresh returned ${res.status}`); return null; }
  const data = await res.json() as { access_token?: string; expires_in?: number; scope?: string };
  if (!data.access_token) return null;
  if (stored) await saveOAuthConnection("google", { accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000, scopes: data.scope?.split(" ") ?? stored.scopes, lastError: undefined });
  return data.access_token;
}

export async function runtimeGithubToken(repo?: string): Promise<string | null> {
  const envToken = repo ? tokenForRepo(repo) : (process.env.GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN_NISAR_DROPX?.trim() || process.env.GITHUB_TOKEN_DROPX_LOGISTICS?.trim() || null);
  if (envToken) return envToken;
  return (await readIntegration("github"))?.accessToken ?? null;
}
export async function githubRuntimeConfigured() { return Boolean(await runtimeGithubToken()); }
export async function googleOAuthConnected() { return Boolean((await readIntegration("google"))?.refreshToken || envGoogleRecord()); }
export async function runtimeGoogleAccessToken(scopes: string[], subject: string, deps: AuthDeps = {}) {
  const env = deps.env ?? process.env;
  if (googleCredentialsConfigured(env)) return googleAccessToken(scopes, subject, deps);
  // Explicit dependency injection belongs to tests and must not silently fall through to live KV credentials.
  if (deps.env) throw new Error("Google credentials are not configured");
  const token = await googleOAuthAccessToken();
  if (!token) throw new Error("Google credentials are not configured");
  return token;
}
