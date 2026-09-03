-- ============================================================
-- Salt & Scissors Studio — item quantity → cost per unit
-- Adds an optional qty to items so the app can show "24 × $0.48 ea".
-- Safe to re-run. Supabase: SQL Editor -> New query -> paste -> Run
-- ============================================================

alter table expenses add column if not exists qty numeric;

-- Check
select column_name, data_type from information_schema.columns
where table_name = 'expenses' and column_name = 'qty';
