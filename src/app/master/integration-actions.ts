"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageMaster } from "@/lib/access";
import { testGeminiConnection } from "@/lib/gemini";
import { classifyGeminiFailure, geminiFailureMessage } from "@/lib/gemini-errors";
import { GoogleApiError } from "@/lib/google-calendar";
import { SHEETS_SCOPES, sheetsErrorMessage, sheetsRuntimeStatus } from "@/lib/google-sheets";
import { GOOGLE_SCOPES } from "@/lib/oauth";
import {
  disconnectGeminiIntegration, disconnectIntegration, noteGeminiCheck, noteIntegrationCheck,
  runtimeGithubToken, runtimeGoogleAccessToken, saveGeminiIntegration, saveOAuthApp, type IntegrationProvider,
} from "@/lib/integrations";
import { requireUser } from "@/lib/session";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const providerOf = (value: string): IntegrationProvider | null => value === "google" || value === "github" ? value : null;
function githubErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message.toLowerCase() : "";
  if (/401|bad credentials|requires authentication/.test(detail)) return "GitHub rejected the saved OAuth token. Reconnect GitHub and approve repository access again.";
  if (/403|rate limit|resource not accessible|sso/.test(detail)) return "GitHub denied this request. Check token permissions, organisation SSO approval, or GitHub rate limits, then reconnect GitHub.";
  if (/429/.test(detail)) return "GitHub rate limit reached. Wait briefly, then test again.";
  if (/timeout|abort/.test(detail)) return "GitHub did not respond in time. Retry the connection test.";
  return "GitHub connection test failed. Reconnect GitHub and approve repository access again.";
}
async function admin() {
  const session = await requireUser();
  if (session.state !== "ok" || session.user.isPreview || !canManageMaster({ id: session.user.id, role: session.user.role, isActive: true })) redirect("/my-tickets");
}
function done(ok: boolean, message: string): never {
  revalidatePath("/master");
  redirect(`/master?tab=integrations&${ok ? "saved" : "error"}=${encodeURIComponent(message)}`);
}

export async function saveOAuthAppAction(fd: FormData) {
  await admin();
  const provider = providerOf(str(fd, "provider")), clientId = str(fd, "clientId"), clientSecret = str(fd, "clientSecret");
  if (!provider || clientId.length < 6 || clientId.length > 300 || clientSecret.length < 6 || clientSecret.length > 500) done(false, "Enter the OAuth client ID and client secret.");
  try { await saveOAuthApp(provider, clientId, clientSecret); }
  catch { done(false, "Secure token storage is not ready. Check the worker KV and encryption key."); }
  done(true, `${provider === "google" ? "Google" : "GitHub"} OAuth app saved. You can connect the account now.`);
}

export async function disconnectIntegrationAction(fd: FormData) {
  await admin();
  const provider = providerOf(str(fd, "provider"));
  if (!provider) done(false, "Unknown integration.");
  await disconnectIntegration(provider);
  done(true, `${provider === "google" ? "Google Workspace" : "GitHub"} disconnected. The OAuth app details were kept.`);
}

export async function testIntegrationAction(fd: FormData) {
  await admin();
  const provider = providerOf(str(fd, "provider"));
  if (!provider) done(false, "Unknown integration.");
  let error = false;
  let errorMessage = "Connection test failed. Reconnect the account and try again.";
  try {
    if (provider === "google") {
      const status = await sheetsRuntimeStatus();
      if (!status.configured) throw new Error(status.missing.join(". "));
      const token = await runtimeGoogleAccessToken(SHEETS_SCOPES, status.owner);
      const tokenInfo = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`, {
        cache: "no-store", signal: AbortSignal.timeout(8_000),
      });
      if (!tokenInfo.ok) throw new GoogleApiError(`Google token validation returned ${tokenInfo.status}`, tokenInfo.status);
      const tokenData = await tokenInfo.json().catch(() => ({})) as { scope?: string; email?: string };
      const granted = new Set(String(tokenData.scope ?? "").split(/[ ,]+/).filter(Boolean));
      const requiredGoogleScopes = GOOGLE_SCOPES.filter((scope) => scope.startsWith("https://www.googleapis.com/auth/"));
      const missingScopes = requiredGoogleScopes.filter((scope) => !granted.has(scope));
      if (missingScopes.length) throw new GoogleApiError("OAuth token has insufficient authentication scopes", 403);
      const res = await fetch("https://www.googleapis.com/drive/v3/files?pageSize=1&spaces=drive&fields=files(id)", {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12_000),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new GoogleApiError(body.error?.message ?? `Google returned ${res.status}`, res.status);
      }
      const gmail = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(12_000),
      });
      if (!gmail.ok) {
        const body = await gmail.json().catch(() => ({})) as { error?: { message?: string } };
        throw new GoogleApiError(body.error?.message ?? `Gmail returned ${gmail.status}`, gmail.status);
      }
    } else {
      const token = await runtimeGithubToken();
      if (!token) throw new Error("No connected account");
      const res = await fetch("https://api.github.com/user", { headers: { authorization: `Bearer ${token}`, accept: "application/json", "user-agent": "dropx-it-support" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(`GitHub returned ${res.status}: ${body.message ?? "provider rejected the request"}`);
      }
    }
    await noteIntegrationCheck(provider);
  } catch (e) {
    error = true;
    errorMessage = provider === "google" ? sheetsErrorMessage(e) : githubErrorMessage(e);
    await noteIntegrationCheck(provider, errorMessage);
  }
  done(!error, error ? errorMessage : `${provider === "google" ? "Google Workspace" : "GitHub"} connection is healthy.`);
}

export async function saveGeminiAction(fd: FormData) {
  await admin();
  const apiKey = str(fd, "apiKey"), model = str(fd, "model");
  if (apiKey.length < 20 || apiKey.length > 300 || /\s/.test(apiKey)) done(false, "Enter a valid Gemini API key from Google AI Studio.");
  if (!/^[a-z0-9._-]{3,100}$/i.test(model)) done(false, "Enter a valid Gemini model name.");
  try {
    await testGeminiConnection(apiKey, model);
  } catch (error) {
    const failure = classifyGeminiFailure(error);
    done(false, `The new Gemini settings were not saved. ${geminiFailureMessage(failure.code)}`);
  }
  try { await saveGeminiIntegration(apiKey, model); }
  catch { done(false, "The key works, but secure token storage is not ready. Check the worker KV and encryption key."); }
  done(true, "Gemini AI is ready for daily-update polishing.");
}

export async function testGeminiAction() {
  await admin();
  try {
    await testGeminiConnection();
    await noteGeminiCheck();
  } catch (error) {
    const failure = classifyGeminiFailure(error);
    const message = geminiFailureMessage(failure.code);
    await noteGeminiCheck(message);
    done(false, `Gemini connection test failed. ${message}`);
  }
  done(true, "Gemini AI connection is healthy.");
}

export async function disconnectGeminiAction() {
  await admin();
  await disconnectGeminiIntegration();
  done(true, "The dashboard Gemini API key was removed.");
}
