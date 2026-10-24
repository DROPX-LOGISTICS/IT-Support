import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarDays, CheckCircle2, ExternalLink, Github, KeyRound, Mail, Plug, ShieldCheck, Table2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { NotConfigured } from "@/components/ui";
import { canManageMaster } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { loadSettings } from "@/lib/targets-server";
import { appUrl } from "@/lib/config";
import { integrationSummaries } from "@/lib/integrations";
import { oauthCallback } from "@/lib/oauth";
import { PRIORITIES, PRIORITY_LABEL } from "@/lib/tickets";
import { updateSettings, addDeveloper, addPortal, addRepo, deleteRepo, dismissUnmatched, mapUnmatched, seedKnownSystems, setUserAccess, updateDeveloper, updatePortal, updateRepo } from "./actions";
import { disconnectIntegrationAction, saveOAuthAppAction, testIntegrationAction } from "./integration-actions";

export const dynamic = "force-dynamic";
const TABS = [["portals", "Portals"], ["repos", "Repositories"], ["developers", "Developers"], ["people", "People & access"], ["unmatched", "Unmatched commits"], ["settings", "Settings"], ["integrations", "Integrations"]] as const;

type Portal = { id: string; code: string; name: string; site_url: string | null; is_active: boolean; sort_order: number };
type Repo = { id: string; repo: string; portal_id: string; path_prefixes: string[] };
type Dev = { id: string; user_id: string | null; display_name: string; github_logins: string[]; commit_author_names: string[]; commit_author_emails: string[]; is_active: boolean };
type Person = { id: string; email: string; name: string; role: string; is_active: boolean };
type Unmatched = { id: string; repo: string; sha: string; commit_date: string; author_login: string | null; author_name: string | null; author_email: string | null; subject: string };

