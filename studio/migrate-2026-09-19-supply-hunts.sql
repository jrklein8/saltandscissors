-- ============================================================
-- Salt & Scissors Studio — Supply finder (Sept 19, 2026)
-- One table: a "hunt" is something she needs to buy, with its budget,
-- deadline, and the options she's comparing (stored as JSON).
-- Safe to re-run. Supabase: SQL Editor -> New query -> paste -> Run
-- ============================================================

create table if not exists hunts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id          uuid references events(id) on delete set null,   -- optional: which party it's for
  name              text not null,                                   -- "Resin sea creatures"
  query             text,                                            -- search words for the store buttons
  guests            numeric,
  units_per_guest   numeric default 1,
  need_by           date,
  charge_per_guest  numeric,                                         -- what she charges per kid/customer
  target_margin     numeric,                                         -- % profit margin she wants
  max_unit_cost     numeric,                                         -- most she'll pay for ONE of this item
  notes             text,
  status            text not null default 'open',                    -- open | decided
  chosen_id         text,                                            -- id of the chosen option
  options           jsonb not null default '[]'::jsonb,              -- [{id,title,store,url,pack_price,pack_qty,shipping,arrives_by,rating,reviews,is_current,notes}]
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table hunts enable row level security;
drop policy if exists "own hunts" on hunts;
create policy "own hunts" on hunts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists hunts_user on hunts (user_id, created_at desc);

-- Check
select policyname from pg_policies where tablename = 'hunts';
