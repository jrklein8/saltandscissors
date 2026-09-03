/* ============================================================
   Salt & Scissors Studio — client & event tracker
   One thing at the center: the EVENT. Everything hangs off it.

   SETUP: paste your Supabase project URL + publishable key below.
   Leave both empty to run in DEMO mode (sample data on this device).
   ============================================================ */
const SUPABASE_URL = '';
const SUPABASE_KEY = '';

/* ---------- business defaults (editable in Settings) ---------- */
const DEFAULT_SETTINGS = {
  ownerName: 'Rebecca',
  extraGuestRate: 15,
  experiences: [
    { name: 'Coastal Creamery',           price: 350, included: 15 },
    { name: 'Charm Bar',                  price: 325, included: 15 },
    { name: 'Sensory Scenes',             price: 275, included: 10 },
    { name: 'Canvas Painting Party',      price: 225, included: 10 },
    { name: 'DIY Patch Party',            price: 325, included: 15 },
    { name: 'Custom Creative Experience', price: 0,   included: 0  },
  ],
  packing: {
    'Coastal Creamery': ['Sundae cups + dome lids','Slime base (clear & white)','Activator','Colors & drizzles','Sprinkles & glitter','Charms & mix-ins','Cherries','Scoops & spoons','Gloves & wipes','Menu / how-to card'],
    'Charm Bar': ['Bracelet & necklace chains','Keychain blanks','Charm trays (sorted)','Jump rings','Pliers (2 sets)','Clasps & extenders','Sizing tape','Mirror','Jewelry gift bags','Display stands'],
    'Sensory Scenes': ['Kinetic sand / play dough','Jars with lids','Themed accessories (shells, figures, gems)','Scoops & tools','Trays','Labels','Wipes'],
    'Canvas Painting Party': ['Mini canvases','Easels','Paint sets','Brushes (assorted)','Water cups','Palettes','Aprons / smocks','Paper towels','Theme reference prints','Drying area plan'],
    'DIY Patch Party': ['Hats / accessories','Patch trays (sorted)','Heat press or iron + extension cord','Pressing cloth / parchment','Fabric glue (backup)','Mirror','Take-home bags'],
    'Custom Creative Experience': ['Project supplies (per plan)','Sample / demo piece','Instruction card'],
    '_always': ['Table cover','Salt & Scissors sign','Trash bags','Wipes & paper towels','Business cards','Phone charged for photos','Water bottle'],
  },
};
const OCCASIONS = ['Birthday','Girls\' Night','Baby or Bridal Shower','Pop-Up / Market','Workshop','School / Community','Corporate','Other'];
const SOURCES   = ['Website form','Instagram','Facebook','Referral','Market / Pop-Up','Other'];
const STATUSES  = [
  { key:'inquiry', label:'Inquiry' },
  { key:'quoted',  label:'Quoted'  },
  { key:'booked',  label:'Booked'  },
  { key:'done',    label:'Done'    },
];
const STATUS_INDEX = Object.fromEntries(STATUSES.map((s,i)=>[s.key,i]));

