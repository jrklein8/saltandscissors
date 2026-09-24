-- ============================================================
-- Salt & Scissors Studio — Google Calendar auto-add
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run
--
-- One small table that remembers her Google connection.
-- The token is stored ENCRYPTED by the google-calendar Edge Function
-- (the key lives only in that function's secrets), so even a signed-in
-- browser only ever sees scrambled text. Safe to run again.
-- ============================================================

create table if not exists google_link (
  user_id       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  token_enc     text not null,                       -- encrypted Google refresh token
  calendar_id   text not null,                       -- the "Salt & Scissors" calendar the Studio created
  email         text,                                -- which Google account (display only)
  connected_at  timestamptz not null default now()
);

alter table google_link enable row level security;

drop policy if exists "own google link" on google_link;
create policy "own google link" on google_link for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
