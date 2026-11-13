"use client";

import { useState, useTransition } from "react";
import { setTransactionCategory, setTransactionNote, toggleExcluded } from "@/app/actions";
import type { Category, Txn } from "@/lib/queries";
import { money, shortDate } from "@/lib/format";

/** Strip card numbers, store ids, dates etc. so a rule matches future charges from the same merchant. */
function suggestPattern(t: Txn) {
  const base = (t.payee || t.description).toUpperCase();
  return base
    .replace(/#?\d{3,}.*$/, "")
    .replace(/\s+(POS|DEBIT|PURCHASE|ACH|CARD)\b.*$/i, "")
    .replace(/[*]+.*$/, (m) => (base.indexOf(m) > 4 ? "" : m))
    .trim()
    .slice(0, 40);
}

export function TxnTable({
  rows,
  categories,
  accounts,
}: {
  rows: Txn[];
  categories: Category[];
  accounts: Record<string, string>;
}) {
  if (!rows.length) return <p className="p-5 text-sm text-[var(--muted)]">No matching transactions.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[var(--line)] text-left text-xs text-[var(--muted)]">
          <th className="px-4 py-2 font-medium">Date</th>
          <th className="px-2 py-2 font-medium">Description</th>
          <th className="px-2 py-2 font-medium">Category</th>
          <th className="hidden px-2 py-2 font-medium lg:table-cell">Account</th>
          <th className="px-4 py-2 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <Row key={t.id} t={t} categories={categories} account={accounts[t.account_id]} />
        ))}
      </tbody>
    </table>
  );
}

function Row({ t, categories, account }: { t: Txn; categories: Category[]; account?: string }) {
  const [pending, start] = useTransition();
  const [catId, setCatId] = useState(t.category_id);
  const [ask, setAsk] = useState<string | null>(null); // pending category to offer as rule
  const [pattern, setPattern] = useState(suggestPattern(t));
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(t.notes ?? "");

  const groups = ["income", "essentials", "lifestyle", "savings", "transfer"];

  return (
    <>
      <tr className={`border-b border-[var(--line)] last:border-0 ${t.is_excluded ? "opacity-45" : ""} ${pending ? "opacity-60" : ""}`}>
        <td className="whitespace-nowrap px-4 py-2 text-xs text-[var(--muted)]">{shortDate(t.posted_on)}</td>
        <td className="max-w-xs px-2 py-2">
          <button onClick={() => setOpen(!open)} className="block w-full truncate text-left hover:underline" title={t.description}>
            {t.payee || t.description}
          </button>
          <div className="flex gap-2 text-xs text-[var(--muted)]">
            {t.pending && <span>pending</span>}
            {t.is_excluded && <span>excluded</span>}
            {t.notes && <span className="truncate">“{t.notes}”</span>}
          </div>
        </td>
        <td className="px-2 py-2">
          <select
            value={catId ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              setCatId(v);
              start(() => setTransactionCategory({ id: t.id, categoryId: v }));
              if (v) setAsk(v);
            }}
            className={`max-w-44 rounded border px-1.5 py-1 text-xs ${catId ? "border-transparent bg-stone-100" : "border-amber-200 bg-amber-50"}`}
          >
            <option value="">Uncategorized</option>
            {groups.map((g) => (
              <optgroup key={g} label={g[0].toUpperCase() + g.slice(1)}>
                {categories.filter((c) => c.group === g).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          {t.category_source && t.category_source !== "manual" && catId === t.category_id && (
            <span className="ml-1 text-[10px] uppercase text-[var(--muted)]">{t.category_source}</span>
          )}
        </td>
        <td className="hidden max-w-40 truncate px-2 py-2 text-xs text-[var(--muted)] lg:table-cell">{account}</td>
        <td className={`whitespace-nowrap px-4 py-2 text-right num ${t.amount > 0 ? "pos" : ""}`}>
          {t.amount > 0 ? "+" : ""}
          {money(t.amount)}
        </td>
      </tr>

      {ask && (
        <tr className="bg-emerald-50/60">
          <td colSpan={5} className="px-4 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span>Always categorize transactions containing</span>
              <input value={pattern} onChange={(e) => setPattern(e.target.value)} className="input py-1 text-xs" />
              <span>as {categories.find((c) => c.id === ask)?.name}?</span>
              <button
                className="btn-primary py-1 text-xs"
                onClick={() => {
                  const cat = ask;
                  setAsk(null);
                  start(() => setTransactionCategory({ id: t.id, categoryId: cat, createRule: pattern, applyToExisting: true }));
                }}
              >
                Create rule
              </button>
              <button className="btn py-1 text-xs" onClick={() => setAsk(null)}>Just this one</button>
            </div>
          </td>
        </tr>
      )}

      {open && (
        <tr className="bg-stone-50">
          <td colSpan={5} className="px-4 py-3 text-xs">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <div className="space-y-1 text-[var(--muted)]">
                <div><span className="text-stone-700">Raw:</span> {t.description}</div>
                {t.payee && <div><span className="text-stone-700">Payee:</span> {t.payee}</div>}
                <div className="flex gap-2 pt-1">
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" className="input flex-1 py-1 text-xs" />
                  <button className="btn py-1 text-xs" onClick={() => start(() => setTransactionNote(t.id, note))}>Save note</button>
                </div>
              </div>
              <button className="btn self-start py-1 text-xs" onClick={() => start(() => toggleExcluded(t.id, !t.is_excluded))}>
                {t.is_excluded ? "Include in reports" : "Exclude from reports"}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