/* ---------- utils ---------- */
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const money = v => '$' + num(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const money2 = v => '$' + num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
const parseDate = iso => iso ? new Date(iso + 'T12:00:00') : null;
const fmtDate = iso => { const d = parseDate(iso); return d ? d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }) : 'Date TBD'; };
const fmtDateLong = iso => { const d = parseDate(iso); return d ? d.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' }) : 'Date TBD'; };
const fmtTime = t => { if(!t) return ''; const [h,m] = t.split(':').map(Number); const ap = h >= 12 ? 'pm' : 'am'; return ((h % 12) || 12) + (m ? ':' + String(m).padStart(2,'0') : '') + ap; };
const daysUntil = iso => { const d = parseDate(iso); if(!d) return null; const t = parseDate(todayISO()); return Math.round((d - t) / 86400000); };
const countdown = iso => { const n = daysUntil(iso); if(n === null) return 'date TBD'; if(n === 0) return 'today!'; if(n === 1) return 'tomorrow'; if(n < 0) return Math.abs(n) + 'd ago'; if(n < 14) return 'in ' + n + ' days'; if(n < 60) return 'in ' + Math.round(n/7) + ' weeks'; return 'in ' + Math.round(n/30) + ' months'; };
const monthKey = iso => iso ? iso.slice(0,7) : '';
const monthLabel = key => { const [y,m] = key.split('-').map(Number); return new Date(y, m-1, 1).toLocaleDateString('en-US', { month:'long', year:'numeric' }); };
const balanceOf = ev => Math.max(0, num(ev.price_agreed) - (ev.paid_in_full ? num(ev.price_agreed) : (ev.deposit_paid ? num(ev.deposit) : 0)));
const collectedOf = ev => ev.paid_in_full ? num(ev.price_agreed) : (ev.deposit_paid ? num(ev.deposit) : 0);
const isActive = ev => ev.status !== 'lost';
const download = (name, text, type='text/plain') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
let toastT; const toast = msg => { let t = $('.toast'); if(!t){ t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); };

/* ============================================================
   DATA LAYER — LocalDB (demo) and SupaDB (real, with login)
   ============================================================ */
function seedDemo(){
  const d = new Date(); const y = d.getFullYear(), m = d.getMonth();
  const iso = (dd, mo=m) => { const x = new Date(y, mo, dd); return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
  const now = new Date().toISOString();
  const e1 = uid(), e2 = uid(), e3 = uid(), e4 = uid(), e5 = uid(), e6 = uid();
  return {
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    events: [
      { id:e1, status:'booked', client_name:'Lauren M.', client_contact:'@laurenmakes', source:'Instagram', occasion:'Birthday', honoree:'Harper, turning 7', experience:'Coastal Creamery', guest_count:18, event_date: iso(d.getDate()+5), event_time:'14:00', location:'Backyard, Ogden', theme:'Mermaid / under the sea', notes:'Nut-free please. Mom will text gate code.', price_quoted:395, price_agreed:395, deposit:100, deposit_paid:true, paid_in_full:false, created_at:now, updated_at:now },
      { id:e2, status:'inquiry', client_name:'Danielle P.', client_contact:'danielle.p@email.com', source:'Website form', occasion:'Girls\' Night', honoree:'', experience:'Charm Bar', guest_count:8, event_date: iso(d.getDate()+19), event_time:'19:00', location:'Wrightsville Beach', theme:'Galentine-ish, gold & pink', notes:'Asked if wine is okay — yes, adults only.', price_quoted:null, price_agreed:null, deposit:null, deposit_paid:false, paid_in_full:false, created_at:now, updated_at:now },
      { id:e3, status:'quoted', client_name:'Ms. Alvarez (PTA)', client_contact:'(910) 555-0142', source:'Referral', occasion:'School / Community', honoree:'', experience:'Sensory Scenes', guest_count:40, event_date: iso(d.getDate()+33), event_time:'10:00', location:'Ogden Elementary gym', theme:'Ocean explorers', notes:'Needs W-9 for the school. Two hosts recommended.', price_quoted:725, price_agreed:null, deposit:null, deposit_paid:false, paid_in_full:false, created_at:now, updated_at:now },
      { id:e4, status:'booked', client_name:'Cargo District Market', client_contact:'events@cargodistrict', source:'Market / Pop-Up', occasion:'Pop-Up / Market', honoree:'', experience:'Coastal Creamery', guest_count:0, event_date: iso(d.getDate()+12), event_time:'11:00', location:'Cargo District, Wilmington', theme:'Sensory sundae pop-up', notes:'Booth fee $40. Bring the banner + tent weights.', price_quoted:0, price_agreed:0, deposit:0, deposit_paid:false, paid_in_full:false, created_at:now, updated_at:now },
      { id:e5, status:'done', client_name:'Taryn C.', client_contact:'@taryn.c', source:'Instagram', occasion:'Girls\' Night', honoree:'', experience:'Charm Bar', guest_count:10, event_date: iso(d.getDate()-9), event_time:'18:30', location:'Client home, Landfall', theme:'Galentines', notes:'Loved the matching mom/daughter sets.', price_quoted:325, price_agreed:325, deposit:100, deposit_paid:true, paid_in_full:true, created_at:now, updated_at:now },
      { id:e6, status:'done', client_name:'Rachel E.', client_contact:'(910) 555-0177', source:'Referral', occasion:'Birthday', honoree:'Twins, turning 5', experience:'Sensory Scenes', guest_count:12, event_date: iso(d.getDate()-21), event_time:'15:00', location:'Hugh MacRae Park shelter', theme:'Dinosaur dig', notes:'', price_quoted:305, price_agreed:305, deposit:75, deposit_paid:true, paid_in_full:true, created_at:now, updated_at:now },
    ],
    expenses: [
      { id:uid(), event_id:e5, item:'Gold chains (25 pk)', cost:42.50, store:'Amazon', created_at:now },
      { id:uid(), event_id:e5, item:'Letter charms', cost:31.20, store:'Amazon', created_at:now },
      { id:uid(), event_id:e5, item:'Jewelry bags', cost:9.99, store:'Michaels', created_at:now },
      { id:uid(), event_id:e6, item:'Kinetic sand (6 lb)', cost:28.00, store:'Target', created_at:now },
      { id:uid(), event_id:e6, item:'Dino figurines', cost:16.75, store:'Amazon', created_at:now },
      { id:uid(), event_id:e6, item:'Jars w/ lids (12)', cost:22.40, store:'Amazon', created_at:now },
      { id:uid(), event_id:e1, item:'Sundae cups + lids (25)', cost:19.80, store:'Amazon', created_at:now },
      { id:uid(), event_id:e1, item:'Mermaid charms + pearls', cost:14.25, store:'Hobby Lobby', created_at:now },
    ],
    checklist: [
      ...DEFAULT_SETTINGS.packing['Coastal Creamery'].map((label,i)=>({ id:uid(), event_id:e1, label, done:i<4, sort:i })),
      ...DEFAULT_SETTINGS.packing['_always'].map((label,i)=>({ id:uid(), event_id:e1, label, done:false, sort:100+i })),
    ],
  };
}

class LocalDB {
  constructor(){ this.key = 'sss_studio_v1'; this.load(); }
  load(){ try { this.d = JSON.parse(localStorage.getItem(this.key)); } catch(e){ this.d = null; } if(!this.d || !this.d.events){ this.d = seedDemo(); this.save(); } }
  save(){ localStorage.setItem(this.key, JSON.stringify(this.d)); }
  async listEvents(){ return this.d.events.map(e => ({...e})); }
  async getEvent(id){ const e = this.d.events.find(e => e.id === id); return e ? {...e} : null; }
  async saveEvent(ev){ const now = new Date().toISOString(); ev.updated_at = now; const i = this.d.events.findIndex(e => e.id === ev.id); if(i < 0){ ev.id = ev.id || uid(); ev.created_at = ev.created_at || now; this.d.events.push(ev); } else this.d.events[i] = ev; this.save(); return {...ev}; }
  async deleteEvent(id){ this.d.events = this.d.events.filter(e => e.id !== id); this.d.expenses = this.d.expenses.filter(x => x.event_id !== id); this.d.checklist = this.d.checklist.filter(x => x.event_id !== id); this.save(); }
  async listExpenses(eventId){ return this.d.expenses.filter(x => !eventId || x.event_id === eventId).map(x => ({...x})); }
  async addExpense(x){ x.id = uid(); x.created_at = new Date().toISOString(); this.d.expenses.push(x); this.save(); return {...x}; }
  async deleteExpense(id){ this.d.expenses = this.d.expenses.filter(x => x.id !== id); this.save(); }
  async listChecklist(eventId){ return this.d.checklist.filter(x => x.event_id === eventId).sort((a,b) => a.sort - b.sort).map(x => ({...x})); }
  async addChecklist(items){ items.forEach(it => { it.id = uid(); this.d.checklist.push(it); }); this.save(); return items; }
  async toggleChecklist(id, done){ const it = this.d.checklist.find(x => x.id === id); if(it) it.done = done; this.save(); }
  async deleteChecklist(id){ this.d.checklist = this.d.checklist.filter(x => x.id !== id); this.save(); }
  async getSettings(){ return { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...this.d.settings }; }
  async saveSettings(s){ this.d.settings = s; this.save(); }
  async resetDemo(){ this.d = seedDemo(); this.save(); }
  async clearAll(){ this.d = { settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), events:[], expenses:[], checklist:[] }; this.save(); }
}

class SupaDB {
  constructor(sb){ this.sb = sb; }
  async listEvents(){ const { data, error } = await this.sb.from('events').select('*'); if(error) throw error; return data; }
  async getEvent(id){ const { data, error } = await this.sb.from('events').select('*').eq('id', id).maybeSingle(); if(error) throw error; return data; }
  async saveEvent(ev){ const row = {...ev}; if(!row.id) delete row.id; delete row.created_at; row.updated_at = new Date().toISOString(); const { data, error } = await this.sb.from('events').upsert(row).select().single(); if(error) throw error; return data; }
  async deleteEvent(id){ const { error } = await this.sb.from('events').delete().eq('id', id); if(error) throw error; }
  async listExpenses(eventId){ let q = this.sb.from('expenses').select('*').order('created_at'); if(eventId) q = q.eq('event_id', eventId); const { data, error } = await q; if(error) throw error; return data; }
  async addExpense(x){ const { data, error } = await this.sb.from('expenses').insert(x).select().single(); if(error) throw error; return data; }
  async deleteExpense(id){ const { error } = await this.sb.from('expenses').delete().eq('id', id); if(error) throw error; }
  async listChecklist(eventId){ const { data, error } = await this.sb.from('checklist').select('*').eq('event_id', eventId).order('sort'); if(error) throw error; return data; }
  async addChecklist(items){ const { data, error } = await this.sb.from('checklist').insert(items).select(); if(error) throw error; return data; }
  async toggleChecklist(id, done){ const { error } = await this.sb.from('checklist').update({ done }).eq('id', id); if(error) throw error; }
  async deleteChecklist(id){ const { error } = await this.sb.from('checklist').delete().eq('id', id); if(error) throw error; }
  async getSettings(){ const { data } = await this.sb.from('settings').select('data').maybeSingle(); return { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...((data && data.data) || {}) }; }
  async saveSettings(s){ const { data:{ user } } = await this.sb.auth.getUser(); const { error } = await this.sb.from('settings').upsert({ user_id: user.id, data: s, updated_at: new Date().toISOString() }); if(error) throw error; }
}

/* ============================================================
   APP STATE + ROUTER
   ============================================================ */
const S = { db:null, sb:null, mode:'demo', settings:null, events:[], user:null };

function route(){
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  return { view: parts[0] || 'home', id: parts[1] || null, q };
}
const go = h => { location.hash = h; };

async function boot(){
  if(SUPABASE_URL && SUPABASE_KEY && window.supabase){
    S.mode = 'live';
    S.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    S.db = new SupaDB(S.sb);
    const { data:{ session } } = await S.sb.auth.getSession();
    S.user = session ? session.user : null;
    S.sb.auth.onAuthStateChange((_e, sess) => { S.user = sess ? sess.user : null; render(); });
  } else {
    // Demo mode only runs on a local dev server — never on the public site
    const local = ['localhost','127.0.0.1'].includes(location.hostname) || location.protocol === 'file:';
    if(!local){
      $('#app').innerHTML = `<div class="login"><div class="card center"><img class="logo" src="assets/logo-full.png" alt="Salt & Scissors"/>
        <span class="hand" style="display:block">almost ready</span><h1 style="font-size:1.3rem">The studio is being set up</h1>
        <p class="small muted">Check back soon.</p></div></div>`;
      return;
    }
    S.mode = 'demo';
    S.db = new LocalDB();
  }
  window.addEventListener('hashchange', render);
  render();
}

async function refresh(){
  S.settings = await S.db.getSettings();
  S.events = await S.db.listEvents();
  // supplies totals per event (used by Money + profit lines)
  const all = await S.db.listExpenses();
  const by = {}; all.forEach(x => { by[x.event_id] = (by[x.event_id] || 0) + num(x.cost); });
  S._spendByEvent = by;
}

/* ============================================================
   RENDER
   ============================================================ */
async function render(){
  const app = $('#app');
  if(S.mode === 'live' && !S.user){ app.innerHTML = viewLogin(); bindLogin(); return; }
  try { await refresh(); } catch(err){ app.innerHTML = `<div class="empty"><span class="hand">hmm, couldn't load</span>${esc(err.message||err)}</div>`; return; }
  const r = route();
  let body = '';
  try {
    if(r.view === 'home') body = viewHome();
    else if(r.view === 'events') body = viewEvents(r.q);
    else if(r.view === 'event' && r.id) body = await viewEvent(r.id);
    else if(r.view === 'new') body = viewForm(null, r.q);
    else if(r.view === 'edit' && r.id) body = viewForm(S.events.find(e => e.id === r.id), r.q);
    else if(r.view === 'clients') body = viewClients();
    else if(r.view === 'money') body = viewMoney(r.q);
    else if(r.view === 'settings') body = viewSettings();
    else body = viewHome();
  } catch(err){ body = `<div class="empty"><span class="hand">something hiccuped</span>${esc(err.message||err)}</div>`; }
  app.innerHTML = shell(body, r.view);
  bind(r);
  window.scrollTo(0,0);
}

function shell(body, view){
  const tab = (name, href, icon, label) => `<a class="tab ${view===name?'active':''}" href="${href}">${icon}<span>${label}</span></a>`;
  const ic = {
    home:'<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>',
    cal:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    ppl:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 4.5"/></svg>',
    usd:'<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M16.5 7.5c0-1.7-2-3-4.5-3S7.5 5.8 7.5 7.5 9.5 10 12 10s4.5 1.3 4.5 3-2 3.5-4.5 3.5-4.5-1.3-4.5-3"/></svg>',
    gear:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  };
  return `
    <header class="top">
      <a href="#/"><img class="logo" src="assets/logo-full.png" alt="Salt & Scissors"/></a>
      <span class="tag">studio</span>
      <span class="spacer"></span>
      ${S.mode==='demo' ? '<span class="pill inquiry">Demo</span>' : ''}
    </header>
    <main>${body}</main>
    ${['home','events','clients','money'].includes(view) ? '<button class="fab" data-action="new" aria-label="New event">+</button>' : ''}
    <nav class="tabs">
      ${tab('home','#/',ic.home,'Home')}
      ${tab('events','#/events',ic.cal,'Events')}
      ${tab('clients','#/clients',ic.ppl,'Clients')}
      ${tab('money','#/money',ic.usd,'Money')}
      ${tab('settings','#/settings',ic.gear,'Settings')}
    </nav>`;
}

/* ---------- LOGIN ---------- */
function viewLogin(){
  return `<div class="login"><div class="card">
    <img class="logo" src="assets/logo-full.png" alt="Salt & Scissors"/>
    <span class="hand center" style="display:block">welcome back!</span>
    <h1 class="center" style="font-size:1.4rem">Sign in to the studio</h1>
    <form id="loginForm">
      <label>Email</label><input name="email" type="email" autocomplete="email" required/>
      <label>Password</label><input name="password" type="password" autocomplete="current-password" required/>
      <p class="tiny neg" id="loginErr" style="min-height:1.2em;margin:.5rem 0 0"></p>
      <button class="btn primary block mt" type="submit">Sign in</button>
    </form>
    <p class="center tiny muted mt"><a href="#" id="forgot">Forgot password?</a></p>
  </div></div>`;
}
function bindLogin(){
  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target); const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Signing in…';
    const { error } = await S.sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
    if(error){ $('#loginErr').textContent = error.message; btn.disabled = false; btn.textContent = 'Sign in'; }
  });
  $('#forgot').addEventListener('click', async e => {
    e.preventDefault(); const email = $('#loginForm [name=email]').value;
    if(!email) return $('#loginErr').textContent = 'Type your email first, then tap forgot.';
    const { error } = await S.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    $('#loginErr').textContent = error ? error.message : 'Check your email for a reset link.';
  });
}

