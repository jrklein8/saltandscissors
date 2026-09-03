-- ============================================================
-- Salt & Scissors Studio — database setup
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run
-- Four small tables. Every row belongs to the signed-in user.
-- ============================================================

create table if not exists events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status        text not null default 'inquiry',   -- inquiry | quoted | booked | done | lost
  client_name   text not null,
  client_contact text,                              -- @handle, phone, or email (free text)
  source        text,                               -- Website form, Instagram, Referral…
  occasion      text,                               -- Birthday, Girls' Night, Shower…
  experience    text,                               -- Coastal Creamery, Charm Bar…
  experience_detail text,                           -- "Playdough", "Cloud slime", add-ons
  honoree       text,                               -- guest of honor ("Harper, turning 7")
  guest_count   text,                               -- "15" or a range like "15–20"
  event_date    date,
  event_time    text,                               -- start, "14:00"
  event_end     text,                               -- end, "16:00"
  location      text,
  theme         text,
  notes         text,
  price_lines   jsonb not null default '[]'::jsonb, -- per-event package: [{label, amount}, …]
  price_quoted  numeric,
  price_agreed  numeric,
  deposit       numeric,
  deposit_paid  boolean not null default false,
  paid_in_full  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- receipts / orders: actual spend for an event (photo lives in Storage bucket "receipts")
create table if not exists receipts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id      uuid not null references events(id) on delete cascade,
  vendor        text,
  receipt_date  date,
  subtotal      numeric not null default 0,     -- items subtotal on the receipt
  shipping      numeric not null default 0,
  tax           numeric not null default 0,
  image_path    text,                           -- "<user_id>/<receipt_id>.jpg" in Storage
  notes         text,
  created_at    timestamptz not null default now()
);

-- individual items bought for a specific event (optionally linked to a receipt)
create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id    uuid not null references events(id) on delete cascade,
  receipt_id  uuid references receipts(id) on delete set null,
  item        text not null,
  qty         numeric,                        -- how many in the pack → cost each
  cost        numeric not null default 0,     -- line total
  store       text,
  created_at  timestamptz not null default now()
);

-- packing checklist per event
create table if not exists checklist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id    uuid not null references events(id) on delete cascade,
  label       text not null,
  done        boolean not null default false,
  sort        int not null default 0
);

-- one settings row per user (price list, packing templates, name)
create table if not exists settings (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- Row Level Security: each user sees only their own rows
alter table events    enable row level security;
alter table expenses  enable row level security;
alter table checklist enable row level security;
alter table settings  enable row level security;

create policy "own events"    on events    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own expenses"  on expenses  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own checklist" on checklist for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own settings"  on settings  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter table receipts enable row level security;
create policy "own receipts"  on receipts  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage: private bucket for receipt photos; each user can only touch their own folder
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;
create policy "own receipt files" on storage.objects for all
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

create index if not exists events_user_date on events (user_id, event_date);
create index if not exists expenses_event  on expenses (event_id);
create index if not exists checklist_event on checklist (event_id);
