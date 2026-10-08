import { AppHeader } from "@/components/app-header";
import { NotConfigured } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { userClient } from "@/lib/supabase/server";
import { TicketForm } from "./ticket-form";

export const dynamic = "force-dynamic";

export default async function NewTicketPage({ searchParams }: { searchParams: { portal?: string; page?: string } }) {
  const session = await requireUser();
  if (session.state === "not_configured") return <NotConfigured missing={session.missing} />;
  const { user } = session;
  const supabase = userClient()!;
  const { data } = await supabase
    .from("support_portals")
    .select("code,name")
    .eq("is_active", true)
    .order("sort_order")
    .returns<{ code: string; name: string }[]>();
  const portals = data ?? [];
  // Only known portal codes are accepted, and "page" is treated as plain text.
  const portal = portals.find((p) => p.code === searchParams.portal)?.code ?? "";
  const page = String(searchParams.page ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 2000);

  return (
    <>
      <AppHeader user={user} />
      <main className="container">
        <h1>Raise a ticket</h1>
        <p className="muted" style={{ margin: "0 0 20px" }}>Tell us what is wrong or what you need. It takes about a minute.</p>
        <TicketForm portals={portals} defaultPortal={portal} defaultPage={page} defaultName={user.name} />
      </main>
    </>
  );
}
