import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { disconnectIntegration, oauthApp, type IntegrationProvider } from "@/lib/integrations";
import { GITHUB_SCOPES, GOOGLE_SCOPES, oauthCallback, oauthCookie, pkceChallenge, randomToken } from "@/lib/oauth";

export const dynamic = "force-dynamic";
const providerOf = (value: string): IntegrationProvider | null => value === "google" || value === "github" ? value : null;

export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const provider = providerOf(params.provider);
  const session = await getSession();
  if (!provider || session.state !== "ok" || session.user.role !== "admin") return NextResponse.redirect(new URL("/login", request.url));
  const app = await oauthApp(provider);
  if (!app) return NextResponse.redirect(new URL("/master?tab=integrations&error=Save+the+OAuth+app+details+first.", request.url));
  // A reconnect must not silently reuse an old provider token. Keep the OAuth
  // app, clear only the account, and require a fresh grant.
  if (request.nextUrl.searchParams.get("force") === "1") await disconnectIntegration(provider);
  const state = randomToken(), verifier = randomToken(48), challenge = await pkceChallenge(verifier);
  const callback = oauthCallback(provider, request.nextUrl.origin);
  const url = provider === "google" ? new URL("https://accounts.google.com/o/oauth2/v2/auth") : new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", (provider === "google" ? GOOGLE_SCOPES : GITHUB_SCOPES).join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (provider === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "false");
    url.searchParams.set("hd", "dropxlogistics.com");
  }
  const response = NextResponse.redirect(url);
  const options = { httpOnly: true, secure: true, sameSite: "lax" as const, path: `/api/integrations/${provider}`, maxAge: 600 };
  response.cookies.set(oauthCookie(provider, "state"), state, options);
  response.cookies.set(oauthCookie(provider, "verifier"), verifier, options);
  return response;
}
