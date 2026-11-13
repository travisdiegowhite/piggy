import { requireUser } from "@/lib/supabase/server";
import { getAccounts, getCategories } from "@/lib/queries";
import { ACCOUNT_TYPES, GROUPS, money } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { deleteCategory, deleteConnection, deleteRule, updateAccount, upsertCategory } from "@/app/actions";
import { ConnectForm, SyncButton } from "./client";

export default async function SettingsPage() {
  const { supabase } = await requireUser();
  const [{ data: conns }, accounts, cats, { data: rules }] = await Promise.all([
    supabase.from("simplefin_connections").select("id, label, last_synced_at, last_sync_status, last_error, created_at").order("created_at"),
    getAccounts(supabase, { includeHidden: true }),
    getCategories(supabase),
    supabase.from("category_rules").select("id, pattern, category_id, priority").order("pattern"),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader title="Settings" />

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <div className="card-title">SimpleFIN connections</div>
          {!!conns?.length && <SyncButton />}
        </div>
        {conns?.length ? (
          <ul className="mb-4 divide-y divide-[var(--line)]">
            {conns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-[var(--muted)]">
                  {c.last_synced_at ? `Last sync ${new Date(c.last_synced_at).toLocaleString("en-US", { timeZone: "America/Denver" })}` : "Never synced"}
                  {c.last_sync_status && ` · ${c.last_sync_status}`}
                </span>
                {c.last_error && <span className="w-full whitespace-pre-wrap text-xs text-amber-700">{c.last_error}</span>}
                <form action={deleteConnection} className="ml-auto">
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-xs text-red-700 hover:underline">Disconnect</button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <ConnectForm />
        <p className="mt-3 text-xs text-[var(--muted)]">
          Get a setup token at <a className="underline" href="https://beta-bridge.simplefin.org/" target="_blank" rel="noreferrer">SimpleFIN Bridge</a> → My Account → New connection. The token is single-use; the resulting access URL is encrypted before it&apos;s stored. Data syncs daily; Bridge allows roughly 24 requests a day, so avoid spamming “Sync now”.
        </p>
      </section>

      <section className="card mt-4 overflow-x-auto">
        <div className="card-title mb-3">Accounts</div>
        {accounts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No accounts yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)]">
                <th className="py-1 font-medium">Account</th>
                <th className="py-1 font-medium">Display name</th>
                <th className="py-1 font-medium">Type</th>
                <th className="py-1 text-right font-medium">Balance</th>
                <th className="py-1 text-center font-medium">Net worth</th>
                <th className="py-1 text-center font-medium">Hidden</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-[var(--line)]">
                  <td className="py-2 pr-2">
                    <div>{a.name}</div>
                    <div className="text-xs text-[var(--muted)]">{a.org_name}</div>
                  </td>
                  <td className="py-2 pr-2">
                    <form action={updateAccount} className="flex gap-1">
                      <input type="hidden" name="id" value={a.id} />
                      <input name="display_name" defaultValue={a.display_name ?? ""} placeholder={a.name} className="input w-40 py-1 text-xs" />
                      <button className="btn py-1 text-xs">Save</button>
                    </form>
                  </td>
                  <td className="py-2 pr-2">
                    <form action={updateAccount} className="flex gap-1">
                      <input type="hidden" name="id" value={a.id} />
                      <select name="type" defaultValue={a.type} className="input py-1 text-xs">
                        {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                      <button className="btn py-1 text-xs">Set</button>
                    </form>
                  </td>
                  <td className="py-2 text-right num">{money(a.balance)}</td>
                  <td className="py-2 text-center">
                    <form action={updateAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="include_in_net_worth" value={String(!a.include_in_net_worth)} />
                      <button className="btn py-1 text-xs">{a.include_in_net_worth ? "Yes" : "No"}</button>
                    </form>
                  </td>
                  <td className="py-2 text-center">
                    <form action={updateAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="is_hidden" value={String(!a.is_hidden)} />
                      <button className="btn py-1 text-xs">{a.is_hidden ? "Hidden" : "Shown"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="card-title mb-3">Categories</div>
          <form action={upsertCategory} className="mb-4 flex flex-wrap gap-2">
            <input name="name" placeholder="New category" required className="input flex-1 py-1" />
            <select name="group" defaultValue="lifestyle" className="input py-1">
              {GROUPS.map((g) => <option key={g}>{g}</option>)}
            </select>
            <input name="color" type="color" defaultValue="#64748b" className="h-9 w-10 rounded border border-[var(--line)]" />
            <button className="btn-primary py-1">Add</button>
          </form>
          <ul className="divide-y divide-[var(--line)]">
            {cats.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-[var(--muted)]">{c.group}</span>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="text-xs text-[var(--muted)] hover:text-red-700" title="Delete (transactions become uncategorized)">✕</button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <section className="card self-start">
          <div className="card-title mb-1">Rules</div>
          <p className="mb-3 text-xs text-[var(--muted)]">Created from the Transactions page. Applied to new transactions on every sync, before the built-in keyword matching.</p>
          {rules?.length ? (
            <ul className="divide-y divide-[var(--line)]">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <code className="flex-1 truncate rounded bg-stone-100 px-1.5 py-0.5 text-xs">{r.pattern}</code>
                  <span className="text-xs">→ {catName.get(r.category_id) ?? "?"}</span>
                  <form action={deleteRule}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs text-[var(--muted)] hover:text-red-700">✕</button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--muted)]">No rules yet.</p>
          )}
        </section>
      </div>
    </>
  );
}
