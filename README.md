# Ledger

A private, single-user personal finance app — a replacement for Monarch / Origin.

- **Data:** [SimpleFIN Bridge](https://beta-bridge.simplefin.org/) (balances, transactions, holdings), synced daily
- **Stack:** Next.js 16 (App Router) · Supabase (Postgres + Auth + RLS) · Vercel (hosting + cron) · Claude API

## Features

| Area | What it does |
| --- | --- |
| **Overview** | Net worth, month-to-date spending/income/net, 12-month cash flow, top categories vs budget, recent transactions |
| **Transactions** | Search + filter by month/category/account, inline recategorize, "always categorize X as Y" rules (applied retroactively), notes, exclude from reports, AI bulk-categorize |
| **Budgets & cash flow** | Monthly budget per category with 3-month average as a hint, month pacing marker, over-budget flags, month-by-month cash flow table |
| **Net worth** | Assets / liabilities by account group, daily history chart (built from sync snapshots), investment holdings with gain/loss |
| **Ask** | Chat with Claude, which calls read-only tools against your data (transactions, category totals, cash flow, budgets, net worth, holdings) |
| **Settings** | Connect SimpleFIN, sync now, rename/retype/hide accounts, manage categories and rules |

Categorization order on sync: **your rules → built-in keyword map → uncategorized** (then optionally AI). Manual edits are never overwritten.

## Security model

- Magic-link auth via Supabase, restricted to `ALLOWED_EMAILS` (checked at link request, callback, and on every page).
- Every table has RLS `user_id = auth.uid()`; the browser only ever uses the anon key.
- The SimpleFIN access URL is AES-256-GCM encrypted with `ENCRYPTION_KEY` and stored in `simplefin_secrets`, a table with RLS on and **no policies**, so only the server's service-role client can read it.
- `/api/cron/sync` requires `Authorization: Bearer $CRON_SECRET`.
- `robots: noindex`.

## Setup (~15 min)

### 1. Supabase
1. Create a new project.
2. SQL Editor → paste and run `supabase/migrations/0001_init.sql` (or `supabase db push` with the CLI).
3. **Authentication → URL Configuration:** set Site URL to your Vercel URL, and add `http://localhost:3000/auth/callback` and `https://YOUR-APP.vercel.app/auth/callback` to Redirect URLs.
4. After you've signed in once, **Authentication → Sign In / Providers → disable "Allow new users to sign up"**. Belt and suspenders with `ALLOWED_EMAILS`.

### 2. Local
```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev
```

### 3. SimpleFIN
1. Sign up at SimpleFIN Bridge (~$15/yr), connect your banks.
2. Create a new app connection → copy the **setup token**.
3. In Ledger → Settings → paste the token → Connect. It claims the token, encrypts the access URL, and backfills ~90 days.

### 4. Vercel
1. Import the repo, add all env vars from `.env.example` (set `NEXT_PUBLIC_SITE_URL` to the production URL).
2. Deploy. `vercel.json` registers a daily cron (`11:17 UTC` ≈ 4–5am Denver) hitting `/api/cron/sync`.
   Vercel automatically sends `CRON_SECRET` as the bearer token.

## Notes & limits

- **History:** SimpleFIN Bridge gives ~90 days of transactions on first sync; everything after accumulates. Net worth history starts at your first sync (one snapshot per account per day).
- **Rate limit:** Bridge allows roughly 24 requests/day. Initial sync uses 2 (60-day chunks); daily syncs use 1.
- **Pending transactions** are re-pulled with a 10-day overlap; stale pending rows (whose id changed on posting) are removed.
- **Liabilities** are accounts with negative balances (SimpleFIN reports cards/loans as negative). Exclude any account from net worth in Settings.
- **Model:** defaults to `claude-sonnet-5-5`; set `ANTHROPIC_MODEL` to change it.

## Project layout

```
supabase/migrations/0001_init.sql   schema, RLS, reporting SQL functions
src/proxy.ts                        session refresh + auth redirect (Next 16 "proxy", formerly middleware)
src/lib/simplefin.ts                SimpleFIN protocol client (v1 + v2 response shapes)
src/lib/sync.ts                     sync engine (accounts, snapshots, holdings, txns, pending cleanup)
src/lib/categories.ts               default categories + keyword categorizer
src/lib/queries.ts                  shared data layer (pages + AI tools)
src/lib/ai-tools.ts                 Claude tool definitions + executors
src/app/api/chat                    streaming agent loop
src/app/api/categorize              AI bulk categorization
src/app/api/cron/sync               daily sync
src/app/(app)/*                     pages
```

## Ideas for v2
- Recurring/subscription detection + upcoming bills
- Split transactions
- Goals (e.g. savings targets) and debt payoff
- CSV import for history older than SimpleFIN's window
- Weekly AI digest email
