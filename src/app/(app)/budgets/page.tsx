import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { getBudgets, getCashflow, getCategories, getSpendingByCategory } from "@/lib/queries";
import { monthBounds } from "@/lib/format";
import { BudgetBar, PageHeader, Stat, money0 } from "@/components/ui";
import { CashflowChart } from "@/components/charts";
import { BudgetInput } from "./budget-input";

export default async function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  const { month } = await searchParams;
  const m = monthBounds(typeof month === "string" ? month : undefined);
  const { supabase } = await requireUser();

  // 3 full months before this one, for a typical-spend reference.
  const avgStart = monthBounds(monthBounds(monthBounds(m.prevYm).prevYm).prevYm).start;

  const [cats, budgets, spent, prior, cashflow] = await Promise.all([
    getCategories(supabase),
    getBudgets(supabase),
    getSpendingByCategory(supabase, m.start, m.end),
    getSpendingByCategory(supabase, avgStart, m.start),
    getCashflow(supabase, 12),
  ]);

  const spentBy = new Map(spent.map((s) => [s.category_id, s.spent]));
  const avgBy = new Map(prior.map((s) => [s.category_id, s.spent / 3]));
  const pace = m.isCurrent ? m.dayOfMonth / m.daysInMonth : 1;
  const thisMonth = cashflow.find((c) => c.month.startsWith(m.ym)) ?? { income: 0, spending: 0, net: 0 };
  const totalBudget = [...budgets.values()].reduce((s, v) => s + v, 0);
  const budgetedSpent = cats.reduce((s, c) => s + (budgets.has(c.id) ? (spentBy.get(c.id) ?? 0) : 0), 0);
  const uncategorizedSpent = spentBy.get(null as unknown as string) ?? 0;

  const sections = [
    { key: "essentials", label: "Essentials" },
    { key: "lifestyle", label: "Lifestyle" },
    { key: "savings", label: "Savings & investing" },
  ];

  return (
    <>
      <PageHeader title="Budgets & cash flow">
        <Link href={`/budgets?month=${m.prevYm}`} className="btn">←</Link>
        <span className="min-w-32 text-center text-sm font-medium">{m.label}</span>
        <Link href={`/budgets?month=${m.nextYm}`} className="btn">→</Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Income" value={money0(thisMonth.income)} />
        <Stat label="Spending" value={money0(thisMonth.spending)} />
        <Stat label="Net" value={money0(thisMonth.net)} tone={thisMonth.net >= 0 ? "pos" : "neg"} sub={thisMonth.income > 0 ? `${Math.round((thisMonth.net / thisMonth.income) * 100)}% savings rate` : undefined} />
        <Stat
          label="Budget left"
          value={totalBudget ? money0(totalBudget - budgetedSpent) : "—"}
          tone={totalBudget && totalBudget - budgetedSpent < 0 ? "neg" : undefined}
          sub={totalBudget ? `${money0(budgetedSpent)} of ${money0(totalBudget)} · ${Math.round(pace * 100)}% of month` : "Set budgets below"}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <div className="mb-1 flex items-baseline justify-between">
            <div className="card-title">Categories</div>
            <div className="text-xs text-[var(--muted)]">Spent · 3-mo avg · Monthly budget</div>
          </div>
          {sections.map((sec) => {
            const list = cats.filter((c) => c.group === sec.key);
            if (!list.length) return null;
            return (
              <div key={sec.key} className="mt-4">
                <div className="mb-2 text-xs font-medium text-stone-500">{sec.label}</div>
                <ul className="space-y-3">
                  {list.map((c) => {
                    const s = spentBy.get(c.id) ?? 0;
                    const b = budgets.get(c.id);
                    const avg = avgBy.get(c.id) ?? 0;
                    return (
                      <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <Link href={`/transactions?category=${c.id}&month=${m.ym}`} className="hover:underline">{c.name}</Link>
                          <span className="num">
                            {money0(s)} <span className="text-xs text-[var(--muted)]">· {money0(avg)}</span>
                          </span>
                        </div>
                        <BudgetInput categoryId={c.id} initial={b} placeholder={avg ? String(Math.round(avg / 10) * 10) : ""} />
                        {b ? (
                          <div className="col-span-1">
                            <BudgetBar spent={s} budget={b} pace={m.isCurrent ? pace : undefined} />
                            {s > b && <div className="mt-0.5 text-xs neg">Over by {money0(s - b)}</div>}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {uncategorizedSpent > 0 && (
            <Link href={`/transactions?category=uncategorized&month=${m.ym}`} className="mt-4 block text-sm text-amber-800 hover:underline">
              + {money0(uncategorizedSpent)} uncategorized spending →
            </Link>
          )}
        </section>

        <section className="card self-start lg:col-span-2">
          <div className="card-title mb-3">Cash flow · 12 months</div>
          <CashflowChart data={cashflow} />
          <table className="mt-4 w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--muted)]">
                <th className="py-1 font-medium">Month</th>
                <th className="py-1 text-right font-medium">In</th>
                <th className="py-1 text-right font-medium">Out</th>
                <th className="py-1 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="num">
              {[...cashflow].reverse().map((c) => (
                <tr key={c.month} className="border-t border-[var(--line)]">
                  <td className="py-1">
                    <Link href={`/budgets?month=${c.month.slice(0, 7)}`} className="hover:underline">
                      {new Date(c.month + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" })}
                    </Link>
                  </td>
                  <td className="py-1 text-right">{money0(c.income)}</td>
                  <td className="py-1 text-right">{money0(c.spending)}</td>
                  <td className={`py-1 text-right ${c.net >= 0 ? "pos" : "neg"}`}>{money0(c.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
