-- Ledger: personal finance schema
-- Single-user app, but every table is keyed by user_id with RLS so the
-- anon key can never read anything without a session.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- SimpleFIN connections (access URL is AES-GCM encrypted app-side)
-- ---------------------------------------------------------------------------
create table public.simplefin_connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  label            text not null default 'SimpleFIN',
  last_synced_at   timestamptz,
  last_sync_status text,
  last_error       text,
  created_at       timestamptz not null default now()
);

-- Encrypted access URLs live in their own table with RLS on and NO policies,
-- so only the service role (server-side sync) can ever read them.
create table public.simplefin_secrets (
  connection_id  uuid primary key references public.simplefin_connections(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  access_url_enc text not null
);
alter table public.simplefin_secrets enable row level security;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------
create table public.accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  connection_id      uuid references public.simplefin_connections(id) on delete set null,
  sfin_id            text not null,
  name               text not null,
  display_name       text,
  org_name           text,
  currency           text not null default 'USD',
  type               text not null default 'other'
                       check (type in ('checking','savings','credit','investment','retirement','loan','property','other')),
  balance            numeric(14,2) not null default 0,
  available_balance  numeric(14,2),
  balance_date       timestamptz,
  is_hidden          boolean not null default false,
  include_in_net_worth boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, sfin_id)
);

create table public.balance_snapshots (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  balance    numeric(14,2) not null,
  primary key (account_id, date)
);
create index on public.balance_snapshots (user_id, date);

create table public.holdings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  account_id    uuid not null references public.accounts(id) on delete cascade,
  sfin_id       text not null,
  symbol        text,
  description   text,
  shares        numeric(20,6),
  market_value  numeric(14,2),
  cost_basis    numeric(14,2),
  currency      text default 'USD',
  updated_at    timestamptz not null default now(),
  unique (account_id, sfin_id)
);

-- ---------------------------------------------------------------------------
-- Categories, rules, budgets
-- ---------------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  "group"     text not null default 'lifestyle'
                check ("group" in ('income','essentials','lifestyle','savings','transfer')),
  color       text not null default '#64748b',
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table public.category_rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  pattern      text not null,           -- case-insensitive substring of description/payee
  category_id  uuid not null references public.categories(id) on delete cascade,
  priority     int not null default 100, -- lower wins
  created_at   timestamptz not null default now(),
  unique (user_id, pattern)
);

create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category_id  uuid not null references public.categories(id) on delete cascade,
  amount       numeric(12,2) not null check (amount >= 0), -- monthly
  unique (user_id, category_id)
);

-- ---------------------------------------------------------------------------
-- Transactions
-- ---------------------------------------------------------------------------
create table public.transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  account_id       uuid not null references public.accounts(id) on delete cascade,
  sfin_id          text not null,
  posted_on        date not null,
  transacted_at    timestamptz,
  amount           numeric(14,2) not null,  -- positive = money in
  description      text not null,
  payee            text,
  memo             text,
  pending          boolean not null default false,
  category_id      uuid references public.categories(id) on delete set null,
  category_source  text check (category_source in ('rule','default','manual','ai')),
  notes            text,
  is_excluded      boolean not null default false,
  created_at       timestamptz not null default now(),
  unique (account_id, sfin_id)
);
create index on public.transactions (user_id, posted_on desc);
create index on public.transactions (user_id, category_id, posted_on);

-- ---------------------------------------------------------------------------
-- RLS: owner-only on everything
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'simplefin_connections','accounts','balance_snapshots','holdings',
    'categories','category_rules','budgets','transactions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner_all" on public.%I for all
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Reporting helpers (security invoker => RLS still applies)
-- ---------------------------------------------------------------------------

-- Monthly income / spending, excluding transfers and excluded rows.
create or replace function public.monthly_cashflow(months int default 12)
returns table (month date, income numeric, spending numeric, net numeric)
language sql stable security invoker as $$
  select date_trunc('month', t.posted_on)::date as month,
         coalesce(sum(t.amount) filter (where t.amount > 0), 0) as income,
         coalesce(-sum(t.amount) filter (where t.amount < 0), 0) as spending,
         coalesce(sum(t.amount), 0) as net
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.is_excluded = false
    and coalesce(c."group", '') <> 'transfer'
    and t.posted_on >= (date_trunc('month', current_date) - make_interval(months => months - 1))::date
  group by 1
  order by 1;
$$;

-- Spending per category for a date range (positive numbers = spent).
create or replace function public.spending_by_category(start_date date, end_date date)
returns table (category_id uuid, category text, "group" text, color text, spent numeric, txn_count bigint)
language sql stable security invoker as $$
  select c.id, coalesce(c.name, 'Uncategorized'), coalesce(c."group", 'lifestyle'),
         coalesce(c.color, '#94a3b8'),
         -sum(t.amount) as spent, count(*) as txn_count
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.is_excluded = false
    and coalesce(c."group", '') not in ('transfer','income')
    and t.posted_on >= start_date and t.posted_on < end_date
  group by 1,2,3,4
  having -sum(t.amount) <> 0
  order by spent desc;
$$;

-- Daily net worth, carrying each account's last known balance forward.
create or replace function public.net_worth_history(days int default 365)
returns table (date date, assets numeric, liabilities numeric, net_worth numeric)
language sql stable security invoker as $$
  with d as (
    select generate_series(current_date - (days - 1), current_date, interval '1 day')::date as date
  ),
  accts as (
    select id from public.accounts where include_in_net_worth
  ),
  filled as (
    select d.date, a.id as account_id,
      (select s.balance from public.balance_snapshots s
        where s.account_id = a.id and s.date <= d.date
        order by s.date desc limit 1) as balance
    from d cross join accts a
  )
  select date,
         coalesce(sum(balance) filter (where balance > 0), 0) as assets,
         coalesce(-sum(balance) filter (where balance < 0), 0) as liabilities,
         coalesce(sum(balance), 0) as net_worth
  from filled
  group by date
  having count(balance) > 0
  order by date;
$$;
