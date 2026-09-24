// ============================================================
// Salt & Scissors Studio — Google Calendar auto-add (Supabase Edge Function)
//
// What it does: once she taps "Connect Google Calendar" in the Studio, every
// event she creates, edits, reschedules, marks lost or deletes is mirrored into
// a calendar named "Salt & Scissors" inside her Google account, within seconds.
//
// What it can touch: ONLY calendars this app created (Google scope
// "calendar.app.created"). It cannot read or change her personal calendar.
//
// Every request must come from a signed-in Studio user; all database reads and
// writes run as her, under row-level security. Her Google token is stored
// encrypted with a key that exists only in this function's secrets.
//
// Deploy: Supabase dashboard -> Edge Functions -> Deploy a new function ->
//         Via Editor -> name it exactly  google-calendar  -> paste this file.
//         Turn OFF "Verify JWT with legacy secret" (this code checks the login).
//         Edge Functions -> Secrets: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
//         (from the Google Cloud OAuth client — see studio/README.md).
// ============================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://saltandscissors.co", "https://www.saltandscissors.co", "http://localhost:4820", "http://127.0.0.1:4820"];
// where Google may send her back after she approves — must also be listed on the Google OAuth client
const ALLOWED_REDIRECTS = ["https://saltandscissors.co/studio/", "https://www.saltandscissors.co/studio/", "http://localhost:4820/studio/"];
const PUBLISHABLE_KEY = "sb_publishable_vZC-aXl96Dq5lWQEGO-lkQ_udh8Yi2j"; // public by design; fallback if the env var is absent
const SCOPES = "openid email https://www.googleapis.com/auth/calendar.app.created";
const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const CAL_NAME = "Salt & Scissors";
const TZ = "America/New_York";
const STUDIO_URL = "https://saltandscissors.co/studio/";
const GAPI = "https://www.googleapis.com/calendar/v3";
const KEEP_DAYS = 30; // a full sync covers events from 30 days ago onward

// <core> ---- pure mapping: a Studio event -> a Google Calendar event (tested separately under Node) ----
// Google lets us choose the event id (letters a-v + digits). A uuid without dashes fits, so no extra column is needed.
function gEventId(uuid) { return String(uuid).replace(/-/g, "").toLowerCase(); }
function shouldMirror(e) { return !!(e && e.event_date && e.status !== "lost"); }
function gEventBody(e, studioUrl) {
  const pad = (n) => String(n).padStart(2, "0");
  const hm = (t) => String(t || "").slice(0, 5);
  const title = (e.status === "inquiry" || e.status === "quoted" ? "(" + e.status + ") " : "") +
    "Salt & Scissors: " + e.client_name + (e.experience ? " — " + e.experience + (e.experience_detail ? " (" + e.experience_detail + ")" : "") : "");
  const details = [e.occasion, e.honoree, e.guest_count ? e.guest_count + " guests" : "", e.theme ? "Theme: " + e.theme : "",
    e.client_contact ? "Contact: " + e.client_contact : "", e.notes, "Open in the Studio: " + studioUrl + "#/event/" + e.id].filter(Boolean).join("\n");
  let start, end;
  if (e.event_time) { // her end time, or start + 2h (same rule as the Studio's "Add to calendar")
    const s = hm(e.event_time); let en = hm(e.event_end);
    if (!en || en <= s) { const [h, m] = s.split(":").map(Number); en = pad(Math.min(23, h + 2)) + ":" + pad(m); }
    start = { dateTime: e.event_date + "T" + s + ":00", timeZone: "America/New_York" };
    end = { dateTime: e.event_date + "T" + en + ":00", timeZone: "America/New_York" };
  } else { // all-day: Google's end date is exclusive, so it's the NEXT day
    const d = new Date(e.event_date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1);
    start = { date: e.event_date }; end = { date: d.toISOString().slice(0, 10) };
  }
  // Google's own palette: grape = inquiry, banana = quoted, sage = booked, graphite = done
  const colorId = { inquiry: "3", quoted: "5", booked: "2", done: "8" }[e.status] || "2";
  return { summary: title, description: details, location: e.location || "", start, end, colorId, status: "confirmed",
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 1440 }] },
    source: { title: "Salt & Scissors Studio", url: studioUrl } };
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

class Fail extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }

// ---- token encryption (AES-GCM, key derived from the client secret; never leaves this function) ----
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function cryptoKey(secret) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret + "|studio-google-token-v1"));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function seal(secret, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(secret), new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length); return b64(out);
}
async function unseal(secret, sealed) {
  const raw = unb64(sealed);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await cryptoKey(secret), raw.slice(12));
  return new TextDecoder().decode(pt);
}

