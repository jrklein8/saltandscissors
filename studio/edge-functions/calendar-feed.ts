// ============================================================
// Salt & Scissors Studio — personal calendar relay (Supabase Edge Function)
//
// Why this exists: browsers aren't allowed to read a Google Calendar private
// link directly from a web page. This tiny function does it on the server:
//   1. checks the caller is signed in to the Studio
//   2. reads HER saved calendar link from her own settings row
//   3. fetches that calendar, expands repeating events, and returns just the
//      days/times in the requested window (titles optional)
// It is read-only and never writes to any calendar.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function ->
//         Via Editor -> name it exactly  calendar-feed  -> paste this file.
//         Then open the function's settings and turn OFF
//         "Verify JWT with legacy secret" (this code checks the login itself).
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import ICAL from "npm:ical.js@2.1.0";

const ALLOWED_ORIGINS = ["https://saltandscissors.co", "https://www.saltandscissors.co", "http://localhost:4820", "http://127.0.0.1:4820"];
// only ever fetch from real calendar providers — this can't be used as an open proxy
const ALLOWED_HOSTS = [/^calendar\.google\.com$/, /(^|\.)icloud\.com$/, /^outlook\.live\.com$/, /^outlook\.office365\.com$/, /^outlook\.office\.com$/];
const PUBLISHABLE_KEY = "sb_publishable_vZC-aXl96Dq5lWQEGO-lkQ_udh8Yi2j"; // public by design; fallback if the env var is absent

// <core> ---- pure calendar logic (tested separately under Node) ----
function expandCalendar(ICAL, icsText, fromISO, toISO, showTitles, tz) {
  const TZ = tz || "America/New_York";
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const local = (jsDate) => { // an instant -> { date:'YYYY-MM-DD', time:'HH:MM' } on her wall clock
    const p = {}; for (const part of fmt.formatToParts(jsDate)) p[part.type] = part.value;
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
  };
  const pad = (n) => String(n).padStart(2, "0");
  const isoOf = (t) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  const comp = new ICAL.Component(ICAL.parse(icsText));
  for (const vtz of comp.getAllSubcomponents("vtimezone")) { try { ICAL.TimezoneService.register(vtz); } catch (_e) { /* ignore a bad zone */ } }

  // group by UID so edited single occurrences ("exceptions") attach to their repeating parent
  const byUid = new Map();
  for (const v of comp.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(v);
    const g = byUid.get(ev.uid) || { master: null, exceptions: [] };
    if (ev.isRecurrenceException()) g.exceptions.push(ev); else g.master = ev;
    byUid.set(ev.uid, g);
  }

  const out = [];
  const push = (title, start, end) => { // start/end are ICAL.Time
    const name = showTitles ? (title || "Busy") : "Busy";
    if (start.isDate) { // all-day; DTEND is exclusive
      const first = isoOf(start); let last = end ? addDays(isoOf(end), -1) : first; if (last < first) last = first;
      for (let d = first, i = 0; d <= last && i < 60; d = addDays(d, 1), i++) if (d >= fromISO && d <= toISO) out.push({ date: d, allDay: true, start: null, end: null, title: name });
      return;
    }
    const s = local(start.toJSDate()), e = local((end || start).toJSDate());
    let lastDay = e.date; if (e.time === "00:00" && e.date > s.date) lastDay = addDays(e.date, -1); // ends exactly at midnight -> belongs to the previous day
    for (let d = s.date, i = 0; d <= lastDay && i < 60; d = addDays(d, 1), i++) {
      if (d < fromISO || d > toISO) continue;
      out.push({ date: d, allDay: false, start: d === s.date ? s.time : "00:00", end: d === e.date ? e.time : (d === lastDay && e.time === "00:00" ? "23:59" : "23:59"), title: name });
    }
  };

  const winStart = ICAL.Time.fromDateString(addDays(fromISO, -2)), winEnd = ICAL.Time.fromDateString(addDays(toISO, 2));
  for (const { master, exceptions } of byUid.values()) {
    const status = (ev) => String(ev.component.getFirstPropertyValue("status") || "").toUpperCase();
    if (!master) { for (const x of exceptions) if (status(x) !== "CANCELLED") push(x.summary, x.startDate, x.endDate); continue; }
    if (status(master) === "CANCELLED") continue;
    if (!master.isRecurring()) { push(master.summary, master.startDate, master.endDate); continue; }
    for (const x of exceptions) master.relateException(x);
    const it = master.iterator(); let next, guard = 0;
    while ((next = it.next()) && guard++ < 20000) {
      if (next.compare(winEnd) > 0) break;
      const occ = master.getOccurrenceDetails(next);
      if (occ.endDate.compare(winStart) < 0) continue;
      if (status(occ.item) === "CANCELLED") continue;
      push(occ.item.summary, occ.startDate, occ.endDate);
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || (a.allDay ? -1 : 0) - (b.allDay ? -1 : 0) || String(a.start).localeCompare(String(b.start)));
  return out;
}
// </core>

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const headers = { ...corsHeaders(req.headers.get("origin") ?? ""), "Content-Type": "application/json" };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  try {
    // 1) must be signed in to the Studio
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY") ?? PUBLISHABLE_KEY, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!user) return reply(401, { error: "Please sign in again." });

    // 2) her own settings row (row-level security guarantees it's hers)
    const { data: row } = await sb.from("settings").select("data").maybeSingle();
    const cfg = (row && row.data) || {};
    let link = String(cfg.personalCalUrl || "").trim().replace(/^webcal:\/\//i, "https://");
    if (!link) return reply(200, { events: [], linked: false });
    let host = ""; try { const u = new URL(link); if (u.protocol !== "https:") throw 0; host = u.hostname.toLowerCase(); } catch (_e) { return reply(400, { error: "That calendar link doesn't look right." }); }
    if (!ALLOWED_HOSTS.some((re) => re.test(host))) return reply(400, { error: "Only Google, iCloud and Outlook calendar links are supported." });

    // 3) the window (at most ~100 days)
    const body = await req.json().catch(() => ({}));
    const okDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
    if (!okDate(body.from) || !okDate(body.to) || body.to < body.from) return reply(400, { error: "Bad date range." });
    const span = (new Date(body.to) - new Date(body.from)) / 86400000; if (span > 100) return reply(400, { error: "Date range too long." });

    const res = await fetch(link, { headers: { "User-Agent": "SaltAndScissorsStudio/1.0" } });
    if (!res.ok) return reply(502, { error: "Couldn't read the calendar (" + res.status + "). The link may have been reset." });
    const text = await res.text();
    if (text.length > 20_000_000 || !/BEGIN:VCALENDAR/i.test(text)) return reply(502, { error: "That link didn't return a calendar." });

    const events = expandCalendar(ICAL, text, body.from, body.to, cfg.personalCalTitles !== false, "America/New_York");
    return reply(200, { events, linked: true });
  } catch (err) {
    return reply(500, { error: "Calendar relay error: " + (err && err.message ? err.message : String(err)) });
  }
});
