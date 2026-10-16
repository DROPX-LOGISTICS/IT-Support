"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardList, Columns3, Home, Inbox, Menu, PlusCircle, Settings2, Ticket, type LucideIcon } from "lucide-react";

export type NavCounts = { confirm: number; unassigned: number };
type Item = { href: string; label: string; short?: string; icon: LucideIcon; count?: number; countLabel?: string };
type Group = { label: string; items: Item[] };

function groups(role: string, counts: NavCounts): Group[] {
  const staff = role !== "reporter";
  const out: Group[] = [{
    label: "Support",
    items: [
      { href: "/", label: "Home", icon: Home },
      { href: "/new", label: "Raise a ticket", short: "Raise", icon: PlusCircle },
      { href: "/my-tickets", label: "My tickets", short: "Mine", icon: Ticket, count: counts.confirm, countLabel: "waiting for your answer" },
    ],
  }];
  if (staff) out.push({
    label: "Team",
    items: [
      { href: "/queue", label: "Queue", icon: Inbox, count: counts.unassigned, countLabel: "open and unassigned" },
      { href: "/board", label: "Board", icon: Columns3 },
      { href: "/daily-updates", label: "Daily updates", short: "Updates", icon: ClipboardList },
    ],
  });
  if (role === "admin" || role === "manager") out.push({ label: "Insights", items: [{ href: "/summary", label: "Summary", icon: BarChart3 }] });
  if (role === "admin") out.push({ label: "Admin", items: [{ href: "/master", label: "Master", icon: Settings2 }] });
  return out;
}

const isCurrent = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** The full menu: the sidebar on a computer, the drop-down on a phone. */
export function NavLinks({ role, counts }: { role: string; counts: NavCounts }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {groups(role, counts).map((g) => (
        <div key={g.label} className="nav" role="group" aria-label={g.label}>
          <div className="nav-label">{g.label}</div>
          {g.items.map((l) => (
            <Link key={l.href} href={l.href} aria-current={isCurrent(path, l.href) ? "page" : undefined}>
              <l.icon size={17} aria-hidden /> {l.label}
              {l.count ? <b title={`${l.count} ${l.countLabel}`}>{l.count > 99 ? "99+" : l.count}<span className="sr-only"> {l.countLabel}</span></b> : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

/** The phone menu. It closes when a link is followed, on Escape, and on a tap outside it. */
export function MobileMenu({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (ref.current) ref.current.open = false; }, [path]);
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
  return (
    <details className="menu" ref={ref}>
      <summary className="icon-btn" aria-label="Menu"><Menu size={20} aria-hidden /></summary>
      <div className="menu-panel">{children}</div>
    </details>
  );
}

/** The most used pages, as a bar along the bottom of a phone. */
export function TabBar({ role, counts }: { role: string; counts: NavCounts }) {
  const path = usePathname();
  const all = groups(role, counts).flatMap((g) => g.items);
  const order = role === "reporter" ? ["/", "/new", "/my-tickets"] : ["/", "/queue", "/new", "/board", "/my-tickets"];
  const items = order.map((h) => all.find((i) => i.href === h)).filter((i): i is Item => Boolean(i));
  return (
    <nav className="tabbar" aria-label="Quick links">
      {items.map((l) => (
        <Link key={l.href} href={l.href} aria-current={isCurrent(path, l.href) ? "page" : undefined}>
          <l.icon size={20} aria-hidden />
          <span>{l.short ?? l.label}</span>
          {l.count ? <b aria-hidden>{l.count > 9 ? "9+" : l.count}</b> : null}
        </Link>
      ))}
    </nav>
  );
}
