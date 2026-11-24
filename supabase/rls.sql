-- Mohalla row-level security for Supabase (plan section 6). Run after schema.sql.
--
-- The FastAPI backend connects with DATABASE_URL as the `postgres` role (table owner), which bypasses RLS,
-- so the API keeps working unchanged. These policies only matter for direct browser access with the
-- anon/publishable key + the user's JWT (e.g. Supabase Realtime), where:
--   pools            any signed-in user can read
--   pool_progress    aggregate-only view of pool_commitments (never which shop committed what)
--   nudges           a merchant reads only their own rows
--   chain_txs        signed-in users can read (it holds only hashes)
-- Every other table has RLS on and no policy, so only the service role / backend can touch it.

-- 1) RLS on for every table ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','merchants','daily_sales','transactions','skus','distributors','schemes',
                           'inventory','category_mix','invoices','forecasts','nudges','pools','pool_invites',
                           'pool_commitments','deliveries','loans','trust_scores','chain_txs','pending_actions',
                           'demo_snapshots']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 2) pools: readable by any signed-in user ---------------------------------------------------
drop policy if exists pools_read on public.pools;
create policy pools_read on public.pools for select to authenticated using (true);

-- 3) nudges: a merchant reads (and marks heard) only their own --------------------------------
drop policy if exists nudges_read_own on public.nudges;
create policy nudges_read_own on public.nudges for select to authenticated
  using (merchant_id = (select p.merchant_id from public.profiles p where p.id = auth.uid()));
drop policy if exists nudges_mark_heard_own on public.nudges;
create policy nudges_mark_heard_own on public.nudges for update to authenticated
  using (merchant_id = (select p.merchant_id from public.profiles p where p.id = auth.uid()))
  with check (merchant_id = (select p.merchant_id from public.profiles p where p.id = auth.uid()));

-- 4) chain_txs: hashes only, readable by signed-in users -------------------------------------
drop policy if exists chain_txs_read on public.chain_txs;
create policy chain_txs_read on public.chain_txs for select to authenticated using (true);

-- 5) profiles: users can read their own profile ----------------------------------------------
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());

-- 6) pool_commitments: aggregates only, through a view (the table itself has no policy) -------
create or replace view public.pool_progress
with (security_invoker = false) as
  select pool_id,
         count(*)                                    as member_count,
         coalesce(sum(cases), 0)                     as committed_cases,
         max(created_at)                             as last_join_at
  from public.pool_commitments
  where status <> 'refunded'
  group by pool_id;
revoke all on public.pool_progress from anon;
grant select on public.pool_progress to authenticated;

-- 7) Realtime (optional): stream pool + tx changes to the browser ----------------------------
-- alter publication supabase_realtime add table public.pools, public.chain_txs, public.nudges;

-- 8) Profile row for every new auth user (role is chosen later via POST /onboarding) ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, display_name, email, lang, created_at)
  values (new.id, null, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
          new.email, 'hi', now())
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
