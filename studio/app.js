/* ============================================================
   Salt & Scissors Studio — client & event tracker
   One thing at the center: the EVENT. Everything hangs off it.

   SETUP: paste your Supabase project URL + publishable key below.
   Leave both empty to run in DEMO mode (sample data on this device).
   ============================================================ */
const SUPABASE_URL = 'https://lvurqxxyuvgrcfkguyje.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vZC-aXl96Dq5lWQEGO-lkQ_udh8Yi2j';

/* ---------- business defaults (editable in Settings) ---------- */
const DEFAULT_SETTINGS = {
  ownerName: 'Rebecca',
  extraGuestRate: 10,
  targetMargin: 70,   // default target profit margin (%) for supply hunts
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
/* form drafts — survive app switching / tab reloads on phones */
const draftKey = id => 'sss_draft_' + (id || 'new');
function attachDraft(form, key){
  let restored = false;
  const MAX_AGE = 12 * 60 * 60 * 1000; // drafts older than 12h are stale — start fresh instead
  try {
    const d = JSON.parse(localStorage.getItem(key));
    if(d && d._t && Date.now() - d._t > MAX_AGE){ localStorage.removeItem(key); }
    else if(d){ Object.entries(d).forEach(([k,v]) => { const el = form.elements[k]; if(el && k !== 'id' && el.type !== 'submit'){ if(el.type === 'checkbox') el.checked = !!v; else el.value = v; } }); restored = true; }
  } catch(e){}
  const save = () => { const o = { _t: Date.now() }; new FormData(form).forEach((v,k) => { if(k !== 'id') o[k] = v; }); [...form.elements].forEach(el => { if(el.type === 'checkbox' && el.name) o[el.name] = el.checked; }); localStorage.setItem(key, JSON.stringify(o)); };
  form.addEventListener('input', save); form.addEventListener('change', save);
  return restored;
}
const clearDraft = key => localStorage.removeItem(key);

/* receipt photos — shrink phone photos before upload (≤1600px JPEG) */
async function compressImage(file, max = 1600, q = 0.8){
  let bmp = null;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch(e){ try { bmp = await createImageBitmap(file); } catch(e2){ return file; } }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(res => c.toBlob(b => res(b || file), 'image/jpeg', q));
}
const fileToDataURL = blob => new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });

/* what an event truly cost — money is counted ONCE:
   items linked to a receipt are detail (the receipt's subtotal is the spend);
   loose items with no receipt count directly; shipping + tax come from receipts */
function eventCosts(expenses, receipts){
  const byReceipt = {};
  expenses.forEach(x => { if(x.receipt_id) byReceipt[x.receipt_id] = (byReceipt[x.receipt_id] || 0) + num(x.cost); });
  const receipted = receipts.reduce((t, r) => t + (num(r.subtotal) || num(byReceipt[r.id] || 0)), 0);
  const loose = expenses.filter(x => !x.receipt_id).reduce((t, x) => t + num(x.cost), 0);
  const supplies = receipted + loose;
  const shipTax = receipts.reduce((t, r) => t + num(r.shipping) + num(r.tax), 0);
  return { supplies, shipTax, trueCost: supplies + shipTax, byReceipt };
}
const VENDORS = ['Amazon','Target','Walmart','Michaels','Hobby Lobby','Dollar Tree','Costco','Etsy'];
/* "24 × $0.48 ea" for items with a quantity */
const unitOf = x => (x.qty && num(x.qty) > 0) ? ` · ${num(x.qty)} × ${money2(num(x.cost) / num(x.qty))} ea` : '';
/* ---------- supply hunts: where to look, the math, and the ranking ---------- */
const STORES = [
  { name:'Amazon',           host:/(^|\.)amazon\.|(^|\.)a\.co$|(^|\.)amzn\./, url:q => `https://www.amazon.com/s?k=${q}` },
  { name:'Temu',             host:/(^|\.)temu\.com$/,            url:q => `https://www.temu.com/search_result.html?search_key=${q}`, overseas:true },
  { name:'Alibaba',          host:/(^|\.)alibaba\.com$/,         url:q => `https://www.alibaba.com/trade/search?SearchText=${q}`, overseas:true },
  { name:'AliExpress',       host:/(^|\.)aliexpress\./,          url:q => `https://www.aliexpress.com/wholesale?SearchText=${q}`, overseas:true },
  { name:'Walmart',          host:/(^|\.)walmart\.com$/,         url:q => `https://www.walmart.com/search?q=${q}` },
  { name:'Target',           host:/(^|\.)target\.com$/,          url:q => `https://www.target.com/s?searchTerm=${q}` },
  { name:'Etsy',             host:/(^|\.)etsy\.com$/,            url:q => `https://www.etsy.com/search?q=${q}` },
  { name:'Michaels',         host:/(^|\.)michaels\.com$/,        url:q => `https://www.michaels.com/search?q=${q}` },
  { name:'Oriental Trading', host:/(^|\.)orientaltrading\.com$/, url:q => `https://www.orientaltrading.com/web/search/searchMain?keyword=${q}` },
  { name:'Dollar Tree',      host:/(^|\.)dollartree\.com$/,      url:q => `https://www.dollartree.com/searchresults?Ntt=${q}` },
  { name:'Google Shopping',  host:/^$/,                          url:q => `https://www.google.com/search?tbm=shop&q=${q}` },
];
const storeFromUrl = u => { try { const h = new URL(u).hostname.toLowerCase(); const s = STORES.find(s => s.host.test(h)); return s ? s.name : h.replace(/^www\./,''); } catch(e){ return ''; } };
const isOverseas = name => !!(STORES.find(s => s.name === name) || {}).overseas;

function huntMath(h){
  const guests = num(h.guests), per = num(h.units_per_guest) || 1;
  const need = guests ? Math.ceil(guests * per) : 0;
  const charge = num(h.charge_per_guest);
  const margin = (h.target_margin === '' || h.target_margin == null) ? null : num(h.target_margin);
  const guestBudget = (charge && margin != null) ? charge * (1 - margin / 100) : null; // for ALL supplies, per guest
  return { guests, per, need, charge, margin, guestBudget, maxUnit: num(h.max_unit_cost) || null };
}
function optMath(o, h){
  const m = huntMath(h);
  const price = num(o.pack_price), qty = num(o.pack_qty) || 1, ship = num(o.shipping);
  const packs = m.need ? Math.max(1, Math.ceil(m.need / qty)) : 1;
  const total = packs * price + ship, units = packs * qty;
  const landed = total / units;                       // true cost each, shipping included
  const late = (h.need_by && o.arrives_by) ? o.arrives_by > h.need_by : null;
  const spare = (h.need_by && o.arrives_by) ? Math.round((parseDate(h.need_by) - parseDate(o.arrives_by)) / 86400000) : null;
  const reviews = num(o.reviews);
  const adj = o.rating ? (reviews ? (num(o.rating) * reviews + 4.0 * 50) / (reviews + 50) : num(o.rating)) : null; // few reviews count for less
  return { priced: price > 0, packs, total, units, sticker: price / qty, landed, perGuest: landed * m.per,
           leftover: m.need ? units - m.need : 0, late, spare, over: m.maxUnit ? landed > m.maxUnit + 1e-9 : false, adj };
}
function rankOptions(h){
  const rows = (h.options || []).map(o => ({ o, m: optMath(o, h), badges: [] }));
  const priced = rows.filter(x => x.m.priced);
  const cheapestOf = arr => arr.slice().sort((a,b) => a.m.landed - b.m.landed)[0] || null;
  const onTime = x => x.m.late !== true, good = x => !x.o.rating || num(x.o.rating) >= 4;
  // best = cheapest that arrives in time, fits the budget and has 4+ stars; relax if nothing qualifies
  const best = cheapestOf(priced.filter(x => onTime(x) && !x.m.over && good(x))) || cheapestOf(priced.filter(onTime)) || cheapestOf(priced);
  const cur = rows.find(x => x.o.is_current && x.m.priced) || null;
  if(best) best.badges.push('best');
  if(priced.length > 1){
    const c = cheapestOf(priced); if(c) c.badges.push('cheapest');
    // a badge only means something when there's real competition for it
    const rated = priced.filter(x => x.m.adj != null).sort((a,b) => b.m.adj - a.m.adj); if(rated.length > 1) rated[0].badges.push('top rated');
    const dated = priced.filter(x => x.o.arrives_by).sort((a,b) => a.o.arrives_by.localeCompare(b.o.arrives_by)); if(dated.length > 1) dated[0].badges.push('fastest');
  }
  rows.sort((a,b) => (b === best) - (a === best) || (a.m.late === true) - (b.m.late === true) || (b.m.priced - a.m.priced) || (a.m.landed - b.m.landed));
  return { rows, best, cur };
}
let toastT; const toast = msg => { let t = $('.toast'); if(!t){ t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); };

/* ============================================================
   DATA LAYER — LocalDB (demo) and SupaDB (real, with login)
   ============================================================ */
