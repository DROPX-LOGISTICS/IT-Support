"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageMaster } from "@/lib/access";
import { disconnectIntegration, googleOAuthAccessToken, noteIntegrationCheck, runtimeGithubToken, saveOAuthApp, type IntegrationProvider } from "@/lib/integrations";
import { requireUser } from "@/lib/session";

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const providerOf = (value: string): IntegrationProvider | null => value === "google" || value === "github" ? value : null;
async function admin() {
  const session = await requireUser();
  if (session.state !== "ok" || !canManageMaster({ id: session.user.id, role: session.user.role, isActive: true })) redirect("/my-tickets");
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
  try {
    const token = provider === "google" ? await googleOAuthAccessToken() : await runtimeGithubToken();
    if (!token) throw new Error("No connected account");
    const url = provider === "google" ? "https://www.googleapis.com/oauth2/v2/userinfo" : "https://api.github.com/user";
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json", "user-agent": "dropx-it-support" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!res.ok) throw new Error(`Provider returned ${res.status}`);
    await noteIntegrationCheck(provider);
  } catch {
    error = true;
    await noteIntegrationCheck(provider, "Connection test failed");
  }
  done(!error, error ? "Connection test failed. Reconnect the account and try again." : `${provider === "google" ? "Google Workspace" : "GitHub"} connection is healthy.`);
}
