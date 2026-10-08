#!/usr/bin/env node
// Run once, locally, to obtain a Gmail refresh token for the sender mailbox.
//   GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... node scripts/get-gmail-refresh-token.mjs
// Requests only the gmail.send scope. The token is printed to this terminal and nowhere else.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const PORT = 8765;
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const clientId = process.env.GMAIL_CLIENT_ID?.trim();
const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET first (see README: Gmail sender).");
  process.exit(1);
}

const state = randomBytes(16).toString("hex");
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT,
  response_type: "code",
  scope: SCOPE,
  access_type: "offline",
  prompt: "consent",
  state,
}).toString();

const page = (title, body) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;max-width:480px;margin:15vh auto;padding:0 16px"><h2>${title}</h2><p>${body}</p>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", REDIRECT);
  if (url.pathname !== "/") { res.writeHead(404).end(); return; }
  const fail = (msg) => {
    res.writeHead(400, { "Content-Type": "text/html" }).end(page("Something went wrong", msg));
    console.error(`\n${msg}`);
    server.close(() => process.exit(1));
  };
  if (url.searchParams.get("error")) return fail(`Google returned: ${url.searchParams.get("error")}`);
  if (url.searchParams.get("state") !== state) return fail("State did not match. Start the script again.");
  const code = url.searchParams.get("code");
  if (!code) return fail("No authorisation code received.");
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
    });
    const data = await r.json();
    if (!r.ok || !data.refresh_token) {
      return fail(`No refresh token returned (${data.error ?? r.status}). Remove the app from https://myaccount.google.com/permissions and try again.`);
    }
    res.writeHead(200, { "Content-Type": "text/html" }).end(page("All done", "You can close this tab and go back to the terminal."));
    console.log("\nGMAIL_REFRESH_TOKEN (copy into your environment, never into git):\n");
    console.log(data.refresh_token);
    console.log("");
    server.close(() => process.exit(0));
  } catch (e) {
    fail(`Token request failed: ${e instanceof Error ? e.message : "error"}`);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Sign in as the sender mailbox (tech@dropxlogistics.com) in your browser:\n\n${authUrl}\n`);
  console.log(`Waiting for Google to redirect to ${REDIRECT} ...`);
});
