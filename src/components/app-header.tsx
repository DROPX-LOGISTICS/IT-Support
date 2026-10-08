import Link from "next/link";
import { signOut } from "@/app/login/actions";
import type { SessionUser } from "@/lib/session";
import { BrandMark } from "./ui";
import { NavLinks } from "./nav-links";

export function AppHeader({ user }: { user: SessionUser }) {
  const initial = (user.name || user.email).trim().charAt(0).toUpperCase();
  return (
    <header className="header">
      <div className="header-in">
        <Link href="/my-tickets" className="brand">
          <BrandMark />
          IT Support
        </Link>
        <NavLinks staff={user.role !== "reporter"} />
        <form action={signOut} className="who">
          <span className="avatar" aria-hidden>{initial}</span>
          <button className="linklike" type="submit">Sign out</button>
        </form>
      </div>
    </header>
  );
}
