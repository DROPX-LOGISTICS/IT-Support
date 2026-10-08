import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { NotConfigured } from "@/components/ui";
import { canManageMaster } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { fmtDate } from "@/lib/format";
import { addDeveloper, addPortal, addRepo, deleteRepo, dismissUnmatched, mapUnmatched, setUserAccess, updateDeveloper, updatePortal, updateRepo } from "./actions";

export const dynamic = "force-dynamic";
const TABS = [["portals", "Portals"], ["repos", "Repositories"], ["developers", "Developers"], ["people", "People & access"], ["unmatched", "Unmatched commits"]] as const;

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
  const staffUsers = U.filter((u) => u.role !== "reporter");
  const portalName = (id: string) => P.find((p) => p.id === id)?.name ?? "";
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <div><label className="field">{label}</label>{children}</div>;

  return (
    <>
      <AppHeader user={user} />
      <main className="container" style={{ maxWidth: 900 }}>
        <h1>Master</h1>
        <p className="muted" style={{ margin: "0 0 14px" }}>Portals, repositories, developers and who can do what. Admins only.</p>
        <div className="tabs" style={{ flexWrap: "wrap", margin: "0 0 16px" }}>
          {TABS.map(([k, label]) => <Link key={k} href={`/master?tab=${k}`} aria-current={tab === k}>{label}{k === "unmatched" && X.length ? ` (${X.length})` : ""}</Link>)}
        </div>
        {searchParams.saved && <div className="banner ok" role="status"><CheckCircle2 size={18} aria-hidden /> <div>{searchParams.saved.slice(0, 200)}</div></div>}
        {searchParams.error && <div className="banner bad" role="alert"><AlertTriangle size={18} aria-hidden /> <div>{searchParams.error.slice(0, 200)}</div></div>}

        {tab === "portals" && (
          <div className="stack">
            {P.map((p) => (
              <form key={p.id} action={updatePortal} className="card grid2">
                <input type="hidden" name="id" value={p.id} />
                <Field label={`Name (${p.code})`}><input type="text" name="name" defaultValue={p.name} maxLength={60} required /></Field>
                <Field label="Site address"><input type="text" name="siteUrl" defaultValue={p.site_url ?? ""} placeholder="https://" /></Field>
                <Field label="Order"><input type="text" name="sortOrder" defaultValue={p.sort_order} inputMode="numeric" /></Field>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
                  <label className="hint"><input type="checkbox" name="active" defaultChecked={p.is_active} /> Active</label>
                  <button className="btn" type="submit">Save</button>
                </div>
              </form>
            ))}
            <form action={addPortal} className="card grid2">
              <div className="section-title" style={{ gridColumn: "1 / -1", marginBottom: 0 }}>Add a portal</div>
              <Field label="Name"><input type="text" name="name" maxLength={60} required /></Field>
              <Field label="Code (optional)"><input type="text" name="code" placeholder="made from the name" /></Field>
              <Field label="Site address"><input type="text" name="siteUrl" placeholder="https://" /></Field>
              <Field label="Order"><input type="text" name="sortOrder" defaultValue="100" inputMode="numeric" /></Field>
              <div style={{ gridColumn: "1 / -1" }} className="actions"><button className="btn" type="submit">Add portal</button></div>
            </form>
          </div>
        )}

        {tab === "repos" && (
          <div className="stack">
            <p className="hint" style={{ margin: 0 }}>A repository with no path prefixes belongs wholly to its portal. When one repository serves several portals, give the specific ones prefixes (one per line); the row with no prefixes catches everything else.</p>
            {R.map((r) => (
              <div key={r.id} className="card">
                <form action={updateRepo} className="grid2">
                  <input type="hidden" name="id" value={r.id} />
                  <div style={{ gridColumn: "1 / -1", fontWeight: 700, overflowWrap: "anywhere" }}>{r.repo}</div>
                  <Field label="Portal"><select name="portalId" defaultValue={r.portal_id}>{P.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                  <Field label="Path prefixes (one per line)"><textarea name="prefixes" defaultValue={r.path_prefixes.join("\n")} style={{ minHeight: 60 }} /></Field>
                  <div className="actions" style={{ gridColumn: "1 / -1" }}><button className="btn" type="submit">Save</button></div>
                </form>
                <form action={deleteRepo} className="actions" style={{ marginTop: 8 }}><input type="hidden" name="id" value={r.id} /><button className="linklike" type="submit">Remove {r.repo} from {portalName(r.portal_id)}</button></form>
              </div>
            ))}
            <form action={addRepo} className="card grid2">
              <div className="section-title" style={{ gridColumn: "1 / -1", marginBottom: 0 }}>Add a repository</div>
              <Field label="Repository (owner/name)"><input type="text" name="repo" placeholder="nisar-dropx/dropx-hrms" required /></Field>
              <Field label="Portal"><select name="portalId" required defaultValue=""><option value="" disabled>Choose…</option>{P.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <div style={{ gridColumn: "1 / -1" }}><Field label="Path prefixes (optional, one per line)"><textarea name="prefixes" style={{ minHeight: 60 }} /></Field></div>
              <div style={{ gridColumn: "1 / -1" }} className="actions"><button className="btn" type="submit">Add repository</button></div>
            </form>
          </div>
        )}

        {tab === "developers" && (
          <div className="stack">
            <p className="hint" style={{ margin: 0 }}>Commits are matched to a developer by GitHub login, then commit email, then commit name. Give each person the identities they commit with.</p>
            {D.map((d) => (
              <form key={d.id} action={updateDeveloper} className="card grid2">
                <input type="hidden" name="id" value={d.id} />
                <Field label="Name"><input type="text" name="displayName" defaultValue={d.display_name} maxLength={80} required /></Field>
                <Field label="Signs in as"><select name="userId" defaultValue={d.user_id ?? ""}><option value="">Not linked</option>{staffUsers.map((u) => <option key={u.id} value={u.id}>{u.name || u.email} ({u.email})</option>)}</select></Field>
                <Field label="GitHub logins"><textarea name="logins" defaultValue={d.github_logins.join("\n")} style={{ minHeight: 56 }} /></Field>
                <Field label="Commit emails"><textarea name="emails" defaultValue={d.commit_author_emails.join("\n")} style={{ minHeight: 56 }} /></Field>
                <Field label="Commit names"><textarea name="names" defaultValue={d.commit_author_names.join("\n")} style={{ minHeight: 56 }} /></Field>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                  <label className="hint"><input type="checkbox" name="active" defaultChecked={d.is_active} /> Active</label><button className="btn" type="submit">Save</button>
                </div>
              </form>
            ))}
            <form action={addDeveloper} className="card grid2">
              <div className="section-title" style={{ gridColumn: "1 / -1", marginBottom: 0 }}>Add a developer</div>
              <Field label="Name"><input type="text" name="displayName" maxLength={80} required /></Field>
              <Field label="Signs in as"><select name="userId" defaultValue=""><option value="">Not linked yet</option>{staffUsers.map((u) => <option key={u.id} value={u.id}>{u.name || u.email} ({u.email})</option>)}</select></Field>
              <Field label="GitHub logins"><textarea name="logins" style={{ minHeight: 56 }} /></Field>
              <Field label="Commit emails"><textarea name="emails" style={{ minHeight: 56 }} /></Field>
              <Field label="Commit names"><textarea name="names" style={{ minHeight: 56 }} /></Field>
              <div className="actions" style={{ alignItems: "flex-end" }}><button className="btn" type="submit">Add developer</button></div>
            </form>
          </div>
        )}

        {tab === "people" && (
          <div className="stack">
            <p className="hint" style={{ margin: 0 }}>People appear here after their first sign-in. New people start as reporters. Only developers appear in the assignee list.</p>
            {U.map((u) => (
              <form key={u.id} action={setUserAccess} className="card grid2">
                <input type="hidden" name="id" value={u.id} />
                <div style={{ overflowWrap: "anywhere" }}><strong>{u.name || u.email}</strong><div className="muted">{u.email}</div></div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <select name="role" defaultValue={u.role} disabled={u.id === user.id} style={{ width: "auto" }} aria-label="Role">
                    {["reporter", "developer", "manager", "admin"].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <label className="hint"><input type="checkbox" name="active" defaultChecked={u.is_active} disabled={u.id === user.id} /> Active</label>
                  <button className="btn" type="submit" disabled={u.id === user.id}>{u.id === user.id ? "You" : "Save"}</button>
                </div>
              </form>
            ))}
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
      </main>
    </>
  );
}
