# Salt & Scissors Studio

A phone-first client & event tracker for Salt & Scissors Creative Co. — separate
from the marketing site, behind a login.

**The whole model is one thing: the Event.** A request comes in → you quote it →
it's booked → it's done. Money, supplies, and the packing list all hang off that
one event. No inventory, no recipes, no abstractions.

| Tab | What it does |
|---|---|
| **Home** | Today at a glance: inquiries needing a reply, quotes waiting, booked events ahead, balances due, this month's revenue, and what's up next |
| **Events** | Every request/party with search and status filters (Inquiry → Quoted → Booked → Done, plus Lost), as a list or a month calendar. Events that overlap or sit under an hour apart get an amber heads-up (form, event page, calendar, list) so she can line up extra help |
| **Event page** | Tap-to-advance status, date/time/place with *Add to calendar*, tap-to-call/DM contact, money (quoted/agreed/deposit/paid toggles + balance due), supplies bought for that event with live profit, and a packing checklist auto-loaded from the experience type |
| **Clients** | Built automatically from events — repeat clients float to the top with lifetime spend and honoree names |
| **Money** | Month-by-month revenue / collected / supplies / profit, all-time totals, and a two-file CSV export for tax time |
| **Settings** | Your name, extra-guest rate, the price list that powers the quote helper, and editable packing lists per experience |

Quote helper: pick an experience + guest count on the form and it suggests a price
using your price list (base price includes N guests + per-guest rate for extras).

## Files
- `index.html`, `app.css`, `app.js` — the entire app, no build step
- `schema.sql` — database tables (run once in Supabase)
- `manifest.webmanifest` — lets it install as a home-screen app on phones
- `assets/` — brand logos

## Run it right now (demo mode)
Leave `SUPABASE_URL` / `SUPABASE_KEY` empty in `app.js` and open the folder on any
static server — it runs in **demo mode** with sample data stored in that browser
only. No login. Good for kicking the tires.

```
python -m http.server 4830
# → http://localhost:4830
```

## Make it real (login + sync across phone and laptop) — free
1. **Supabase project** — supabase.com → New project (free tier) → name it
   `salt-scissors-studio`, choose a US-East region, set a DB password, wait ~2 min.
2. **Tables** — Dashboard → SQL Editor → New query → paste all of `schema.sql` → Run.
3. **Her login** — Dashboard → Authentication → Users → **Add user** → her email +
   a password (she can change it later with "Forgot password" on the sign-in screen).
   Then Authentication → Providers → Email → turn **off** "Allow new users to sign up"
   so strangers can't create accounts.
4. **Connect the app** — Dashboard → Project Settings → API. Copy the **Project URL**
   and the **publishable / anon** key (never the secret key). Paste both into the two
   constants at the top of `app.js`. These are safe to publish — Row Level Security
   means the key can only read/write rows belonging to whoever is signed in.
5. Reload → sign-in screen appears → she's in. Data now syncs everywhere she logs in.

## Where it lives — `saltandscissors.co/studio`
This folder sits inside the main website repo (`SaltAndScissors/studio/`), so pushing the
site deploys the app too. No extra repo, subdomain, or DNS.

"Password protection" = the Supabase login. GitHub Pages is static (no server passwords),
but nothing renders and no data exists until someone signs in, the page carries `noindex`,
and it isn't linked from the site. Before Supabase is connected, the public URL shows a
polite "being set up" screen — demo mode only runs on localhost.

## Personal calendar (optional) — shade personal days soft red
Read-only. Shades days with personal commitments on the Events calendar and warns before
booking over them. Works with a Google Calendar "secret address in iCal format" (iCloud and
Outlook subscribe links are also accepted).

Browsers can't fetch that link directly, so a small Supabase Edge Function relays it:

1. Supabase dashboard -> **Edge Functions** -> **Deploy a new function** -> **Via Editor**
2. Name it exactly `calendar-feed`, paste all of `edge-functions/calendar-feed.ts`, **Deploy**
3. Open the function's settings and turn **off** "Verify JWT with legacy secret" (the code
   checks the Studio login itself and only reads the signed-in user's own settings row)
4. In the Studio: gear icon -> **Personal calendar** -> paste the link -> **Save & test**

The function only fetches from Google/iCloud/Outlook calendar hosts, only for a signed-in
user, only that user's saved link, and at most ~100 days at a time. Its calendar logic
(repeats, skipped/rescheduled occurrences, time zones, DST) is covered by a Node test.

## Phone install
Open the URL in Safari/Chrome → Share → **Add to Home Screen**. It opens full-screen
with the S&S logo like a native app.
