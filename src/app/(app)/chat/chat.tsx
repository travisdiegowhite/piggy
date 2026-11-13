"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[] };

const SUGGESTIONS = [
  "How did my spending this month compare to last month?",
  "What subscriptions am I paying for?",
  "Where could I cut $300 a month?",
  "Any unusual or duplicate charges in the last 30 days?",
  "How much did I spend on cycling this year?",
  "What's my savings rate over the last 3 months?",
];

const TOOL_LABEL: Record<string, string> = {
  get_accounts: "accounts",
  list_categories: "categories",
  search_transactions: "transactions",
  spending_by_category: "category totals",
  monthly_cashflow: "cash flow",
  get_budgets: "budgets",
  net_worth_history: "net worth",
  get_holdings: "holdings",
};

export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: text.trim() }];
    setMsgs([...next, { role: "assistant", content: "", tools: [] }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const ev = JSON.parse(line) as { type: string; text?: string; name?: string; error?: string };
          setMsgs((m) => {
            const copy = [...m];
            const last = { ...copy[copy.length - 1] };
            if (ev.type === "text") last.content += ev.text;
            if (ev.type === "tool") last.tools = [...(last.tools ?? []), ev.name!];
            if (ev.type === "error") last.content += `\n\n_Error: ${ev.error}_`;
            copy[copy.length - 1] = last;
            return copy;
          });
        }
      }
    } catch (e) {
      setMsgs((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { role: "assistant", content: `_${e instanceof Error ? e.message : "Something went wrong"}_` };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {msgs.length === 0 && (
          <div className="card">
            <p className="text-sm text-[var(--muted)]">Ask anything about your money. Answers are computed from your synced data.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="rounded-full border border-[var(--line)] px-3 py-1.5 text-left text-sm hover:bg-stone-50">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-stone-800 px-4 py-2 text-sm text-white">{m.content}</div>
            </div>
          ) : (
            <div key={i} className="card max-w-full">
              {!!m.tools?.length && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {[...new Set(m.tools)].map((t) => (
                    <span key={t} className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">
                      read {TOOL_LABEL[t] ?? t}
                    </span>
                  ))}
                </div>
              )}
              {m.content.trim() ? (
                <div className="prose-chat text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content.trim()}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-sm text-[var(--muted)]">Thinking…</div>
              )}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-[var(--line)] pt-3"
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your spending, budgets, net worth…" className="input flex-1" disabled={busy} />
        <button className="btn-primary" disabled={busy || !input.trim()}>Send</button>
        {msgs.length > 0 && (
          <button type="button" className="btn" onClick={() => setMsgs([])} disabled={busy}>New</button>
        )}
      </form>
    </div>
  );
}