export default async function MasterPage({ searchParams }: { searchParams: { tab?: string; saved?: string; error?: string } }) {
  const session = await requireUser();
  if (session.state === "not_configured") return <NotConfigured missing={session.missing} />;
  const { user } = session;
  if (!canManageMaster({ id: user.id, role: user.role, isActive: true })) redirect("/my-tickets");
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "portals";
  const supabase = userClient()!;

  const [portals, repos, devs, people, unmatched] = await Promise.all([
    supabase.from("support_portals").select("*").order("sort_order").returns<Portal[]>(),
    supabase.from("support_portal_repos").select("id,repo,portal_id,path_prefixes").order("repo").returns<Repo[]>(),
    supabase.from("support_developers").select("*").order("display_name").returns<Dev[]>(),
    supabase.from("support_users").select("id,email,name,role,is_active").order("name").returns<Person[]>(),
    supabase.from("support_unmatched_commits").select("*").order("commit_date", { ascending: false }).limit(100).returns<Unmatched[]>(),
  ]);
  const P = portals.data ?? [], R = repos.data ?? [], D = devs.data ?? [], U = people.data ?? [], X = unmatched.data ?? [];
  const cfg = await loadSettings(supabase);
  const integrations = tab === "integrations" ? await integrationSummaries() : null;
  const staffUsers = U.filter((u) => u.role !== "reporter");
  const portalName = (id: string) => P.find((p) => p.id === id)?.name ?? "";
  const Field = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => <div className={className}><label className="field">{label}</label>{children}</div>;

  return (
    <AppShell user={user} width="mid">
        <p className="eyebrow">Admin</p>
        <h1>Master</h1>
        <p className="muted" style={{ margin: "0 0 14px" }}>Portals, repositories, developers and who can do what. Admins only.</p>
        <div className="tabs master-tabs">
          {TABS.map(([k, label]) => <Link key={k} href={`/master?tab=${k}`} aria-current={tab === k}>{label}{k === "unmatched" && X.length ? ` (${X.length})` : ""}</Link>)}
        </div>
        {searchParams.saved && <div className="banner ok" role="status"><CheckCircle2 size={18} aria-hidden /> <div>{searchParams.saved.slice(0, 200)}</div></div>}
        {searchParams.error && <div className="banner bad" role="alert"><AlertTriangle size={18} aria-hidden /> <div>{searchParams.error.slice(0, 200)}</div></div>}

        {tab === "portals" && (
          <div className="stack">
            <div className="card seed-card"><div><strong>Sync the DropX systems directory</strong><p className="hint">Adds or refreshes all approved product links, repositories, path mappings, and developer GitHub identities. Safe to run again.</p></div><form action={seedKnownSystems}><button className="btn sm" type="submit">Sync known systems</button></form></div>
            <div className="master-records">
              {P.map((p) => (
                <form key={p.id} action={updatePortal} className="card master-card portal-record">
                  <input type="hidden" name="id" value={p.id} />
                  <Field className="record-name" label="Portal"><div className="input-with-tag"><input type="text" name="name" defaultValue={p.name} maxLength={60} required /><span>{p.code}</span></div></Field>
                  <Field className="record-url" label="Site address"><input type="url" name="siteUrl" defaultValue={p.site_url ?? ""} placeholder="https://" /></Field>
                  <Field className="record-order" label="Order"><input type="text" name="sortOrder" defaultValue={p.sort_order} inputMode="numeric" /></Field>
                  <label className="compact-check"><input type="checkbox" name="active" defaultChecked={p.is_active} /> Active</label>
                  <button className="btn sm" type="submit">Save</button>
                </form>
              ))}
            </div>
            <details className="card master-create">
              <summary><span>Add a portal</span><small>Create another system entry</small></summary>
              <form action={addPortal} className="portal-record portal-add-record">
                <Field className="record-name" label="Name"><input type="text" name="name" maxLength={60} required /></Field>
                <Field className="record-code" label="Code (optional)"><input type="text" name="code" placeholder="made from the name" /></Field>
                <Field className="record-url" label="Site address"><input type="url" name="siteUrl" placeholder="https://" /></Field>
                <Field className="record-order" label="Order"><input type="text" name="sortOrder" defaultValue="100" inputMode="numeric" /></Field>
                <button className="btn sm" type="submit">Add portal</button>
              </form>
            </details>
          </div>
        )}

        {tab === "repos" && (
          <div className="stack">
            <p className="hint" style={{ margin: 0 }}>A repository with no path prefixes belongs wholly to its portal. When one repository serves several portals, separate its path prefixes with commas; the row with no prefixes catches everything else.</p>
            <div className="master-records">
              {R.map((r) => (
                <form key={r.id} action={updateRepo} className="card master-card repo-record">
                  <input type="hidden" name="id" value={r.id} />
                  <div className="repo-identity"><label className="field">Repository</label><a href={`https://github.com/${r.repo}`} target="_blank" rel="noreferrer">{r.repo}<ExternalLink size={12} aria-hidden /></a><small>{portalName(r.portal_id)}</small></div>
                  <Field label="Portal"><select name="portalId" defaultValue={r.portal_id}>{P.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                  <Field label="Path prefixes"><input type="text" name="prefixes" defaultValue={r.path_prefixes.join(", ")} placeholder="Blank = whole repository" /></Field>
                  <div className="record-actions"><button className="btn ghost sm danger-text" type="submit" formAction={deleteRepo}>Remove</button><button className="btn sm" type="submit">Save</button></div>
                </form>
              ))}
            </div>
            <details className="card master-create">
              <summary><span>Add a repository</span><small>Use owner/name from GitHub</small></summary>
              <form action={addRepo} className="repo-record repo-add-record">
                <Field label="Repository (owner/name)"><input type="text" name="repo" placeholder="nisar-dropx/dropx-hrms" required /></Field>
                <Field label="Portal"><select name="portalId" required defaultValue=""><option value="" disabled>Choose…</option>{P.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                <Field label="Path prefixes"><input type="text" name="prefixes" placeholder="Optional; separate with commas" /></Field>
                <button className="btn sm" type="submit">Add repository</button>
              </form>
            </details>
          </div>
        )}

        {tab === "developers" && (
          <div className="stack">
            <p className="hint" style={{ margin: 0 }}>Commits are matched to a developer by GitHub login, then commit email, then commit name. Give each person the identities they commit with.</p>
            <div className="master-records">
              {D.map((d) => (
                <form key={d.id} action={updateDeveloper} className="card master-card developer-record">
                  <input type="hidden" name="id" value={d.id} />
                  <Field label="Developer"><input type="text" name="displayName" defaultValue={d.display_name} maxLength={80} required /></Field>
                  <Field label="Signs in as"><select name="userId" defaultValue={d.user_id ?? ""}><option value="">Not linked</option>{staffUsers.map((u) => <option key={u.id} value={u.id}>{u.name || u.email} ({u.email})</option>)}</select></Field>
                  <label className="compact-check"><input type="checkbox" name="active" defaultChecked={d.is_active} /> Active</label>
                  <button className="btn sm" type="submit">Save</button>
                  <details className="identity-editor">
                    <summary><span>Commit matching</span><small>{d.github_logins.length ? `@${d.github_logins.join(", @")}` : "Add GitHub login, email or author name"}</small></summary>
                    <div className="identity-grid">
                      <Field label="GitHub logins"><input type="text" name="logins" defaultValue={d.github_logins.join(", ")} placeholder="login, another-login" /></Field>
                      <Field label="Commit emails"><input type="text" name="emails" defaultValue={d.commit_author_emails.join(", ")} placeholder="name@company.com" /></Field>
                      <Field label="Commit names"><input type="text" name="names" defaultValue={d.commit_author_names.join(", ")} placeholder="Author names" /></Field>
                    </div>
                  </details>
                </form>
              ))}
            </div>
            <details className="card master-create">
              <summary><span>Add a developer</span><small>Link a person and their commit identity</small></summary>
              <form action={addDeveloper} className="developer-record developer-add-record">
                <Field label="Developer"><input type="text" name="displayName" maxLength={80} required /></Field>
                <Field label="Signs in as"><select name="userId" defaultValue=""><option value="">Not linked yet</option>{staffUsers.map((u) => <option key={u.id} value={u.id}>{u.name || u.email} ({u.email})</option>)}</select></Field>
                <button className="btn sm" type="submit">Add developer</button>
                <details className="identity-editor">
                  <summary><span>Commit matching (optional)</span><small>Add GitHub login, email or author name</small></summary>
                  <div className="identity-grid">
                    <Field label="GitHub logins"><input type="text" name="logins" placeholder="login, another-login" /></Field>
                    <Field label="Commit emails"><input type="text" name="emails" placeholder="name@company.com" /></Field>
                    <Field label="Commit names"><input type="text" name="names" placeholder="Author names" /></Field>
                  </div>
                </details>
              </form>
            </details>
          </div>
        )}

        {tab === "people" && (
          <div className="stack">
            <p className="hint" style={{ margin: 0 }}>People appear here after their first sign-in. New people start as reporters. Only developers appear in the assignee list.</p>
            {U.map((u) => (
              <form key={u.id} action={setUserAccess} className="card master-card people-record">
                <input type="hidden" name="id" value={u.id} />
                <div className="person-identity"><strong>{u.name || u.email}</strong><span>{u.email}</span></div>
                <select name="role" defaultValue={u.role} disabled={u.id === user.id} aria-label={`Role for ${u.name || u.email}`}>
                  {["reporter", "developer", "manager", "admin"].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <label className="compact-check"><input type="checkbox" name="active" defaultChecked={u.is_active} disabled={u.id === user.id} /> Active</label>
                <button className="btn sm" type="submit" disabled={u.id === user.id}>{u.id === user.id ? "You" : "Save"}</button>
              </form>
            ))}
          </div>
        )}


        {tab === "settings" && (
          <form action={updateSettings} className="stack">
            <section className="card">
              <div className="section-title">Targets (hours, wall-clock)</div>
              <p className="hint" style={{ marginTop: 0 }}>A ticket past its response or fix target shows as overdue. A reopened ticket&apos;s fix clock restarts at the reopen. Tickets waiting for the reporter are never overdue.</p>
              <div className="table-wrap"><table className="plain">
                <thead><tr><th>Priority</th><th className="n">Respond within</th><th className="n">Fix within</th></tr></thead>
                <tbody>{PRIORITIES.map((p) => (
                  <tr key={p}><td>{p} · {PRIORITY_LABEL[p]}</td>
                    <td className="n"><input type="text" inputMode="numeric" name={`response_${p}`} defaultValue={cfg.targets.response[p]} style={{ width: 90, textAlign: "right" }} aria-label={`${p} response hours`} /></td>
                    <td className="n"><input type="text" inputMode="numeric" name={`fix_${p}`} defaultValue={cfg.targets.fix[p]} style={{ width: 90, textAlign: "right" }} aria-label={`${p} fix hours`} /></td></tr>
                ))}</tbody>
              </table></div>
            </section>
            <section className="card grid2">
              <div className="section-title" style={{ gridColumn: "1 / -1", marginBottom: 0 }}>Waiting for the reporter</div>
              <Field label="Remind after (days)"><input type="text" inputMode="numeric" name="reminder_days" defaultValue={cfg.reminderDays} /></Field>
              <Field label="Close automatically after (days)"><input type="text" inputMode="numeric" name="auto_close_days" defaultValue={cfg.autoCloseDays} /></Field>
            </section>
            <section className="card">
              <div className="section-title">Emails to send</div>
              {([["n_raised", "raised", "A ticket is raised"], ["n_assigned", "assigned", "A ticket is assigned"], ["n_status", "status", "Status, update, reopen, not viable and Meet changes"], ["n_comment", "comment", "A comment is added"], ["n_confirmation", "confirmation", "Confirmation request and reminder"]] as const).map(([name, key, label]) => (
                <label key={name} style={{ display: "flex", gap: 8, alignItems: "center", margin: "6px 0" }}><input type="checkbox" name={name} defaultChecked={cfg.notify[key] !== false} /> {label}</label>
              ))}
            </section>
            <div className="actions"><button className="btn" type="submit">Save settings</button></div>
          </form>
        )}

        {tab === "integrations" && integrations && (
          <div className="stack compact-stack">
            <section className="integration-hero">
              <div className="integration-hero-icon"><Plug size={20} aria-hidden /></div>
              <div><strong>Connect once. Use everywhere.</strong><p>Tokens are encrypted before they are stored in Cloudflare KV. Values are never sent to the browser again.</p></div>
              <span className={`system-status ${integrations.google.storageReady ? "live" : "off"}`}>{integrations.google.storageReady ? "Secure storage ready" : "Storage unavailable"}</span>
            </section>

            <div className="integration-grid">
              {(["google", "github"] as const).map((provider) => {
                const item = integrations[provider];
                const google = provider === "google";
                const Icon = google ? Mail : Github;
                return (
                  <section key={provider} className="card integration-card">
                    <div className="integration-head">
                      <span className={`provider-icon ${provider}`}><Icon size={19} aria-hidden /></span>
                      <div><h2>{google ? "Google Workspace" : "GitHub"}</h2><span className="hint">{google ? "Gmail · Calendar · Meet · Sheets" : "Repositories · commits · daily updates"}</span></div>
                      <span className={`system-status ${item.connected ? "live" : "off"}`}>{item.connected ? "Connected" : item.appConfigured ? "Ready to connect" : "Setup needed"}</span>
                    </div>
                    {item.connected ? (
                      <div className="connection-account"><CheckCircle2 size={16} aria-hidden /><div><strong>{item.account ?? "Connected securely"}</strong><span>{item.source === "dashboard" ? "Connected from this dashboard" : "Provided by the worker environment"}</span></div></div>
                    ) : <p className="muted integration-copy">{google ? "Send ticket email, create Meet sessions, and export directly to Sheets." : "Read approved repositories and draft developer updates from commits."}</p>}
                    {google && <div className="capability-row"><span><Mail size={13} /> Gmail</span><span><CalendarDays size={13} /> Meet</span><span><Table2 size={13} /> Sheets</span></div>}
                    {item.lastError && <div className="mini-alert"><AlertTriangle size={14} /> {item.lastError}</div>}
                    <div className="integration-actions">
                      {item.appConfigured && !item.connected && <a className="btn sm" href={`/api/integrations/${provider}/start`}><ExternalLink size={14} /> Connect {google ? "Google" : "GitHub"}</a>}
                      {item.connected && <form action={testIntegrationAction}><input type="hidden" name="provider" value={provider} /><button className="btn ghost sm" type="submit">Test connection</button></form>}
                      {item.connected && item.source === "dashboard" && <form action={disconnectIntegrationAction}><input type="hidden" name="provider" value={provider} /><button className="linklike danger-link" type="submit">Disconnect</button></form>}
                    </div>
                    <details className="integration-setup" open={!item.appConfigured}>
                      <summary><KeyRound size={14} /> {item.appConfigured ? "Replace OAuth app" : "Set up OAuth app"}</summary>
                      <form action={saveOAuthAppAction} className="compact-form">
                        <input type="hidden" name="provider" value={provider} />
                        <p className="oauth-help">Create a Web OAuth app in <a href={google ? "https://console.cloud.google.com/apis/credentials" : "https://github.com/settings/applications/new"} target="_blank" rel="noreferrer">{google ? "Google Cloud" : "GitHub settings"} <ExternalLink size={11} /></a>, then register the callback below.</p>
                        <label><span>Client ID</span><input name="clientId" type="text" autoComplete="off" required placeholder={google ? "Google OAuth client ID" : "GitHub OAuth client ID"} /></label>
                        <label><span>Client secret</span><input name="clientSecret" type="password" autoComplete="new-password" required placeholder="Stored encrypted" /></label>
                        <label className="callback-field"><span>Callback URL</span><code>{oauthCallback(provider)}</code></label>
                        <button className="btn sm" type="submit">Save OAuth app</button>
                      </form>
                    </details>
                  </section>
                );
              })}
            </div>

            <section className="infra-grid">
              {([
                ["Scheduled jobs", Boolean(process.env.CRON_SECRET?.trim()), "Daily drafts, reminders and auto-close."],
                ["Service role", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()), "Private attachments and background jobs."],
                ["Secure token vault", integrations.google.storageReady, "Encrypted OAuth credentials in Cloudflare KV."],
              ] as const).map(([name, ok, description]) => <div className="card infra-card" key={name}><ShieldCheck size={17} /><div><strong>{name}</strong><span>{description}</span></div><span className={ok ? "s-ok" : "s-off"}>{ok ? "Ready" : "Missing"}</span></div>)}
            </section>
          </div>
        )}

        {tab === "unmatched" && (
          <div className="stack">
            <p className="hint" style={{ margin: 0 }}>Commits whose author matches no developer. Choose the developer they belong to; their identity is added so future commits match.</p>
            {X.length === 0 && <div className="card empty"><h2>Nothing to map</h2><p className="muted" style={{ margin: 0 }}>Every commit matched a developer.</p></div>}
            {X.map((c) => (
              <div key={c.id} className="card">
                <div className="meta" style={{ marginTop: 0 }}><span>{c.repo}</span><span>{fmtDate(c.commit_date)}</span><span className="num">{c.sha.slice(0, 7)}</span></div>
                <h2 style={{ overflowWrap: "anywhere" }}>{c.subject || "(no message)"}</h2>
                <div className="muted" style={{ overflowWrap: "anywhere" }}>{[c.author_name, c.author_email, c.author_login && `@${c.author_login}`].filter(Boolean).join(" · ")}</div>
                <form action={mapUnmatched} className="actions" style={{ marginTop: 10, justifyContent: "flex-start" }}>
                  <input type="hidden" name="commitId" value={c.id} />
                  <select name="developerId" required defaultValue="" style={{ width: "auto", maxWidth: "100%" }} aria-label="Developer"><option value="" disabled>Belongs to…</option>{D.map((d) => <option key={d.id} value={d.id}>{d.display_name}</option>)}</select>
                  <button className="btn" type="submit">Map</button>
                </form>
                <form action={dismissUnmatched} style={{ marginTop: 6 }}><input type="hidden" name="commitId" value={c.id} /><button className="linklike" type="submit">Dismiss (not our work)</button></form>
              </div>
            ))}
          </div>
        )}
    </AppShell>
  );
}
