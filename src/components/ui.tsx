import type { ReactNode } from "react";
import { money, money0, shortDate } from "@/lib/format";
import type { Category, Txn } from "@/lib/queries";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: "pos" | "neg" }) {
  return (
    <div className="card">
      <div className="card-title">{label}</div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight num ${tone ?? ""}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

export function Amount({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`num ${value > 0 ? "pos" : ""} ${className}`}>{value > 0 ? "+" : ""}{money(value)}</span>;
}

export function CategoryPill({ cat }: { cat?: Category | null }) {
  if (!cat) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">Uncategorized</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color }} />
      {cat.name}
    </span>
  );
}

/** Horizontal progress bar; turns red with label when over. */
export function BudgetBar({ spent, budget, pace, neutral }: { spent: number; budget: number; pace?: number; neutral?: boolean }) {
  const pct = budget > 0 ? spent / budget : 0;
  const over = pct > 1;
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-stone-100">
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(pct, 1) * 100}%`, background: neutral ? "#a8a29e" : over ? "#d03b3b" : pct > 0.85 ? "#eda100" : "#2a78d6" }}
      />
      {pace != null && pace < 1 && (
        <div className="absolute top-0 h-full w-px bg-stone-500" style={{ left: `${pace * 100}%` }} title="Month pace" />
      )}
    </div>
  );
}

export function SimpleTxnList({ rows, cats }: { rows: Txn[]; cats: Map<string, Category> }) {
  if (!rows.length) return <p className="text-sm text-[var(--muted)]">No transactions yet.</p>;
  return (
    <ul className="divide-y divide-[var(--line)]">
      {rows.map((t) => (
        <li key={t.id} className="flex items-center gap-3 py-2.5 text-sm">
          <span className="w-14 shrink-0 text-xs text-[var(--muted)]">{shortDate(t.posted_on)}</span>
          <span className="min-w-0 flex-1 truncate">
            {t.payee || t.description}
            {t.pending && <span className="ml-2 text-xs text-[var(--muted)]">pending</span>}
          </span>
          <span className="hidden sm:block">
            <CategoryPill cat={t.category_id ? cats.get(t.category_id) : null} />
          </span>
          <Amount value={t.amount} className="w-24 shrink-0 text-right" />
        </li>
      ))}
    </ul>
  );
}

export { money, money0 };
