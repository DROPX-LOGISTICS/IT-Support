import Link from "next/link";
import { LogOut, PlusCircle } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { isStaff } from "@/lib/access";
import type { SessionUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { DONE } from "@/lib/status-flow";
import { Avatar, Logo } from "./ui";
import { MobileMenu, NavLinks, TabBar, type NavCounts } from "./nav-links";
import { ViewAsUserButton } from "./view-as-user";

type Width = "narrow" | "mid" | "wide";
type ShellUser = Pick<SessionUser, "id" | "name" | "email" | "role">;
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
  const homeHref = preview ? `/admin/view-as?user=${encodeURIComponent(user.id)}&view=%2F` : "/";
  return (
    <div className="app">
      <aside className="side">
        <Link href={homeHref} className="side-brand">
          <Logo />
          <span className="brand-product"><strong>IT Support</strong><small>Help desk</small></span>
        </Link>
        <div className="side-cta">{preview ? <span className="btn wide disabled-action" aria-disabled="true"><PlusCircle size={17} aria-hidden /> Raise a ticket</span> : <Link className="btn wide" href="/new"><PlusCircle size={17} aria-hidden /> Raise a ticket</Link>}</div>
        <div className="side-scroll"><NavLinks role={user.role} counts={counts} previewUserId={preview ? user.id : undefined} /></div>
        {!preview && user.role === "admin" && <div className="side-view-as"><ViewAsUserButton users={viewUsers} /></div>}
        <UserCard user={user} preview={preview} />
      </aside>

      <div className="main">
        <header className="topbar">
          <Link href={homeHref} aria-label="DropX IT Support, home"><Logo /></Link>
          <span className="spacer" />
          {!preview && user.role === "admin" && <ViewAsUserButton users={viewUsers} />}
          {!preview && <Link className="btn sm" href="/new"><PlusCircle size={15} aria-hidden /> Raise</Link>}
          <MobileMenu><NavLinks role={user.role} counts={counts} previewUserId={preview ? user.id : undefined} /><UserCard user={user} preview={preview} /></MobileMenu>
        </header>
        <main className={`container${width === "narrow" ? "" : ` w-${width}`}`}>{children}</main>
        <TabBar role={user.role} counts={counts} previewUserId={preview ? user.id : undefined} />
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
  const viewUsers = user.role === "admin" && supabase ? (await supabase.from("support_users").select("id,name,email,role,is_active").order("name").returns<ViewUser[]>()).data ?? [] : [];
  return <ShellFrame user={user} counts={await loadCounts(user)} viewUsers={viewUsers} width={width}>{children}</ShellFrame>;
}