/* ---------- HOME ---------- */
function viewHome(){
  const s = S.settings, evs = S.events.filter(isActive);
  const today = todayISO();
  const upcoming = evs.filter(e => e.status === 'booked' && e.event_date && e.event_date >= today).sort((a,b) => a.event_date.localeCompare(b.event_date));
  const inquiries = evs.filter(e => e.status === 'inquiry');
  const quoted = evs.filter(e => e.status === 'quoted');
  const owed = evs.filter(e => ['booked','done'].includes(e.status) && balanceOf(e) > 0);
  const owedTotal = owed.reduce((t,e) => t + balanceOf(e), 0);
  const mk = monthKey(today);
  const thisMonth = evs.filter(e => ['booked','done'].includes(e.status) && monthKey(e.event_date) === mk);
  const rev = thisMonth.reduce((t,e) => t + num(e.price_agreed), 0);
  const hour = new Date().getHours(); const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const nextEv = upcoming[0];
  return `
    <span class="hand">${esc(new Date().toLocaleDateString('en-US',{weekday:'long', month:'long', day:'numeric'}))}</span>
    <h1>${greet}, ${esc(s.ownerName)}.</h1>
    ${nextEv ? `<p class="muted small">Next up: <b>${esc(nextEv.client_name)}</b> · ${esc(nextEv.experience||'')} <span class="countdown">${countdown(nextEv.event_date)}</span></p>` : `<p class="muted small">Nothing on the calendar yet — let's change that.</p>`}
    <div class="stats">
      <a class="stat warm" href="#/events?status=inquiry"><div class="n">${inquiries.length}</div><div class="l">need a reply</div></a>
      <a class="stat" href="#/events?status=quoted"><div class="n">${quoted.length}</div><div class="l">waiting on quote</div></a>
      <a class="stat cool" href="#/events?status=booked"><div class="n">${upcoming.length}</div><div class="l">booked ahead</div></a>
      <a class="stat" href="#/money"><div class="n">${money(owedTotal)}</div><div class="l">balances due</div></a>
    </div>
    <div class="card"><div class="between"><div><span class="eyebrow">${esc(monthLabel(mk))}</span><div class="money big">${money(rev)}</div><div class="tiny muted">agreed revenue · ${thisMonth.length} event${thisMonth.length===1?'':'s'}</div></div><a class="btn soft sm" href="#/money">Money →</a></div></div>

    <h2 class="sec">Up next</h2>
    ${upcoming.length ? upcoming.slice(0,4).map(eventCard).join('') : `<div class="card empty"><span class="hand">quiet calendar</span>No booked events coming up.</div>`}

    ${inquiries.length ? `<h2 class="sec">Waiting on you</h2>${inquiries.map(e => `
      <a class="card tap ev" href="#/event/${e.id}"><div class="between">
        <div><div class="name">${esc(e.client_name)}</div><div class="meta">${esc(e.experience||'Undecided')} · ${esc(e.occasion||'')} ${e.guest_count?'· '+e.guest_count+' guests':''}</div></div>
        <span class="pill inquiry">reply</span></div></a>`).join('')}` : ''}

    ${owed.length ? `<h2 class="sec">Money to collect</h2>${owed.map(e => `
      <a class="card tap ev" href="#/event/${e.id}"><div class="between">
        <div><div class="name">${esc(e.client_name)}</div><div class="meta">${fmtDate(e.event_date)} · ${e.deposit_paid?'deposit in':'no deposit yet'}</div></div>
        <div class="money">${money(balanceOf(e))}</div></div></a>`).join('')}` : ''}
  `;
}

function eventCard(e){
  const bal = balanceOf(e);
  return `<a class="card tap ev" href="#/event/${e.id}">
    <div class="between"><span class="when">${fmtDate(e.event_date)}${e.event_time?' · '+fmtTime(e.event_time):''}</span><span class="countdown">${countdown(e.event_date)}</span></div>
    <div class="name">${esc(e.client_name)}${e.honoree?` <span class="muted small">· ${esc(e.honoree)}</span>`:''}</div>
    <div class="meta">${esc(e.experience||'Experience TBD')} · ${esc(e.occasion||'')}${e.guest_count?' · '+e.guest_count+' guests':''}${e.location?' · '+esc(e.location):''}</div>
    <div class="row wrap" style="margin-top:.45rem"><span class="pill ${e.status}">${e.status}</span>${num(e.price_agreed)?`<span class="money" style="font-size:1rem">${money(e.price_agreed)}</span>`:''}${bal>0&&e.status!=='inquiry'?`<span class="pill due">${money(bal)} due</span>`:(e.paid_in_full?'<span class="pill paid">paid</span>':'')}</div>
  </a>`;
}

/* ---------- EVENTS LIST ---------- */
function viewEvents(q){
  const status = q.status || 'all'; const client = q.client || ''; const search = (q.s || '').toLowerCase();
  let list = S.events.slice();
  if(status === 'all') list = list.filter(isActive); else list = list.filter(e => e.status === status);
  if(client) list = list.filter(e => (e.client_name||'').toLowerCase() === client.toLowerCase());
  if(search) list = list.filter(e => [e.client_name,e.honoree,e.experience,e.occasion,e.location,e.theme,e.notes].join(' ').toLowerCase().includes(search));
  const today = todayISO();
  // upcoming (or undated) first by soonest; past events after, most recent first
  list.sort((a,b) => {
    const ad = a.event_date || '9999', bd = b.event_date || '9999';
    if(status === 'done') return bd.localeCompare(ad);
    const ap = ad < today, bp = bd < today;
    if(ap !== bp) return ap ? 1 : -1;
    return ap ? bd.localeCompare(ad) : ad.localeCompare(bd);
  });
  const chip = (k,l) => `<button class="chip ${status===k?'on':''}" data-action="filter" data-status="${k}">${l}</button>`;
  return `
    <span class="eyebrow">Events</span>
    <h1>${client ? esc(client) : 'Every event'}</h1>
    ${client ? `<a class="btn soft sm" href="#/events">← all clients</a>` : ''}
    <input id="search" placeholder="Search names, themes, places…" value="${esc(q.s||'')}" style="margin-top:.7rem"/>
    <div class="chips">${chip('all','Active')}${chip('inquiry','Inquiries')}${chip('quoted','Quoted')}${chip('booked','Booked')}${chip('done','Done')}${chip('lost','Lost')}</div>
    ${list.length ? list.map(eventCard).join('') : `<div class="card empty"><span class="hand">nothing here yet</span>Tap + to add an event or request.</div>`}
  `;
}

/* ---------- EVENT DETAIL ---------- */
async function viewEvent(id){
  const e = S.events.find(x => x.id === id);
  if(!e) return `<div class="empty"><span class="hand">can't find that one</span><a href="#/events">Back to events</a></div>`;
  const [expenses, checklist] = await Promise.all([S.db.listExpenses(id), S.db.listChecklist(id)]);
  const spend = expenses.reduce((t,x) => t + num(x.cost), 0);
  const agreed = num(e.price_agreed), bal = balanceOf(e), profit = agreed - spend;
  const doneCount = checklist.filter(c => c.done).length;
  const contact = esc(e.client_contact || '');
  const contactLink = !e.client_contact ? '' : /^@/.test(e.client_contact) ? `<a href="https://instagram.com/${esc(e.client_contact.slice(1))}" target="_blank" rel="noopener">${contact}</a>` : /@.+\./.test(e.client_contact) ? `<a href="mailto:${contact}">${contact}</a>` : /\d{3}/.test(e.client_contact) ? `<a href="tel:${esc(e.client_contact.replace(/[^\d+]/g,''))}">${contact}</a>` : contact;
  const si = STATUS_INDEX[e.status] ?? -1;
  return `
    <a class="tiny muted" href="#/events">← events</a>
    <div class="between" style="align-items:flex-start;margin-top:.3rem"><div><span class="eyebrow">${esc(e.occasion||'Event')}${e.honoree?' · '+esc(e.honoree):''}</span><h1>${esc(e.client_name)}</h1></div>
      <a class="btn soft sm" href="#/edit/${e.id}">Edit</a></div>

    <div class="stepper">${STATUSES.map((s,i)=>`<button class="step ${e.status===s.key?'on':(i<si?'passed':'')}" data-action="status" data-status="${s.key}">${s.label}</button>`).join('')}</div>
    <div class="between tiny muted"><span>${e.status==='lost'?'<span class="pill lost">marked lost</span>':'Tap a stage to move it along'}</span>${e.status!=='lost'?'<button class="iconbtn tiny" data-action="status" data-status="lost" style="font-size:.74rem;font-weight:700">mark lost</button>':'<button class="iconbtn tiny" data-action="status" data-status="inquiry" style="font-size:.74rem;font-weight:700">reopen</button>'}</div>

    <div class="card mt">
      <div class="between"><h3>${esc(e.experience||'Experience TBD')}</h3>${e.guest_count?`<span class="pill quoted">${e.guest_count} guests</span>`:''}</div>
      <div class="small"><b>${fmtDateLong(e.event_date)}</b>${e.event_time?' at '+fmtTime(e.event_time):''} <span class="countdown">${countdown(e.event_date)}</span></div>
      ${e.location?`<div class="small muted">${esc(e.location)}</div>`:''}
      ${e.theme?`<div class="small" style="margin-top:.4rem"><span class="hand" style="font-size:1.1rem">theme:</span> ${esc(e.theme)}</div>`:''}
      <div class="row wrap" style="margin-top:.7rem">
        ${e.event_date?`<button class="btn soft sm" data-action="ics">Add to calendar</button>`:''}
        ${contactLink?`<span class="small">${contactLink}</span>`:''}
        ${e.source?`<span class="tiny muted">via ${esc(e.source)}</span>`:''}
      </div>
    </div>

    <div class="card">
      <div class="between"><h3>Money</h3>${e.paid_in_full?'<span class="pill paid">paid in full</span>':bal>0?`<span class="pill due">${money(bal)} due</span>`:''}</div>
      <div class="grid2" style="margin:.4rem 0 .6rem">
        <div><div class="tiny muted">Quoted</div><div class="money">${e.price_quoted!=null&&e.price_quoted!==''?money(e.price_quoted):'—'}</div></div>
        <div><div class="tiny muted">Agreed</div><div class="money">${agreed?money(agreed):'—'}</div></div>
      </div>
      <div class="switch"><span class="small">Deposit ${num(e.deposit)?'<b>'+money(e.deposit)+'</b>':''} received</span><input type="checkbox" data-action="toggle" data-field="deposit_paid" ${e.deposit_paid?'checked':''}/></div>
      <div class="switch"><span class="small">Paid in full</span><input type="checkbox" data-action="toggle" data-field="paid_in_full" ${e.paid_in_full?'checked':''}/></div>
      ${agreed?`<div class="between mt"><span class="small muted">Collected so far</span><b>${money(collectedOf(e))}</b></div>`:''}
    </div>

    <div class="card">
      <div class="between"><h3>Supplies for this event</h3><span class="money">${money2(spend)}</span></div>
      ${expenses.length ? `<ul class="list">${expenses.map(x=>`<li><div class="grow"><div>${esc(x.item)}</div>${x.store?`<div class="tiny muted">${esc(x.store)}</div>`:''}</div><b>${money2(x.cost)}</b><button class="iconbtn" data-action="del-expense" data-id="${x.id}" aria-label="Remove">×</button></li>`).join('')}</ul>` : `<p class="small muted">Nothing bought yet. Add what you pick up for this party.</p>`}
      <form class="inline-form" id="expenseForm"><div><label>Item</label><input name="item" placeholder="Sundae cups (25)" required/></div><div><label>Cost</label><input name="cost" type="number" step="0.01" min="0" placeholder="0.00" required/></div><button class="btn sand sm" type="submit">Add</button></form>
      <input name="store" id="expenseStore" placeholder="Where (optional) — Amazon, Target…" style="margin-top:.5rem"/>
      ${agreed?`<div class="between mt" style="border-top:1px solid var(--line);padding-top:.7rem"><span class="small"><b>Profit</b> <span class="tiny muted">agreed − supplies</span></span><span class="money ${profit>=0?'pos':'neg'}">${money2(profit)}</span></div>`:''}
    </div>

    <div class="card">
      <div class="between"><h3>Packing list</h3><span class="tiny muted">${checklist.length?doneCount+' / '+checklist.length+' packed':''}</span></div>
      ${checklist.length ? `<div class="progress"><i style="width:${Math.round(doneCount/checklist.length*100)}%"></i></div>
        ${checklist.map(c=>`<label class="check ${c.done?'done':''}"><input type="checkbox" data-action="check" data-id="${c.id}" ${c.done?'checked':''}/><span class="grow">${esc(c.label)}</span><button class="iconbtn" data-action="del-check" data-id="${c.id}" aria-label="Remove">×</button></label>`).join('')}`
        : `<p class="small muted">Load the ${esc(e.experience||'')} packing list and check things off as you load the car.</p><button class="btn soft sm" data-action="load-packing">Load packing list</button>`}
      <form class="row mt" id="checkForm"><input name="label" placeholder="Add an item…" required/><button class="btn sand sm" type="submit">Add</button></form>
      ${checklist.length?`<button class="btn ghost sm mt" data-action="load-packing">Add ${esc(e.experience||'default')} list again</button>`:''}
    </div>

    ${e.notes?`<div class="note">${esc(e.notes)}</div>`:''}
    <div class="center mt"><button class="btn danger sm" data-action="delete">Delete this event</button></div>
  `;
}

