"use client";

import { useActionState, useState, useTransition } from "react";
import { connectSimpleFin, syncNow, type ActionState } from "@/app/actions";

export function ConnectForm() {
  const [state, action, pending] = useActionState(connectSimpleFin, null);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input name="token" required placeholder="Paste SimpleFIN setup token" className="input min-w-64 flex-1 font-mono text-xs" autoComplete="off" />
        <input name="label" placeholder="Label (optional)" className="input w-44" />
        <button disabled={pending} className="btn-primary">{pending ? "Connecting & syncing…" : "Connect"}</button>
      </div>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.message && <p className="text-sm text-emerald-800">{state.message}</p>}
    </form>
  );
}

export function SyncButton() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ActionState>(null);
  return (
    <div className="flex items-center gap-2">
      {res?.message && <span className={`text-xs ${res.ok ? "text-[var(--muted)]" : "text-amber-700"}`}>{res.message}</span>}
      <button className="btn" disabled={pending} onClick={() => start(async () => setRes(await syncNow()))}>
        {pending ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
