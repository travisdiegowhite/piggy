"use client";

import { useState, useTransition } from "react";
import { setBudget } from "@/app/actions";

export function BudgetInput({ categoryId, initial, placeholder }: { categoryId: string; initial?: number; placeholder?: string }) {
  const [val, setVal] = useState(initial ? String(initial) : "");
  const [pending, start] = useTransition();
  const save = () => {
    const n = val.trim() === "" ? null : Number(val.replace(/[$,]/g, ""));
    if ((n ?? 0) === (initial ?? 0)) return;
    start(() => setBudget(categoryId, n));
  };
  return (
    <div className="relative row-span-2 self-start">
      <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-[var(--muted)]">$</span>
      <input
        inputMode="decimal"
        value={val}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={`input w-24 py-1 pl-5 text-right text-sm num ${pending ? "opacity-50" : ""}`}
        aria-label="Monthly budget"
      />
    </div>
  );
}