/* ---------- NEW / EDIT FORM ---------- */
function viewForm(e, q){
  const s = S.settings; const isNew = !e; e = e || { status: q.status || 'inquiry', source: 'Website form' };
  const opt = (list, v) => list.map(x => `<option ${x===v?'selected':''}>${esc(x)}</option>`).join('');
  const expNames = s.experiences.map(x => x.name);
  return `
    <a class="tiny muted" href="${isNew?'#/events':'#/event/'+e.id}">← back</a>
    <span class="eyebrow">${isNew?'New request':'Edit event'}</span>
    <h1>${isNew?'Who\'s celebrating?':esc(e.client_name)}</h1>
    <form id="eventForm">
      <input type="hidden" name="id" value="${esc(e.id||'')}"/>
      <div class="card">
        <label>Client name *</label><input name="client_name" required value="${esc(e.client_name||'')}" placeholder="Lauren M."/>
        <div class="grid2 stack-sm">
          <div><label>Contact</label><input name="client_contact" value="${esc(e.client_contact||'')}" placeholder="@handle, phone, or email"/></div>
          <div><label>Came from</label><select name="source">${opt(SOURCES, e.source)}</select></div>
        </div>
        <div class="grid2 stack-sm">
          <div><label>Occasion</label><select name="occasion">${opt(OCCASIONS, e.occasion||'Birthday')}</select></div>
          <div><label>Guest of honor</label><input name="honoree" value="${esc(e.honoree||'')}" placeholder="Harper, turning 7"/></div>
        </div>
      </div>
      <div class="card">
        <div class="grid2">
          <div><label>Experience</label><select name="experience" id="fExp">${opt(expNames, e.experience||expNames[0])}</select></div>
          <div><label>Guests</label><input name="guest_count" id="fGuests" type="number" min="0" value="${esc(e.guest_count??'')}" placeholder="15"/></div>
        </div>
        <div class="grid2">
          <div><label>Date</label><input name="event_date" type="date" value="${esc(e.event_date||'')}"/></div>
          <div><label>Time</label><input name="event_time" type="time" value="${esc(e.event_time||'')}"/></div>
        </div>
        <label>Location</label><input name="location" value="${esc(e.location||'')}" placeholder="Backyard, park shelter, studio…"/>
        <label>Theme / vibe</label><input name="theme" value="${esc(e.theme||'')}" placeholder="Mermaid, galentines, dino dig…"/>
      </div>
      <div class="card">
        <div class="between"><h3>Money</h3><label style="margin:0">Status <select name="status" style="display:inline-block;width:auto;padding:.3rem .6rem;margin-left:.3rem">${STATUSES.map(x=>`<option value="${x.key}" ${e.status===x.key?'selected':''}>${x.label}</option>`).join('')}<option value="lost" ${e.status==='lost'?'selected':''}>Lost</option></select></label></div>
        <div class="quote" id="quoteBox"></div>
        <div class="grid2">
          <div><label>Quoted</label><input name="price_quoted" id="fQuoted" type="number" step="1" min="0" value="${esc(e.price_quoted??'')}"/></div>
          <div><label>Agreed</label><input name="price_agreed" id="fAgreed" type="number" step="1" min="0" value="${esc(e.price_agreed??'')}"/></div>
        </div>
        <label>Deposit amount</label><input name="deposit" type="number" step="1" min="0" value="${esc(e.deposit??'')}" placeholder="100"/>
      </div>
      <div class="card"><label>Notes</label><textarea name="notes" placeholder="Allergies, gate codes, special requests…">${esc(e.notes||'')}</textarea></div>
      <button class="btn primary block" type="submit">${isNew?'Save request':'Save changes'}</button>
    </form>`;
}

