-- ============================================================
-- Salt & Scissors Studio — market / pop-up sales
-- Run ONCE in Supabase: SQL Editor → New query → paste → Run
--
-- Adds one column so a market event can record what she took in,
-- split by how people paid: {"cash": 212, "venmo": 148, "square": 96.5, "other": null}
-- Safe to run again.
-- ============================================================
alter table events add column if not exists sales jsonb;
