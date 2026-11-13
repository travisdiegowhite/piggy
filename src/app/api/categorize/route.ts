import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { anthropic, MODEL, USER_CONTEXT } from "@/lib/ai";
import { getCategories } from "@/lib/queries";

export const maxDuration = 120;

// Categorize up to 150 uncategorized transactions in one Claude call.
export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cats = await getCategories(supabase);
  const { data: txns } = await supabase
    .from("transactions")
    .select("id, description, payee, amount")
    .is("category_id", null)
    .order("posted_on", { ascending: false })
    .limit(150);
  if (!txns?.length) return NextResponse.json({ updated: 0, considered: 0 });

  const catNames = cats.map((c) => `${c.name} (${c.group})`).join("\n");
  const lines = txns
    .map((t, i) => `${i}\t${Number(t.amount).toFixed(2)}\t${t.payee ?? ""}\t${t.description}`)
    .join("\n");

  const msg = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 4000,
    tool_choice: { type: "tool", name: "assign" },
    tools: [
      {
        name: "assign",
        description: "Assign a category to each transaction index. Omit ones you are unsure about.",
        input_schema: {
          type: "object",
          properties: {
            assignments: {
              type: "array",
              items: {
                type: "object",
                properties: { i: { type: "integer" }, category: { type: "string" } },
                required: ["i", "category"],
              },
            },
          },
          required: ["assignments"],
        },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Categorize these bank/credit-card transactions for a personal finance app.${USER_CONTEXT ? ` About the user: ${USER_CONTEXT}.` : ""} Amount is positive for money in, negative for money out. Credit card payments and moves between own accounts are transfers. Use ONLY these category names exactly:\n${catNames}\n\nTransactions (index, amount, payee, description):\n${lines}`,
      },
    ],
  });

  const block = msg.content.find((b) => b.type === "tool_use");
  const assignments = (block?.type === "tool_use"
    ? (block.input as { assignments: { i: number; category: string }[] }).assignments
    : []) ?? [];
  const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));

  // Group updates by category to keep round trips low.
  const groups = new Map<string, string[]>();
  for (const a of assignments) {
    const t = txns[a.i];
    const id = byName.get(a.category.replace(/\s*\(.*\)$/, "").toLowerCase());
    if (!t || !id) continue;
    groups.set(id, [...(groups.get(id) ?? []), t.id]);
  }
  let updated = 0;
  for (const [catId, ids] of groups) {
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: catId, category_source: "ai" })
      .in("id", ids)
      .is("category_id", null);
    if (!error) updated += ids.length;
  }
  return NextResponse.json({ updated, considered: txns.length });
}
