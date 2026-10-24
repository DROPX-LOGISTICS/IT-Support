import { ExternalLink, Github, Globe2, GitBranch, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { NotConfigured } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Portal = { id: string; code: string; name: string; site_url: string | null; is_active: boolean };
type Repo = { id: string; portal_id: string; repo: string; path_prefixes: string[] };

export default async function IntegrationsPage() {
  const session = await requireUser();
  if (session.state === "not_configured") return <NotConfigured missing={session.missing} />;
  const db = userClient()!;
  const [{ data: portals }, { data: repos }] = await Promise.all([
    db.from("support_portals").select("id,code,name,site_url,is_active").order("sort_order").returns<Portal[]>(),
    db.from("support_portal_repos").select("id,portal_id,repo,path_prefixes").order("repo").returns<Repo[]>(),
  ]);
  const items = portals ?? [];
  const allRepos = repos ?? [];

  return (
    <AppShell user={session.user} width="mid">
      <div className="page-head">
        <div>
          <p className="eyebrow">Connected systems</p>
          <h1>Systems directory</h1>
          <p className="muted">Live DropX products and the repositories that power them.</p>
        </div>
        <div className="status-pill"><ShieldCheck size={16} aria-hidden /><span className="s-ok">Access controlled</span></div>
      </div>
      <div className="system-grid">
        {items.map((portal) => {
          const portalRepos = allRepos.filter((repo) => repo.portal_id === portal.id);
          return (
            <section className="card system-card" key={portal.id}>
              <div className="system-card-head">
                <div className="system-icon"><Globe2 size={18} aria-hidden /></div>
                <div><h2>{portal.name}</h2><span className="hint">{portal.code}</span></div>
                <span className={`system-status ${portal.is_active ? "live" : "off"}`}>{portal.is_active ? "Active" : "Inactive"}</span>
              </div>
              <div className="system-links">
                {portal.site_url ? <a href={portal.site_url} target="_blank" rel="noreferrer"><ExternalLink size={15} aria-hidden /> Open live site</a> : <span className="muted"><Globe2 size={15} aria-hidden /> Live URL not added</span>}
                {portalRepos.length > 0 ? portalRepos.map((repo) => <a key={repo.id} href={`https://github.com/${repo.repo}`} target="_blank" rel="noreferrer"><Github size={15} aria-hidden /> {repo.repo}<GitBranch size={13} aria-hidden /></a>) : <span className="muted"><Github size={15} aria-hidden /> Repository not linked</span>}
              </div>
              {portalRepos.some((repo) => repo.path_prefixes.length > 0) && <div className="system-scope"><strong>Tracked paths</strong><span>{portalRepos.flatMap((repo) => repo.path_prefixes).join(" · ")}</span></div>}
            </section>
          );
        })}
      </div>
      <div className="card directory-note"><Github size={17} aria-hidden /><div><strong>Keep this directory current</strong><p className="muted">Admins can update live URLs, repositories, and path ownership in Master → Portals and Repositories.</p></div></div>
    </AppShell>
  );
}
