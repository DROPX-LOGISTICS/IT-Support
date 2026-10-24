import { NextResponse, type NextRequest } from "next/server";
import { allowedDomain } from "@/lib/config";
import { getSession } from "@/lib/session";
import { noteIntegrationCheck, oauthApp, saveOAuthConnection, type IntegrationProvider } from "@/lib/integrations";
import { GITHUB_SCOPES, GOOGLE_SCOPES, oauthCallback, oauthCookie } from "@/lib/oauth";

export const dynamic = "force-dynamic";
const providerOf = (value: string): IntegrationProvider | null => value === "google" || value === "github" ? value : null;
const back = (request: NextRequest, ok: boolean, message: string) => NextResponse.redirect(new URL(`/master?tab=integrations&${ok ? "saved" : "error"}=${encodeURIComponent(message)}`, request.url));

export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const provider = providerOf(params.provider);
  const session = await getSession();
  if (!provider || session.state !== "ok" || session.user.role !== "admin") return back(request, false, "Admin sign-in is required.");
  const state = request.nextUrl.searchParams.get("state"), expected = request.cookies.get(oauthCookie(provider, "state"))?.value;
  const verifier = request.cookies.get(oauthCookie(provider, "verifier"))?.value;
  const code = request.nextUrl.searchParams.get("code");
  if (!state || !expected || state !== expected || !verifier || !code) return back(request, false, "The connection request expired. Please try again.");
  const app = await oauthApp(provider);
  if (!app) return back(request, false, "OAuth app details are missing.");
  try {
    const callback = oauthCallback(provider, request.nextUrl.origin);
    const tokenUrl = provider === "google" ? "https://oauth2.googleapis.com/token" : "https://github.com/login/oauth/access_token";
    const tokenRes = await fetch(tokenUrl, {
      method: "POST", cache: "no-store", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, code, redirect_uri: callback, code_verifier: verifier, grant_type: "authorization_code" }),
      signal: AbortSignal.timeout(15_000),
    });
    const token = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
    if (!tokenRes.ok || !token.access_token) throw new Error("token exchange failed");
    let account = "Connected account";
    if (provider === "google") {
      if (!token.refresh_token) throw new Error("Google did not issue a refresh token. Disconnect the account, then reconnect and approve offline access.");
      const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
      const user = await profile.json() as { email?: string; verified_email?: boolean };
      if (!profile.ok || !user.email || user.verified_email === false || !user.email.toLowerCase().endsWith(`@${allowedDomain()}`)) throw new Error("Use a verified DropX Workspace account");
      account = user.email;
    } else {
      const profile = await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${token.access_token}`, accept: "application/vnd.github+json", "user-agent": "dropx-it-support" }, cache: "no-store" });
      const user = await profile.json() as { login?: string };
      if (!profile.ok || !user.login) throw new Error("GitHub profile unavailable");
      account = `@${user.login}`;
    }
    await saveOAuthConnection(provider, {
      accessToken: token.access_token, refreshToken: token.refresh_token,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
      account, scopes: (token.scope?.split(/[ ,]+/) ?? (provider === "google" ? GOOGLE_SCOPES : GITHUB_SCOPES)).filter(Boolean),
      lastCheckedAt: new Date().toISOString(), lastError: undefined,
    });
    return back(request, true, `${provider === "google" ? "Google Workspace" : "GitHub"} connected as ${account}.`);
  } catch (error) {
    const message = error instanceof Error && /DropX Workspace|refresh token|offline access/i.test(error.message) ? error.message : "The provider could not be connected. Check the OAuth app and callback URL.";
    await noteIntegrationCheck(provider, message);
    return back(request, false, message);
  }
}
