import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getAccounts,
  getBudgets,
  getCashflow,
  getCategories,
  getHoldings,
  getNetWorthHistory,
  getSpendingByCategory,
  getTransactions,
  netWorth,
} from "@/lib/queries";

// Read-only tools Claude can call. All queries run with the user's session → RLS.

export const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "get_accounts",
    description: "List all accounts with current balances, types, institutions, plus net worth totals.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_categories",
    description: "List spending/income categories with their ids and groups.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_transactions",
    description:
      "Search transactions. Amounts: negative = money out, positive = money in. Dates are YYYY-MM-DD; end is exclusive. Returns at most `limit` rows plus the total match count and the sum of amounts across returned rows.",
    input_schema: {
      type: "object",
      properties: {
        start: { type: "string", description: "YYYY-MM-DD inclusive" },
        end: { type: "string", description: "YYYY-MM-DD exclusive" },
        category: { type: "string", description: "Category name (exact) or 'uncategorized'" },
        search: { type: "string", description: "Substring of description/payee/notes" },
        direction: { type: "string", enum: ["in", "out"] },
        min_amount: { type: "number" },
        max_amount: { type: "number" },
        limit: { type: "integer", description: "Default 50, max 500" },
      },
    },
  },
  {
    name: "spending_by_category",
    description: "Total spending per category for a date range (excludes transfers and income).",
    input_schema: {
      type: "object",
      properties: { start: { type: "string" }, end: { type: "string", description: "exclusive" } },
      required: ["start", "end"],
    },
  },
  {
    name: "monthly_cashflow",
    description: "Income, spending and net per month for the last N months (transfers excluded).",
    input_schema: { type: "object", properties: { months: { type: "integer", description: "Default 12" } } },
  },
  {
    name: "get_budgets",
    description: "Monthly budgets per category with spending for a given month (YYYY-MM, default current).",
    input_schema: { type: "object", properties: { month: { type: "string" } } },
  },
  {
    name: "net_worth_history",
    description: "Daily net worth, assets and liabilities for the last N days (sampled weekly if long).",
    input_schema: { type: "object", properties: { days: { type: "integer", description: "Default 180" } } },
  },
  {
    name: "get_holdings",
    description: "Investment holdings (symbol, shares, market value, cost basis).",
    input_schema: { type: "object", properties: {} },
  },
];

type Input = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export async function runTool(sb: SupabaseClient, name: string, input: Input): Promise<unknown> {
  switch (name) {
    case "get_accounts": {
      const accts = await getAccounts(sb, { includeHidden: true });
      return {
        net_worth: netWorth(accts),
        accounts: accts.map((a) => ({
          name: a.display_name ?? a.name,
          institution: a.org_name,
          type: a.type,
          balance: a.balance,
          in_net_worth: a.include_in_net_worth,
          balance_as_of: a.balance_date,
        })),
      };
    }
    case "list_categories":
      return (await getCategories(sb)).map((c) => ({ name: c.name, group: c.group }));
    case "search_transactions": {
      let categoryId: string | undefined;
      const cat = s(input.category);
      if (cat === "uncategorized") categoryId = "uncategorized";
      else if (cat) {
        const found = (await getCategories(sb)).find((c) => c.name.toLowerCase() === cat.toLowerCase());
        if (!found) return { error: `Unknown category "${cat}". Call list_categories.` };
        categoryId = found.id;
      }
      const cats = new Map((await getCategories(sb)).map((c) => [c.id, c.name]));
      const { rows, count } = await getTransactions(sb, {
        start: s(input.start),
        end: s(input.end),
        categoryId,
        search: s(input.search),
        direction: input.direction === "in" || input.direction === "out" ? input.direction : undefined,
        minAmount: n(input.min_amount),
        maxAmount: n(input.max_amount),
        limit: Math.min(n(input.limit) ?? 50, 500),
      });
      return {
        total_matches: count,
        returned: rows.length,
        sum_of_returned: Math.round(rows.reduce((t, r) => t + r.amount, 0) * 100) / 100,
        transactions: rows.map((r) => ({
          date: r.posted_on,
          amount: r.amount,
          description: r.payee || r.description,
          category: r.category_id ? cats.get(r.category_id) : null,
          pending: r.pending || undefined,
          excluded: r.is_excluded || undefined,
          note: r.notes ?? undefined,
        })),
      };
    }
    case "spending_by_category":
      return (await getSpendingByCategory(sb, String(input.start), String(input.end))).map((r) => ({
        category: r.category,
        group: r.group,
        spent: r.spent,
        transactions: r.txn_count,
      }));
    case "monthly_cashflow":
      return getCashflow(sb, n(input.months) ?? 12);
    case "get_budgets": {
      const now = new Date();
      const ym = s(input.month) ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const [y, m] = ym.split("-").map(Number);
      const start = `${ym}-01`;
      const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
      const [budgets, spent, cats] = await Promise.all([
        getBudgets(sb),
        getSpendingByCategory(sb, start, end),
        getCategories(sb),
      ]);
      const spentBy = new Map(spent.map((r) => [r.category_id, r.spent]));
      return {
        month: ym,
        budgets: cats
          .filter((c) => budgets.has(c.id))
          .map((c) => ({ category: c.name, budget: budgets.get(c.id), spent: spentBy.get(c.id) ?? 0 })),
      };
    }
    case "net_worth_history": {
      const h = await getNetWorthHistory(sb, n(input.days) ?? 180);
      return h.length > 120 ? h.filter((_, i) => i % 7 === 0 || i === h.length - 1) : h;
    }
    case "get_holdings":
      return getHoldings(sb);
    default:
      return { error: `Unknown tool ${name}` };
  }
}
