import Link from "next/link";
import { Eye, LogOut, PlusCircle, ShieldCheck } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { isStaff } from "@/lib/access";
import type { SessionUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { DONE } from "@/lib/status-flow";
import { Avatar, Logo } from "./ui";
import { MobileMenu, NavLinks, TabBar, type NavCounts } from "./nav-links";
import { ViewAsUserButton } from "./view-as-user";

type Width = "narrow" | "mid" | "wide";
type ShellUser = Pick<SessionUser, "id" | "name" | "email" | "role" | "isPreview">;
type ViewUser = { id: string; name: string; email: string; role: string; is_active: boolean };

function UserCard({ user, preview = false }: { user: ShellUser; preview?: boolean }) {
  if (preview) return <div className="side-user"><Avatar name={user.name || user.email} /><div style={{ minWidth: 0 }}><strong title={user.email}>{user.name || user.email}</strong><small>{user.role} · preview</small></div></div>;
  return (
    <form action={signOut} className="side-user">
      <Avatar name={user.name || user.email} />
      <div style={{ minWidth: 0 }}><strong title={user.email}>{user.name || user.email}</strong><small>{user.role}</small></div>
      <button className="icon-btn" type="submit" title="Sign out" aria-label="Sign out"><LogOut size={17} aria-hidden /></button>
    </form>
  );
}

/** The frame around every signed-in page: sidebar on a computer, top bar and bottom bar on a phone. */
export function ShellFrame({ user, counts, viewUsers = [], width = "narrow", preview = false, children }: { user: ShellUser; counts: NavCounts; viewUsers?: ViewUser[]; width?: Width; preview?: boolean; children: React.ReactNode }) {
  const inPreview = preview || Boolean(user.isPreview);
  return (
    <div className="app">
      <aside className="side">
        <Link href="/" className="side-brand">
          <Logo />
          <span className="brand-product"><strong>IT Support</strong><small>Help desk</small></span>
        </Link>
        <div className="side-cta">{inPreview ? <span className="btn wide disabled-action" aria-disabled="true"><PlusCircle size={17} aria-hidden /> Raise a ticket</span> : <Link className="btn wide" href="/new"><PlusCircle size={17} aria-hidden /> Raise a ticket</Link>}</div>
        <div className="side-scroll"><NavLinks role={user.role} counts={counts} /></div>
        {!inPreview && user.role === "admin" && <div className="side-view-as"><ViewAsUserButton users={viewUsers} /></div>}
        <UserCard user={user} preview={inPreview} />
      </aside>

      <div className="main">
        <header className="topbar">
          <Link href="/" aria-label="DropX IT Support, home"><Logo /></Link>
          <span className="spacer" />
          {!inPreview && user.role === "admin" && <ViewAsUserButton users={viewUsers} />}
          {!inPreview && <Link className="btn sm" href="/new"><PlusCircle size={15} aria-hidden /> Raise</Link>}
          <MobileMenu><NavLinks role={user.role} counts={counts} /><UserCard user={user} preview={inPreview} /></MobileMenu>
        </header>
        <main className={`container${width === "narrow" ? "" : ` w-${width}`}`}>
          {inPreview && <div className="preview-session-bar"><Eye size={16} aria-hidden /><div><strong>Viewing as {user.name || user.email}</strong><span>Same role-based access · read-only preview</span></div><span className="system-status live"><ShieldCheck size={13} aria-hidden /> Safe mode</span><a className="back" href="/api/admin/view-as?exit=1">Exit preview</a></div>}
          {children}
        </main>
        <TabBar role={user.role} counts={counts} />
      </div>
    </div>
  );
}

/** Small numbers beside the menu items. A failed count shows nothing; it never breaks the page. */
async function loadCounts(user: ShellUser): Promise<NavCounts> {
  const supabase = userClient();
  if (!supabase) return { confirm: 0, unassigned: 0 };
  try {
    const base = () => supabase.from("support_tickets").select("id", { count: "exact", head: true }).is("deleted_at", null);
    const [confirm, unassigned] = await Promise.all([
      base().eq("reporter_id", user.id).eq("status", DONE),
      isStaff(user.role) ? base().is("assignee_id", null).not("status", "in", '("Closed","Not viable")') : Promise.resolve({ count: 0 }),
    ]);
    return { confirm: confirm.count ?? 0, unassigned: unassigned.count ?? 0 };
  } catch {
    return { confirm: 0, unassigned: 0 };
  }
}

export async function AppShell({ user, width, children }: { user: SessionUser; width?: Width; children: React.ReactNode }) {
  const supabase = userClient();
  const viewUsers = user.role === "admin" && !user.isPreview && supabase ? (await supabase.from("support_users").select("id,name,email,role,is_active").order("name").returns<ViewUser[]>()).data ?? [] : [];
  return <ShellFrame user={user} counts={await loadCounts(user)} viewUsers={viewUsers} preview={Boolean(user.isPreview)} width={width}>{children}</ShellFrame>;
}
