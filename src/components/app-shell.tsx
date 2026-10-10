import Link from "next/link";
import { LogOut, PlusCircle } from "lucide-react";
import { signOut } from "@/app/login/actions";
import { isStaff } from "@/lib/access";
import type { SessionUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { DONE } from "@/lib/status-flow";
import { Avatar, Logo } from "./ui";
import { MobileMenu, NavLinks, TabBar, type NavCounts } from "./nav-links";

type Width = "narrow" | "mid" | "wide";
type ShellUser = Pick<SessionUser, "id" | "name" | "email" | "role">;

function UserCard({ user }: { user: ShellUser }) {
  return (
    <form action={signOut} className="side-user">
      <Avatar name={user.name || user.email} />
      <div style={{ minWidth: 0 }}><strong title={user.email}>{user.name || user.email}</strong><small>{user.role}</small></div>
      <button className="icon-btn" type="submit" title="Sign out" aria-label="Sign out"><LogOut size={17} aria-hidden /></button>
    </form>
  );
}

/** The frame around every signed-in page: sidebar on a computer, top bar and bottom bar on a phone. */
export function ShellFrame({ user, counts, width = "narrow", children }: { user: ShellUser; counts: NavCounts; width?: Width; children: React.ReactNode }) {
  return (
    <div className="app">
      <aside className="side">
        <Link href="/" className="side-brand">
          <Logo />
          <span className="brand-product"><strong>IT Support</strong><small>Help desk</small></span>
        </Link>
        <div className="side-cta"><Link className="btn wide" href="/new"><PlusCircle size={17} aria-hidden /> Raise a ticket</Link></div>
        <div className="side-scroll"><NavLinks role={user.role} counts={counts} /></div>
        <UserCard user={user} />
      </aside>

      <div className="main">
        <header className="topbar">
          <Link href="/" aria-label="DropX IT Support, home"><Logo /></Link>
          <span className="spacer" />
          <Link className="btn sm" href="/new"><PlusCircle size={15} aria-hidden /> Raise</Link>
          <MobileMenu><NavLinks role={user.role} counts={counts} /><UserCard user={user} /></MobileMenu>
        </header>
        <main className={`container${width === "narrow" ? "" : ` w-${width}`}`}>{children}</main>
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
      isStaff(user.role) ? base().is("assignee_id", null).in("status", ["New", "Viable check", "Reopened"]) : Promise.resolve({ count: 0 }),
    ]);
    return { confirm: confirm.count ?? 0, unassigned: unassigned.count ?? 0 };
  } catch {
    return { confirm: 0, unassigned: 0 };
  }
}

export async function AppShell({ user, width, children }: { user: SessionUser; width?: Width; children: React.ReactNode }) {
  return <ShellFrame user={user} counts={await loadCounts(user)} width={width}>{children}</ShellFrame>;
}
