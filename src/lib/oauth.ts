import { appUrl } from "./config.ts";
import type { IntegrationProvider } from "./integrations.ts";

export const GOOGLE_SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/spreadsheets",
  // Full Drive scope is required because the attachment folder already exists
  // outside this OAuth app. drive.file cannot reliably write into that folder.
  "https://www.googleapis.com/auth/drive",
];
export const GITHUB_SCOPES = ["repo", "read:user", "user:email"];
export const oauthCallback = (provider: IntegrationProvider, origin?: string) => `${appUrl(origin)}/api/integrations/${provider}/callback`;

export const randomToken = (bytes = 32) => {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export async function pkceChallenge(verifier: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function oauthCookie(provider: IntegrationProvider, part: "state" | "verifier") { return `support_oauth_${provider}_${part}`; }
