import { requireUser } from "@/lib/supabase/server";
import { getAccounts, getHoldings, getNetWorthHistory, netWorth } from "@/lib/queries";
import { money, money0 } from "@/lib/format";
import { NetWorthChart } from "@/components/charts";
import { PageHeader, Stat } from "@/components/ui";

const TYPE_LABEL: Record<string, string> = {
  checking: "Cash", savings: "Cash", investment: "Investments", retirement: "Retirement",
  property: "Property", other: "Other", credit: "Credit cards", loan: "Loans",
};
const ORDER = ["Cash", "Investments", "Retirement", "Property", "Other", "Credit cards", "Loans"];

export default async function NetWorthPage({ searchParams }: PageProps<"/net-worth">) {
  const { range } = await searchParams;
  const days = range === "90" ? 90 : range === "all" ? 3650 : 365;
  const { supabase } = await requireUser();
  const [accounts, history, holdings] = await Promise.all([
    getAccounts(supabase, { includeHidden: true }),
    getNetWorthHistory(supabase, days),
    getHoldings(supabase),
  ]);

  const nw = netWorth(accounts);
  const first = history[0];
  const change = first ? nw.net - first.net_worth : 0;

  const groups = new Map<string, typeof accounts>();
  for (const a of accounts.filter((a) => a.include_in_net_worth)) {
    const g = TYPE_LABEL[a.type] ?? "Other";
    groups.set(g, [...(groups.get(g) ?? []), a]);
  }
  const acctName = new Map(accounts.map((a) => [a.id, a.display_name ?? a.name]));

  return (
    <>
      <PageHeader title="Net worth">
        {(["90", "365", "all"] as const).map((r) => (
          <a key={r} href={`/net-worth?range=${r}`} className={`btn ${String(days === 90 ? "90" : days === 365 ? "365" : "all") === r ? "bg-stone-100" : ""}`}>
            {r === "90" ? "3M" : r === "365" ? "1Y" : "All"}
          </a>
        ))}
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Net worth" value={money0(nw.net)} />
        <Stat label="Change" value={`${change >= 0 ? "+" : ""}${money0(change)}`} tone={change >= 0 ? "pos" : "neg"} sub={first ? `since ${new Date(first.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}` : "History builds daily"} />
        <Stat label="Assets" value={money0(nw.assets)} />
        <Stat label="Liabilities" value={money0(nw.liabilities)} />
      </div>

      <section className="card mt-4">
        <div className="card-title mb-3">Net worth over time</div>
        {history.length > 1 ? (
          <NetWorthChart data={history} />
        ) : (
          <p className="py-10 text-center text-sm text-[var(--muted)]">
            SimpleFIN only reports current balances, so the chart fills in one point per daily sync.
          </p>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <div className="card-title mb-2">Accounts</div>
          {ORDER.filter((g) => groups.has(g)).map((g) => {
            const list = groups.get(g)!;
            const total = list.reduce((s, a) => s + a.balance, 0);
            return (
              <div key={g} className="mt-3">
                <div className="flex justify-between border-b border-[var(--line)] pb-1 text-xs font-medium text-stone-500">
                  <span>{g}</span>
                  <span className="num">{money0(total)}</span>
                </div>
                <ul>
                  {list.map((a) => (
                    <li key={a.id} className="flex justify-between py-1.5 text-sm">
                      <span className="min-w-0 truncate">
                        {a.display_name ?? a.name}
                        <span className="ml-2 text-xs text-[var(--muted)]">{a.org_name}</span>
                      </span>
                      <span className={`num ${a.balance < 0 ? "neg" : ""}`}>{money(a.balance)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="card self-start">
          <div className="card-title mb-2">Holdings</div>
          {holdings.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No holdings reported. Not every brokerage shares positions through SimpleFIN.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="py-1 font-medium">Symbol</th>
                  <th className="py-1 text-right font-medium">Shares</th>
                  <th className="py-1 text-right font-medium">Value</th>
                  <th className="py-1 text-right font-medium">Gain</th>
                </tr>
              </thead>
              <tbody className="num">
                {holdings.map((h) => {
                  const gain = h.market_value != null && h.cost_basis ? h.market_value - h.cost_basis : null;
                  return (
                    <tr key={h.id} className="border-t border-[var(--line)]">
                      <td className="py-1.5">
                        <div className="font-medium">{h.symbol ?? "—"}</div>
                        <div className="max-w-48 truncate text-xs text-[var(--muted)]">{h.description ?? acctName.get(h.account_id)}</div>
                      </td>
                      <td className="py-1.5 text-right">{h.shares?.toLocaleString(undefined, { maximumFractionDigits: 3 }) ?? "—"}</td>
                      <td className="py-1.5 text-right">{money0(h.market_value)}</td>
                      <td className={`py-1.5 text-right ${gain == null ? "" : gain >= 0 ? "pos" : "neg"}`}>
                        {gain == null ? "—" : `${gain >= 0 ? "+" : ""}${money0(gain)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