function seedDemo(){
  const d = new Date(); const y = d.getFullYear(), m = d.getMonth();
  const iso = (dd, mo=m) => { const x = new Date(y, mo, dd); return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
  const now = new Date().toISOString();
  const e1 = uid(), e2 = uid(), e3 = uid(), e4 = uid(), e5 = uid(), e6 = uid();
  const r1 = uid(), r2 = uid();
  return {
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    receipts: [
      { id:r1, event_id:e5, vendor:'Amazon', receipt_date: iso(d.getDate()-14), subtotal:73.70, shipping:0, tax:5.16, notes:'Order #112-4471', created_at:now },
      { id:r2, event_id:e6, vendor:'Target', receipt_date: iso(d.getDate()-24), subtotal:28.00, shipping:0, tax:1.96, notes:'', created_at:now },
    ],
    events: [
      { id:e1, status:'booked', client_name:'Lauren M.', client_contact:'@laurenmakes', source:'Instagram', occasion:'Birthday', honoree:'Harper, turning 7', experience:'Coastal Creamery', guest_count:18, event_date: iso(d.getDate()+5), event_time:'14:00', location:'Backyard, Ogden', theme:'Mermaid / under the sea', notes:'Nut-free please. Mom will text gate code.', price_lines:[{label:'Coastal Creamery (includes 15)',amount:350},{label:'3 extra guests × $15',amount:45}], price_quoted:395, price_agreed:395, deposit:100, deposit_paid:true, paid_in_full:false, created_at:now, updated_at:now },
      { id:e2, status:'inquiry', client_name:'Danielle P.', client_contact:'danielle.p@email.com', source:'Website form', occasion:'Girls\' Night', honoree:'', experience:'Charm Bar', guest_count:8, event_date: iso(d.getDate()+19), event_time:'19:00', location:'Wrightsville Beach', theme:'Galentine-ish, gold & pink', notes:'Asked if wine is okay — yes, adults only.', price_quoted:null, price_agreed:null, deposit:null, deposit_paid:false, paid_in_full:false, created_at:now, updated_at:now },
      { id:e3, status:'quoted', client_name:'Ms. Alvarez (PTA)', client_contact:'(910) 555-0142', source:'Referral', occasion:'School / Community', honoree:'', experience:'Sensory Scenes', guest_count:40, event_date: iso(d.getDate()+33), event_time:'10:00', location:'Ogden Elementary gym', theme:'Ocean explorers', notes:'Needs W-9 for the school. Two hosts recommended.', price_lines:[{label:'Sensory Scenes (includes 10)',amount:275},{label:'30 extra guests × $15',amount:450}], price_quoted:725, price_agreed:null, deposit:null, deposit_paid:false, paid_in_full:false, created_at:now, updated_at:now },
      { id:e4, status:'booked', client_name:'Cargo District Market', client_contact:'events@cargodistrict', source:'Market / Pop-Up', occasion:'Pop-Up / Market', honoree:'', experience:'Coastal Creamery', experience_detail:'Sensory sundae booth', guest_count:'', event_date: iso(d.getDate()+12), event_time:'11:00', event_end:'15:00', location:'Cargo District, Wilmington', theme:'Sensory sundae pop-up', notes:'Booth fee $40. Bring the banner + tent weights.', price_quoted:0, price_agreed:0, deposit:0, deposit_paid:false, paid_in_full:false, created_at:now, updated_at:now },
      { id:e5, status:'done', client_name:'Taryn C.', client_contact:'@taryn.c', source:'Instagram', occasion:'Girls\' Night', honoree:'', experience:'Charm Bar', guest_count:10, event_date: iso(d.getDate()-9), event_time:'18:30', location:'Client home, Landfall', theme:'Galentines', notes:'Loved the matching mom/daughter sets.', price_quoted:325, price_agreed:325, deposit:100, deposit_paid:true, paid_in_full:true, created_at:now, updated_at:now },
      { id:e6, status:'done', client_name:'Rachel E.', client_contact:'(910) 555-0177', source:'Referral', occasion:'Birthday', honoree:'Twins, turning 5', experience:'Sensory Scenes', guest_count:12, event_date: iso(d.getDate()-21), event_time:'15:00', location:'Hugh MacRae Park shelter', theme:'Dinosaur dig', notes:'', price_quoted:305, price_agreed:305, deposit:75, deposit_paid:true, paid_in_full:true, created_at:now, updated_at:now },
    ],
    expenses: [
      { id:uid(), event_id:e5, item:'Gold chains', qty:25, cost:42.50, store:'Amazon', receipt_id:r1, created_at:now },
      { id:uid(), event_id:e5, item:'Letter charms', qty:120, cost:31.20, store:'Amazon', receipt_id:r1, created_at:now },
      { id:uid(), event_id:e5, item:'Jewelry bags', cost:9.99, store:'Michaels', receipt_id:null, created_at:now },
      { id:uid(), event_id:e6, item:'Kinetic sand (6 lb)', cost:28.00, store:'Target', receipt_id:r2, created_at:now },
      { id:uid(), event_id:e6, item:'Dino figurines', cost:16.75, store:'Amazon', created_at:now },
      { id:uid(), event_id:e6, item:'Jars w/ lids (12)', cost:22.40, store:'Amazon', created_at:now },
      { id:uid(), event_id:e1, item:'Sundae cups + lids (25)', cost:19.80, store:'Amazon', created_at:now },
      { id:uid(), event_id:e1, item:'Mermaid charms + pearls', cost:14.25, store:'Hobby Lobby', created_at:now },
    ],
    hunts: [
      { id:uid(), event_id:e1, name:'Mermaid charms', query:'mermaid charms bulk', guests:18, units_per_guest:3, charge_per_guest:22, target_margin:70, max_unit_cost:0.40, need_by: iso(d.getDate()+3), notes:'Mix of tails, shells and starfish.', status:'open', chosen_id:null, created_at:now, updated_at:now,
        options:[
          { id:uid(), title:'Ocean charm mix, 60 pc', store:'Amazon', url:'https://www.amazon.com/s?k=mermaid+charms+bulk', pack_price:13.99, pack_qty:60, shipping:0, arrives_by: iso(d.getDate()+2), rating:4.6, reviews:1204, is_current:true, notes:'What I bought last time.' },
          { id:uid(), title:'Sea life charms, 100 pc', store:'Temu', url:'https://www.temu.com/search_result.html?search_key=mermaid+charms', pack_price:8.49, pack_qty:100, shipping:2.99, arrives_by: iso(d.getDate()+11), rating:4.3, reviews:312, is_current:false, notes:'' },
          { id:uid(), title:'Enamel mermaid charm set, 50 pc', store:'Etsy', url:'https://www.etsy.com/search?q=mermaid+charms', pack_price:24.00, pack_qty:50, shipping:4.50, arrives_by: iso(d.getDate()+3), rating:4.9, reviews:88, is_current:false, notes:'Prettiest, priciest.' },
        ] },
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
  async updateExpense(id, patch){ const x = this.d.expenses.find(e => e.id === id); if(x) Object.assign(x, patch); this.save(); }
  async listReceipts(eventId){ return (this.d.receipts||[]).filter(r => !eventId || r.event_id === eventId).map(r => ({...r})); }
  async addReceipt(r, file){ r.id = uid(); r.created_at = new Date().toISOString(); if(file){ r.image_data = await fileToDataURL(await compressImage(file)); } (this.d.receipts = this.d.receipts || []).push(r); this.save(); return {...r}; }
  async deleteReceipt(id){ this.d.receipts = (this.d.receipts||[]).filter(r => r.id !== id); this.d.expenses.forEach(x => { if(x.receipt_id === id) x.receipt_id = null; }); this.save(); }
  async updateReceipt(id, patch, file){ const r = (this.d.receipts||[]).find(x => x.id === id); if(!r) return; Object.assign(r, patch); if(file) r.image_data = await fileToDataURL(await compressImage(file)); this.save(); return {...r}; }
  async receiptUrl(r){ return r.image_data || null; }
  async listChecklist(eventId){ return this.d.checklist.filter(x => x.event_id === eventId).sort((a,b) => a.sort - b.sort).map(x => ({...x})); }
  async addChecklist(items){ items.forEach(it => { it.id = uid(); this.d.checklist.push(it); }); this.save(); return items; }
  async toggleChecklist(id, done){ const it = this.d.checklist.find(x => x.id === id); if(it) it.done = done; this.save(); }
  async deleteChecklist(id){ this.d.checklist = this.d.checklist.filter(x => x.id !== id); this.save(); }
  // demo stand-in for her personal calendar, so the soft-red days can be seen without linking anything
  async personalEvents(from, to){
    const out = [], add = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth()+1).padStart(2,'0') + '-' + String(x.getDate()).padStart(2,'0'); };
    for(let n = -35; n <= 70; n++){ const x = new Date(); x.setDate(x.getDate() + n); if(x.getDay() === 2) out.push({ date: add(n), allDay:false, start:'17:00', end:'18:00', title:'Soccer practice' }); }
    out.push({ date: add(5), allDay:false, start:'13:00', end:'15:00', title:"Stevie's recital" }, { date: add(8), allDay:false, start:'10:00', end:'11:00', title:'Dentist' });
    [13,14,15].forEach(n => out.push({ date: add(n), allDay:true, start:null, end:null, title:'Family beach trip' }));
    const titles = this.d.settings && this.d.settings.personalCalTitles === false;
    return out.filter(e => e.date >= from && e.date <= to).map(e => titles ? { ...e, title:'Busy' } : e).sort((a,b) => a.date.localeCompare(b.date));
  }
  async listHunts(){ return (this.d.hunts||[]).map(h => JSON.parse(JSON.stringify(h))); }
  async saveHunt(h){ this.d.hunts = this.d.hunts || []; const now = new Date().toISOString(); h.updated_at = now; const i = this.d.hunts.findIndex(x => x.id === h.id); if(i < 0){ h.id = h.id || uid(); h.created_at = now; this.d.hunts.push(h); } else this.d.hunts[i] = h; this.save(); return JSON.parse(JSON.stringify(h)); }
  async deleteHunt(id){ this.d.hunts = (this.d.hunts||[]).filter(h => h.id !== id); this.save(); }
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
  async updateExpense(id, patch){ const { error } = await this.sb.from('expenses').update(patch).eq('id', id); if(error) throw error; }
  async listReceipts(eventId){ let q = this.sb.from('receipts').select('*').order('receipt_date', {ascending:false}); if(eventId) q = q.eq('event_id', eventId); const { data, error } = await q; if(error) throw error; return data; }
  async addReceipt(r, file){
    const { data, error } = await this.sb.from('receipts').insert(r).select().single(); if(error) throw error;
    if(!file) return data;
    const blob = await compressImage(file);
    const { data:{ user } } = await this.sb.auth.getUser();
    const path = `${user.id}/${data.id}.jpg`;
    const up = await this.sb.storage.from('receipts').upload(path, blob, { contentType:'image/jpeg', upsert:true });
    if(up.error) throw up.error;
    const { data: d2, error: e2 } = await this.sb.from('receipts').update({ image_path: path }).eq('id', data.id).select().single(); if(e2) throw e2;
    return d2;
  }
  async deleteReceipt(id){
    const { data } = await this.sb.from('receipts').select('image_path').eq('id', id).maybeSingle();
    if(data && data.image_path) await this.sb.storage.from('receipts').remove([data.image_path]);
    const { error } = await this.sb.from('receipts').delete().eq('id', id); if(error) throw error;
  }
  async receiptUrl(r){ if(!r.image_path) return null; const { data } = await this.sb.storage.from('receipts').createSignedUrl(r.image_path, 3600); return data ? data.signedUrl : null; }
  async updateReceipt(id, patch, file){
    if(file){
      const blob = await compressImage(file);
      const { data:{ user } } = await this.sb.auth.getUser();
      const path = `${user.id}/${id}.jpg`;
      const up = await this.sb.storage.from('receipts').upload(path, blob, { contentType:'image/jpeg', upsert:true });
      if(up.error) throw up.error;
      patch = { ...patch, image_path: path };
    }
    const { data, error } = await this.sb.from('receipts').update(patch).eq('id', id).select().single(); if(error) throw error; return data;
  }
  async listChecklist(eventId){ const { data, error } = await this.sb.from('checklist').select('*').eq('event_id', eventId).order('sort'); if(error) throw error; return data; }
  async addChecklist(items){ const { data, error } = await this.sb.from('checklist').insert(items).select(); if(error) throw error; return data; }
  async toggleChecklist(id, done){ const { error } = await this.sb.from('checklist').update({ done }).eq('id', id); if(error) throw error; }
  async deleteChecklist(id){ const { error } = await this.sb.from('checklist').delete().eq('id', id); if(error) throw error; }
  // her personal calendar, read through the calendar-feed edge function (browsers can't fetch Google's link directly)
  async personalEvents(from, to){
    const { data, error } = await this.sb.functions.invoke('calendar-feed', { body: { from, to } });
    if(error){ let msg = error.message || 'Could not reach the calendar relay'; try { const j = await error.context.json(); if(j && j.error) msg = j.error; } catch(e){} throw new Error(msg); }
    if(data && data.error) throw new Error(data.error);
    return (data && data.events) || [];
  }
  async listHunts(){ const { data, error } = await this.sb.from('hunts').select('*').order('created_at', {ascending:false}); if(error) throw error; return data; }
  async saveHunt(h){ const row = {...h}; if(!row.id) delete row.id; delete row.created_at; delete row.user_id; row.updated_at = new Date().toISOString(); const { data, error } = await this.sb.from('hunts').upsert(row).select().single(); if(error) throw error; return data; }
  async deleteHunt(id){ const { error } = await this.sb.from('hunts').delete().eq('id', id); if(error) throw error; }
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
  const isLocal = ['localhost','127.0.0.1'].includes(location.hostname) || location.protocol === 'file:';
  const forceDemo = isLocal && new URLSearchParams(location.search).has('demo'); // ?demo=1 on localhost = sample data, no login
  if(SUPABASE_URL && SUPABASE_KEY && window.supabase && !forceDemo){
    S.mode = 'live';
    S.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    S.db = new SupaDB(S.sb);
    const { data:{ session } } = await S.sb.auth.getSession();
    S.user = session ? session.user : null;
    // Only re-render when the signed-in user actually changes. Token refreshes
    // (which fire every time the app comes back to the foreground on a phone)
    // must NOT rebuild the screen — that was wiping half-typed forms.
    S.sb.auth.onAuthStateChange((_e, sess) => {
      const prevId = S.user ? S.user.id : null, nextId = sess ? sess.user.id : null;
      S.user = sess ? sess.user : null;
      if(prevId !== nextId) render();
    });
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
  // tap anywhere else to close an open "Add to calendar" menu
  document.addEventListener('click', ev => { $$('details.calmenu[open]').forEach(d => { if(!d.contains(ev.target)) d.removeAttribute('open'); }); });
  render();
}

async function refresh(){
  S.settings = await S.db.getSettings();
  S.events = await S.db.listEvents();
  // true cost per event (supplies counted once + shipping/tax) for Money + exports
  const [all, recs] = await Promise.all([S.db.listExpenses(), S.db.listReceipts()]);
  const xs = {}, rs = {};
  all.forEach(x => (xs[x.event_id] = xs[x.event_id] || []).push(x));
  recs.forEach(r => (rs[r.event_id] = rs[r.event_id] || []).push(r));
  S._costByEvent = {}; S._spendByEvent = {};
  new Set([...Object.keys(xs), ...Object.keys(rs)]).forEach(id => { const c = eventCosts(xs[id] || [], rs[id] || []); S._costByEvent[id] = c; S._spendByEvent[id] = c.trueCost; });
  S._allReceipts = recs;
  S._allExpenses = all;
  // supply hunts — guarded so the rest of the app still works if the table isn't there yet
  try { S.hunts = await S.db.listHunts(); S._huntsMissing = false; } catch(e){ S.hunts = []; S._huntsMissing = true; }
}

/* ============================================================
   RENDER
   ============================================================ */
async function render(){
  const app = $('#app');
  if(S.mode === 'live' && !S.user){ app.innerHTML = viewLogin(); bindLogin(); return; }
  try { await refresh(); } catch(err){ app.innerHTML = `<div class="empty"><span class="hand">hmm, couldn't load</span>${esc(err.message||err)}</div>`; return; }
  const r = route();
  if(r.view !== 'event'){ S._editItem = null; S._editReceipt = null; }
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
    else if(r.view === 'supplies') body = viewHunts();
    else if(r.view === 'hunt' && r.id) body = viewHunt(r.id);
    else if(r.view === 'hunt-new') body = viewHuntForm(null, r.q);
    else if(r.view === 'hunt-edit' && r.id) body = viewHuntForm((S.hunts||[]).find(h => h.id === r.id), r.q);
    else body = viewHome();
  } catch(err){ body = `<div class="empty"><span class="hand">something hiccuped</span>${esc(err.message||err)}</div>`; }
  if(r.view !== 'hunt') S._editOpt = null;
  // same screen re-rendering (added an item, saved an edit) keeps your place; a new screen starts at the top
  const screenOf = h => (h || '').split('?')[0]; // tapping a day or month is the same screen — don't jump to the top
  const keepY = screenOf(S._lastHash) === screenOf(location.hash) ? window.scrollY : 0;
  S._lastHash = location.hash;
  app.innerHTML = shell(body, ['hunt','hunt-new','hunt-edit'].includes(r.view) ? 'supplies' : r.view);
  bind(r);
  window.scrollTo(0, keepY);
}

function shell(body, view){
  const tab = (name, href, icon, label) => `<a class="tab ${view===name?'active':''}" href="${href}">${icon}<span>${label}</span></a>`;
  const ic = {
    home:'<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></svg>',
    cal:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    ppl:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5a5 5 0 0 1 6 4.5"/></svg>',
    bag:'<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    usd:'<svg viewBox="0 0 24 24"><path d="M12 3v18"/><path d="M16.5 7.5c0-1.7-2-3-4.5-3S7.5 5.8 7.5 7.5 9.5 10 12 10s4.5 1.3 4.5 3-2 3.5-4.5 3.5-4.5-1.3-4.5-3"/></svg>',
    gear:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  };
  return `
    <header class="top">
      <a href="#/"><img class="logo" src="assets/logo-full.png" alt="Salt & Scissors"/></a>
      <span class="tag">studio</span>
      <span class="spacer"></span>
      ${S.mode==='demo' ? '<span class="pill inquiry">Demo</span>' : ''}
      <a class="gear ${view==='settings'?'active':''}" href="#/settings" aria-label="Settings">${ic.gear}</a>
    </header>
    <main>${body}</main>
    ${['home','events','clients','money'].includes(route().view) ? '<button class="fab" data-action="new" aria-label="New event">+</button>' : ''}
    ${route().view === 'supplies' && !S._huntsMissing ? '<button class="fab" data-action="new-hunt" aria-label="New supply hunt">+</button>' : ''}
    <nav class="tabs">
      ${tab('home','#/',ic.home,'Home')}
      ${tab('events','#/events',ic.cal,'Events')}
      ${tab('supplies','#/supplies',ic.bag,'Supplies')}
      ${tab('money','#/money',ic.usd,'Money')}
      ${tab('clients','#/clients',ic.ppl,'Clients')}
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
  const clash = e.event_date && e.event_date >= todayISO() && isActive(e) && e.status !== 'done' ? worstClash(eventClashes(e.event_date, e.event_time, e.event_end, e.id).filter(c => c.kind !== 'day')) : '';
  return `<a class="card tap ev" href="#/event/${e.id}">
    <div class="between"><span class="when">${fmtDate(e.event_date)}${e.event_time?' · '+fmtTime(e.event_time):''}</span><span class="countdown">${countdown(e.event_date)}</span></div>
    <div class="name">${esc(e.client_name)}${e.honoree?` <span class="muted small">· ${esc(e.honoree)}</span>`:''}</div>
    <div class="meta">${esc(e.experience||'Experience TBD')} · ${esc(e.occasion||'')}${e.guest_count?' · '+e.guest_count+' guests':''}${e.location?' · '+esc(e.location):''}</div>
    <div class="row wrap" style="margin-top:.45rem"><span class="pill ${e.status}">${e.status}</span>${clash?`<span class="pill clash">${clash==='overlap'?'overlaps':'back-to-back'}</span>`:''}${num(e.price_agreed)?`<span class="money" style="font-size:1rem">${money(e.price_agreed)}</span>`:''}${bal>0&&e.status!=='inquiry'?`<span class="pill due">${money(bal)} due</span>`:(e.paid_in_full?'<span class="pill paid">paid</span>':'')}</div>
  </a>`;
}

/* ---------- EVENTS LIST ---------- */
/* ---------- personal calendar (read-only) ---------- */
const PERSONAL = {}; // monthKey -> { t, events, loading, error, waiters:[] }
const personalOn = () => S.mode === 'demo' || !!(S.settings && S.settings.personalCalUrl);
const clearPersonal = () => { Object.keys(PERSONAL).forEach(k => delete PERSONAL[k]); };
// Returns what we have right now; fetches in the background if missing/stale and calls onReady when it lands.
function personalMonth(mk, onReady){
  if(!personalOn()) return null;
  let c = PERSONAL[mk];
  if(c && !c.loading && Date.now() - c.t < 10 * 60 * 1000) return c;
  if(c && c.loading){ if(onReady) c.waiters.push(onReady); return c; }
  c = PERSONAL[mk] = { t: Date.now(), events: c ? c.events : [], loading: true, error: null, waiters: onReady ? [onReady] : [] };
  const [y, m] = mk.split('-').map(Number), pad = n => String(n).padStart(2, '0');
  S.db.personalEvents(`${y}-${pad(m)}-01`, `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`)
    .then(ev => { c.events = ev; c.error = null; })
    .catch(err => { c.error = err.message || String(err); })
    .finally(() => { c.loading = false; c.t = Date.now(); const w = c.waiters; c.waiters = []; w.forEach(fn => { try { fn(c); } catch(e){} }); });
  return c;
}
// Once she adds a Studio event to her Google calendar it comes back through the personal feed — that's not a "personal" plan.
// Matched by our calendar title, or (busy-only mode hides titles) by the exact same day + hours as one of her events.
function isStudioEcho(p){
  if(/^Salt & Scissors:/i.test(p.title || '')) return true;
  return !p.allDay && S.events.some(e => e.event_date === p.date && e.event_time && isActive(e) && e.event_time.slice(0, 5) === p.start && eventEndTime(e).slice(0, 5) === p.end);
}
const personalItems = c => ((c && c.events) || []).filter(p => !isStudioEcho(p));
const pTime = p => p.allDay ? 'all day' : fmtTime(p.start) + (p.end && p.end !== '23:59' ? '–' + fmtTime(p.end) : '');
function pOverlaps(p, time, end){ // does this personal item collide with the event's hours?
  if(p.allDay || !time) return true;
  let eEnd = end; if(!eEnd || eEnd <= time){ const [h, m] = time.split(':').map(Number); eEnd = String(Math.min(23, h + 2)).padStart(2, '0') + ':' + String(m).padStart(2, '0'); }
  return p.start < eEnd && time < (p.end || '23:59');
}
// fills a placeholder element with a soft-red heads-up for one date (used on the event form + event page)
function paintPersonalNote(el, date, time, end){
  if(!el) return; el.innerHTML = '';
  if(!date || !personalOn()) return;
  const draw = c => { if(!el.isConnected || !c || c.error) return;
    const items = personalItems(c).filter(p => p.date === date); if(!items.length) return;
    const clash = items.filter(p => pOverlaps(p, time, end));
    el.innerHTML = `<div class="pnote"><b>${clash.length && time ? 'Heads up — this overlaps your personal calendar' : 'You have personal plans that day'}</b>${items.map(p => `<div>${esc(pTime(p))} · ${esc(p.title)}${time && !p.allDay && pOverlaps(p, time, end) ? ' <span class="tiny">(overlaps)</span>' : ''}</div>`).join('')}</div>`; };
  const c = personalMonth(monthKey(date), draw); if(c && !c.loading) draw(c);
}

/* ---------- double-booking heads-up (her own events vs each other) ---------- */
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const minLabel = n => n >= 60 ? (n % 60 ? (n / 60).toFixed(1) : n / 60) + ' hr' : n + ' min';
function spanOf(time, end){ // [start, end] in minutes — her end time, or start + 2h (same rule as the calendar export)
  if(!time) return null;
  const s = toMin(time); let e = end ? toMin(end) : NaN;
  if(!(e > s)) e = Math.min(s + 120, 24 * 60 - 1);
  return [s, e];
}
// other active events on the same day: 'overlap' (hours collide), 'tight' (under an hour between), or 'day' (same day only)
function eventClashes(date, time, end, selfId){
  if(!date) return [];
  const me = spanOf(time, end);
  return S.events.filter(o => o.event_date === date && isActive(o) && String(o.id) !== String(selfId || '')).map(o => {
    const sp = spanOf(o.event_time, o.event_end); let kind = 'day', gap = null;
    if(me && sp){ if(me[0] < sp[1] && sp[0] < me[1]) kind = 'overlap'; else { gap = me[0] >= sp[1] ? me[0] - sp[1] : sp[0] - me[1]; if(gap < 60) kind = 'tight'; } }
    return { e: o, kind, gap };
  }).sort((a, b) => (a.e.event_time || '').localeCompare(b.e.event_time || ''));
}
const worstClash = list => list.some(c => c.kind === 'overlap') ? 'overlap' : list.some(c => c.kind === 'tight') ? 'tight' : list.length ? 'day' : '';
function clashNoteHTML(date, time, end, selfId, link){
  const list = eventClashes(date, time, end, selfId); if(!list.length) return '';
  const worst = worstClash(list);
  const head = { overlap: 'Heads up — this overlaps another event', tight: 'Heads up — back-to-back with another event', day: list.length > 1 ? 'You have other events that day' : 'You have another event that day' }[worst];
  const tip = worst !== 'day' ? 'You may need to line up extra help.' : (!time ? 'Add a start time to check whether they overlap.' : '');
  return `<div class="pnote biz"><b>${head}</b>${list.map(c => { const o = c.e;
    const hours = o.event_time ? fmtTime(o.event_time) + (o.event_end && o.event_end > o.event_time ? '–' + fmtTime(o.event_end) : '') + ' · ' : '';
    const label = esc(hours + (o.client_name || 'Event') + (o.experience ? ' — ' + o.experience : ''));
    const tag = c.kind === 'overlap' ? '(overlaps)' : c.kind === 'tight' ? (c.gap ? `(only ${minLabel(c.gap)} between)` : '(no gap between)') : (o.event_time ? '' : '(no time set)');
    return `<div>${link ? `<a href="#/event/${o.id}">${label}</a>` : label} <span class="tiny">${esc(o.status)}${tag ? ' · ' + tag : ''}</span></div>`; }).join('')}${tip ? `<div class="tiny" style="margin-top:.25rem">${tip}</div>` : ''}</div>`;
}
// worst clash among one day's events (calendar cells + day panel)
function dayClash(list){
  let worst = '';
  list.forEach(e => { const w = worstClash(eventClashes(e.event_date, e.event_time, e.event_end, e.id).filter(c => c.kind !== 'day')); if(w === 'overlap' || (w === 'tight' && !worst)) worst = w; });
  return worst;
}

/* List | Calendar switch — remembers which one she used last */
function eventsViewPref(q){
  let pref = 'list';
  try { if(q.view){ localStorage.setItem('sss_events_view', q.view); } pref = q.view || localStorage.getItem('sss_events_view') || 'list'; } catch(e){ pref = q.view || 'list'; }
  return pref === 'cal' ? 'cal' : 'list';
}
const viewSwitch = on => `<div class="seg"><a class="${on==='list'?'on':''}" href="#/events?view=list">List</a><a class="${on==='cal'?'on':''}" href="#/events?view=cal">Calendar</a></div>`;

function viewCalendar(q){
  const today = todayISO();
  const mk = q.m || monthKey(q.d || today);
  const [y, mo] = mk.split('-').map(Number);
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${y}-${pad(mo)}-${pad(d)}`;
  const daysIn = new Date(y, mo, 0).getDate(), lead = new Date(y, mo - 1, 1).getDay();
  const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1);
  const prev = keyOf(new Date(y, mo - 2, 1)), next = keyOf(new Date(y, mo, 1));
  const evs = S.events.filter(e => isActive(e) && e.event_date && monthKey(e.event_date) === mk);
  const byDay = {}; evs.forEach(e => (byDay[e.event_date] = byDay[e.event_date] || []).push(e));
  Object.values(byDay).forEach(a => a.sort((p, n) => (p.event_time || '').localeCompare(n.event_time || '')));
  const sel = (q.d && monthKey(q.d) === mk) ? q.d : (monthKey(today) === mk ? today : (Object.keys(byDay).sort()[0] || null));
  // personal commitments: paint now with what's cached, repaint when the fetch lands (only if she's still on this month)
  const P = personalMonth(mk, () => { const r = route(); if(r.view === 'events' && eventsViewPref(r.q) === 'cal' && (r.q.m || monthKey(r.q.d || todayISO())) === mk) render(); });
  const pByDay = {}; if(P) personalItems(P).forEach(p => (pByDay[p.date] = pByDay[p.date] || []).push(p));
  const booked = evs.filter(e => ['booked','done'].includes(e.status));
  const cells = [];
  for(let i = 0; i < lead; i++) cells.push('<span class="cal-day blank"></span>');
  for(let d = 1; d <= daysIn; d++){
    const k = iso(d), list = byDay[k] || [], clash = list.length > 1 && k >= today ? dayClash(list) : '';
    cells.push(`<a class="cal-day ${k === today ? 'today' : ''} ${k === sel ? 'sel' : ''} ${k < today ? 'past' : ''} ${pByDay[k] ? 'personal' : ''}" href="#/events?view=cal&m=${mk}&d=${k}" aria-label="${fmtDateLong(k)}${list.length ? ', ' + list.length + ' event' + (list.length === 1 ? '' : 's') : ''}${clash ? ', events ' + (clash === 'overlap' ? 'overlap' : 'back-to-back') : ''}${pByDay[k] ? ', personal plans' : ''}">
      <span class="n">${d}</span>${clash ? '<span class="cal-flag" aria-hidden="true">!</span>' : ''}
      ${list.slice(0, 3).map(e => `<span class="cal-ev ${e.status}">${e.event_time ? fmtTime(e.event_time) + ' ' : ''}${esc((e.client_name || '').split(' ')[0])}</span>`).join('')}
      ${list.length > 3 ? `<span class="cal-more">+${list.length - 3}</span>` : ''}
    </a>`);
  }
  const dayList = sel ? (byDay[sel] || []) : [];
  return `
    <span class="eyebrow">Events</span>
    <div class="between"><h1 style="margin:0">Calendar</h1>${viewSwitch('cal')}</div>
    <div class="between" style="margin:.9rem 0 .5rem">
      <a class="btn soft sm" href="#/events?view=cal&m=${prev}" aria-label="Previous month">‹</a>
      <div class="center"><div style="font-family:var(--disp);font-size:1.25rem;color:var(--slate)">${esc(monthLabel(mk))}</div>
        <div class="tiny muted">${evs.length} event${evs.length === 1 ? '' : 's'}${booked.reduce((t, e) => t + num(e.price_agreed), 0) > 0 ? ' · ' + money(booked.reduce((t, e) => t + num(e.price_agreed), 0)) + ' booked' : ''}</div></div>
      <a class="btn soft sm" href="#/events?view=cal&m=${next}" aria-label="Next month">›</a>
    </div>
    <div class="cal">
      ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<span class="cal-dow">${d}</span>`).join('')}
      ${cells.join('')}
    </div>
    <div class="between tiny muted" style="margin:.5rem 0 0"><span class="row wrap" style="gap:.6rem"><span><i class="dot inquiry"></i> inquiry</span><span><i class="dot quoted"></i> quoted</span><span><i class="dot booked"></i> booked</span><span><i class="dot done"></i> done</span>${P ? '<span><i class="dot personal"></i> personal</span>' : ''}</span>${monthKey(today) !== mk ? `<a href="#/events?view=cal&m=${monthKey(today)}&d=${today}">today</a>` : ''}</div>
    ${P && P.loading ? '<p class="tiny muted" style="margin:.4rem 0 0">checking your personal calendar…</p>' : ''}
    ${P && P.error ? `<p class="tiny" style="margin:.4rem 0 0"><span class="neg">Personal calendar: ${esc(P.error)}</span> <button class="iconbtn txt" data-action="personal-retry">retry</button></p>` : ''}
    ${!P ? '<p class="tiny muted" style="margin:.4rem 0 0">Want your personal plans shaded here? <a href="#/settings">Link your calendar in Settings</a>.</p>' : ''}
    ${sel ? `<h2 class="sec">${fmtDateLong(sel)}</h2>
      ${(pByDay[sel] || []).length ? `<div class="pnote"><b>Personal</b>${pByDay[sel].map(p => `<div>${esc(pTime(p))} · ${esc(p.title)}</div>`).join('')}</div>` : ''}
      ${(() => { const w = dayList.length > 1 && sel >= today ? dayClash(dayList) : ''; return w ? `<div class="pnote biz"><b>${w === 'overlap' ? 'Heads up — events overlap this day' : 'Heads up — back-to-back events this day'}</b><div>You may need to line up extra help.</div></div>` : ''; })()}
      ${dayList.length ? dayList.map(eventCard).join('') : `<div class="card empty" style="padding:1rem"><span class="hand">${(pByDay[sel] || []).length ? 'no events booked' : 'wide open'}</span>Nothing for the business on this day.</div>`}
      <a class="btn ghost sm" href="#/new?date=${sel}">+ Add an event on this day</a>` : ''}
  `;
}

function viewEvents(q){
  if(eventsViewPref(q) === 'cal' && !q.client && !q.status && !q.s) return viewCalendar(q);
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
    <div class="between"><h1 style="margin:0">${client ? esc(client) : 'Every event'}</h1>${client ? '' : viewSwitch('list')}</div>
    ${client ? `<a class="btn soft sm" href="#/events?view=list">← all events</a>` : ''}
    <input id="search" placeholder="Search names, themes, places…" value="${esc(q.s||'')}" style="margin-top:.7rem"/>
    <div class="chips">${chip('all','Active')}${chip('inquiry','Inquiries')}${chip('quoted','Quoted')}${chip('booked','Booked')}${chip('done','Done')}${chip('lost','Lost')}</div>
    ${list.length ? list.map(eventCard).join('') : `<div class="card empty"><span class="hand">nothing here yet</span>Tap + to add an event or request.</div>`}
  `;
}

