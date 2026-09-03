-- ============================================================
-- Salt & Scissors Studio — Sept 3, 2026
-- 1) Adds the new columns the updated form uses
-- 2) Imports Rebecca's first two real events into her account
-- Run ONCE in Supabase: SQL Editor -> New query -> paste -> Run
-- ============================================================

-- 1) Schema updates (safe to re-run)
alter table events alter column guest_count type text using guest_count::text;
alter table events add column if not exists experience_detail text;
alter table events add column if not exists event_end text;

-- 2) Import (owner = Rebecca's user id from Authentication -> Users)
insert into events (
  user_id, status, client_name, client_contact, source, occasion, honoree,
  experience, experience_detail, guest_count, event_date, event_time, event_end,
  location, theme, notes, price_quoted, price_agreed, deposit, deposit_paid, paid_in_full
) values
(
  'caa71c62-2cbc-4f4b-98e8-7a8a13ecd2a4', 'booked',
  'Gracyn Janning', 'gracynjanning@gmail.com', null, 'Birthday', 'Stevie, turning 4',
  'Sensory Scenes', 'Playdough', '20', '2026-10-03', '10:30', null,
  'The Park, 380 J H Batts Road', 'Mermaid / Under the Sea',
  'Playdough pre-set up. Kids will decorate jars and take them home. Originally quoted $350 for 15 kids. Added 5 additional children at $10 each.',
  350, 400, 100, true, false
),
(
  'caa71c62-2cbc-4f4b-98e8-7a8a13ecd2a4', 'booked',
  'Brittany Schram', '910-297-0203', 'Referral / Payton''s slime party', 'Birthday', 'Skylar, turning 8',
  'Coastal Creamery', 'Cloud slime', '15–20', '2026-11-07', '13:00', '15:00',
  'Neighborhood marina', 'Cloud slime',
  'Marina reserved 12:30–3:30; party 1–3. Referred from Payton''s slime party. Quoted $350 slime only, $450 slime + canvas painting, or $475 slime + keychain add-on. $150 deposit paid. Final balance for slime-only package: $200.',
  350, 350, 150, true, false
);

-- Check: should show both events with their balances
select client_name, event_date, price_agreed, deposit, deposit_paid,
       price_agreed - case when deposit_paid then deposit else 0 end as balance_due
from events where user_id = 'caa71c62-2cbc-4f4b-98e8-7a8a13ecd2a4' order by event_date;
