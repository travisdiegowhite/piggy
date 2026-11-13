"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAdminClient, createClient, isAllowedEmail, requireUser } from "@/lib/supabase/server";
import { claimSetupToken } from "@/lib/simplefin";
import { encrypt } from "@/lib/crypto";
import { syncAll, ensureDefaultCategories } from "@/lib/sync";

export type ActionState = { ok?: boolean; error?: string; message?: string } | null;

// ---------------------------------------------------------------- auth

export async function sendMagicLink(_: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!isAllowedEmail(email)) {
    // Same response either way — don't reveal which emails are allowed.
    return { ok: true, message: "If that email is allowed, a sign-in link is on its way." };
  }
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };
  return { ok: true, message: "If that email is allowed, a sign-in link is on its way." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------------------------------------------------------------- simplefin

export async function connectSimpleFin(_: ActionState, form: FormData): Promise<ActionState> {
  const { user } = await requireUser();
  const token = String(form.get("token") ?? "").trim();
  const label = String(form.get("label") ?? "").trim() || "SimpleFIN";
  if (!token) return { error: "Paste a setup token from SimpleFIN Bridge." };

  let accessUrl: string;
  try {
    accessUrl = await claimSetupToken(token);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Claim failed" };
  }

  const admin = createAdminClient();
  const { data: conn, error } = await admin
    .from("simplefin_connections")
    .insert({ user_id: user.id, label })
    .select("id")
    .single();
  if (error) return { error: error.message };
  const { error: secErr } = await admin
    .from("simplefin_secrets")
    .insert({ connection_id: conn.id, user_id: user.id, access_url_enc: encrypt(accessUrl) });
  if (secErr) return { error: secErr.message };

  const results = await syncAll(user.id);
  revalidatePath("/", "layout");
  const r = results.find((r) => r.connectionId === conn.id);
  return {
    ok: true,
    message: `Connected. Pulled ${r?.accounts ?? 0} accounts and ${r?.newTransactions ?? 0} transactions.${
      r?.warnings.length ? ` Warnings: ${r.warnings.join("; ")}` : ""
    }`,
  };
}

export async function syncNow(): Promise<ActionState> {
  const { user } = await requireUser();
  const results = await syncAll(user.id);
  revalidatePath("/", "layout");
  const n = results.reduce((s, r) => s + r.newTransactions, 0);
  const warnings = results.flatMap((r) => r.warnings);
  return {
    ok: warnings.length === 0,
    message: `Synced ${results.length} connection(s), ${n} new transactions.${warnings.length ? " " + warnings.join("; ") : ""}`,
  };
}

export async function deleteConnection(form: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("simplefin_connections").delete().eq("id", String(form.get("id")));
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- accounts

export async function updateAccount(form: FormData) {
  const { supabase } = await requireUser();
  const id = String(form.get("id"));
  const patch: Record<string, unknown> = {};
  if (form.has("type")) patch.type = String(form.get("type"));
  if (form.has("display_name")) patch.display_name = String(form.get("display_name")).trim() || null;
  if (form.has("is_hidden")) patch.is_hidden = form.get("is_hidden") === "true";
  if (form.has("include_in_net_worth")) patch.include_in_net_worth = form.get("include_in_net_worth") === "true";
  await supabase.from("accounts").update(patch).eq("id", id);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- transactions

export async function setTransactionCategory(input: {
  id: string;
  categoryId: string | null;
  createRule?: string | null; // pattern
  applyToExisting?: boolean;
}) {
  const { supabase, user } = await requireUser();
  await supabase
    .from("transactions")
    .update({ category_id: input.categoryId, category_source: input.categoryId ? "manual" : null })
    .eq("id", input.id);

  if (input.createRule && input.categoryId) {
    const pattern = input.createRule.trim();
    await supabase
      .from("category_rules")
      .upsert(
        { user_id: user.id, pattern, category_id: input.categoryId, priority: 50 },
        { onConflict: "user_id,pattern" },
      );
    if (input.applyToExisting) {
      // Re-categorize everything matching that isn't manually set.
      const p = pattern.replace(/[%_,()*]/g, " ").trim();
      if (p) {
        await supabase
          .from("transactions")
          .update({ category_id: input.categoryId, category_source: "rule" })
          .or(`description.ilike.*${p}*,payee.ilike.*${p}*`)
          .or("category_source.is.null,category_source.neq.manual");
      }
    }
  }
  revalidatePath("/", "layout");
}

export async function toggleExcluded(id: string, excluded: boolean) {
  const { supabase } = await requireUser();
  await supabase.from("transactions").update({ is_excluded: excluded }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function setTransactionNote(id: string, notes: string) {
  const { supabase } = await requireUser();
  await supabase.from("transactions").update({ notes: notes || null }).eq("id", id);
  revalidatePath("/transactions");
}

// ---------------------------------------------------------------- categories, rules, budgets

export async function upsertCategory(form: FormData) {
  const { supabase, user } = await requireUser();
  const id = form.get("id") ? String(form.get("id")) : undefined;
  const row = {
    user_id: user.id,
    name: String(form.get("name")).trim(),
    group: String(form.get("group") ?? "lifestyle"),
    color: String(form.get("color") ?? "#64748b"),
  };
  if (!row.name) return;
  if (id) await supabase.from("categories").update(row).eq("id", id);
  else await supabase.from("categories").insert(row);
  revalidatePath("/", "layout");
}

export async function deleteCategory(form: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("categories").delete().eq("id", String(form.get("id")));
  revalidatePath("/", "layout");
}

export async function deleteRule(form: FormData) {
  const { supabase } = await requireUser();
  await supabase.from("category_rules").delete().eq("id", String(form.get("id")));
  revalidatePath("/settings");
}

export async function setBudget(categoryId: string, amount: number | null) {
  const { supabase, user } = await requireUser();
  if (amount == null || Number.isNaN(amount) || amount <= 0) {
    await supabase.from("budgets").delete().eq("category_id", categoryId);
  } else {
    await supabase
      .from("budgets")
      .upsert({ user_id: user.id, category_id: categoryId, amount }, { onConflict: "user_id,category_id" });
  }
  revalidatePath("/budgets");
  revalidatePath("/");
}

export async function seedCategories() {
  const { supabase, user } = await requireUser();
  await ensureDefaultCategories(supabase, user.id);
  revalidatePath("/", "layout");
}
