import { requireUser } from "@/lib/supabase/server";
import { ensureDefaultCategories } from "@/lib/sync";
import { Nav } from "@/components/nav";
import { signOut } from "@/app/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { supabase, user } = await requireUser();
  await ensureDefaultCategories(supabase, user.id);
  const { data: conn } = await supabase
    .from("simplefin_connections")
    .select("last_synced_at, last_sync_status")
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 flex-row items-center gap-1 border-b border-[var(--line)] bg-white px-3 py-2 md:w-56 md:flex-col md:items-stretch md:border-r md:border-b-0 md:px-3 md:py-5">
        <div className="mr-3 px-2 text-lg font-semibold tracking-tight md:mb-6 md:mr-0">Ledger</div>
        <Nav />
        <div className="ml-auto hidden text-xs text-[var(--muted)] md:mt-auto md:ml-0 md:block md:px-2">
          {conn?.last_synced_at ? (
            <>
              Synced {new Date(conn.last_synced_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" })}
              {conn.last_sync_status !== "ok" && <span className="text-amber-600"> · {conn.last_sync_status}</span>}
            </>
          ) : (
            "Not connected"
          )}
          <form action={signOut}>
            <button className="mt-2 hover:underline">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
