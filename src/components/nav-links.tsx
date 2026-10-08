"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/new", label: "Raise a ticket" },
  { href: "/my-tickets", label: "My tickets" },
];

export function NavLinks({ staff }: { staff: boolean }) {
  const path = usePathname();
  const links = staff ? [{ href: "/queue", label: "Queue" }, ...LINKS] : LINKS;
  return (
    <nav className="nav" aria-label="Main">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
