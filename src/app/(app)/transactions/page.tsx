import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getAccounts, getCategories, getTransactions } from "@/lib/queries";
import { monthBounds, money } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { TxnTable } from "./txn-table";
import { AiCategorizeButton } from "./ai-categorize-button";

const PAGE = 100;

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const month = one("month");
  const category = one("category");
  const account = one("account");
  const q = one("q");
  const page = Math.max(1, Number(one("page") ?? 1));

  const { supabase } = await requireUser();
  const m = month ? monthBounds(month) : null;
  const [cats, accounts, txns] = await Promise.all([
    getCategories(supabase),
    getAccounts(supabase, { includeHidden: true }),
    getTransactions(supabase, {
      start: m?.start,
      end: m?.end,
      categoryId: category,
      accountId: account,
      search: q,
      limit: PAGE,
      offset: (page - 1) * PAGE,
    }),
  ]);

  const total = txns.rows.reduce((s, t) => s + (t.is_excluded ? 0 : t.amount), 0);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { month, category, account, q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/transactions?${p}`;
  };

  return (
    <>
      <PageHeader title="Transactions">
        {category === "uncategorized" && <AiCategorizeButton />}
      </PageHeader>

      <form className="mb-4 flex flex-wrap gap-2" action="/transactions">
        <input name="q" defaultValue={q} placeholder="Search description, payee, notes" className="input min-w-56 flex-1" />
        <input name="month" type="month" defaultValue={month} className="input" />
        <select name="category" defaultValue={category ?? ""} className="input">
          <option value="">All categories</option>
          <option value="uncategorized">Uncategorized</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="account" defaultValue={account ?? ""} className="input">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.display_name ?? a.name}</option>
          ))}
        </select>
        <button className="btn">Filter</button>
        {(q || month || category || account) && <Link href="/transactions" className="btn">Clear</Link>}
      </form>

      <div className="mb-2 flex justify-between text-xs text-[var(--muted)]">
        <span>
          {txns.count.toLocaleString()} transactions{m ? ` in ${m.label}` : ""}
        </span>
        <span className="num">Net on this page: {money(total)}</span>
      </div>

      <div className="card overflow-x-auto p-0">
        <TxnTable
          rows={txns.rows}
          categories={cats}
          accounts={Object.fromEntries(accounts.map((a) => [a.id, a.display_name ?? a.name]))}
        />
      </div>

      {txns.count > PAGE && (
        <div className="mt-4 flex justify-between text-sm">
          {page > 1 ? <Link className="btn" href={qs({ page: String(page - 1) })}>← Newer</Link> : <span />}
          {page * PAGE < txns.count && <Link className="btn" href={qs({ page: String(page + 1) })}>Older →</Link>}
        </div>
      )}
    </>
  );
}
