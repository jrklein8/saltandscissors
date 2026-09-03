-- ============================================================
-- Salt & Scissors Studio — receipts & orders (Sept 3, 2026)
-- Adds receipt uploads per event. Safe to re-run.
-- Run in Supabase: SQL Editor -> New query -> paste -> Run
-- ============================================================

-- 1) receipts table
create table if not exists receipts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id      uuid not null references events(id) on delete cascade,
  vendor        text,
  receipt_date  date,
  subtotal      numeric not null default 0,
  shipping      numeric not null default 0,
  tax           numeric not null default 0,
  image_path    text,
  notes         text,
  created_at    timestamptz not null default now()
);
alter table receipts enable row level security;
drop policy if exists "own receipts" on receipts;
create policy "own receipts" on receipts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists receipts_event on receipts (event_id);

-- 2) items can link to a receipt
alter table expenses add column if not exists receipt_id uuid references receipts(id) on delete set null;

-- 3) private Storage bucket for receipt photos (each user only sees their own folder)
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;
drop policy if exists "own receipt files" on storage.objects;
create policy "own receipt files" on storage.objects for all
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Check: bucket + policy exist
select id, public from storage.buckets where id = 'receipts';
select policyname from pg_policies where tablename in ('receipts','objects') and policyname like 'own receipt%';
