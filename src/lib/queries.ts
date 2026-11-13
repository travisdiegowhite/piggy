import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Category = { id: string; name: string; group: string; color: string };
export type Account = {
  id: string;
  name: string;
  display_name: string | null;
  org_name: string | null;
  type: string;
  balance: number;
  available_balance: number | null;
  balance_date: string | null;
  is_hidden: boolean;
  include_in_net_worth: boolean;
};
export type Txn = {
  id: string;
  posted_on: string;
  amount: number;
  description: string;
  payee: string | null;
  pending: boolean;
  category_id: string | null;
  category_source: string | null;
  notes: string | null;
  is_excluded: boolean;
  account_id: string;
};

const num = <T extends Record<string, unknown>>(rows: T[] | null, keys: (keyof T)[]) =>
  (rows ?? []).map((r) => {
    const o = { ...r };
    for (const k of keys) if (o[k] != null) (o as Record<string, unknown>)[k as string] = Number(o[k]);
    return o;
  });

export async function getCategories(sb: SupabaseClient): Promise<Category[]> {
  const { data } = await sb.from("categories").select("id, name, group, color").order("group").order("name");
  return data ?? [];
}

export async function getAccounts(sb: SupabaseClient, opts: { includeHidden?: boolean } = {}): Promise<Account[]> {
  let q = sb
    .from("accounts")
    .select("id, name, display_name, org_name, type, balance, available_balance, balance_date, is_hidden, include_in_net_worth")
    .order("type")
    .order("name");
  if (!opts.includeHidden) q = q.eq("is_hidden", false);
  const { data } = await q;
  return num(data, ["balance", "available_balance"]) as Account[];
}

export type TxnFilter = {
  start?: string;
  end?: string; // exclusive
  categoryId?: string | "uncategorized";
  accountId?: string;
  search?: string;
  minAmount?: number;
  maxAmount?: number;
  direction?: "in" | "out";
  limit?: number;
  offset?: number;
};

export async function getTransactions(sb: SupabaseClient, f: TxnFilter = {}) {
  let q = sb
    .from("transactions")
    .select(
      "id, posted_on, amount, description, payee, pending, category_id, category_source, notes, is_excluded, account_id",
      { count: "exact" },
    )
    .order("posted_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (f.start) q = q.gte("posted_on", f.start);
  if (f.end) q = q.lt("posted_on", f.end);
  if (f.categoryId === "uncategorized") q = q.is("category_id", null);
  else if (f.categoryId) q = q.eq("category_id", f.categoryId);
  if (f.accountId) q = q.eq("account_id", f.accountId);
  if (f.search) {
    const s = f.search.replace(/[%_,()]/g, " ");
    q = q.or(`description.ilike.%${s}%,payee.ilike.%${s}%,notes.ilike.%${s}%`);
  }
  if (f.direction === "in") q = q.gt("amount", 0);
  if (f.direction === "out") q = q.lt("amount", 0);
  if (f.minAmount != null) q = q.gte("amount", f.minAmount);
  if (f.maxAmount != null) q = q.lte("amount", f.maxAmount);
  const limit = f.limit ?? 100;
  const offset = f.offset ?? 0;
  q = q.range(offset, offset + limit - 1);
  const { data, count, error } = await q;
  if (error) throw error;
  return { rows: num(data, ["amount"]) as Txn[], count: count ?? 0 };
}

export async function getSpendingByCategory(sb: SupabaseClient, start: string, end: string) {
  const { data, error } = await sb.rpc("spending_by_category", { start_date: start, end_date: end });
  if (error) throw error;
  return num(data, ["spent", "txn_count"]) as {
    category_id: string | null;
    category: string;
    group: string;
    color: string;
    spent: number;
    txn_count: number;
  }[];
}

export async function getCashflow(sb: SupabaseClient, months = 12) {
  const { data, error } = await sb.rpc("monthly_cashflow", { months });
  if (error) throw error;
  return num(data, ["income", "spending", "net"]) as {
    month: string;
    income: number;
    spending: number;
    net: number;
  }[];
}

export async function getNetWorthHistory(sb: SupabaseClient, days = 365) {
  const { data, error } = await sb.rpc("net_worth_history", { days });
  if (error) throw error;
  return num(data, ["assets", "liabilities", "net_worth"]) as {
    date: string;
    assets: number;
    liabilities: number;
    net_worth: number;
  }[];
}

export async function getBudgets(sb: SupabaseClient) {
  const { data } = await sb.from("budgets").select("category_id, amount");
  return new Map((data ?? []).map((b) => [b.category_id as string, Number(b.amount)]));
}

export async function getHoldings(sb: SupabaseClient) {
  const { data } = await sb
    .from("holdings")
    .select("id, account_id, symbol, description, shares, market_value, cost_basis")
    .order("market_value", { ascending: false, nullsFirst: false });
  return num(data, ["shares", "market_value", "cost_basis"]) as {
    id: string;
    account_id: string;
    symbol: string | null;
    description: string | null;
    shares: number | null;
    market_value: number | null;
    cost_basis: number | null;
  }[];
}

export function netWorth(accounts: Account[]) {
  const inc = accounts.filter((a) => a.include_in_net_worth);
  const assets = inc.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const liabilities = -inc.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0);
  return { assets, liabilities, net: assets - liabilities };
}
