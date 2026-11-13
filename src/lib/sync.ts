import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";
import {
  fetchAccounts,
  guessAccountType,
  orgName,
  sfinErrors,
  type SfinAccountSet,
} from "@/lib/simplefin";
import { categorize, DEFAULT_CATEGORIES, type Rule } from "@/lib/categories";

const DAY = 86_400_000;
const INITIAL_BACKFILL_DAYS = 90; // SimpleFIN Bridge caps history at ~90 days
const OVERLAP_DAYS = 10; // re-pull recent days so pending -> posted settles
const CHUNK_DAYS = 60;

export async function ensureDefaultCategories(sb: SupabaseClient, userId: string) {
  const { count } = await sb
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if ((count ?? 0) > 0) return;
  await sb.from("categories").insert(
    DEFAULT_CATEGORIES.map((c) => ({ user_id: userId, name: c.name, group: c.group, color: c.color })),
  );
}

export type SyncResult = {
  connectionId: string;
  accounts: number;
  newTransactions: number;
  updatedTransactions: number;
  warnings: string[];
};

/** Sync every SimpleFIN connection for a user (or all users when userId omitted, for cron). */
export async function syncAll(userId?: string): Promise<SyncResult[]> {
  const admin = createAdminClient();
  let q = admin.from("simplefin_connections").select("id, user_id, last_synced_at");
  if (userId) q = q.eq("user_id", userId);
  const { data: conns, error } = await q;
  if (error) throw error;

  const results: SyncResult[] = [];
  for (const c of conns ?? []) {
    try {
      results.push(await syncConnection(admin, c));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin
        .from("simplefin_connections")
        .update({ last_sync_status: "error", last_error: msg })
        .eq("id", c.id);
      results.push({ connectionId: c.id, accounts: 0, newTransactions: 0, updatedTransactions: 0, warnings: [msg] });
    }
  }
  return results;
}

async function syncConnection(
  admin: SupabaseClient,
  conn: { id: string; user_id: string; last_synced_at: string | null },
): Promise<SyncResult> {
  const userId = conn.user_id;
  await ensureDefaultCategories(admin, userId);

  const { data: secret, error: secretErr } = await admin
    .from("simplefin_secrets")
    .select("access_url_enc")
    .eq("connection_id", conn.id)
    .single();
  if (secretErr || !secret) throw new Error("Missing SimpleFIN credentials — reconnect in Settings.");
  const accessUrl = decrypt(secret.access_url_enc);

  // Window
  const end = new Date(Date.now() + DAY); // end-date is exclusive
  const start = conn.last_synced_at
    ? new Date(new Date(conn.last_synced_at).getTime() - OVERLAP_DAYS * DAY)
    : new Date(Date.now() - INITIAL_BACKFILL_DAYS * DAY);

  // Categorization context
  const [{ data: cats }, { data: rules }] = await Promise.all([
    admin.from("categories").select("id, name").eq("user_id", userId),
    admin.from("category_rules").select("pattern, category_id, priority").eq("user_id", userId),
  ]);
  const catByName = new Map((cats ?? []).map((c) => [c.name, c.id] as [string, string]));

  const result: SyncResult = {
    connectionId: conn.id,
    accounts: 0,
    newTransactions: 0,
    updatedTransactions: 0,
    warnings: [],
  };

  // Chunk oldest -> newest so the final chunk's balances win.
  for (let s = start.getTime(); s < end.getTime(); s += CHUNK_DAYS * DAY) {
    const chunkStart = new Date(s);
    const chunkEnd = new Date(Math.min(s + CHUNK_DAYS * DAY, end.getTime()));
    const set = await fetchAccounts(accessUrl, { start: chunkStart, end: chunkEnd });
    result.warnings.push(...sfinErrors(set));
    const r = await applyAccountSet(admin, userId, conn.id, set, chunkStart, chunkEnd, (rules ?? []) as Rule[], catByName);
    result.accounts = r.accounts;
    result.newTransactions += r.inserted;
    result.updatedTransactions += r.updated;
  }

  await admin
    .from("simplefin_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: result.warnings.length ? "partial" : "ok",
      last_error: result.warnings.length ? result.warnings.join("\n") : null,
    })
    .eq("id", conn.id);

  return result;
}