// ---- Google plumbing ----
async function tokenRequest(params) {
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === "invalid_grant") throw new Fail(409, "reconnect", "Google needs you to connect again (Settings → Google Calendar).");
    throw new Fail(502, "google", "Google sign-in error: " + (data.error_description || data.error || res.status));
  }
  return data;
}
function google(accessToken) {
  return async (method, path, body) => {
    const res = await fetch(GAPI + path, { method, headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    let data = null; if (res.status !== 204) data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, data };
  };
}
const gErr = (r) => (r.data && r.data.error && r.data.error.message) || ("HTTP " + r.status);
async function createCalendar(g) {
  const r = await g("POST", "/calendars", { summary: CAL_NAME, timeZone: TZ, description: "Events from the Salt & Scissors Studio. Kept up to date automatically — make changes in the Studio, not here." });
  if (!r.ok) throw new Fail(502, "google", "Couldn't create the calendar: " + gErr(r));
  return r.data.id;
}
async function findOrCreateCalendar(g, knownId) {
  if (knownId) { const r = await g("GET", "/calendars/" + encodeURIComponent(knownId)); if (r.ok) return knownId; }
  try { // reconnecting? reuse the calendar we made last time instead of piling up duplicates
    const r = await g("GET", "/users/me/calendarList?minAccessRole=owner&maxResults=250");
    const hit = r.ok && (r.data.items || []).find((c) => c.summary === CAL_NAME && !c.primary && !c.deleted);
    if (hit) return hit.id;
  } catch (_e) { /* fall through to create */ }
  return await createCalendar(g);
}
class CalendarGone extends Error {}
async function upsertEvent(g, calId, e) {
  const cal = "/calendars/" + encodeURIComponent(calId) + "/events", id = gEventId(e.id), body = gEventBody(e, STUDIO_URL);
  let r = await g("PUT", cal + "/" + id, body);
  if (r.status === 404 || r.status === 410) {
    r = await g("POST", cal, { ...body, id });
    if (r.status === 404) throw new CalendarGone();
    if (r.status === 409) r = await g("PATCH", cal + "/" + id, body); // id is taken by a removed copy — bring that one back
  }
  if (!r.ok) throw new Fail(502, "google", "Google Calendar wouldn't save " + e.client_name + ": " + gErr(r));
}
async function removeEvent(g, calId, uuid) {
  const r = await g("DELETE", "/calendars/" + encodeURIComponent(calId) + "/events/" + gEventId(uuid));
  if (!r.ok && ![404, 410].includes(r.status)) throw new Fail(502, "google", "Google Calendar wouldn't remove an event: " + gErr(r));
  return r.ok;
}
async function pool(items, size, fn) { // a few at a time — quick, but gentle on Google's rate limits
  let i = 0; const run = async () => { while (i < items.length) { const it = items[i++]; await fn(it); } };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
}
const daysAgoISO = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

async function fullSync(sb, g, calId) {
  const since = daysAgoISO(KEEP_DAYS);
  const { data: rows, error } = await sb.from("events").select("*").gte("event_date", since);
  if (error) throw new Fail(500, "db", error.message);
  const keep = (rows || []).filter(shouldMirror);
  await pool(keep, 4, (e) => upsertEvent(g, calId, e));
  // anything in the Google calendar (same window) that the Studio no longer has -> remove
  const want = new Set(keep.map((e) => gEventId(e.id))); const stale = []; let page = "";
  do {
    const r = await g("GET", "/calendars/" + encodeURIComponent(calId) + "/events?maxResults=2500&showDeleted=false&timeMin=" + encodeURIComponent(since + "T00:00:00Z") + (page ? "&pageToken=" + encodeURIComponent(page) : ""));
    if (!r.ok) break;
    for (const it of r.data.items || []) if (!want.has(it.id)) stale.push(it.id);
    page = r.data.nextPageToken || "";
  } while (page);
  await pool(stale, 4, async (id) => { await g("DELETE", "/calendars/" + encodeURIComponent(calId) + "/events/" + id); });
  return { synced: keep.length, removed: stale.length };
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
    if (!user) return reply(401, { error: "Please sign in again.", code: "signin" });

    const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID"), CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!CLIENT_ID || !CLIENT_SECRET) return reply(503, { error: "Google Calendar isn't set up yet (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET secrets).", code: "not_configured" });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    // her own row (row-level security guarantees it's hers)
    const { data: link } = await sb.from("google_link").select("token_enc, calendar_id, email, connected_at").maybeSingle();

    if (action === "status") return reply(200, { connected: !!link, email: link ? link.email : null, connectedAt: link ? link.connected_at : null });

    if (action === "start") { // build the Google approval link
      if (!ALLOWED_REDIRECTS.includes(body.redirect_uri)) return reply(400, { error: "Unknown return address." });
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(String(body.state || ""))) return reply(400, { error: "Bad state." });
      const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      u.search = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: body.redirect_uri, response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent", state: body.state }).toString();
      return reply(200, { url: u.toString() });
    }

    if (action === "exchange") { // she approved: trade the one-time code for a long-lived token, make the calendar, first sync
      if (!ALLOWED_REDIRECTS.includes(body.redirect_uri) || !body.code) return reply(400, { error: "Bad request." });
      const tok = await tokenRequest({ code: String(body.code), client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: body.redirect_uri, grant_type: "authorization_code" });
      if (!String(tok.scope || "").split(" ").includes(CAL_SCOPE)) return reply(400, { error: "The calendar box wasn't ticked on Google's screen. Tap Connect again and leave it checked.", code: "scope" });
      if (!tok.refresh_token) return reply(400, { error: "Google didn't return a long-lived token. Tap Connect again.", code: "scope" });
      let email = null; try { email = JSON.parse(atob(String(tok.id_token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).email || null; } catch (_e) { /* display only */ }
      const g = google(tok.access_token);
      const calId = await findOrCreateCalendar(g, link ? link.calendar_id : null);
      const { error } = await sb.from("google_link").upsert({ user_id: user.id, token_enc: await seal(CLIENT_SECRET, tok.refresh_token), calendar_id: calId, email, connected_at: new Date().toISOString() });
      if (error) return reply(500, { error: "Couldn't save the connection: " + error.message + " (has the google-calendar migration been run?)", code: "db" });
      const result = await fullSync(sb, g, calId);
      return reply(200, { ok: true, connected: true, email, ...result });
    }

    if (!link) return reply(409, { error: "Google Calendar isn't connected.", code: "not_connected" });

    if (action === "disconnect") { // forget the connection; her calendar and its events stay in Google
      try { const rt = await unseal(CLIENT_SECRET, link.token_enc); await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(rt), { method: "POST" }); } catch (_e) { /* best effort */ }
      const { error } = await sb.from("google_link").delete().eq("user_id", user.id);
      if (error) return reply(500, { error: error.message, code: "db" });
      return reply(200, { ok: true, connected: false });
    }

    if (action === "sync") {
      let refresh; try { refresh = await unseal(CLIENT_SECRET, link.token_enc); } catch (_e) { throw new Fail(409, "reconnect", "Google needs you to connect again (Settings → Google Calendar)."); }
      const tok = await tokenRequest({ refresh_token: refresh, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "refresh_token" });
      const g = google(tok.access_token);
      let calId = link.calendar_id;
      const ids = Array.isArray(body.ids) ? body.ids.filter((x) => /^[0-9a-f-]{36}$/i.test(String(x))).slice(0, 50) : null;
      try {
        if (!ids) return reply(200, { ok: true, ...(await fullSync(sb, g, calId)) });
        const { data: rows, error } = await sb.from("events").select("*").in("id", ids);
        if (error) throw new Fail(500, "db", error.message);
        const byId = new Map((rows || []).map((e) => [e.id, e])); let synced = 0, removed = 0;
        for (const id of ids) { // gone from the Studio, marked lost, or no date yet -> it shouldn't be on her calendar
          const e = byId.get(id);
          if (shouldMirror(e)) { await upsertEvent(g, calId, e); synced++; } else if (await removeEvent(g, calId, id)) removed++;
        }
        return reply(200, { ok: true, synced, removed });
      } catch (err) {
        if (!(err instanceof CalendarGone)) throw err;
        // she deleted the calendar in Google — make a fresh one and refill it
        calId = await createCalendar(g);
        await sb.from("google_link").update({ calendar_id: calId }).eq("user_id", user.id);
        return reply(200, { ok: true, recreated: true, ...(await fullSync(sb, g, calId)) });
      }
    }

    return reply(400, { error: "Unknown action." });
  } catch (err) {
    if (err instanceof Fail) return reply(err.status, { error: err.message, code: err.code });
    return reply(500, { error: "Google Calendar error: " + (err && err.message ? err.message : String(err)) });
  }
});