/* ---------- EVENT DETAIL ---------- */
async function viewEvent(id){
  const e = S.events.find(x => x.id === id);
  if(!e) return `<div class="empty"><span class="hand">can't find that one</span><a href="#/events">Back to events</a></div>`;
  const [expenses, checklist, receipts] = await Promise.all([S.db.listExpenses(id), S.db.listChecklist(id), S.db.listReceipts(id)]);
  const urls = {}; await Promise.all(receipts.map(async r => { urls[r.id] = await S.db.receiptUrl(r); }));
  const costs = eventCosts(expenses, receipts);
  const spend = costs.trueCost;
  const agreed = num(e.price_agreed), bal = balanceOf(e), profit = agreed - spend;
  const rlabel = r => `${r.vendor || 'Receipt'} · ${fmtDate(r.receipt_date)}`;
  const itemEditForm = x => `<form class="iedit" data-id="${x.id}"><input name="item" value="${esc(x.item)}" placeholder="Item" required/><input name="qty" type="number" step="any" min="0" placeholder="qty" value="${x.qty??''}"/><input name="cost" type="number" step="0.01" min="0" value="${num(x.cost)}" required/><input name="store" class="wide" list="vendorList" value="${esc(x.store||'')}" placeholder="Where (Amazon, Target…)"/><div class="btns"><button class="btn sand sm" type="submit">Save</button><button type="button" class="btn soft sm" data-action="cancel-edit">Cancel</button></div></form>`;
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
      <div class="between"><h3>${esc(e.experience||'Experience TBD')}${e.experience_detail?` <span class="muted" style="font-weight:500">· ${esc(e.experience_detail)}</span>`:''}</h3>${e.guest_count?`<span class="pill quoted">${esc(e.guest_count)} guests</span>`:''}</div>
      <div class="small"><b>${fmtDateLong(e.event_date)}</b>${e.event_time?' · '+fmtTime(e.event_time)+(e.event_end?' – '+fmtTime(e.event_end):''):''} <span class="countdown">${countdown(e.event_date)}</span></div>
      ${e.location?`<div class="small muted">${esc(e.location)}</div>`:''}
      ${e.event_date && isActive(e) && e.status !== 'done' ? clashNoteHTML(e.event_date, e.event_time, e.event_end, e.id, true) : ''}
      ${e.event_date && e.status !== 'done' ? `<div id="personalNote"data-date="${esc(e.event_date)}" data-time="${esc(e.event_time||'')}" data-end="${esc(e.event_end||'')}"></div>` : ''}
      ${e.theme?`<div class="small" style="margin-top:.4rem"><span class="hand" style="font-size:1.1rem">theme:</span> ${esc(e.theme)}</div>`:''}
      <div class="row wrap" style="margin-top:.7rem">
        ${e.event_date ? (() => { const L = calLinks(e); return `<details class="calmenu"><summary class="btn soft sm">Add to calendar</summary>
          <div class="menu">
            <a href="${esc(L.google)}" target="_blank" rel="noopener" data-action="cal-link"><b>Google Calendar</b><span>Android phones, Gmail, web</span></a>
            <button type="button" data-action="ics"><b>Apple Calendar</b><span>iPhone, iPad, Mac</span></button>
            <a href="${esc(L.outlook)}" target="_blank" rel="noopener" data-action="cal-link"><b>Outlook</b><span>Outlook.com, Hotmail</span></a>
            <button type="button" data-action="ics"><b>Another calendar app</b><span>Samsung, etc. — downloads a calendar file</span></button>
          </div></details>`; })() : ''}
        ${contactLink?`<span class="small">${contactLink}</span>`:''}
        ${e.source?`<span class="tiny muted">via ${esc(e.source)}</span>`:''}
      </div>
    </div>

    <div class="card">
      <div class="between"><h3>Money</h3>${e.paid_in_full?'<span class="pill paid">paid in full</span>':bal>0?`<span class="pill due">${money(bal)} due</span>`:''}</div>
      ${agreed?`<div class="summary">
        <div class="srow"><span>Agreed total</span><b>${money(agreed)}</b></div>
        <div class="srow"><span>${e.paid_in_full?'Collected (paid in full)':'Deposit collected'}</span><b>${money(collectedOf(e))}</b></div>
        <div class="srow"><button type="button" class="linkish" data-action="jump" data-target="supplies">Supplies</button><b>${money2(costs.supplies)}</b></div>
        <div class="srow"><span>Shipping &amp; tax</span><b>${money2(costs.shipTax)}</b></div>
        <div class="srow total"><span>True event cost</span><b>${money2(costs.trueCost)}</b></div>
        <div class="srow profit"><span>Projected profit</span><b class="${profit>=0?'pos':'neg'}">${money2(profit)}</b></div>
      </div>`:''}
      ${(e.price_lines&&e.price_lines.length)?`<div class="tiny muted" style="margin-top:.6rem">Package</div><ul class="list" style="margin:0 0 .5rem">${e.price_lines.map(l=>`<li><span class="grow small">${esc(l.label)}</span><b>${money(l.amount)}</b></li>`).join('')}</ul>`:''}
      <div class="grid2" style="margin:.4rem 0 .6rem">
        <div><div class="tiny muted">Quoted</div><div class="money">${e.price_quoted!=null&&e.price_quoted!==''?money(e.price_quoted):'—'}</div></div>
        <div><div class="tiny muted">Agreed</div><div class="money">${agreed?money(agreed):'—'}</div></div>
      </div>
      <div class="switch"><span class="small">Deposit ${num(e.deposit)?'<b>'+money(e.deposit)+'</b>':''} received</span><input type="checkbox" data-action="toggle" data-field="deposit_paid" ${e.deposit_paid?'checked':''}/></div>
      <div class="switch"><span class="small">Paid in full</span><input type="checkbox" data-action="toggle" data-field="paid_in_full" ${e.paid_in_full?'checked':''}/></div>
      ${agreed?`<div class="between mt"><span class="small muted">Collected so far</span><b>${money(collectedOf(e))}</b></div>`:''}
    </div>

    <div class="card" id="supplies">
      <div class="between"><h3>Receipts &amp; orders</h3><span class="money">${money2(costs.trueCost)}</span></div>
      <p class="tiny muted" style="margin:0 0 .3rem">Actual spend. Snap the receipt or Amazon order — subtotal, shipping and tax roll into the true event cost.</p>
      ${receipts.length ? receipts.map(r => { const mine = expenses.filter(x => x.receipt_id === r.id); const linked = costs.byReceipt[r.id]||0; const sub = num(r.subtotal) || linked; return `<div class="receipt-block">
        <div class="receipt">
          ${urls[r.id]?`<a href="${urls[r.id]}" target="_blank" rel="noopener"><img src="${urls[r.id]}" alt="Receipt"/></a>`:`<div class="rthumb">no<br/>photo</div>`}
          <div class="grow"><div><b>${esc(r.vendor||'Receipt')}</b> <span class="tiny muted">${fmtDate(r.receipt_date)}</span></div>
            <div class="tiny muted">items ${money2(sub)} · ship ${money2(r.shipping)} · tax ${money2(r.tax)}</div>
            ${r.notes?`<div class="tiny muted">${esc(r.notes)}</div>`:''}</div>
          <b>${money2(sub + num(r.shipping) + num(r.tax))}</b>
          <button class="iconbtn txt" data-action="edit-receipt" data-id="${r.id}">edit</button>
          <button class="iconbtn" data-action="del-receipt" data-id="${r.id}" aria-label="Remove receipt">×</button>
        </div>
        ${S._editReceipt === r.id ? `<form class="redit" id="receiptEdit" data-id="${r.id}">
          <div class="grid2">
            <div><label>Store / vendor</label><input name="vendor" list="vendorList" value="${esc(r.vendor||'')}"/></div>
            <div><label>Date</label><input name="receipt_date" type="date" value="${esc(r.receipt_date||'')}"/></div>
          </div>
          <div class="grid3">
            <div><label>Items subtotal</label><input name="subtotal" type="number" step="0.01" min="0" value="${num(r.subtotal)||''}"/></div>
            <div><label>Shipping</label><input name="shipping" type="number" step="0.01" min="0" value="${num(r.shipping)||''}"/></div>
            <div><label>Tax</label><input name="tax" type="number" step="0.01" min="0" value="${num(r.tax)||''}"/></div>
          </div>
          <label>${urls[r.id]?'Replace photo (optional)':'Add photo (optional)'}</label><input name="photo" type="file" accept="image/*" capture="environment"/>
          <label>Notes</label><input name="notes" value="${esc(r.notes||'')}"/>
          <div class="row mt"><button class="btn sand sm" type="submit">Save changes</button><button type="button" class="btn soft sm" data-action="cancel-edit">Cancel</button></div>
        </form>` : ''}
        <div class="ritems">
          ${mine.map(x=> S._editItem === x.id ? itemEditForm(x) : `<div class="ritem"><span class="grow">${esc(x.item)}<span class="tiny muted">${unitOf(x)}</span></span><span>${money2(x.cost)}</span><button class="iconbtn txt" data-action="edit-item" data-id="${x.id}">edit</button><button class="iconbtn" data-action="del-expense" data-id="${x.id}" aria-label="Remove item">×</button></div>`).join('')}
          ${num(r.subtotal) && mine.length && Math.abs(num(r.subtotal)-linked)>0.005 ? `<div class="tiny muted">items add to ${money2(linked)} of the ${money2(r.subtotal)} subtotal</div>` : ''}
          <form class="radd" data-receipt="${r.id}"><input name="rname" placeholder="+ item on this receipt" required/><input name="rqty" type="number" step="any" min="0" inputmode="numeric" placeholder="qty"/><input name="rcost" type="number" step="0.01" min="0" placeholder="$" required/><button class="btn sand sm" type="submit">Add</button></form>
        </div>
      </div>`; }).join('') : ''}
      <details class="addbox mt"><summary class="btn soft sm">+ Add receipt / order</summary>
        <form id="receiptForm" class="mt">
          <div class="grid2">
            <div><label>Store / vendor</label><input name="vendor" list="vendorList" placeholder="Amazon"/><datalist id="vendorList">${VENDORS.map(v=>`<option value="${v}">`).join('')}</datalist></div>
            <div><label>Date</label><input name="receipt_date" type="date" value="${todayISO()}"/></div>
          </div>
          <label>Items on this receipt</label>
          <div id="rlines"></div>
          <button type="button" class="btn soft sm" id="rlineAdd" style="margin-top:.5rem">+ Item</button>
          <div class="grid3" style="margin-top:.4rem">
            <div><label>Items subtotal</label><input name="subtotal" id="rSubtotal" type="number" step="0.01" min="0" placeholder="0.00"/></div>
            <div><label>Shipping</label><input name="shipping" type="number" step="0.01" min="0" placeholder="0.00"/></div>
            <div><label>Tax</label><input name="tax" type="number" step="0.01" min="0" placeholder="0.00"/></div>
          </div>
          <p class="tiny muted" style="margin:.3rem 0 0">Subtotal adds itself up from the items — or just type the receipt's subtotal if you'd rather skip itemizing.</p>
          <label>Photo of receipt (optional)</label><input name="photo" type="file" accept="image/*" capture="environment"/>
          <label>Notes</label><input name="notes" placeholder="Order #, what it was for…"/>
          <button class="btn sand sm mt" type="submit">Save receipt</button>
        </form>
      </details>

      ${(() => { const loose = expenses.filter(x => !x.receipt_id); return `
      <div class="between" style="margin-top:1.2rem"><h3 style="margin:0">Other items</h3><span class="tiny muted">no receipt — cash, odds &amp; ends</span></div>
      ${loose.length ? `<ul class="list">${loose.map(x=> S._editItem === x.id ? `<li>${itemEditForm(x)}</li>` : `<li><div class="grow"><div>${esc(x.item)}<span class="tiny muted">${unitOf(x)}</span></div><div class="tiny muted">${x.store?esc(x.store)+' · ':''}${receipts.length?`<select class="rsel" data-action="link-receipt" data-id="${x.id}"><option value="">no receipt</option>${receipts.map(r=>`<option value="${r.id}">${esc(rlabel(r))}</option>`).join('')}</select>`:'no receipt'}</div></div><b>${money2(x.cost)}</b><button class="iconbtn txt" data-action="edit-item" data-id="${x.id}">edit</button><button class="iconbtn" data-action="del-expense" data-id="${x.id}" aria-label="Remove">×</button></li>`).join('')}</ul>` : `<p class="small muted" style="margin:.4rem 0">Anything bought without a receipt goes here.</p>`}
      <form class="inline-form qty" id="expenseForm"><div><label>Item</label><input name="item" placeholder="Resin sea creatures" required/></div><div><label>Qty</label><input name="qty" type="number" step="any" min="0" inputmode="numeric" placeholder="#"/></div><div><label>Cost</label><input name="cost" type="number" step="0.01" min="0" placeholder="0.00" required/></div><button class="btn sand sm" type="submit">Add</button></form>
      <input name="store" id="expenseStore" placeholder="Where (optional)" style="margin-top:.5rem"/>`; })()}
      ${S._huntsMissing ? '' : (() => { const mine = (S.hunts || []).filter(h => h.event_id === e.id); return `
      <div class="between" style="margin-top:1.2rem;border-top:1px solid var(--line);padding-top:.8rem"><h3 style="margin:0">Still need to buy?</h3><a class="btn ghost sm" href="#/hunt-new?event=${e.id}">Find supplies</a></div>
      ${mine.length ? `<ul class="list">${mine.map(h => { const c = (h.options || []).find(o => o.id === h.chosen_id); return `<li><a class="grow" href="#/hunt/${h.id}" style="text-decoration:none"><b>${esc(h.name)}</b><div class="tiny muted">${c ? 'chosen: ' + esc(c.store || c.title) + ' · ' + money2(optMath(c, h).landed) + ' each' : (h.options || []).length + ' option' + ((h.options || []).length === 1 ? '' : 's') + ' so far'}</div></a><span class="pill ${h.status === 'decided' ? 'booked' : 'quoted'}">${h.status === 'decided' ? 'decided' : 'looking'}</span></li>`; }).join('')}</ul>` : ''}`; })()}
    </div>

    <div class="card">
      <div class="between"><h3>Packing list</h3><span class="tiny muted">${checklist.length?doneCount+' / '+checklist.length+' packed':''}</span></div>
      ${checklist.length ? `<div class="progress"><i style="width:${Math.round(doneCount/checklist.length*100)}%"></i></div>
        ${checklist.map(c=>`<label class="check ${c.done?'done':''}"><input type="checkbox" data-action="check" data-id="${c.id}" ${c.done?'checked':''}/><span class="grow">${esc(c.label)}</span><button class="iconbtn" data-action="del-check" data-id="${c.id}" aria-label="Remove">×</button></label>`).join('')}`
        : `<p class="small muted">Load the ${esc(e.experience||'')} packing list and check things off as you load the car.</p><button class="btn soft sm" data-action="load-packing">Load packing list</button>`}
      <form class="row mt" id="checkForm"><input name="label" placeholder="Add an item…" required/><button class="btn sand sm" type="submit">Add</button></form>
      <div class="row mt"><select id="packPick" style="flex:1">${S.settings.experiences.map(x=>`<option ${x.name===e.experience?'selected':''}>${esc(x.name)}</option>`).join('')}</select><button class="btn soft sm" data-action="load-packing-for">Add list</button></div>
      <p class="tiny muted" style="margin:.3rem 0 0">Doing more than one experience? Add each one's list.</p>
    </div>

    ${e.notes?`<div class="note">${esc(e.notes)}</div>`:''}
    <div class="center mt"><button class="btn danger sm" data-action="delete">Delete this event</button></div>
  `;
}

/* ---------- NEW / EDIT FORM ---------- */
function viewForm(e, q){
  const s = S.settings; const isNew = !e; e = e || { status: q.status || 'inquiry', source: 'Website form', event_date: /^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : '' };
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
          <div><label>Came from</label><input name="source" list="srcList" value="${esc(e.source||'')}" placeholder="Instagram, Referral / who…"/><datalist id="srcList">${SOURCES.map(x=>`<option value="${esc(x)}">`).join('')}</datalist></div>
        </div>
        <div class="grid2 stack-sm">
          <div><label>Occasion</label><select name="occasion">${opt(OCCASIONS, e.occasion||'Birthday')}</select></div>
          <div><label>Guest of honor</label><input name="honoree" value="${esc(e.honoree||'')}" placeholder="Harper, turning 7"/></div>
        </div>
      </div>
      <div class="card">
        <div class="grid2">
          <div><label>Experience</label><select name="experience" id="fExp">${opt(expNames, e.experience||expNames[0])}</select></div>
          <div><label>Guests</label><input name="guest_count" id="fGuests" type="text" inputmode="numeric" value="${esc(e.guest_count??'')}" placeholder="15 or 15–20"/></div>
        </div>
        <label>Experience details</label><input name="experience_detail" value="${esc(e.experience_detail||'')}" placeholder="Playdough, cloud slime, keychain add-on…"/>
        <label>Date</label><input name="event_date" type="date" value="${esc(e.event_date||'')}"/>
        <div id="dateNote"></div>
        <div class="grid2">
          <div><label>Start time</label><input name="event_time" type="time" value="${esc(e.event_time||'')}"/></div>
          <div><label>End time</label><input name="event_end" type="time" value="${esc(e.event_end||'')}"/></div>
        </div>
        <div id="clashNote"></div>
        <label>Location</label><input name="location" value="${esc(e.location||'')}" placeholder="Backyard, park shelter, studio…"/>
        <label>Theme / vibe</label><input name="theme" value="${esc(e.theme||'')}" placeholder="Mermaid, galentines, dino dig…"/>
      </div>
      <div class="card">
        <div class="between"><h3>Pricing</h3><label style="margin:0">Status <select name="status" style="display:inline-block;width:auto;padding:.3rem .6rem;margin-left:.3rem">${STATUSES.map(x=>`<option value="${x.key}" ${e.status===x.key?'selected':''}>${x.label}</option>`).join('')}<option value="lost" ${e.status==='lost'?'selected':''}>Lost</option></select></label></div>
        <p class="tiny muted" style="margin:.2rem 0 .4rem">Build this event's package — tap a preset, then change anything. Every event can be priced its own way.</p>
        <div class="chips" id="presetChips" style="margin:.3rem 0 .4rem">
          ${s.experiences.map(x=>`<button type="button" class="chip" data-action="add-line" data-label="${esc(x.name)}${x.included?` (includes ${x.included})`:''}" data-amount="${x.price||''}">${esc(x.name)}${x.price?' · '+money(x.price):''}</button>`).join('')}
          <button type="button" class="chip" data-action="add-extra-guests">+ Extra guests</button>
          <button type="button" class="chip" data-action="add-line" data-label="" data-amount="">+ Custom line</button>
        </div>
        <div id="lines"></div>
        <div class="between" style="margin:.6rem 0 .2rem"><b>Package total</b><span class="money" id="linesTotal">$0</span></div>
        <input type="hidden" name="price_lines" id="fLines" value="${esc(JSON.stringify(e.price_lines||[]))}"/>
        <div class="grid2">
          <div><label>First quoted</label><input name="price_quoted" id="fQuoted" type="number" step="1" min="0" value="${esc(e.price_quoted??'')}"/></div>
          <div><label>Agreed total</label><input name="price_agreed" id="fAgreed" type="number" step="1" min="0" value="${esc(e.price_agreed??'')}"/></div>
        </div>
        <div class="grid2">
          <div><label>Deposit amount</label><input name="deposit" type="number" step="1" min="0" value="${esc(e.deposit??'')}" placeholder="100"/></div>
          <div><label>Deposit received?</label><label class="check" style="border:none;padding:.7rem 0 0"><input type="checkbox" name="deposit_paid" ${e.deposit_paid?'checked':''}/><span>Yes, it's in</span></label></div>
        </div>
      </div>
      <div class="card"><label>Notes</label><textarea name="notes" placeholder="Allergies, gate codes, special requests…">${esc(e.notes||'')}</textarea></div>
      <button class="btn primary block" type="submit">${isNew?'Save request':'Save changes'}</button>
    </form>`;
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
      <div class="stat warm"><div class="n">${money2(spend)}</div><div class="l">true cost</div></div>
      <div class="stat"><div class="n ${rev-spend>=0?'pos':'neg'}">${money(rev-spend)}</div><div class="l">profit</div></div>
    </div>
    <div class="card">
      ${inMonth.length ? `<table class="tbl"><tr><th>Event</th><th class="r">Agreed</th><th class="r">Cost</th><th class="r">Profit</th></tr>
        ${inMonth.map(e => `<tr><td><a href="#/event/${e.id}" style="text-decoration:none"><b>${esc(e.client_name)}</b></a><div class="tiny muted">${fmtDate(e.event_date)} · ${esc(e.experience||'')}${balanceOf(e)>0?' · <span class="neg">'+money(balanceOf(e))+' due</span>':''}</div></td><td class="r">${money(e.price_agreed)}</td><td class="r">${money2(spendBy[e.id]||0)}</td><td class="r ${num(e.price_agreed)-num(spendBy[e.id])>=0?'pos':'neg'}">${money2(num(e.price_agreed)-num(spendBy[e.id]))}</td></tr>`).join('')}</table>`
        : `<div class="empty"><span class="hand">no booked events this month</span></div>`}
    </div>
    <div class="card">
      <h3>All time</h3>
      <div class="between small"><span class="muted">Agreed revenue</span><b>${money(allRev)}</b></div>
      <div class="between small"><span class="muted">True cost (supplies + shipping/tax)</span><b>${money2(allSpend)}</b></div>
      <div class="between small"><span class="muted">Profit</span><b class="${allRev-allSpend>=0?'pos':'neg'}">${money2(allRev-allSpend)}</b></div>
      <div class="between small"><span class="muted">Still owed to you</span><b class="neg">${money(owed)}</b></div>
      <button class="btn ghost sm mt" data-action="export">Export CSV for taxes</button>
    </div>
  `;
}

/* ---------- SUPPLIES (supply hunts) ---------- */
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '';
const BADGE = { best:'best pick', cheapest:'cheapest', 'top rated':'top rated', fastest:'fastest' };

function viewHunts(){
  if(S._huntsMissing) return `<span class="eyebrow">Supplies</span><h1>Supply finder</h1>
    <div class="card empty"><span class="hand">one quick setup step</span>The database needs the new <b>hunts</b> table. Run <b>migrate-2026-09-19-supply-hunts.sql</b> in Supabase, then refresh.</div>`;
  const hunts = (S.hunts || []).slice().sort((a,b) => (a.status === 'decided') - (b.status === 'decided') || (a.need_by || '9999').localeCompare(b.need_by || '9999'));
  return `
    <span class="eyebrow">Supplies</span>
    <h1>Supply finder</h1>
    <p class="muted small">Say what you need and what you can spend. Search every store in one tap, drop the contenders in, and the math picks the winner — cost each, shipping, arrival date and quality all counted.</p>
    ${hunts.length ? hunts.map(h => {
      const { best } = rankOptions(h); const ev = h.event_id ? S.events.find(e => e.id === h.event_id) : null;
      const chosen = (h.options || []).find(o => o.id === h.chosen_id); const pick = chosen ? { o: chosen, m: optMath(chosen, h) } : best;
      return `<a class="card tap ev" href="#/hunt/${h.id}">
        <div class="between"><span class="when">${h.need_by ? 'need by ' + fmtDate(h.need_by) : 'no deadline'}</span>${h.need_by ? `<span class="countdown">${countdown(h.need_by)}</span>` : ''}</div>
        <div class="name">${esc(h.name)}</div>
        <div class="meta">${ev ? 'for ' + esc(ev.client_name) + ' · ' : ''}${(h.options || []).length} option${(h.options || []).length === 1 ? '' : 's'}</div>
        <div class="row wrap" style="margin-top:.45rem">${h.status === 'decided' ? '<span class="pill booked">decided</span>' : '<span class="pill quoted">looking</span>'}${pick ? `<span class="small"><b>${esc(pick.o.store || pick.o.title)}</b> · ${money2(pick.m.landed)} each</span>` : ''}</div>
      </a>`; }).join('') : `<div class="card empty"><span class="hand">nothing on the list yet</span>Tap + to start a supply hunt.</div>`}
  `;
}

function optForm(o, mode){
  o = o || {};
  return `<form id="${mode === 'edit' ? 'optEdit' : 'optForm'}" ${o.id ? `data-id="${o.id}"` : ''}>
    <label>Link to the listing</label><input name="url" type="url" inputmode="url" placeholder="Paste the product link" value="${esc(o.url || '')}"/>
    <div class="grid2">
      <div><label>What is it *</label><input name="title" required placeholder="Sea creature mix, 24 pc" value="${esc(o.title || '')}"/></div>
      <div><label>Store</label><input name="store" list="storeList" placeholder="Amazon" value="${esc(o.store || '')}"/></div>
    </div>
    <div class="grid3">
      <div><label>Price *</label><input name="pack_price" type="number" step="0.01" min="0" required placeholder="11.62" value="${o.pack_price ?? ''}"/></div>
      <div><label>How many in it</label><input name="pack_qty" type="number" step="any" min="0" placeholder="24" value="${o.pack_qty ?? ''}"/></div>
      <div><label>Shipping</label><input name="shipping" type="number" step="0.01" min="0" placeholder="0.00" value="${o.shipping || ''}"/></div>
    </div>
    <div class="grid3">
      <div><label>Arrives by</label><input name="arrives_by" type="date" value="${esc(o.arrives_by || '')}"/></div>
      <div><label>Stars</label><input name="rating" type="number" step="0.1" min="0" max="5" placeholder="4.6" value="${o.rating ?? ''}"/></div>
      <div><label># reviews</label><input name="reviews" type="number" step="1" min="0" placeholder="1200" value="${o.reviews ?? ''}"/></div>
    </div>
    <label class="check" style="border:none;padding:.6rem 0 0"><input type="checkbox" name="is_current" ${o.is_current ? 'checked' : ''}/><span>This is what I buy now (compare the others against it)</span></label>
    <label>Notes</label><input name="notes" placeholder="Colors, sizes, anything to remember" value="${esc(o.notes || '')}"/>
    <div class="row mt"><button class="btn sand sm" type="submit">${mode === 'edit' ? 'Save changes' : 'Add option'}</button>${mode === 'edit' ? '<button type="button" class="btn soft sm" data-action="opt-cancel">Cancel</button>' : ''}</div>
  </form>`;
}

function viewHunt(id){
  const h = (S.hunts || []).find(x => x.id === id);
  if(!h) return `<div class="empty"><span class="hand">can't find that one</span><a href="#/supplies">Back to supplies</a></div>`;
  const m = huntMath(h); const { rows, best, cur } = rankOptions(h);
  const ev = h.event_id ? S.events.find(e => e.id === h.event_id) : null;
  const q = h.query || (h.name + ' bulk');
  const past = (S._allExpenses || []).filter(x => num(x.qty) > 0 && num(x.cost) > 0);
  const card = x => { const o = x.o, mm = x.m; const chosen = h.chosen_id === o.id; const link = safeUrl(o.url);
    if(S._editOpt === o.id) return `<div class="opt editing">${optForm(o, 'edit')}</div>`;
    let vs = '';
    if(cur && x !== cur && mm.priced){ const d = cur.m.landed - mm.landed;
      vs = Math.abs(d) < 0.005 ? 'same cost each as what you buy now' : d > 0 ? `<span class="pos">saves ${money2(d)} each vs what you buy now</span>` : `<span class="neg">${money2(-d)} more each than what you buy now</span>`;
      if(m.need){ const dt = cur.m.total - mm.total; // per-unit and per-order can disagree when a big pack leaves leftovers — say both
        if(Math.abs(dt) >= 0.005) vs += dt > 0 ? ` · <span class="pos">this order is ${money2(dt)} less</span>` : ` · <span class="neg">this order is ${money2(-dt)} more</span>${mm.leftover > cur.m.leftover ? ` <span class="muted">(only worth it if you'll use the ${mm.leftover} extra)</span>` : ''}`; } }
    return `<div class="opt ${x === best ? 'best' : ''} ${chosen ? 'chosen' : ''} ${mm.late === true ? 'late' : ''}">
      <div class="between" style="align-items:flex-start"><div><b>${esc(o.title)}</b>${o.store ? ` <span class="pill store">${esc(o.store)}</span>` : ''}</div>
        ${mm.priced ? `<div class="right"><span class="money">${money2(mm.landed)}</span><div class="tiny muted">each${num(o.shipping) ? ', shipped' : ''}</div></div>` : ''}</div>
      <div class="row wrap" style="gap:.3rem;margin:.3rem 0">${chosen ? '<span class="pill done">chosen</span>' : ''}${o.is_current ? '<span class="pill lost">what I buy now</span>' : ''}${x.badges.map(b => `<span class="pill ${b === 'best' ? 'booked' : 'quoted'}">${BADGE[b]}</span>`).join('')}${mm.over ? '<span class="pill due">over your max</span>' : ''}</div>
      ${mm.priced ? `<div class="small">${money2(o.pack_price)} for ${num(o.pack_qty) || 1}${m.need ? ` · you need ${mm.packs} → <b>${money2(mm.total)}</b>${num(o.shipping) ? ' with shipping' : ''}${mm.leftover ? ` · ${mm.leftover} left over` : ''}` : ''}</div>` : '<div class="small muted">no price entered yet</div>'}
      ${mm.priced && m.guests ? `<div class="small">Per guest: <b>${money2(mm.perGuest)}</b>${m.guestBudget ? ` <span class="muted">(${Math.round(mm.perGuest / m.guestBudget * 100)}% of your ${money2(m.guestBudget)} supply budget)</span>` : ''}</div>` : ''}
      <div class="small">${o.arrives_by ? (mm.late === true ? `<span class="neg"><b>Arrives ${fmtDate(o.arrives_by)} — ${Math.abs(mm.spare)} day${Math.abs(mm.spare) === 1 ? '' : 's'} too late</b></span>` : `Arrives ${fmtDate(o.arrives_by)}${mm.spare != null ? ` <span class="pos">— ${mm.spare === 0 ? 'just in time' : mm.spare + ' day' + (mm.spare === 1 ? '' : 's') + ' to spare'}</span>` : ''}`) : `<span class="muted">arrival date not entered${isOverseas(o.store) ? ' — ships from overseas, check it carefully' : ''}</span>`}</div>
      ${o.rating ? `<div class="small">${'★'.repeat(Math.round(num(o.rating)))}<span class="muted">${'★'.repeat(5 - Math.round(num(o.rating)))}</span> ${num(o.rating).toFixed(1)}${o.reviews ? ` <span class="muted">(${num(o.reviews).toLocaleString()} reviews)</span>` : ''}</div>` : ''}
      ${vs ? `<div class="small">${vs}</div>` : ''}
      ${o.notes ? `<div class="tiny muted">${esc(o.notes)}</div>` : ''}
      <div class="row wrap" style="margin-top:.55rem">${link ? `<a class="btn soft sm" href="${esc(link)}" target="_blank" rel="noopener">Open listing</a>` : ''}${chosen ? `<button class="btn ghost sm" data-action="opt-unchoose">Un-choose</button>` : `<button class="btn sand sm" data-action="opt-choose" data-id="${o.id}">Choose this</button>`}<span class="spacer" style="flex:1"></span><button class="iconbtn txt" data-action="opt-edit" data-id="${o.id}">edit</button><button class="iconbtn" data-action="opt-del" data-id="${o.id}" aria-label="Remove option">×</button></div>
    </div>`; };
  return `
    <a class="tiny muted" href="#/supplies">← supplies</a>
    <div class="between" style="align-items:flex-start;margin-top:.3rem"><div><span class="eyebrow">Supply hunt${ev ? ' · ' + esc(ev.client_name) : ''}</span><h1>${esc(h.name)}</h1></div><a class="btn soft sm" href="#/hunt-edit/${h.id}">Edit</a></div>

    <div class="card">
      <div class="summary" style="margin:0">
        <div class="srow"><span>You need</span><b>${m.need ? `${m.need} <span class="muted" style="font-weight:600">(${m.per} per guest × ${m.guests})</span>` : '<span class="muted">quantity not set</span>'}</b></div>
        <div class="srow"><span>Need it by</span><b>${h.need_by ? `${fmtDate(h.need_by)} <span class="countdown">${countdown(h.need_by)}</span>` : '<span class="muted">no deadline</span>'}</b></div>
        <div class="srow"><span>Most you'll pay each</span><b>${m.maxUnit ? money2(m.maxUnit) : '<span class="muted">not set</span>'}</b></div>
        ${m.guestBudget != null ? `<div class="srow"><span>Supply budget per guest</span><b>${money2(m.guestBudget)} <span class="muted" style="font-weight:600">(charging ${money2(m.charge)}, ${m.margin}% margin)</span></b></div>` : ''}
      </div>
      ${ev ? `<a class="tiny" href="#/event/${ev.id}">Open ${esc(ev.client_name)}'s event →</a>` : ''}
      ${h.notes ? `<div class="tiny muted" style="margin-top:.4rem">${esc(h.notes)}</div>` : ''}
    </div>

    <div class="card">
      <h3>Search the stores</h3>
      <input id="huntQuery" value="${esc(q)}" placeholder="What to search for"/>
      <div class="chips" style="margin:.6rem 0 .3rem">${STORES.map((s,i) => `<button type="button" class="chip" data-action="store-search" data-i="${i}">${esc(s.name)}</button>`).join('')}</div>
      <p class="tiny muted" style="margin:0">Each opens that store's results in a new tab. Found a contender? Copy its link and add it below — the arrival date on the listing is the one to trust, since it's based on your address.</p>
    </div>

    <h2 class="sec">Options ${rows.length ? `<span class="muted small" style="font-weight:600">· ranked</span>` : ''}</h2>
    ${rows.length ? rows.map(card).join('') : `<div class="card empty"><span class="hand">no contenders yet</span>Add what you buy now first — then everything else gets compared against it.</div>`}
    ${rows.length > 1 && best ? `<p class="tiny muted">Best pick = the cheapest option (shipping included) that arrives in time${m.maxUnit ? ', fits your max' : ''} and has 4+ stars.</p>` : ''}

    <div class="card">
      <h3>Add an option</h3>
      ${past.length ? `<div class="row" style="margin-bottom:.4rem"><select id="pastPick" style="flex:1"><option value="">From something I've bought before…</option>${past.map(x => `<option value="${x.id}">${esc(x.item)} · ${esc(x.store || 'store?')} · ${money2(num(x.cost) / num(x.qty))} each</option>`).join('')}</select><button type="button" class="btn soft sm" data-action="add-past">Add</button></div>` : ''}
      ${optForm(null, 'add')}
      <datalist id="storeList">${[...new Set([...STORES.map(s => s.name), ...VENDORS])].filter(n => n !== 'Google Shopping').map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    </div>
    <div class="center mt"><button class="btn danger sm" data-action="hunt-delete">Delete this hunt</button></div>
  `;
}

function viewHuntForm(h, q){
  const isNew = !h; const s = S.settings;
  if(isNew){
    h = { target_margin: s.targetMargin ?? 70, units_per_guest: 1 };
    const ev = q && q.event ? S.events.find(e => e.id === q.event) : null;
    if(ev) Object.assign(h, huntFromEvent(ev));
  }
  const evs = S.events.filter(e => isActive(e) && e.status !== 'done').sort((a,b) => (a.event_date || '9999').localeCompare(b.event_date || '9999'));
  return `
    <a class="tiny muted" href="${isNew ? '#/supplies' : '#/hunt/' + h.id}">← back</a>
    <span class="eyebrow">${isNew ? 'New supply hunt' : 'Edit hunt'}</span>
    <h1>${isNew ? 'What are you shopping for?' : esc(h.name)}</h1>
    <form id="huntForm">
      <input type="hidden" name="id" value="${esc(h.id || '')}"/>
      <div class="card">
        <label>What do you need *</label><input name="hname" required placeholder="Resin sea creatures" value="${esc(h.name || '')}"/>
        <label>Search words <span class="tiny muted" style="text-transform:none;letter-spacing:0">(optional — defaults to the name + "bulk")</span></label><input name="query" placeholder="resin sea animals mini bulk" value="${esc(h.query || '')}"/>
        <label>For which event</label><select name="event_id" id="hEvent"><option value="">Not tied to one event</option>${evs.map(e => `<option value="${e.id}" ${h.event_id === e.id ? 'selected' : ''}>${esc(e.client_name)} · ${fmtDate(e.event_date)}</option>`).join('')}</select>
      </div>
      <div class="card">
        <h3>How many, by when</h3>
        <div class="grid3">
          <div><label>Guests</label><input name="guests" id="hGuests" type="number" min="0" step="1" placeholder="20" value="${h.guests ?? ''}"/></div>
          <div><label>Per guest</label><input name="units_per_guest" id="hPer" type="number" min="0" step="any" placeholder="1" value="${h.units_per_guest ?? ''}"/></div>
          <div><label>Need it by</label><input name="need_by" id="hNeedBy" type="date" value="${esc(h.need_by || '')}"/></div>
        </div>
        <p class="hand" id="hNeed" style="margin:.5rem 0 0;font-size:1.15rem"></p>
      </div>
      <div class="card">
        <h3>What you can spend</h3>
        <div class="grid2">
          <div><label>You charge per guest</label><input name="charge_per_guest" id="hCharge" type="number" min="0" step="0.01" placeholder="20.00" value="${h.charge_per_guest ?? ''}"/></div>
          <div><label>Target profit margin %</label><input name="target_margin" id="hMargin" type="number" min="0" max="100" step="1" placeholder="70" value="${h.target_margin ?? ''}"/></div>
        </div>
        <p class="hand" id="hBudget" style="margin:.5rem 0 0;font-size:1.15rem"></p>
        <label>Most you'll pay for ONE of these</label><input name="max_unit_cost" type="number" min="0" step="0.01" placeholder="0.50" value="${h.max_unit_cost ?? ''}"/>
        <p class="tiny muted" style="margin:.3rem 0 0">The per-guest budget covers everything in the kit — this is the cap for just this item. Options over the cap get flagged.</p>
      </div>
      <div class="card"><label>Notes</label><textarea name="notes" placeholder="Colors, sizes, must-haves…">${esc(h.notes || '')}</textarea></div>
      <button class="btn primary block" type="submit">${isNew ? 'Start the hunt' : 'Save changes'}</button>
    </form>`;
}
function huntFromEvent(ev){
  const nums = (String(ev.guest_count || '').match(/\d+/g) || []).map(Number); const g = nums.length ? Math.max(...nums) : null;
  let need_by = null; if(ev.event_date){ const d = parseDate(ev.event_date); d.setDate(d.getDate() - 3); need_by = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  return { event_id: ev.id, guests: g, need_by, charge_per_guest: (g && num(ev.price_agreed)) ? Math.round(num(ev.price_agreed) / g * 100) / 100 : null };
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
        <label>Default extra-guest rate (a starting point — every event can be priced its own way)</label><input name="extraGuestRate" type="number" min="0" step="1" value="${esc(s.extraGuestRate)}"/>
        <label>Target profit margin % (starting point for supply hunts)</label><input name="targetMargin" type="number" min="0" max="100" step="1" value="${esc(s.targetMargin ?? 70)}"/>
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
    <form id="pcalForm" class="card mt">
      <div class="between"><h3>Personal calendar</h3>${s.personalCalUrl ? '<span class="pill booked">linked</span>' : ''}</div>
      <p class="tiny muted" style="margin:.1rem 0 .4rem">Shades the days you already have personal plans, and warns you before you book over them. The Studio only <b>reads</b> it — nothing is ever added to or changed in your personal calendar.</p>
      <label>Your Google Calendar private link</label>
      <input name="personalCalUrl" type="url" inputmode="url" autocomplete="off" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value="${esc(s.personalCalUrl || '')}"/>
      <details class="addbox" style="margin-top:.5rem"><summary class="tiny" style="color:var(--terra);font-weight:800;cursor:pointer">Where do I find that link?</summary>
        <ol class="small" style="padding-left:1.2rem;margin:.5rem 0 0">
          <li>On a <b>computer</b>, open Google Calendar (the phone app doesn't show this).</li>
          <li>Gear icon → <b>Settings</b>.</li>
          <li>On the left under <b>Settings for my calendars</b>, click your calendar's name.</li>
          <li>Scroll to <b>Integrate calendar</b>.</li>
          <li>Copy <b>Secret address in iCal format</b> and paste it here.</li>
        </ol>
        <p class="tiny muted" style="margin:.4rem 0 0">Treat that link like a password — anyone who has it can read that calendar. It's stored under your login only. If it ever leaks, Google can reset it from that same screen.</p>
      </details>
      <label class="check" style="border:none;padding:.7rem 0 0"><input type="checkbox" name="personalCalTitles" ${s.personalCalTitles === false ? '' : 'checked'}/><span>Show what each commitment is <span class="tiny muted">(off = just show "Busy")</span></span></label>
      <div class="row mt wrap"><button class="btn sand sm" type="submit">Save &amp; test</button>${s.personalCalUrl ? '<button type="button" class="btn danger sm" data-action="pcal-unlink">Unlink</button>' : ''}</div>
      <p class="small" id="pcalStatus" style="margin:.6rem 0 0;min-height:1.2em"></p>
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
    if(a === 'new-hunt') return go('#/hunt-new');
    if(a === 'personal-retry'){ clearPersonal(); return render(); }
    if(a === 'pcal-unlink'){ if(!confirm('Unlink your personal calendar from the Studio?')) return; const f = $('#pcalForm'); f.elements.personalCalUrl.value = ''; return f.requestSubmit(); }
    if(r.view === 'hunt'){
      const h = (S.hunts || []).find(x => x.id === r.id);
      if(h){
        if(a === 'store-search'){
          const q = ($('#huntQuery').value || h.name).trim();
          window.open(STORES[+el.dataset.i].url(encodeURIComponent(q)), '_blank', 'noopener');
          if(q !== (h.query || '')){ h.query = q; S.db.saveHunt(h).catch(() => {}); } // remember her search words
          return;
        }
        if(a === 'opt-edit'){ S._editOpt = el.dataset.id; return render(); }
        if(a === 'opt-cancel'){ S._editOpt = null; return render(); }
        if(a === 'opt-del'){ if(!confirm('Remove this option?')) return; h.options = (h.options || []).filter(o => o.id !== el.dataset.id); if(h.chosen_id === el.dataset.id){ h.chosen_id = null; h.status = 'open'; } await S.db.saveHunt(h); return render(); }
        if(a === 'opt-choose'){ h.chosen_id = el.dataset.id; h.status = 'decided'; await S.db.saveHunt(h); toast('Chosen — nice find'); return render(); }
        if(a === 'opt-unchoose'){ h.chosen_id = null; h.status = 'open'; await S.db.saveHunt(h); return render(); }
        if(a === 'add-past'){
          const x = (S._allExpenses || []).find(e => e.id === $('#pastPick').value); if(!x) return toast('Pick something from the list first');
          h.options = [...(h.options || []), { id: uid(), title: x.item, store: x.store || '', url: '', pack_price: num(x.cost), pack_qty: num(x.qty), shipping: 0, arrives_by: null, rating: null, reviews: null, is_current: true, notes: 'From a past purchase' }];
          await S.db.saveHunt(h); toast('Added as what you buy now'); return render();
        }
        if(a === 'hunt-delete'){ if(!confirm('Delete this supply hunt and its options?')) return; await S.db.deleteHunt(h.id); toast('Deleted'); return go('#/supplies'); }
      }
    }
    if(a === 'discard-draft'){ clearDraft(el.dataset.key); toast('Draft discarded'); return render(); }
    if(a === 'filter'){ const q = route().q; const p = new URLSearchParams(q); p.set('status', el.dataset.status); return go('#/events?' + p.toString()); }
    if(a === 'month') return go('#/money?m=' + el.dataset.m);
    if(a === 'status'){ ev.preventDefault(); const e = S.events.find(x => x.id === r.id); e.status = el.dataset.status; await S.db.saveEvent(e); toast('Moved to ' + e.status); return render(); }
    if(a === 'del-expense'){ ev.preventDefault(); await S.db.deleteExpense(el.dataset.id); return render(); }
    if(a === 'del-receipt'){ ev.preventDefault(); if(!confirm('Remove this receipt? Linked items stay, just unlinked.')) return; await S.db.deleteReceipt(el.dataset.id); toast('Receipt removed'); return render(); }
    if(a === 'edit-item'){ S._editItem = el.dataset.id; S._editReceipt = null; return render(); }
    if(a === 'edit-receipt'){ S._editReceipt = el.dataset.id; S._editItem = null; return render(); }
    if(a === 'cancel-edit'){ S._editItem = null; S._editReceipt = null; return render(); }
    if(a === 'jump'){ const t = document.getElementById(el.dataset.target); if(t) t.scrollIntoView({behavior:'smooth', block:'start'}); return; }
    if(a === 'del-check'){ ev.preventDefault(); await S.db.deleteChecklist(el.dataset.id); return render(); }
    if(a === 'load-packing' || a === 'load-packing-for'){
      const e = S.events.find(x => x.id === r.id); const s = S.settings;
      const exp = a === 'load-packing-for' ? $('#packPick').value : e.experience;
      const existing = await S.db.listChecklist(e.id); const have = new Set(existing.map(c => c.label.toLowerCase())); const base = existing.length;
      const items = [...(s.packing[exp]||[]), ...(s.packing._always||[])].filter(l => !have.has(l.toLowerCase())).map((label,i) => ({ event_id: e.id, label, done:false, sort: base + i }));
      if(!items.length) return toast('Already loaded');
      await S.db.addChecklist(items); toast(exp + ' list added'); return render();
    }
    if(a === 'delete'){ if(!confirm('Delete this event and its supplies/checklist?')) return; await S.db.deleteEvent(r.id); toast('Deleted'); return go('#/events'); }
    if(a === 'cal-link'){ const m = el.closest('details'); if(m) m.removeAttribute('open'); return; } // let the link open; just tidy the menu
    if(a === 'ics'){ const m = el.closest('details'); if(m) m.removeAttribute('open'); const e = S.events.find(x => x.id === r.id); return download(`salt-scissors-${(e.client_name||'event').replace(/\W+/g,'-').toLowerCase()}.ics`, makeICS(e), 'text/calendar;charset=utf-8'); }
    if(a === 'export'){ return exportCSV(); }
    if(a === 'reset-demo'){ if(!confirm('Replace everything with the sample data?')) return; await S.db.resetDemo(); toast('Sample data loaded'); return render(); }
    if(a === 'clear-all'){ if(!confirm('Delete ALL events and start empty?')) return; await S.db.clearAll(); toast('Fresh start'); return render(); }
    if(a === 'signout'){ await S.sb.auth.signOut(); return; }
  };
  app.onchange = async ev => {
    const el = ev.target.closest('[data-action]'); if(!el) return;
    if(el.dataset.action === 'toggle'){ const e = S.events.find(x => x.id === r.id); e[el.dataset.field] = el.checked; if(el.dataset.field==='paid_in_full' && el.checked) e.deposit_paid = true; await S.db.saveEvent(e); toast(el.checked ? 'Marked ' + (el.dataset.field==='paid_in_full'?'paid in full':'deposit received') : 'Updated'); return render(); }
    if(el.dataset.action === 'link-receipt'){ await S.db.updateExpense(el.dataset.id, { receipt_id: el.value || null }); toast(el.value ? 'Linked to receipt' : 'Unlinked'); return render(); }
    if(el.dataset.action === 'check'){ await S.db.toggleChecklist(el.dataset.id, el.checked); el.closest('.check').classList.toggle('done', el.checked); const all = $$('.check input'); const d = all.filter(i => i.checked).length; const bar = $('.progress i'); if(bar) bar.style.width = Math.round(d/all.length*100) + '%'; const cnt = $('.card .between .tiny.muted'); return; }
  };

  // event page: personal-calendar heads-up (fills in place once the calendar has been read)
  { const pn = $('#personalNote'); if(pn) paintPersonalNote(pn, pn.dataset.date, pn.dataset.time, pn.dataset.end); }

  // settings: link / unlink the personal calendar
  const pf = $('#pcalForm');
  if(pf){
    const status = $('#pcalStatus');
    const saveCal = async (url) => { const s = JSON.parse(JSON.stringify(S.settings)); s.personalCalUrl = url; s.personalCalTitles = pf.elements.personalCalTitles.checked; await S.db.saveSettings(s); S.settings = s; clearPersonal(); };
    pf.onsubmit = async e => {
      e.preventDefault(); const url = pf.elements.personalCalUrl.value.trim(); const btn = pf.querySelector('button[type=submit]');
      if(url && !/^(https|webcal):\/\//i.test(url)){ status.innerHTML = '<span class="neg">That doesn\'t look like a calendar link — it should start with https://</span>'; return; }
      btn.disabled = true; btn.textContent = 'Checking…'; status.textContent = '';
      try {
        await saveCal(url);
        if(!url){ status.textContent = 'Saved — no calendar linked.'; }
        else { const a = todayISO(), d = new Date(); d.setDate(d.getDate() + 60); const b = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
          const ev = await S.db.personalEvents(a, b); const days = new Set(ev.map(x => x.date)).size;
          status.innerHTML = `<span class="pos"><b>Linked.</b> Found ${ev.length} personal item${ev.length === 1 ? '' : 's'} on ${days} day${days === 1 ? '' : 's'} in the next 60 days.</span>`; }
      } catch(err){ status.innerHTML = `<span class="neg">Saved the link, but couldn't read the calendar: ${esc(err.message || err)}</span>`; }
      btn.disabled = false; btn.textContent = 'Save & test';
    };
  }

  // events search (debounced)
  const search = $('#search'); if(search){ let t; search.oninput = () => { clearTimeout(t); t = setTimeout(() => { const p = new URLSearchParams(route().q); if(search.value) p.set('s', search.value); else p.delete('s'); history.replaceState(null,'','#/events?' + p.toString()); const list = viewEvents(Object.fromEntries(p)); $('main').innerHTML = list; bind(route()); const s2 = $('#search'); s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }, 250); }; }

  // event form
  const ef = $('#eventForm');
  if(ef){
    const dkey = draftKey(ef.elements.id.value || 'new');
    if(attachDraft(ef, dkey)){
      toast('Restored what you were typing');
      $('main h1').insertAdjacentHTML('afterend', `<button type="button" class="btn soft sm" data-action="discard-draft" data-key="${dkey}" style="margin-bottom:.6rem">Discard unsaved changes</button>`);
    }
    { const qd = route().q.date; if(qd && !ef.elements.id.value && /^\d{4}-\d{2}-\d{2}$/.test(qd)) ef.elements.event_date.value = qd; } // date tapped on the calendar wins over an old draft
    // personal-calendar heads-up: updates in place as she picks a date/time (never re-renders the form)
    const notePersonal = () => { const d = ef.elements.event_date.value, t = ef.elements.event_time.value, en = ef.elements.event_end.value;
      paintPersonalNote($('#dateNote'), d, t, en);
      $('#clashNote').innerHTML = clashNoteHTML(d, t, en, ef.elements.id.value, false); }; // double-booking heads-up, same in-place rule
    ['event_date','event_time','event_end'].forEach(n => ef.elements[n].addEventListener('change', notePersonal)); notePersonal();
    // ---- per-event price builder (line items) ----
    const linesEl = $('#lines'), fLines = $('#fLines'), totalEl = $('#linesTotal');
    let lines = []; try { lines = JSON.parse(fLines.value || '[]') || []; } catch(e){ lines = []; }
    const sync = () => {
      const total = lines.reduce((t,l) => t + num(l.amount), 0);
      totalEl.textContent = money(total); fLines.value = JSON.stringify(lines);
      if(lines.length) $('#fAgreed').value = total;
      fLines.dispatchEvent(new Event('input', {bubbles:true})); // feeds the draft autosave
    };
    const renderLines = (focusLast) => {
      linesEl.innerHTML = lines.map((l,i) => `<div class="line-row" data-i="${i}"><input class="l-label" placeholder="What (e.g. Canvas add-on)" value="${esc(l.label||'')}"/><input class="l-amt" type="number" step="1" inputmode="decimal" placeholder="$" value="${l.amount===''||l.amount==null?'':l.amount}"/><button type="button" class="iconbtn l-del" aria-label="Remove line">×</button></div>`).join('');
      sync();
      if(focusLast && lines.length){ const rows = linesEl.querySelectorAll('.line-row'); const last = rows[rows.length-1]; (last.querySelector('.l-label').value ? last.querySelector('.l-amt') : last.querySelector('.l-label')).focus(); }
    };
    linesEl.addEventListener('input', ev => { const row = ev.target.closest('.line-row'); if(!row) return; const i = +row.dataset.i; if(ev.target.classList.contains('l-label')) lines[i].label = ev.target.value; else lines[i].amount = ev.target.value === '' ? '' : num(ev.target.value); sync(); });
    linesEl.addEventListener('click', ev => { const b = ev.target.closest('.l-del'); if(!b) return; lines.splice(+b.closest('.line-row').dataset.i, 1); renderLines(); });
    $('#presetChips').addEventListener('click', ev => {
      const b = ev.target.closest('[data-action]'); if(!b) return;
      if(b.dataset.action === 'add-line'){ lines.push({ label: b.dataset.label, amount: b.dataset.amount === '' ? '' : num(b.dataset.amount) }); renderLines(true); }
      if(b.dataset.action === 'add-extra-guests'){
        const x = S.settings.experiences.find(z => z.name === $('#fExp').value);
        const nums = (String($('#fGuests').value||'').match(/\d+/g) || []).map(Number);
        const extra = Math.max(0, (nums.length ? Math.max(...nums) : 0) - (x ? x.included : 0));
        const rate = num(S.settings.extraGuestRate);
        lines.push(extra ? { label: `${extra} extra guests × ${money(rate)}`, amount: extra * rate } : { label: 'Extra guests', amount: '' });
        renderLines(true);
      }
    });
    renderLines();
    ef.onsubmit = async e => {
      e.preventDefault(); const f = new FormData(ef); const o = Object.fromEntries(f.entries());
      const ev = { id: o.id || undefined, status:o.status, client_name:o.client_name.trim(), client_contact:o.client_contact.trim(), source:(o.source||'').trim(), occasion:o.occasion, honoree:o.honoree.trim(), experience:o.experience, experience_detail:(o.experience_detail||'').trim(), guest_count:(o.guest_count||'').trim()||null, event_date:o.event_date||null, event_time:o.event_time||null, event_end:o.event_end||null, location:o.location.trim(), theme:o.theme.trim(), notes:o.notes.trim(), price_quoted:o.price_quoted===''?null:num(o.price_quoted), price_agreed:o.price_agreed===''?null:num(o.price_agreed), deposit:o.deposit===''?null:num(o.deposit), deposit_paid: !!o.deposit_paid, price_lines: (()=>{ try { return (JSON.parse(o.price_lines||'[]')||[]).filter(l => (l.label||'').trim() || l.amount !== '').map(l => ({ label:(l.label||'').trim(), amount:num(l.amount) })); } catch(e){ return []; } })() };
      const prev = o.id ? S.events.find(x => x.id === o.id) : null;
      if(prev){ ev.paid_in_full = prev.paid_in_full; ev.created_at = prev.created_at; } else { ev.paid_in_full = false; }
      try { const saved = await S.db.saveEvent(ev); clearDraft(dkey); toast(prev ? 'Saved' : 'Request added'); go('#/event/' + saved.id); } catch(err){ alert('Could not save: ' + (err.message||err)); }
    };
  }

  // expense form
  const xf = $('#expenseForm');
  if(xf) xf.onsubmit = async e => { e.preventDefault(); const f = new FormData(xf); const rsel = $('#expenseReceipt'); await S.db.addExpense({ event_id: r.id, item: f.get('item').trim(), qty: f.get('qty') === '' ? null : num(f.get('qty')), cost: num(f.get('cost')), store: ($('#expenseStore').value||'').trim(), receipt_id: (rsel && rsel.value) ? rsel.value : null }); toast('Added'); render(); };
  const rf = $('#receiptForm');
  if(rf){
    // itemized receipt: item rows sum into the subtotal
    const rl = $('#rlines'); let rlines = [];
    const rsync = () => { const t = rlines.reduce((s,l) => s + num(l.cost), 0); if(rlines.length) $('#rSubtotal').value = t ? t.toFixed(2) : ''; };
    const rrender = (focusLast) => {
      rl.innerHTML = rlines.map((l,i) => `<div class="line-row qty" data-i="${i}"><input class="rl-label" placeholder="Item (e.g. Resin sea creatures)" value="${esc(l.item||'')}"/><input class="rl-qty" type="number" step="any" min="0" inputmode="numeric" placeholder="qty" value="${l.qty===''||l.qty==null?'':l.qty}"/><input class="rl-amt" type="number" step="0.01" min="0" inputmode="decimal" placeholder="$" value="${l.cost===''||l.cost==null?'':l.cost}"/><button type="button" class="iconbtn rl-del" aria-label="Remove">×</button></div>`).join('');
      rsync();
      if(focusLast && rlines.length){ rl.querySelectorAll('.line-row')[rlines.length-1].querySelector('.rl-label').focus(); }
    };
    rl.addEventListener('input', ev => { const row = ev.target.closest('.line-row'); if(!row) return; const i = +row.dataset.i; const v = ev.target.value; if(ev.target.classList.contains('rl-label')) rlines[i].item = v; else if(ev.target.classList.contains('rl-qty')) rlines[i].qty = v === '' ? '' : num(v); else rlines[i].cost = v === '' ? '' : num(v); rsync(); });
    rl.addEventListener('click', ev => { const b = ev.target.closest('.rl-del'); if(!b) return; rlines.splice(+b.closest('.line-row').dataset.i, 1); rrender(); });
    $('#rlineAdd').addEventListener('click', () => { rlines.push({ item:'', cost:'' }); rrender(true); });
    rf.onsubmit = async e => {
      e.preventDefault(); const f = new FormData(rf); const btn = rf.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Saving…';
      const file = rf.elements.photo.files[0] || null;
      const items = rlines.filter(l => (l.item||'').trim());
      const rec = { event_id: r.id, vendor: (f.get('vendor')||'').trim(), receipt_date: f.get('receipt_date') || null, subtotal: num(f.get('subtotal')), shipping: num(f.get('shipping')), tax: num(f.get('tax')), notes: (f.get('notes')||'').trim() };
      try {
        const saved = await S.db.addReceipt(rec, file);
        for(const l of items) await S.db.addExpense({ event_id: r.id, item: l.item.trim(), qty: (l.qty === '' || l.qty == null) ? null : num(l.qty), cost: num(l.cost), store: rec.vendor, receipt_id: saved.id });
        toast(`Receipt saved${items.length ? ' with ' + items.length + ' item' + (items.length===1?'':'s') : ''}${file ? ' + photo' : ''}`); render();
      } catch(err){ btn.disabled = false; btn.textContent = 'Save receipt'; alert('Could not save receipt: ' + (err.message||err)); }
    };
  }
  // add an item straight onto an existing receipt
  $$('.radd').forEach(fr => fr.onsubmit = async e => {
    e.preventDefault(); const f = new FormData(fr); const rid = fr.dataset.receipt;
    const rec = (S._allReceipts||[]).find(x => x.id === rid);
    await S.db.addExpense({ event_id: r.id, item: (f.get('rname')||'').trim(), qty: f.get('rqty') === '' ? null : num(f.get('rqty')), cost: num(f.get('rcost')), store: rec ? rec.vendor : '', receipt_id: rid });
    toast('Added to receipt'); render();
  });
  // inline edits — items and receipts
  $$('.iedit').forEach(fe => fe.onsubmit = async e => {
    e.preventDefault(); const f = new FormData(fe);
    await S.db.updateExpense(fe.dataset.id, { item: (f.get('item')||'').trim(), qty: f.get('qty') === '' ? null : num(f.get('qty')), cost: num(f.get('cost')), store: (f.get('store')||'').trim() });
    S._editItem = null; toast('Item updated'); render();
  });
  const re = $('#receiptEdit');
  if(re) re.onsubmit = async e => {
    e.preventDefault(); const f = new FormData(re); const btn = re.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Saving…';
    const file = re.elements.photo.files[0] || null;
    try {
      await S.db.updateReceipt(re.dataset.id, { vendor: (f.get('vendor')||'').trim(), receipt_date: f.get('receipt_date') || null, subtotal: num(f.get('subtotal')), shipping: num(f.get('shipping')), tax: num(f.get('tax')), notes: (f.get('notes')||'').trim() }, file);
      S._editReceipt = null; toast('Receipt updated'); render();
    } catch(err){ btn.disabled = false; btn.textContent = 'Save changes'; alert('Could not update receipt: ' + (err.message||err)); }
  };
  const cf = $('#checkForm');
  if(cf) cf.onsubmit = async e => { e.preventDefault(); const f = new FormData(cf); const existing = await S.db.listChecklist(r.id); await S.db.addChecklist([{ event_id: r.id, label: f.get('label').trim(), done:false, sort: existing.length }]); render(); };

  // ---- supply hunts ----
  const hf = $('#huntForm');
  if(hf){
    const hkey = 'sss_draft_hunt_' + (hf.elements.id.value || 'new');
    if(attachDraft(hf, hkey)) toast('Restored what you were typing');
    const live = () => {
      const g = num($('#hGuests').value), per = num($('#hPer').value) || 1;
      $('#hNeed').textContent = g ? `so you need about ${Math.ceil(g * per)}` : '';
      const c = num($('#hCharge').value), mg = $('#hMargin').value;
      $('#hBudget').textContent = (c && mg !== '') ? `${money2(c * (1 - num(mg) / 100))} per guest to spend on ALL supplies` : '';
    };
    hf.addEventListener('input', live); live();
    $('#hEvent').onchange = () => { // tie to an event → fill in what we already know (never overwrites what she typed)
      const ev = S.events.find(e => e.id === $('#hEvent').value); if(!ev) return; const p = huntFromEvent(ev);
      if(!$('#hGuests').value && p.guests) $('#hGuests').value = p.guests;
      if(!$('#hNeedBy').value && p.need_by) $('#hNeedBy').value = p.need_by;
      if(!$('#hCharge').value && p.charge_per_guest) $('#hCharge').value = p.charge_per_guest;
      live(); hf.dispatchEvent(new Event('input'));
    };
    hf.onsubmit = async e => {
      e.preventDefault(); const f = new FormData(hf); const v = k => (f.get(k) ?? '').toString().trim(); const n = k => v(k) === '' ? null : num(v(k));
      const prev = v('id') ? (S.hunts || []).find(x => x.id === v('id')) : null;
      const h = { ...(prev || { options: [], status: 'open', chosen_id: null }), name: v('hname'), query: v('query'), event_id: v('event_id') || null, guests: n('guests'), units_per_guest: n('units_per_guest') ?? 1, need_by: v('need_by') || null, charge_per_guest: n('charge_per_guest'), target_margin: n('target_margin'), max_unit_cost: n('max_unit_cost'), notes: v('notes') };
      try { const saved = await S.db.saveHunt(h); clearDraft(hkey); toast(prev ? 'Saved' : 'Hunt started'); go('#/hunt/' + saved.id); } catch(err){ alert('Could not save: ' + (err.message || err)); }
    };
  }
  const readOpt = f => ({ url: (f.get('url') || '').trim(), title: (f.get('title') || '').trim(), store: (f.get('store') || '').trim(), pack_price: num(f.get('pack_price')), pack_qty: f.get('pack_qty') === '' ? 1 : num(f.get('pack_qty')), shipping: num(f.get('shipping')), arrives_by: f.get('arrives_by') || null, rating: f.get('rating') === '' ? null : num(f.get('rating')), reviews: f.get('reviews') === '' ? null : num(f.get('reviews')), is_current: f.get('is_current') === 'on', notes: (f.get('notes') || '').trim() });
  [['#optForm', false], ['#optEdit', true]].forEach(([sel, editing]) => {
    const of = $(sel); if(!of) return;
    const h = (S.hunts || []).find(x => x.id === r.id); if(!h) return;
    const okey = 'sss_draft_opt_' + h.id;
    if(!editing) attachDraft(of, okey); // she WILL hop to Amazon mid-form — keep what she typed
    const urlEl = of.querySelector('[name=url]'), storeEl = of.querySelector('[name=store]');
    urlEl.addEventListener('input', () => { const s = storeFromUrl(urlEl.value.trim()); if(s && (!storeEl.value || storeEl.dataset.auto === '1')){ storeEl.value = s; storeEl.dataset.auto = '1'; } });
    storeEl.addEventListener('input', () => { storeEl.dataset.auto = ''; });
    of.onsubmit = async e => {
      e.preventDefault(); const o = readOpt(new FormData(of));
      if(o.is_current) (h.options || []).forEach(x => { x.is_current = false; }); // only one baseline
      if(editing){ const i = (h.options || []).findIndex(x => x.id === of.dataset.id); if(i >= 0) h.options[i] = { ...h.options[i], ...o }; S._editOpt = null; }
      else h.options = [...(h.options || []), { id: uid(), ...o }];
      try { await S.db.saveHunt(h); if(!editing) clearDraft(okey); toast(editing ? 'Option updated' : 'Option added'); render(); } catch(err){ alert('Could not save: ' + (err.message || err)); }
    };
  });

  // settings form
  const sf = $('#settingsForm');
  if(sf) attachDraft(sf, 'sss_draft_settings');
  if(sf) sf.onsubmit = async e => {
    e.preventDefault(); clearDraft('sss_draft_settings'); const f = new FormData(sf); const s = JSON.parse(JSON.stringify(S.settings));
    s.ownerName = f.get('ownerName').trim() || 'there'; s.extraGuestRate = num(f.get('extraGuestRate')); s.targetMargin = f.get('targetMargin') === '' ? 70 : num(f.get('targetMargin'));
    s.experiences = s.experiences.map((x,i) => ({ name: (f.get('exp_name_'+i)||x.name).trim(), price: num(f.get('exp_price_'+i)), included: parseInt(f.get('exp_inc_'+i)||0,10) }));
    const packing = {}; Object.keys(s.packing).forEach(k => { packing[k] = (f.get('pack_'+k)||'').split('\n').map(x => x.trim()).filter(Boolean); });
    s.experiences.forEach(x => { if(!(x.name in packing)) packing[x.name] = []; }); s.packing = packing;
    await S.db.saveSettings(s); toast('Settings saved'); render();
  };
}

/* ---------- calendar + export ---------- */
/* "Add to calendar" — one event, every calendar. Times are Wilmington (Eastern) wall-clock. */
const CAL_TZ = 'America/New_York';
function eventEndTime(e){ // her end time, or start + 2h
  if(e.event_end && e.event_end > e.event_time) return e.event_end;
  const [h, m] = e.event_time.split(':').map(Number); return String(Math.min(23, h + 2)).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
function tzOffset(dateISO, time){ // "-04:00" in summer, "-05:00" in winter
  try { const s = new Intl.DateTimeFormat('en-US', { timeZone: CAL_TZ, timeZoneName: 'longOffset' }).formatToParts(new Date(dateISO + 'T' + (time || '12:00') + ':00Z')).find(p => p.type === 'timeZoneName').value; const m = s.match(/GMT([+-]\d{2}:\d{2})/); return m ? m[1] : '-05:00'; } catch(err){ return '-05:00'; }
}
function calInfo(e){
  return { title: 'Salt & Scissors: ' + e.client_name + (e.experience ? ' — ' + e.experience + (e.experience_detail ? ' (' + e.experience_detail + ')' : '') : ''),
    details: [e.occasion, e.honoree, e.guest_count ? e.guest_count + ' guests' : '', e.theme ? 'Theme: ' + e.theme : '', e.client_contact ? 'Contact: ' + e.client_contact : '', e.notes].filter(Boolean).join('\n'),
    location: e.location || '' };
}
function calLinks(e){
  const i = calInfo(e), enc = encodeURIComponent, d = e.event_date.replace(/-/g, '');
  const nextDay = (() => { const x = parseDate(e.event_date); x.setDate(x.getDate() + 1); return x.getFullYear() + String(x.getMonth() + 1).padStart(2, '0') + String(x.getDate()).padStart(2, '0'); })();
  let gDates, oStart, oEnd;
  if(e.event_time){
    const end = eventEndTime(e), off = tzOffset(e.event_date, e.event_time);
    gDates = `${d}T${e.event_time.replace(':', '')}00/${d}T${end.replace(':', '')}00`;
    oStart = `${e.event_date}T${e.event_time}:00${off}`; oEnd = `${e.event_date}T${end}:00${off}`;
  } else { gDates = `${d}/${nextDay}`; oStart = e.event_date; oEnd = e.event_date; }
  return {
    google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(i.title)}&dates=${gDates}&ctz=${enc(CAL_TZ)}&details=${enc(i.details)}&location=${enc(i.location)}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&subject=${enc(i.title)}&startdt=${enc(oStart)}&enddt=${enc(oEnd)}&allday=${e.event_time ? 'false' : 'true'}&body=${enc(i.details)}&location=${enc(i.location)}`,
  };
}
function makeICS(e){
  const dt = e.event_date.replace(/-/g,'');
  const stamp = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
  let start, end;
  if(e.event_time){
    start = `DTSTART;TZID=${CAL_TZ}:${dt}T${e.event_time.replace(':','')}00`;
    end = `DTEND;TZID=${CAL_TZ}:${dt}T${eventEndTime(e).replace(':','')}00`;
  } else { // all-day: the end date is exclusive, so it's the NEXT day
    const x = parseDate(e.event_date); x.setDate(x.getDate() + 1);
    start = `DTSTART;VALUE=DATE:${dt}`; end = `DTEND;VALUE=DATE:${x.getFullYear()}${String(x.getMonth()+1).padStart(2,'0')}${String(x.getDate()).padStart(2,'0')}`;
  }
  const escI = s => String(s||'').replace(/\\/g,'\\\\').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n');
  const i = calInfo(e);
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Salt & Scissors Studio//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',`UID:${e.id}@saltandscissors.co`,`DTSTAMP:${stamp}`,start,end,`SUMMARY:${escI(i.title)}`,`LOCATION:${escI(i.location)}`,`DESCRIPTION:${escI(i.details)}`,
    'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Salt & Scissors event tomorrow','TRIGGER:-P1D','END:VALARM','END:VEVENT','END:VCALENDAR'].join('\r\n');
}

async function exportCSV(){
  const expenses = await S.db.listExpenses();
  const q = v => '"' + String(v ?? '').replace(/"/g,'""') + '"';
  const receipts = S._allReceipts || [];
  const ev = [['Date','Start','End','Client','Contact','Status','Occasion','Guest of honor','Experience','Details','Guests','Location','Theme','Package','Quoted','Agreed','Deposit','Deposit paid','Paid in full','Collected','Supplies','Shipping/tax','True cost','Profit','Source','Notes'].join(',')];
  const cb = S._costByEvent || {};
  S.events.slice().sort((a,b) => (a.event_date||'').localeCompare(b.event_date||'')).forEach(e => { const c = cb[e.id] || { supplies:0, shipTax:0, trueCost:0 }; ev.push([e.event_date, e.event_time, e.event_end, e.client_name, e.client_contact, e.status, e.occasion, e.honoree, e.experience, e.experience_detail, e.guest_count, e.location, e.theme, (e.price_lines||[]).map(l => l.label + ' ' + money(l.amount)).join('; '), e.price_quoted, e.price_agreed, e.deposit, e.deposit_paid?'yes':'no', e.paid_in_full?'yes':'no', collectedOf(e), c.supplies.toFixed(2), c.shipTax.toFixed(2), c.trueCost.toFixed(2), (num(e.price_agreed)-c.trueCost).toFixed(2), e.source, e.notes].map(q).join(',')); });
  const ex = [['Date bought','Event date','Client','Item','Qty','Cost','Each','Store','Receipt'].join(',')];
  expenses.forEach(x => { const e = S.events.find(v => v.id === x.event_id) || {}; const r = receipts.find(v => v.id === x.receipt_id); const each = (x.qty && num(x.qty) > 0) ? (num(x.cost)/num(x.qty)).toFixed(4) : ''; ex.push([x.created_at?x.created_at.slice(0,10):'', e.event_date, e.client_name, x.item, x.qty ?? '', num(x.cost).toFixed(2), each, x.store, r ? (r.vendor||'') + ' ' + (r.receipt_date||'') : ''].map(q).join(',')); });
  const rc = [['Receipt date','Vendor','Event date','Client','Items subtotal','Shipping','Tax','Total','Notes'].join(',')];
  receipts.slice().sort((a,b) => (a.receipt_date||'').localeCompare(b.receipt_date||'')).forEach(r => { const e = S.events.find(v => v.id === r.event_id) || {}; rc.push([r.receipt_date, r.vendor, e.event_date, e.client_name, num(r.subtotal).toFixed(2), num(r.shipping).toFixed(2), num(r.tax).toFixed(2), (num(r.subtotal)+num(r.shipping)+num(r.tax)).toFixed(2), r.notes].map(q).join(',')); });
  download('salt-scissors-events.csv', ev.join('\n'), 'text/csv');
  setTimeout(() => download('salt-scissors-items.csv', ex.join('\n'), 'text/csv'), 400);
  setTimeout(() => download('salt-scissors-receipts.csv', rc.join('\n'), 'text/csv'), 800);
  toast('Three CSVs downloaded');
}

/* ---------- go ---------- */
boot();
