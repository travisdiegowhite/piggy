import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import {
  getAccounts,
  getBudgets,
  getCashflow,
  getCategories,
  getSpendingByCategory,
  getTransactions,
  netWorth,
} from "@/lib/queries";
import { monthBounds } from "@/lib/format";
import { CashflowChart } from "@/components/charts";
import { BudgetBar, PageHeader, SimpleTxnList, Stat, money0 } from "@/components/ui";

export default async function Overview() {
  const { supabase } = await requireUser();
  const m = monthBounds();

  const [accounts, cashflow, spending, recent, cats, budgets, uncategorized] = await Promise.all([
    getAccounts(supabase, { includeHidden: true }),
    getCashflow(supabase, 12),
    getSpendingByCategory(supabase, m.start, m.end),
    getTransactions(supabase, { limit: 10 }),
    getCategories(supabase),
    getBudgets(supabase),
    getTransactions(supabase, { categoryId: "uncategorized", limit: 1 }),
  ]);

  if (accounts.length === 0) {
    return (
      <>
        <PageHeader title="Overview" />
        <div className="card max-w-lg">
          <h2 className="font-medium">Connect your accounts</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Paste a SimpleFIN Bridge setup token to pull in balances and the last 90 days of transactions.
          </p>
          <Link href="/settings" className="btn-primary mt-4">Go to Settings</Link>
        </div>
      </>
    );
  }

  const nw = netWorth(accounts);
  const thisMonth = cashflow.find((c) => c.month.startsWith(m.ym)) ?? { income: 0, spending: 0, net: 0 };
  const lastMonth = cashflow.find((c) => c.month.startsWith(m.prevYm));
  const totalBudget = [...budgets.values()].reduce((s, v) => s + v, 0);
  const pace = m.dayOfMonth / m.daysInMonth;
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const top = spending.slice(0, 8);

  return (
    <>
      <PageHeader title="Overview">
        <span className="text-sm text-[var(--muted)]">{m.label}</span>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Net worth" value={money0(nw.net)} sub={<Link href="/net-worth" className="hover:underline">{money0(nw.assets)} assets · {money0(nw.liabilities)} debt</Link>} />
        <Stat
          label="Spent this month"
          value={money0(thisMonth.spending)}
          sub={totalBudget ? `of ${money0(totalBudget)} budgeted · ${Math.round(pace * 100)}% through month` : lastMonth ? `${money0(lastMonth.spending)} last month` : undefined}
        />
        <Stat label="Income this month" value={money0(thisMonth.income)} sub={lastMonth ? `${money0(lastMonth.income)} last month` : undefined} />
        <Stat label="Net cash flow" value={money0(thisMonth.net)} tone={thisMonth.net >= 0 ? "pos" : "neg"} sub="income − spending, excl. transfers" />
      </div>

      {uncategorized.count > 0 && (
        <Link href="/transactions?category=uncategorized" className="mt-4 block rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 hover:bg-amber-100">
          {uncategorized.count} uncategorized transaction{uncategorized.count === 1 ? "" : "s"} — review →
        </Link>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <div className="card-title mb-3">Cash flow · 12 months</div>
          <CashflowChart data={cashflow} />
        </section>

        <section className="card lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="card-title">Spending by category</div>
            <Link href="/budgets" className="text-xs text-[var(--muted)] hover:underline">Budgets →</Link>
          </div>
          {top.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nothing spent yet this month.</p>
          ) : (
            <ul className="space-y-3">
              {top.map((s) => {
                const b = s.category_id ? budgets.get(s.category_id) : undefined;
                return (
                  <li key={s.category_id ?? "none"}>
                    <Link href={`/transactions?category=${s.category_id ?? "uncategorized"}&month=${m.ym}`} className="block">
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{s.category}</span>
                        <span className="num">
                          {money0(s.spent)}
                          {b ? <span className="text-[var(--muted)]"> / {money0(b)}</span> : null}
                        </span>
                      </div>
                      <BudgetBar spent={s.spent} budget={b ?? top[0].spent} pace={b ? pace : undefined} neutral={!b} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="card-title">Recent transactions</div>
          <Link href="/transactions" className="text-xs text-[var(--muted)] hover:underline">All →</Link>
        </div>
        <SimpleTxnList rows={recent.rows} cats={catMap} />
      </section>
    </>
  );
}