function quoteFor(expName, guests){
  const s = S.settings; const x = s.experiences.find(e => e.name === expName);
  if(!x || !x.price) return { html: `<span class="hand">custom quote</span><div class="small muted">Price this one by hand — every custom party is different.</div>`, total: null };
  const extra = Math.max(0, num(guests) - x.included);
  const total = x.price + extra * num(s.extraGuestRate);
  return { total, html: `<span class="eyebrow">Suggested price</span><div class="big">${money(total)}</div>
    <div class="tiny muted">${money(x.price)} includes ${x.included} guests${extra?` + ${extra} extra × ${money(s.extraGuestRate)}`:''}</div>
    <div class="row mt" style="margin-top:.5rem"><button type="button" class="btn sand sm" data-action="use-quote" data-field="price_quoted">Use as quoted</button><button type="button" class="btn soft sm" data-action="use-quote" data-field="price_agreed">Use as agreed</button></div>` };
}

/* ---------- CLIENTS ---------- */
function viewClients(){
  const map = new Map();
  S.events.forEach(e => {
    const k = (e.client_name||'').trim(); if(!k) return;
    const c = map.get(k.toLowerCase()) || { name:k, contact:'', count:0, total:0, last:'', next:'', honorees:new Set() };
    c.count++; if(isActive(e)) c.total += num(e.price_agreed);
    if(e.client_contact) c.contact = e.client_contact;
    if(e.honoree) c.honorees.add(e.honoree);
    if(e.event_date){ if(e.event_date < todayISO()){ if(e.event_date > c.last) c.last = e.event_date; } else if(!c.next || e.event_date < c.next) c.next = e.event_date; }
    map.set(k.toLowerCase(), c);
  });
  const list = [...map.values()].sort((a,b) => b.count - a.count || b.total - a.total);
  return `
    <span class="eyebrow">Clients</span>
    <h1>Your people</h1>
    <p class="muted small">Built automatically from your events. Repeat clients rise to the top.</p>
    ${list.length ? list.map(c => `<a class="card tap ev" href="#/events?client=${encodeURIComponent(c.name)}">
      <div class="between"><div class="name">${esc(c.name)}</div>${c.count>1?`<span class="pill booked">${c.count}× booked</span>`:''}</div>
      <div class="meta">${c.contact?esc(c.contact)+' · ':''}${c.total?money(c.total)+' lifetime':'no revenue yet'}</div>
      <div class="meta">${c.next?'next: '+fmtDate(c.next):c.last?'last: '+fmtDate(c.last):''}${c.honorees.size?' · '+esc([...c.honorees].join(', ')):''}</div>
    </a>`).join('') : `<div class="card empty"><span class="hand">no clients yet</span>They'll appear here as you add events.</div>`}
  `;
}

/* ---------- MONEY ---------- */
function viewMoney(q){
  const mk = q.m || monthKey(todayISO());
  const [y,m] = mk.split('-').map(Number);
  const prev = new Date(y, m-2, 1), next = new Date(y, m, 1);
  const keyOf = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  const evs = S.events.filter(e => ['booked','done'].includes(e.status));
  const inMonth = evs.filter(e => monthKey(e.event_date) === mk).sort((a,b) => (a.event_date||'').localeCompare(b.event_date||''));
  const spendBy = S._spendByEvent || {};
  const rev = inMonth.reduce((t,e) => t + num(e.price_agreed), 0);
  const col = inMonth.reduce((t,e) => t + collectedOf(e), 0);
  const spend = inMonth.reduce((t,e) => t + num(spendBy[e.id]), 0);
  const allRev = evs.reduce((t,e) => t + num(e.price_agreed), 0);
  const allSpend = Object.values(spendBy).reduce((t,v) => t + num(v), 0);
  const owed = evs.reduce((t,e) => t + balanceOf(e), 0);
  return `
    <span class="eyebrow">Money</span>
    <div class="between"><button class="btn soft sm" data-action="month" data-m="${keyOf(prev)}">‹</button><h1 style="margin:0;font-size:1.4rem">${esc(monthLabel(mk))}</h1><button class="btn soft sm" data-action="month" data-m="${keyOf(next)}">›</button></div>
    <div class="stats">
      <div class="stat cool"><div class="n">${money(rev)}</div><div class="l">agreed revenue</div></div>
      <div class="stat"><div class="n">${money(col)}</div><div class="l">collected</div></div>
      <div class="stat warm"><div class="n">${money2(spend)}</div><div class="l">supplies spent</div></div>
      <div class="stat"><div class="n ${rev-spend>=0?'pos':'neg'}">${money(rev-spend)}</div><div class="l">profit</div></div>
    </div>
    <div class="card">
      ${inMonth.length ? `<table class="tbl"><tr><th>Event</th><th class="r">Agreed</th><th class="r">Supplies</th><th class="r">Profit</th></tr>
        ${inMonth.map(e => `<tr><td><a href="#/event/${e.id}" style="text-decoration:none"><b>${esc(e.client_name)}</b></a><div class="tiny muted">${fmtDate(e.event_date)} · ${esc(e.experience||'')}${balanceOf(e)>0?' · <span class="neg">'+money(balanceOf(e))+' due</span>':''}</div></td><td class="r">${money(e.price_agreed)}</td><td class="r">${money2(spendBy[e.id]||0)}</td><td class="r ${num(e.price_agreed)-num(spendBy[e.id])>=0?'pos':'neg'}">${money2(num(e.price_agreed)-num(spendBy[e.id]))}</td></tr>`).join('')}</table>`
        : `<div class="empty"><span class="hand">no booked events this month</span></div>`}
    </div>
    <div class="card">
      <h3>All time</h3>
      <div class="between small"><span class="muted">Agreed revenue</span><b>${money(allRev)}</b></div>
      <div class="between small"><span class="muted">Supplies spent</span><b>${money2(allSpend)}</b></div>
      <div class="between small"><span class="muted">Profit</span><b class="${allRev-allSpend>=0?'pos':'neg'}">${money2(allRev-allSpend)}</b></div>
      <div class="between small"><span class="muted">Still owed to you</span><b class="neg">${money(owed)}</b></div>
      <button class="btn ghost sm mt" data-action="export">Export CSV for taxes</button>
    </div>
  `;
}

/* ---------- SETTINGS ---------- */
function viewSettings(){
  const s = S.settings;
  return `
    <span class="eyebrow">Settings</span>
    <h1>Your studio</h1>
    <form id="settingsForm">
      <div class="card">
        <label>Your name</label><input name="ownerName" value="${esc(s.ownerName)}"/>
        <label>Extra guest rate (per guest over the included count)</label><input name="extraGuestRate" type="number" min="0" step="1" value="${esc(s.extraGuestRate)}"/>
      </div>
      <div class="card">
        <h3>Price list</h3><p class="tiny muted">Base price and how many guests it includes. Feeds the quote helper.</p>
        ${s.experiences.map((x,i)=>`<div class="grid2" style="grid-template-columns:1fr 84px 84px;gap:.4rem;margin-top:.5rem"><input name="exp_name_${i}" value="${esc(x.name)}"/><input name="exp_price_${i}" type="number" min="0" value="${esc(x.price)}" placeholder="$"/><input name="exp_inc_${i}" type="number" min="0" value="${esc(x.included)}" placeholder="guests"/></div>`).join('')}
      </div>
      <div class="card">
        <h3>Packing lists</h3><p class="tiny muted">One item per line. "Always" gets added to every event.</p>
        ${Object.keys(s.packing).map(k=>`<label>${k==='_always'?'Always pack':esc(k)}</label><textarea name="pack_${esc(k)}">${esc((s.packing[k]||[]).join('\n'))}</textarea>`).join('')}
      </div>
      <button class="btn primary block" type="submit">Save settings</button>
    </form>
    <div class="card mt">
      <h3>${S.mode==='demo'?'Demo mode':'Signed in'}</h3>
      ${S.mode==='demo'
        ? `<p class="small muted">Data lives only in this browser. Connect Supabase (see README) for login + sync across your phone and laptop.</p><div class="row wrap"><button class="btn soft sm" data-action="reset-demo">Reload sample data</button><button class="btn danger sm" data-action="clear-all">Start empty</button></div>`
        : `<p class="small muted">${esc(S.user.email)}</p><button class="btn ghost sm" data-action="signout">Sign out</button>`}
    </div>
    <p class="tiny muted center">Tip: on your phone, use Share → "Add to Home Screen" to make this an app.</p>
  `;
}

/* ============================================================
   BIND — one delegated handler per render
   ============================================================ */
function bind(r){
  const app = $('#app');
  app.onclick = async ev => {
    const el = ev.target.closest('[data-action]'); if(!el) return;
    const a = el.dataset.action;
    if(a === 'new') return go('#/new');
    if(a === 'filter'){ const q = route().q; const p = new URLSearchParams(q); p.set('status', el.dataset.status); return go('#/events?' + p.toString()); }
    if(a === 'month') return go('#/money?m=' + el.dataset.m);
    if(a === 'status'){ ev.preventDefault(); const e = S.events.find(x => x.id === r.id); e.status = el.dataset.status; await S.db.saveEvent(e); toast('Moved to ' + e.status); return render(); }
    if(a === 'del-expense'){ ev.preventDefault(); await S.db.deleteExpense(el.dataset.id); return render(); }
    if(a === 'del-check'){ ev.preventDefault(); await S.db.deleteChecklist(el.dataset.id); return render(); }
    if(a === 'load-packing'){ const e = S.events.find(x => x.id === r.id); const s = S.settings; const existing = await S.db.listChecklist(e.id); const have = new Set(existing.map(c => c.label.toLowerCase())); const base = existing.length; const items = [...(s.packing[e.experience]||[]), ...(s.packing._always||[])].filter(l => !have.has(l.toLowerCase())).map((label,i) => ({ event_id: e.id, label, done:false, sort: base + i })); if(!items.length) return toast('Already loaded'); await S.db.addChecklist(items); toast('Packing list loaded'); return render(); }
    if(a === 'delete'){ if(!confirm('Delete this event and its supplies/checklist?')) return; await S.db.deleteEvent(r.id); toast('Deleted'); return go('#/events'); }
    if(a === 'ics'){ const e = S.events.find(x => x.id === r.id); return download(`salt-scissors-${(e.client_name||'event').replace(/\W+/g,'-').toLowerCase()}.ics`, makeICS(e), 'text/calendar'); }
    if(a === 'export'){ return exportCSV(); }
    if(a === 'use-quote'){ const f = el.dataset.field; const box = $('#quoteBox'); const t = box.dataset.total; if(t) $('#f' + (f==='price_quoted'?'Quoted':'Agreed')).value = t; return; }
    if(a === 'reset-demo'){ if(!confirm('Replace everything with the sample data?')) return; await S.db.resetDemo(); toast('Sample data loaded'); return render(); }
    if(a === 'clear-all'){ if(!confirm('Delete ALL events and start empty?')) return; await S.db.clearAll(); toast('Fresh start'); return render(); }
    if(a === 'signout'){ await S.sb.auth.signOut(); return; }
  };
  app.onchange = async ev => {
    const el = ev.target.closest('[data-action]'); if(!el) return;
    if(el.dataset.action === 'toggle'){ const e = S.events.find(x => x.id === r.id); e[el.dataset.field] = el.checked; if(el.dataset.field==='paid_in_full' && el.checked) e.deposit_paid = true; await S.db.saveEvent(e); toast(el.checked ? 'Marked ' + (el.dataset.field==='paid_in_full'?'paid in full':'deposit received') : 'Updated'); return render(); }
    if(el.dataset.action === 'check'){ await S.db.toggleChecklist(el.dataset.id, el.checked); el.closest('.check').classList.toggle('done', el.checked); const all = $$('.check input'); const d = all.filter(i => i.checked).length; const bar = $('.progress i'); if(bar) bar.style.width = Math.round(d/all.length*100) + '%'; const cnt = $('.card .between .tiny.muted'); return; }
  };

  // events search (debounced)
  const search = $('#search'); if(search){ let t; search.oninput = () => { clearTimeout(t); t = setTimeout(() => { const p = new URLSearchParams(route().q); if(search.value) p.set('s', search.value); else p.delete('s'); history.replaceState(null,'','#/events?' + p.toString()); const list = viewEvents(Object.fromEntries(p)); $('main').innerHTML = list; bind(route()); const s2 = $('#search'); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }, 250); }; }

  // event form
  const ef = $('#eventForm');
  if(ef){
    const upd = () => { const qb = $('#quoteBox'); const { html, total } = quoteFor($('#fExp').value, $('#fGuests').value); qb.innerHTML = html; qb.dataset.total = total ?? ''; };
    $('#fExp').onchange = upd; $('#fGuests').oninput = upd; upd();
    ef.onsubmit = async e => {
      e.preventDefault(); const f = new FormData(ef); const o = Object.fromEntries(f.entries());
      const ev = { id: o.id || undefined, status:o.status, client_name:o.client_name.trim(), client_contact:o.client_contact.trim(), source:o.source, occasion:o.occasion, honoree:o.honoree.trim(), experience:o.experience, guest_count:o.guest_count===''?null:parseInt(o.guest_count,10), event_date:o.event_date||null, event_time:o.event_time||null, location:o.location.trim(), theme:o.theme.trim(), notes:o.notes.trim(), price_quoted:o.price_quoted===''?null:num(o.price_quoted), price_agreed:o.price_agreed===''?null:num(o.price_agreed), deposit:o.deposit===''?null:num(o.deposit) };
      const prev = o.id ? S.events.find(x => x.id === o.id) : null;
      if(prev){ ev.deposit_paid = prev.deposit_paid; ev.paid_in_full = prev.paid_in_full; ev.created_at = prev.created_at; } else { ev.deposit_paid = false; ev.paid_in_full = false; }
      try { const saved = await S.db.saveEvent(ev); toast(prev ? 'Saved' : 'Request added'); go('#/event/' + saved.id); } catch(err){ alert('Could not save: ' + (err.message||err)); }
    };
  }

  // expense form
  const xf = $('#expenseForm');
  if(xf) xf.onsubmit = async e => { e.preventDefault(); const f = new FormData(xf); await S.db.addExpense({ event_id: r.id, item: f.get('item').trim(), cost: num(f.get('cost')), store: ($('#expenseStore').value||'').trim() }); toast('Added'); render(); };
  const cf = $('#checkForm');
  if(cf) cf.onsubmit = async e => { e.preventDefault(); const f = new FormData(cf); const existing = await S.db.listChecklist(r.id); await S.db.addChecklist([{ event_id: r.id, label: f.get('label').trim(), done:false, sort: existing.length }]); render(); };

  // settings form
  const sf = $('#settingsForm');
  if(sf) sf.onsubmit = async e => {
    e.preventDefault(); const f = new FormData(sf); const s = JSON.parse(JSON.stringify(S.settings));
    s.ownerName = f.get('ownerName').trim() || 'there'; s.extraGuestRate = num(f.get('extraGuestRate'));
    s.experiences = s.experiences.map((x,i) => ({ name: (f.get('exp_name_'+i)||x.name).trim(), price: num(f.get('exp_price_'+i)), included: parseInt(f.get('exp_inc_'+i)||0,10) }));
    const packing = {}; Object.keys(s.packing).forEach(k => { packing[k] = (f.get('pack_'+k)||'').split('\n').map(x => x.trim()).filter(Boolean); });
    s.experiences.forEach(x => { if(!(x.name in packing)) packing[x.name] = []; }); s.packing = packing;
    await S.db.saveSettings(s); toast('Settings saved'); render();
  };
}

/* ---------- calendar + export ---------- */
function makeICS(e){
  const dt = e.event_date.replace(/-/g,'');
  const stamp = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
  let start, end;
  if(e.event_time){ const t = e.event_time.replace(':',''); start = `DTSTART;TZID=America/New_York:${dt}T${t}00`; const [h,m] = e.event_time.split(':').map(Number); const eh = String(Math.min(23,h+2)).padStart(2,'0'); end = `DTEND;TZID=America/New_York:${dt}T${eh}${String(m).padStart(2,'0')}00`; }
  else { start = `DTSTART;VALUE=DATE:${dt}`; end = `DTEND;VALUE=DATE:${dt}`; }
  const escI = s => String(s||'').replace(/\\/g,'\\\\').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n');
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Salt & Scissors Studio//EN','BEGIN:VEVENT',`UID:${e.id}@saltandscissors.co`,`DTSTAMP:${stamp}`,start,end,`SUMMARY:${escI('Salt & Scissors: ' + e.client_name + (e.experience?' — '+e.experience:''))}`,`LOCATION:${escI(e.location)}`,`DESCRIPTION:${escI([e.occasion, e.honoree, e.guest_count?e.guest_count+' guests':'', e.theme?'Theme: '+e.theme:'', e.notes].filter(Boolean).join('\n'))}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
}

