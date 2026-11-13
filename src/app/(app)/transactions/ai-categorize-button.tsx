"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AiCategorizeButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-xs text-[var(--muted)]">{msg}</span>}
      <button
        className="btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const res = await fetch("/api/categorize", { method: "POST" });
            const j = await res.json();
            setMsg(res.ok ? `Categorized ${j.updated} of ${j.considered}.` : j.error ?? "Failed");
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Categorizing…" : "Auto-categorize with AI"}
      </button>
    </div>
  );
}