async function applyAccountSet(
  admin: SupabaseClient,
  userId: string,
  connectionId: string,
  set: SfinAccountSet,
  windowStart: Date,
  windowEnd: Date,
  rules: Rule[],
  catByName: Map<string, string>,
) {
  let inserted = 0;
  let updated = 0;

  const { data: existingAccts } = await admin
    .from("accounts")
    .select("id, sfin_id")
    .eq("user_id", userId);
  const acctBySfin = new Map((existingAccts ?? []).map((a) => [a.sfin_id, a.id] as [string, string]));

  for (const a of set.accounts) {
    const balanceDate = new Date(a["balance-date"] * 1000);
    const base = {
      user_id: userId,
      connection_id: connectionId,
      sfin_id: a.id,
      name: a.name,
      org_name: orgName(set, a),
      currency: a.currency?.length === 3 ? a.currency : "USD",
      balance: Number(a.balance),
      available_balance: a["available-balance"] != null ? Number(a["available-balance"]) : null,
      balance_date: balanceDate.toISOString(),
      updated_at: new Date().toISOString(),
    };

    let accountId = acctBySfin.get(a.id);
    if (accountId) {
      // Don't clobber user-edited type/display name.
      await admin.from("accounts").update(base).eq("id", accountId);
    } else {
      const { data, error } = await admin
        .from("accounts")
        .insert({ ...base, type: guessAccountType(a) })
        .select("id")
        .single();
      if (error) throw error;
      accountId = data.id as string;
      acctBySfin.set(a.id, accountId);
    }

    // Daily balance snapshot
    await admin.from("balance_snapshots").upsert(
      {
        account_id: accountId,
        user_id: userId,
        date: balanceDate.toISOString().slice(0, 10),
        balance: Number(a.balance),
      },
      { onConflict: "account_id,date" },
    );

    // Holdings (investment accounts, when Bridge provides them)
    if (a.holdings?.length) {
      await admin.from("holdings").upsert(
        a.holdings.map((h) => ({
          user_id: userId,
          account_id: accountId,
          sfin_id: h.id,
          symbol: h.symbol ?? null,
          description: h.description ?? null,
          shares: h.shares != null ? Number(h.shares) : null,
          market_value: h.market_value != null ? Number(h.market_value) : null,
          cost_basis: h.cost_basis != null ? Number(h.cost_basis) : null,
          currency: h.currency ?? "USD",
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "account_id,sfin_id" },
      );
    }

    // Transactions
    const txns = a.transactions ?? [];
    const sfinIds = txns.map((t) => t.id);
    const { data: existing } = sfinIds.length
      ? await admin
          .from("transactions")
          .select("sfin_id")
          .eq("account_id", accountId)
          .in("sfin_id", sfinIds)
      : { data: [] as { sfin_id: string }[] };
    const have = new Set((existing ?? []).map((t) => t.sfin_id));

    const toInsert = [];
    const toUpdate = [];
    for (const t of txns) {
      const ts = t.posted || t.transacted_at || Math.floor(Date.now() / 1000);
      const row = {
        user_id: userId,
        account_id: accountId,
        sfin_id: t.id,
        posted_on: new Date(ts * 1000).toISOString().slice(0, 10),
        transacted_at: t.transacted_at ? new Date(t.transacted_at * 1000).toISOString() : null,
        amount: Number(t.amount),
        description: t.description || t.payee || "(no description)",
        payee: t.payee ?? null,
        memo: t.memo ?? null,
        pending: !!t.pending || t.posted === 0,
      };
      if (have.has(t.id)) {
        toUpdate.push(row); // category fields untouched
      } else {
        const cat = categorize(`${row.description} ${row.payee ?? ""}`, rules, catByName);
        toInsert.push({
          ...row,
          category_id: cat?.categoryId ?? null,
          category_source: cat?.source ?? null,
        });
      }
    }

    for (let i = 0; i < toInsert.length; i += 500) {
      const { error } = await admin.from("transactions").insert(toInsert.slice(i, i + 500));
      if (error) throw error;
    }
    for (let i = 0; i < toUpdate.length; i += 500) {
      const { error } = await admin
        .from("transactions")
        .upsert(toUpdate.slice(i, i + 500), { onConflict: "account_id,sfin_id" });
      if (error) throw error;
    }
    inserted += toInsert.length;
    updated += toUpdate.length;

    // Pending transactions often get a new id once posted — drop stale pendings.
    let del = admin
      .from("transactions")
      .delete()
      .eq("account_id", accountId)
      .eq("pending", true)
      .gte("posted_on", windowStart.toISOString().slice(0, 10))
      .lt("posted_on", windowEnd.toISOString().slice(0, 10));
    if (sfinIds.length) del = del.not("sfin_id", "in", `(${sfinIds.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")})`);
    await del;
  }

  return { accounts: set.accounts.length, inserted, updated };
}