async function exportCSV(){
  const expenses = await S.db.listExpenses();
  const q = v => '"' + String(v ?? '').replace(/"/g,'""') + '"';
  const ev = [['Date','Client','Status','Occasion','Experience','Guests','Location','Quoted','Agreed','Deposit','Deposit paid','Paid in full','Collected','Supplies','Profit','Source','Notes'].join(',')];
  const by = {}; expenses.forEach(x => { by[x.event_id] = (by[x.event_id]||0) + num(x.cost); });
  S.events.slice().sort((a,b) => (a.event_date||'').localeCompare(b.event_date||'')).forEach(e => ev.push([e.event_date, e.client_name, e.status, e.occasion, e.experience, e.guest_count, e.location, e.price_quoted, e.price_agreed, e.deposit, e.deposit_paid?'yes':'no', e.paid_in_full?'yes':'no', collectedOf(e), (by[e.id]||0).toFixed(2), (num(e.price_agreed)-(by[e.id]||0)).toFixed(2), e.source, e.notes].map(q).join(',')));
  const ex = [['Date bought','Event date','Client','Item','Store','Cost'].join(',')];
  expenses.forEach(x => { const e = S.events.find(v => v.id === x.event_id) || {}; ex.push([x.created_at?x.created_at.slice(0,10):'', e.event_date, e.client_name, x.item, x.store, num(x.cost).toFixed(2)].map(q).join(',')); });
  download('salt-scissors-events.csv', ev.join('\n'), 'text/csv');
  setTimeout(() => download('salt-scissors-supplies.csv', ex.join('\n'), 'text/csv'), 400);
  toast('Two CSVs downloaded');
}

/* ---------- go ---------- */
boot();
