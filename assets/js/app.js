/* ============================================================
   LBD MEMBERSHIP PORTAL — central script
   ============================================================ */

/* ---------- CONFIG: paste your Apps Script Web App URL here ---------- */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyNFS1hcJRfmjxq8h8qaTcuptiC2Gs_LIPRP_g3oVLAZJfM-hOC-YvUqZZ4NGtjYC6V/exec',   // https://script.google.com/macros/s/XXXX/exec
  MAX_FILE_MB: 5,
  POLL_MS: 45000,                            // admin queue auto-refresh
};
const TOKEN_KEY = 'lbd_admin_token';
const MTOKEN_KEY = 'lbd_member_token';

/* ============================================================
   DATA
   ============================================================ */
const TIERS = {
  general:{label:'LBD Member Card',short:'LBD',      color:'#C98A4B', commit:'Criteria-based',        order:0},
  gold:   {label:'Gold MAP Card',  short:'Gold MAP', color:'#DFA92E', commit:'₦1M – ₦4M',             order:1},
  vip:    {label:'VIP Card',       short:'VIP',      color:'#2A1C10', commit:'₦5M and above',         order:2},
};
const TIER_KEYS = Object.keys(TIERS);
const colonyOpts = ['PARTNERSHIP','APPRENTICESHIP','RELATIONSHIP','CITIZENSHIP','ENTREPRENEURSHIP','LEADERSHIP','STEWARDSHIP'].map(v => ({value:v, label:v}));
const hubOpts = (() => {
  const a = [];
  for (let i = 1; i <= 24; i++) a.push(`Hub ${i}`);
  for (let i = 26; i <= 31; i++) a.push(`Hub ${i}`);   // Hub 25 intentionally excluded
  return a.map(v => ({value:v, label:v}));
})();
const tribeOpts = Array.from({length:90}, (_,i) => ({value:`Tribe ${i+1}`, label:`Tribe ${i+1}`}));
const tierOpts  = TIER_KEYS.map(k => ({value:k, label:TIERS[k].label, color:TIERS[k].color}));

let apps = [];   // loaded from the backend
let me = null;   // {username, role} of the signed-in admin

/* ============================================================
   HELPERS
   ============================================================ */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => /^https:\/\/(drive|docs)\.google\.com\//.test(u || '') ? u : '';

function toast(msg, kind = 'ok'){
  const icons = {ok:'check-circle', warn:'info-circle', bad:'x-circle'};
  const t = document.createElement('div');
  t.className = 'toast' + (kind !== 'ok' ? ' ' + kind : '');
  t.innerHTML = `<i class="bi bi-${icons[kind]}"></i><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 4000);
}

/* ============================================================
   API — talks to Code.gs (Google Apps Script web app)
   text/plain avoids a CORS preflight, which Apps Script can't answer.
   ============================================================ */
async function api(action, data = {}, {auth = false} = {}){
  if (!CONFIG.API_URL || CONFIG.API_URL.startsWith('PASTE_')){
    throw Object.assign(new Error('Backend not connected yet — set CONFIG.API_URL in assets/js/app.js.'), {code:'CONFIG'});
  }
  const body = {action, ...data};
  if (auth) body.token = sessionStorage.getItem(auth === 'member' ? MTOKEN_KEY : TOKEN_KEY) || '';
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(body)});
  } catch (e) { throw Object.assign(new Error('Could not reach the server. Check your connection.'), {code:'NETWORK'}); }
  let json;
  try { json = await res.json(); } catch (e) { throw Object.assign(new Error('Unexpected server response.'), {code:'BAD_RESPONSE'}); }
  if (!json.ok) throw Object.assign(new Error(json.error || 'Request failed.'), {code:json.code || 'ERROR'});
  return json.data;
}

/* logos: every mark is an <img src="assets/logo.png"> in index.html */

/* ticker */
(() => {
  const items = ['BETHEL','NOVAS','MAP LIBRARY','LOYALTY PROGRAMME','ANNUAL CONVENTION','INTELLECTUAL WEBINARS','LBD PARTNERS','SEVEN COLONIES','NINETY TRIBES'];
  const group = `<span class="tk">${items.map(i => `<span>${i}</span><i></i>`).join('')}</span>`;
  $('#tickerTrack').innerHTML = group + group;
})();

/* ============================================================
   CUSTOM SELECT
   ============================================================ */
class Sel {
  static map = new Map();
  static closeAll(except){ Sel.map.forEach(inst => { if (inst !== except) inst.close(); }); }
  constructor(root, opts, {searchable = false, swatch = false, onChange = null} = {}){
    this.root = root; this.opts = opts; this.swatch = swatch; this.onChange = onChange;
    this.value = null; this.open = false;
    this.btn = root.querySelector('.selectBtn');
    this.valEl = root.querySelector('.selVal');
    this.list = root.querySelector('.selList');
    this.searchWrap = root.querySelector('.selSearch');
    this.searchIn = this.searchWrap.querySelector('input');
    this.searchWrap.style.display = searchable ? '' : 'none';
    this.build('');
    this.btn.addEventListener('click', e => { e.stopPropagation(); this.open ? this.close() : this.show(); });
    this.searchIn.addEventListener('input', () => { this.build(this.searchIn.value); this.list.scrollTop = 0; });
    this.searchIn.addEventListener('keydown', e => { if (e.key === 'Escape'){ this.close(); this.btn.focus(); }});
    Sel.map.set(root, this);
  }
  build(q){
    this.list.innerHTML = '';
    const items = this.opts.filter(o => o.label.toLowerCase().includes(q.toLowerCase()));
    if (!items.length){ this.list.innerHTML = '<li class="selNone">No matches found</li>'; return; }
    for (const o of items){
      const li = document.createElement('li');
      li.setAttribute('role', 'option'); li.dataset.v = o.value;
      li.innerHTML = `${this.swatch ? `<span class="sw" style="--c:${o.color}"></span>` : ''}<span>${o.label}</span><i class="bi bi-check-lg ck"></i>`;
      if (this.value === o.value) li.classList.add('on');
      li.addEventListener('click', () => { this.set(o.value); this.close(); this.btn.focus(); });
      this.list.appendChild(li);
    }
  }
  set(v, silent){
    this.value = v;
    const o = this.opts.find(x => x.value === v);
    this.valEl.classList.remove('placeholder');
    this.valEl.innerHTML = `${this.swatch ? `<span class="btnSw show" style="--c:${o.color}"></span>` : ''}${o.label}`;
    this.list.querySelectorAll('li').forEach(li => li.classList.toggle('on', li.dataset.v === v));
    if (!silent && this.onChange) this.onChange(v);
  }
  reset(){
    this.value = null;
    this.valEl.classList.add('placeholder');
    this.valEl.innerHTML = `${this.swatch ? '<span class="btnSw"></span>' : ''}${this.root.dataset.ph}`;
    this.build('');
  }
  show(){ Sel.closeAll(this); this.open = true; this.root.classList.add('open');
    if (this.searchWrap.style.display !== 'none'){ this.searchIn.value = ''; this.build(''); setTimeout(() => this.searchIn.focus(), 40); } }
  close(){ this.open = false; this.root.classList.remove('open'); }
}

/* ============================================================
   VIEW ROUTER
   ============================================================ */
let pollTimer = null;
function showView(name){
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
  window.scrollTo(0, 0);
  Sel.closeAll(); closeDrawer();
  document.title = name === 'admin' ? 'LBD · Admin Review Desk' : 'LBD — Living By Design · Membership Portal';
  clearInterval(pollTimer);
  if (name === 'member') loadMember();
  if (name === 'admin'){
    lastActive = lastPing = Date.now();
    loadApps();
    pollTimer = setInterval(() => loadApps(true), CONFIG.POLL_MS);
  }
}

$$('.adminLink').forEach(b => b.addEventListener('click', openAdmin));
$('#loginBack').addEventListener('click', () => showView('site'));

async function openAdmin(){
  showView('login');
  await initLoginCard();
}

/* ============================================================
   ADMIN AUTH — first-time password creation, then sign-in
   ============================================================ */
let authMode = null;   // 'setup' | 'login'

function setLoginError(msg){
  const box = $('#loginErr');
  $('#loginErrTxt').textContent = msg || '';
  box.classList.toggle('show', !!msg);
  if (msg){ const c = $('.loginCard'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
}

async function initLoginCard(){
  const btn = $('#loginBtn');
  setLoginError('');
  ['#userField','#codeField','#passField','#confirmField','#pwHint'].forEach(s => $(s).classList.add('hidden'));
  btn.disabled = true; btn.textContent = 'Please wait…';
  $('#loginTitle').textContent = 'Admin Sign-in';
  $('#loginSub').textContent = 'Checking the review desk…';

  /* an existing session? skip straight in */
  if (sessionStorage.getItem(TOKEN_KEY)){
    try { const o = await api('list', {}, {auth:true}); setMe(o.me); showView('admin'); return; }
    catch (e) { sessionStorage.removeItem(TOKEN_KEY); }
  }

  try {
    const st = await api('status');
    authMode = st.configured ? 'login' : 'setup';
    $('#passField').classList.remove('hidden'); $('#userField').classList.remove('hidden');
    if (authMode === 'setup'){
      $('#loginEyebrow').textContent = 'LBD — First-time setup';
      $('#loginTitle').textContent = 'Create Admin Account';
      $('#loginSub').textContent = 'No administrator exists yet. Choose a username and password for the first (owner) account — the password is stored only as a salted hash.';
      $('#passLabel').textContent = 'New Password';
      $('#adminPass').autocomplete = 'new-password';
      $('#confirmField').classList.remove('hidden');
      $('#pwHint').classList.remove('hidden');
      if (st.requiresCode) $('#codeField').classList.remove('hidden');
      btn.innerHTML = 'Create password &amp; sign in <i class="bi bi-arrow-right"></i>';
    } else {
      $('#loginEyebrow').textContent = 'LBD — Review Desk';
      $('#loginTitle').textContent = 'Admin Sign-in';
      $('#loginSub').textContent = 'Restricted area. This console is reserved for LBD membership administrators reviewing card applications.';
      $('#passLabel').textContent = 'Password';
      $('#adminPass').autocomplete = 'current-password';
      btn.innerHTML = 'Sign in to Review Desk <i class="bi bi-arrow-right"></i>';
    }
    btn.disabled = false;
    $('#adminPass').focus();
  } catch (e) {
    $('#loginSub').textContent = 'Restricted area.';
    btn.textContent = 'Unavailable';
    setLoginError(e.message);
  }
}

$('#pwToggle').addEventListener('click', () => {
  const inp = $('#adminPass');
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  $('#pwToggle').innerHTML = `<i class="bi bi-${show ? 'eye-slash' : 'eye'}"></i>`;
});

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pass = $('#adminPass').value, username = $('#adminUser').value.trim();
  if (!authMode) return;
  if (!username) return setLoginError('Enter your username.');
  if (authMode === 'setup'){
    if (pass.length < 8) return setLoginError('Password must be at least 8 characters.');
    if (pass !== $('#adminPass2').value) return setLoginError('The two passwords do not match.');
  } else if (!pass) return setLoginError('Enter your password.');

  const btn = $('#loginBtn'), label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span>${authMode === 'setup' ? 'Creating…' : 'Verifying credentials…'}`;
  setLoginError('');
  try {
    const out = await api(authMode, {username, password:pass, setupCode:$('#setupCode').value.trim()});
    sessionStorage.setItem(TOKEN_KEY, out.token);
    $('#adminPass').value = ''; $('#adminPass2').value = ''; $('#setupCode').value = '';
    showView('admin');
    toast(authMode === 'setup' ? 'Owner account created — welcome!' : 'Signed in — welcome back.');
  } catch (err) {
    setLoginError(err.message);
  } finally {
    btn.disabled = false; btn.innerHTML = label;  }
});

$('#btnSignout').addEventListener('click', async () => {
  try { await api('logout', {}, {auth:true}); } catch (e) {}
  sessionStorage.removeItem(TOKEN_KEY);
  apps = []; me = null;
  showView('site');
  toast('Signed out of the Review Desk.');
});

function sessionExpired(){
  sessionStorage.removeItem(TOKEN_KEY);
  showView('site');
  toast('Your session expired — please sign in again.', 'warn');
}

/* live clock */
setInterval(() => {
  const d = new Date(), p = n => String(n).padStart(2,'0');
  $('#admClock').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}, 1000);

/* ============================================================
   APPLICATION FORM (public site)
   ============================================================ */
const state = {file:null};
const selColony = new Sel($('#selColony'), colonyOpts, {searchable:true, onChange:() => { clearErr('#f-colony'); updateSteps(); }});
const selHub    = new Sel($('#selHub'),    hubOpts,    {searchable:true, onChange:() => { clearErr('#f-hub');    updateSteps(); }});
const selTribe  = new Sel($('#selTribe'),  tribeOpts,  {searchable:true, onChange:() => { clearErr('#f-tribe');  updateSteps(); }});
const selTier   = new Sel($('#selTier'),   tierOpts,   {swatch:true,     onChange:v => { clearErr('#f-tier'); updateLetterUI(v); updateSteps(); }});

document.addEventListener('click', e => { if (!e.target.closest('.select')) Sel.closeAll(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ Sel.closeAll(); closeModal(); } });

function updateLetterUI(tier){
  const tag = $('#letterTag'), hint = $('#letterHint');
  if (tier === 'general'){
    tag.textContent = 'Required'; tag.className = 'tagReq req';
    hint.textContent = 'Required for the LBD Member Card — issued by your Priestley division';
  } else {
    tag.textContent = 'Optional'; tag.className = 'tagReq opt';
    hint.textContent = tier
      ? 'Not required for this tier — attach only if it strengthens your review'
      : 'Required only for LBD Member Card applications · PDF, JPG or PNG · max 5MB';
  }
}

/* file upload */
const drop = $('#drop'), fileIn = $('#letter');
const OK_TYPES = ['application/pdf','image/jpeg','image/png'];
drop.addEventListener('click', () => fileIn.click());
['dragover','dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) setFile(f); });
fileIn.addEventListener('change', () => { if (fileIn.files[0]) setFile(fileIn.files[0]); });
function setFile(f){
  if (!OK_TYPES.includes(f.type)){ toast('Only PDF, JPG or PNG files are accepted.', 'warn'); fileIn.value = ''; return; }
  if (f.size > CONFIG.MAX_FILE_MB * 1024 * 1024){ toast(`File is larger than ${CONFIG.MAX_FILE_MB}MB.`, 'warn'); fileIn.value = ''; return; }
  state.file = f;
  $('#fileName').textContent = f.name;
  $('#fileSize').textContent = (f.size / 1024).toFixed(0) + ' KB';
  $('#fileChip').classList.add('show');
  $('#f-letter').classList.remove('error'); drop.classList.remove('error');
  updateSteps();
}
$('#fileRemove').addEventListener('click', e => {
  e.stopPropagation();
  state.file = null; fileIn.value = '';
  $('#fileChip').classList.remove('show');
  updateSteps();
});
const toBase64 = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = () => rej(new Error('Could not read the file.'));
  r.readAsDataURL(f);
});

/* validation */
function setErr(sel, on){ const f = $(sel); if (f) f.classList.toggle('error', on); }
function clearErr(sel){ setErr(sel, false); }
['fName','fEmail','fPhone'].forEach(id =>
  $('#' + id).addEventListener('input', () => { clearErr('#f-' + id.slice(1).toLowerCase()); updateSteps(); })
);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function updateSteps(){
  const name  = $('#fName').value.trim();
  const email = EMAIL_RE.test($('#fEmail').value.trim());
  const phone = $('#fPhone').value.replace(/\D/g,'').length >= 7;
  const s1 = name.length >= 3 && email && phone;
  const s2 = !!(selColony.value && selHub.value && selTribe.value);
  const s3 = !!selTier.value && (selTier.value !== 'general' || !!state.file);
  const done = [s1,s2,s3];
  done.forEach((d,i) => $('#st' + (i+1)).classList.toggle('done', d));
  const n = done.filter(Boolean).length;
  $('#stepBar').style.width = (n / 3 * 100) + '%';
  $('#stepPct').textContent = `${n} / 3`;
  return {s1,s2,s3};
}
updateLetterUI(null);

/* submit → backend */
$('#appForm').addEventListener('submit', async e => {
  e.preventDefault();
  const st = updateSteps();
  let ok = true, firstErr = null;
  if (!st.s1){
    if ($('#fName').value.trim().length < 3){ setErr('#f-name', true); firstErr = firstErr || '#f-name'; }
    if (!EMAIL_RE.test($('#fEmail').value.trim())){ setErr('#f-email', true); firstErr = firstErr || '#f-email'; }
    if ($('#fPhone').value.replace(/\D/g,'').length < 7){ setErr('#f-phone', true); firstErr = firstErr || '#f-phone'; }
    ok = false;
  }
  if (!st.s2){
    if (!selColony.value){ setErr('#f-colony', true); firstErr = firstErr || '#f-colony'; }
    if (!selHub.value){ setErr('#f-hub', true); firstErr = firstErr || '#f-hub'; }
    if (!selTribe.value){ setErr('#f-tribe', true); firstErr = firstErr || '#f-tribe'; }
    ok = false;
  }
  if (!selTier.value){ setErr('#f-tier', true); firstErr = firstErr || '#f-tier'; ok = false; }
  if (selTier.value === 'general' && !state.file){
    $('#f-letter').classList.add('error'); drop.classList.add('error');
    firstErr = firstErr || '#f-letter'; ok = false;
  }
  if (!ok){ $(firstErr).scrollIntoView({behavior:'smooth', block:'center'}); toast('Please complete the highlighted fields.', 'warn'); return; }

  const btn = $('#submitBtn'), label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Submitting…';
  try {
    const payload = {
      name:$('#fName').value.trim(), email:$('#fEmail').value.trim(), phone:$('#fPhone').value.trim(),
      colony:selColony.value, hub:selHub.value, tribe:selTribe.value, tier:selTier.value,
    };
    if (state.file) payload.file = {name:state.file.name, mime:state.file.type, data:await toBase64(state.file)};
    const out = await api('submit', payload);

    $('#mRef').textContent = 'REFERENCE · ' + out.ref;
    $('#mName').textContent = payload.name;
    $('#mTier').textContent = TIERS[payload.tier].short.toUpperCase() + ' TIER';
    $('#mTierDot').style.setProperty('--c', TIERS[payload.tier].color);
    $('#mCheckHolder').innerHTML = '<span class="mCheck"></span>';
    openModal();
  } catch (err) {
    toast(err.message, 'bad');
  } finally {
    btn.disabled = false; btn.innerHTML = label;  }
});

function openModal(){ $('#modalWrap').classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeModal(){
  if (!$('#modalWrap').classList.contains('show')) return;
  $('#modalWrap').classList.remove('show'); document.body.style.overflow = '';
  resetForm();
}
$('#mClose').addEventListener('click', closeModal);
$('#mDone').addEventListener('click', closeModal);
$('#modalWrap').addEventListener('click', e => { if (e.target === $('#modalWrap')) closeModal(); });

function resetForm(){
  $('#appForm').reset();
  [selColony, selHub, selTribe, selTier].forEach(s => s.reset());
  state.file = null; fileIn.value = '';
  $('#fileChip').classList.remove('show');
  $$('#viewSite .field').forEach(f => f.classList.remove('error'));
  drop.classList.remove('error');
  updateLetterUI(null); updateSteps();
}

$('#btnLogin').addEventListener('click', () => openMemberLogin());
$('#footMember').addEventListener('click', () => openMemberLogin());

/* ============================================================
   ADMIN QUEUE — reads/writes through the backend
   ============================================================ */
const GROUPS = {all:null, pending:['pending'], awaiting:['suggested','accepted'], approved:['approved'], upgraded:['upgraded'], reassigned:['reassigned'], rejected:['rejected']};
const statusOrder = {pending:0, accepted:1, suggested:2, upgraded:3, reassigned:4, approved:5, rejected:6};
const shortOf = k => (TIERS[k] ? TIERS[k].short : '');
const statusLabel = a => ({
  pending:'Pending review', approved:'Approved', rejected:'Rejected',
  upgraded:`Upgraded · ${shortOf(a.tier)}`, suggested:`Awaiting user · ${shortOf(a.suggestedTier)}`,
  accepted:`User accepted · ${shortOf(a.tier)}`, reassigned:`Reassigned · ${shortOf(a.tier)}`,
}[a.status] || a.status);
const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'}); };

let curTab = 'all', curQ = '';

async function loadApps(silent){
  try {
    const out = await api('list', {poll: !!silent}, {auth:true});
    setMe(out.me);
    const before = drawerUid ? (drawerApp() || {}).status : null;
    apps = (out.apps || []).filter(a => TIERS[a.tier]);
    renderQueue();
    if (drawerUid){ const now = drawerApp(); if (!now) closeDrawer(); else if (now.status !== before) renderDrawer(); }
  } catch (e) {
    if (e.code === 'AUTH') return sessionExpired();
    if (!silent) toast(e.message, 'bad');
  }
}
function setMe(m){
  me = m || null;
  if (!me) return;
  $('#admUserName').textContent = me.username;
  $('#admAvatar').textContent = me.username.charAt(0).toUpperCase();
  $('#btnAdmins').classList.toggle('hidden', me.role !== 'owner');
}
$('#btnRefresh').addEventListener('click', async () => { await loadApps(); toast('Queue refreshed.'); });

const countIn = g => apps.filter(a => GROUPS[g].includes(a.status)).length;
const appliedKey = a => (a.origTier && TIERS[a.origTier]) ? a.origTier : a.tier;      // the card they originally applied for
const unq = s => String(s ?? '').replace(/^'(?=[=+\-@])/, '');                    // leading text-marker apostrophe (formula guard)
const initials = n => String(n).trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0)).join('').toUpperCase();
const longDate = iso => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleString(undefined, {day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit'}); };

function renderQueue(flashId){
  const statDefs = [
    {k:'pending',  label:'Pending review', c:'#B0A692', icon:'inbox'},
    {k:'awaiting', label:'Awaiting',       c:'#2D5FA6', icon:'hourglass-split'},
    {k:'approved', label:'Approved',       c:'#C8501A', icon:'check-circle'},
    {k:'rejected', label:'Rejected',       c:'#C22B1B', icon:'x-circle'},
  ];
  $('#statStrip').innerHTML = statDefs.map(s => `
    <button type="button" class="statCard ${curTab === s.k ? 'on' : ''}" data-tab="${s.k}" style="--c:${s.c}">
      <span class="scTop"><i class="bi bi-${s.icon}"></i>${s.label}</span>
      <b>${String(countIn(s.k)).padStart(2,'0')}</b>
    </button>`).join('');

  const tabs = [['all','All queue'],['pending','Pending'],['awaiting','Awaiting'],['approved','Approved'],['upgraded','Upgraded'],['reassigned','Reassigned'],['rejected','Rejected']];
  $('#conTabs').innerHTML = tabs.map(([k, l]) => {
    const c = k === 'all' ? apps.length : countIn(k);
    return `<button type="button" class="conTab ${curTab === k ? 'active' : ''}" data-tab="${k}">${l.toUpperCase()} <i>${c}</i></button>`;
  }).join('');

  const q = curQ.toLowerCase();
  const list = apps
    .filter(a => curTab === 'all' || GROUPS[curTab].includes(a.status))
    .filter(a => !q || [a.ref, a.uid, a.name, a.email, a.phone, a.colony, a.hub, a.tribe, TIERS[a.tier].short].join(' ').toLowerCase().includes(q))
    .sort((a,b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) || String(b.submitted).localeCompare(String(a.submitted)));

  // the board only shows: name · card applied for · status — everything else lives in the details drawer
  $('#qBody').innerHTML = list.map(a => {
    const ak = appliedKey(a);
    return `
    <div class="boardRow${a.uid === flashId ? ' flash' : ''}" role="button" tabindex="0" data-id="${esc(a.uid)}" aria-label="Open ${esc(a.name)}">
      <div class="bName"><span class="bAv">${esc(initials(unq(a.name)))}</span><span class="nm">${esc(unq(a.name))}</span></div>
      <div class="bCard"><span class="tierChip"><span class="dot" style="--c:${TIERS[ak].color}"></span>${esc(TIERS[ak].label)}</span></div>
      <div class="bStatus"><span class="pill p-${esc(a.status)}">${esc(statusLabel(a))}</span></div>
      <i class="bi bi-chevron-right bChev"></i>
    </div>`;
  }).join('');

  $('#qEmpty').classList.toggle('show', list.length === 0);
  $('#qCount').textContent = `${list.length} RECORD${list.length === 1 ? '' : 'S'} · ${countIn('pending')} PENDING · ${countIn('awaiting')} AWAITING`;
}

$('#conTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; curTab = b.dataset.tab; renderQueue(); });
$('#statStrip').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; curTab = b.dataset.tab; renderQueue(); });
$('#qSearch').addEventListener('input', e => { curQ = e.target.value; renderQueue(); });
$('#qBody').addEventListener('click', e => { const r = e.target.closest('.boardRow'); if (r) openDrawer(r.dataset.id); });
$('#qBody').addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('boardRow')){ e.preventDefault(); openDrawer(e.target.dataset.id); }
});

/* one place for every decision: calls the backend, refreshes the board + drawer, reports whether the email went out */
async function decide(a, op, extra = {}, doneMsg = 'Saved.', kind = 'ok'){
  try {
    const out = await api('update', {uid:a.uid, op, ...extra}, {auth:true});
    Object.assign(a, out.app);
    renderQueue(a.uid);
    if (drawerUid === a.uid) renderDrawer();
    const em = out.email || {};
    if (em.sent === false) toast(`${doneMsg} But the email to ${a.email} failed: ${em.error || 'unknown error'}`, 'warn');
    else toast(em.sent ? `${doneMsg} Email sent to ${a.email}.` : doneMsg, kind);
    return true;
  } catch (e) {
    if (e.code === 'AUTH') sessionExpired(); else toast(e.message, 'bad');
    return false;
  }
}

/* ============================================================
   APPLICANT DETAILS — drawer (side panel on desktop, bottom sheet on phones)
   ============================================================ */
let drawerUid = null, dwMode = null;
const drawerApp = () => apps.find(x => x.uid === drawerUid);

function openDrawer(uid){
  drawerUid = uid; dwMode = null;
  renderDrawer();
  $('#drawerWrap').classList.add('show');
  document.body.style.overflow = 'hidden';
  $('#dwBody').scrollTop = 0;
}
function closeDrawer(){
  drawerUid = null; dwMode = null;
  $('#drawerWrap').classList.remove('show');
  if (!$('#modalWrap').classList.contains('show')) document.body.style.overflow = '';
}

function choicesFor(a, mode){
  const cur = TIERS[a.tier].order;
  if (mode === 'upgrade') return {head:'Upgrade to which card?', items:TIER_KEYS.filter(k => TIERS[k].order > cur).map(k => ({k, label:TIERS[k].label, sub:TIERS[k].commit}))};
  if (mode === 'reject')  return {head:'Criteria not met — email the applicant', items:[{k:'', label:'Decline only', sub:'no offer'}]
      .concat(TIER_KEYS.filter(k => TIERS[k].order < cur).reverse().map(k => ({k, label:'Offer ' + TIERS[k].label, sub:'user must confirm'})))};
  return {head:'Reassign to which card?', items:TIER_KEYS.filter(k => k !== a.tier).map(k => ({k, label:TIERS[k].label, sub:TIERS[k].commit}))};
}
const dwBtn = (act, ico, label, cls = '') => `<button type="button" class="dwBtn ${cls}${dwMode === act ? ' active' : ''}" data-dw="${act}"><i class="bi bi-${ico}"></i><span>${label}</span></button>`;

function renderDrawer(){
  const a = drawerApp(); if (!a){ closeDrawer(); return; }
  $('#dwName').textContent = unq(a.name);
  const st = $('#dwStatus'); st.className = 'pill p-' + a.status; st.textContent = statusLabel(a);

  const ak = appliedKey(a), url = safeUrl(a.letterUrl);
  const chip = k => `<span class="tierChip"><span class="dot" style="--c:${TIERS[k].color}"></span>${esc(TIERS[k].label)}</span>`;
  const item = (k, v, cls = '') => `<div class="dwItem ${cls}"><dt>${k}</dt><dd${cls.includes('mono') ? ' class="mono"' : ''}>${v}</dd></div>`;
  const tel = unq(a.phone).replace(/[^\d+]/g, '');
  const letter = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">View recommendation letter</a>`
    : (ak === 'general' ? '<span class="bad">Missing — required for the LBD Member Card</span>' : '<span class="dim">Not required for this card</span>');

  const details = [
    item('Reference ID', esc(a.ref), 'mono'),
    item('Unique ID', esc(a.uid), 'mono'),
    item('Email', `<a href="mailto:${esc(unq(a.email))}">${esc(unq(a.email))}</a>`, 'full'),
    item('WhatsApp', `<a href="tel:${esc(tel)}">${esc(unq(a.phone))}</a>`),
    item('Submitted', esc(longDate(a.submitted))),
    item('Colony', esc(a.colony)),
    item('Hub · Tribe', `${esc(a.hub)} · ${esc(a.tribe)}`),
    item('Card applied for', chip(ak)),
    item('Annual commitment', esc(TIERS[ak].commit)),
    a.tier !== ak ? item('Current card', chip(a.tier) + `<div class="aSub mono">${esc(TIERS[a.tier].commit)}</div>`) : '',
    a.status === 'suggested' && TIERS[a.suggestedTier] ? item('Card offered', chip(a.suggestedTier) + '<div class="aSub mono">awaiting the applicant’s reply</div>') : '',
    item('Recommendation letter', letter, 'full'),
    item('Last updated', esc(longDate(a.updated)), 'full'),
  ].join('');

  let acts = '';
  if (a.status === 'pending') acts += dwBtn('approve','check-lg','Approve','primary') + dwBtn('upgrade','arrow-up-circle','Upgrade…') + dwBtn('reject','x-circle','Decline — criteria not met…') + dwBtn('reassign','arrow-left-right','Reassign…');
  else if (a.status === 'accepted') acts += dwBtn('confirm','check2-all','Confirm reassignment','primary') + dwBtn('reassign','arrow-left-right','Reassign…') + dwBtn('undo','arrow-counterclockwise','Undo');
  else if (a.status === 'suggested') acts += dwBtn('resend','envelope','Resend the offer email','primary') + dwBtn('reassign','arrow-left-right','Reassign…') + dwBtn('undo','arrow-counterclockwise','Cancel offer / undo');
  else acts += dwBtn('reassign','arrow-left-right','Reassign…') + dwBtn('undo','arrow-counterclockwise','Undo — back to pending');

  let choice = '';
  if (dwMode){
    const c = choicesFor(a, dwMode);
    choice = `<div class="dwChoice"><div class="dwChoiceHead"><span>${esc(c.head)}</span><button type="button" data-dw="cancelchoice">Cancel</button></div>` +
      c.items.map(it => `<button type="button" class="dwPick" data-pick="${esc(it.k)}"><span class="sw" style="--c:${it.k ? TIERS[it.k].color : '#C22B1B'}"></span>${esc(it.label)}<span class="tpSub">${esc(it.sub)}</span></button>`).join('') + '</div>';
  }

  $('#dwBody').innerHTML = `
    <div class="dwSec"><div class="dwLabel">Application details</div><dl class="dwGrid">${details}</dl></div>
    <div class="dwSec"><div class="dwLabel">Decisions</div><div class="dwActions">${acts}</div>${choice}</div>
    <div class="dwSec"><div class="dwActions">${dwBtn('delete','trash','Delete application','danger')}</div></div>`;
}

async function runChoice(a, mode, k){
  if (mode === 'upgrade') return decide(a, 'upgrade', {tier:k}, `Upgraded — ${a.name} moved to the ${TIERS[k].label}.`);
  if (mode === 'reject'){
    const msg = `Email ${a.name} that the criteria for the ${TIERS[a.tier].label} were not met` +
      (k ? `, and offer the ${TIERS[k].label}? Nothing changes until they accept, and you confirm.` : ' (no alternative offered)?');
    if (confirm(msg)) return decide(a, 'reject', {suggest:k}, k ? `Offer sent — awaiting ${a.name}'s confirmation.` : 'Declined — criteria-not-met email sent.', k ? 'ok' : 'bad');
    return;
  }
  if (confirm(`Reassign ${a.name} to the ${TIERS[k].label}? They will be emailed this update.`))
    return decide(a, 'reassign', {tier:k}, `Reassigned — ${a.name} is now in the ${TIERS[k].label}.`);
}

$('#dwBody').addEventListener('click', async e => {
  const a = drawerApp(); if (!a) return;
  const pick = e.target.closest('[data-pick]');
  if (pick){ const mode = dwMode; dwMode = null; renderDrawer(); await runChoice(a, mode, pick.dataset.pick); return; }
  const b = e.target.closest('[data-dw]'); if (!b) return;
  const act = b.dataset.dw;
  if (act === 'cancelchoice'){ dwMode = null; return renderDrawer(); }
  if (['upgrade','reject','reassign'].includes(act)){
    if (!choicesFor(a, act).items.length){ toast('VIP is the highest card — nothing above it.', 'warn'); return; }
    dwMode = dwMode === act ? null : act; return renderDrawer();
  }
  if (act === 'delete'){
    if (!confirm(`Permanently delete ${a.name}'s application (${a.ref})? This also removes their uploaded letter and cannot be undone.`)) return;
    try { await api('deleteApp', {uid:a.uid}, {auth:true}); apps = apps.filter(x => x !== a); closeDrawer(); renderQueue(); toast('Application deleted.', 'warn'); }
    catch (err) { if (err.code === 'AUTH') sessionExpired(); else toast(err.message, 'bad'); }
    return;
  }
  if (act === 'confirm' && !confirm(`Confirm ${a.name}'s placement in the ${TIERS[a.tier].label}? They will be emailed the update and given Member Portal access.`)) return;
  b.disabled = true;
  if (act === 'approve') await decide(a, 'approve', {}, `Approved — ${a.name} joins the ${TIERS[a.tier].short} tier.`);
  else if (act === 'resend') await decide(a, 'resend', {}, 'Offer re-sent with a fresh link.');
  else if (act === 'confirm') await decide(a, 'confirm', {}, `Confirmed — ${a.name} is now in the ${TIERS[a.tier].short} tier.`);
  else if (act === 'undo') await decide(a, 'undo', {}, 'Decision reverted — back to pending review.', 'warn');
  b.disabled = false;
});
$('#dwClose').addEventListener('click', closeDrawer);
$('#drawerWrap').addEventListener('click', e => { if (e.target === $('#drawerWrap')) closeDrawer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawerUid) closeDrawer(); });

/* ============================================================
   ADMIN SECURITY — Log out button + auto log out after 30 min idle
   ============================================================ */
const IDLE_MS = 30 * 60 * 1000, WARN_MS = 29 * 60 * 1000, PING_MS = 4 * 60 * 1000;
let lastActive = Date.now(), lastPing = Date.now();
const adminOpen = () => $('#viewAdmin').classList.contains('active');

function noteActivity(){
  if (!adminOpen()) return;
  const now = Date.now();
  if (now - lastActive >= IDLE_MS) return;                       // already expired — the checker signs out
  lastActive = now; $('#idleBar').classList.remove('show');
  if (now - lastPing > PING_MS){                                  // keep the server session alive while the admin is active
    lastPing = now;
    api('ping', {}, {auth:true}).catch(e => { if (e.code === 'AUTH') sessionExpired(); });
  }
}
['pointerdown','keydown','touchstart','wheel','scroll','mousemove'].forEach(ev => document.addEventListener(ev, noteActivity, {passive:true, capture:true}));

async function autoLogout(){
  if (sessionStorage.getItem(TOKEN_KEY)) api('logout', {}, {auth:true}).catch(() => {});
  sessionStorage.removeItem(TOKEN_KEY); apps = []; me = null;
  ['#adminsWrap','#updatesWrap','#idleBar'].forEach(s => $(s).classList.remove('show'));
  await openAdmin();                                              // lands on the sign-in card
  toast('You were signed out after 30 minutes of inactivity.', 'warn');
}
function idleCheck(){
  if (!adminOpen()) return;
  const idle = Date.now() - lastActive;
  if (idle >= IDLE_MS) return autoLogout();
  const bar = $('#idleBar');
  bar.classList.toggle('show', idle >= WARN_MS);
  if (idle >= WARN_MS){ const s = Math.max(1, Math.ceil((IDLE_MS - idle) / 1000)); $('#idleLeft').textContent = s > 60 ? '1 minute' : `${s} second${s === 1 ? '' : 's'}`; }
}
setInterval(idleCheck, 5000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') idleCheck(); });
$('#idleStay').addEventListener('click', noteActivity);

/* ============================================================
   ADMIN ACCOUNTS (owner only)
   ============================================================ */
let admins = [];
async function loadAdmins(){
  try { admins = (await api('admins', {}, {auth:true})).admins; renderAdmins(); }
  catch (e) { if (e.code === 'AUTH') { $('#adminsWrap').classList.remove('show'); sessionExpired(); } else toast(e.message, 'bad'); }
}
function renderAdmins(){
  $('#admList').innerHTML = admins.map(a => {
    const self = me && a.username.toLowerCase() === me.username.toLowerCase();
    return `<div class="admItem" data-u="${esc(a.username)}">
      <div class="admInfo"><b>${esc(a.username)}${self ? ' (you)' : ''}</b>
        <span>Created ${esc(fmtDate(a.created)) || '—'} · Last login ${esc(fmtDate(a.lastLogin)) || 'never'}</span></div>
      <span class="pill ${a.role === 'owner' ? 'p-approved' : 'p-pending'}">${esc(a.role)}</span>
      ${a.status !== 'active' ? '<span class="pill p-rejected">disabled</span>' : ''}
      <button class="undoBtn" data-aact="pw"><i class="bi bi-key"></i>Password</button>
      ${self ? '' : '<button class="actBtn no del" data-aact="rm" title="Remove admin"><i class="bi bi-trash"></i></button>'}
    </div>`;
  }).join('') || '<div class="admItem">No administrators.</div>';
}
$('#btnAdmins').addEventListener('click', () => { $('#adminsWrap').classList.add('show'); loadAdmins(); });
const closeAdmins = () => $('#adminsWrap').classList.remove('show');
$('#admClose').addEventListener('click', closeAdmins);
$('#adminsWrap').addEventListener('click', e => { if (e.target === $('#adminsWrap')) closeAdmins(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAdmins(); });

$('#newAdmBtn').addEventListener('click', async () => {
  const username = $('#newAdmUser').value.trim(), password = $('#newAdmPass').value, role = $('#newAdmRole').value;
  if (!username || !password) return toast('Enter a username and password.', 'warn');
  try {
    admins = (await api('addAdmin', {username, password, role}, {auth:true})).admins; renderAdmins();
    $('#newAdmUser').value = ''; $('#newAdmPass').value = '';
    toast(`Administrator "${username}" added.`);
  } catch (e) { toast(e.message, 'bad'); }
});
$('#admList').addEventListener('click', async e => {
  const b = e.target.closest('[data-aact]'); if (!b) return;
  const u = b.closest('.admItem').dataset.u;
  try {
    if (b.dataset.aact === 'rm'){
      if (!confirm(`Remove administrator "${u}"? They will lose access immediately.`)) return;
      admins = (await api('removeAdmin', {username:u}, {auth:true})).admins; renderAdmins(); toast(`"${u}" removed.`, 'warn');
    } else {
      const pw = prompt(`New password for "${u}" (8+ characters):`); if (!pw) return;
      await api('setAdminPassword', {username:u, password:pw}, {auth:true}); toast(`Password updated for "${u}".`);
    }
  } catch (err) { toast(err.message, 'bad'); }
});

/* ============================================================
   BENEFIT UPDATES — admin side
   ============================================================ */
let updates = [];
const audLabel = t => t === 'general' || !TIERS[t] ? 'All members' : `${TIERS[t].short} and above`;
async function loadUpdates(){
  try { updates = (await api('listUpdates', {}, {auth:true})).updates; renderUpdates(); }
  catch (e) { if (e.code === 'AUTH'){ closeUpdates(); sessionExpired(); } else toast(e.message, 'bad'); }
}
function renderUpdates(){
  $('#updList').innerHTML = updates.map(u => `
    <div class="admItem" data-id="${esc(u.id)}">
      <div class="admInfo"><b>${esc(u.title)}</b><span>${esc(fmtDate(u.posted))} · ${esc(audLabel(u.minTier))} · by ${esc(u.by)}</span><div class="updMsg">${esc(u.message)}</div></div>
      <button class="actBtn no del" data-uact="rm" title="Delete update"><i class="bi bi-trash"></i></button>
    </div>`).join('') || '<div class="admItem">No updates posted yet.</div>';
}
const closeUpdates = () => $('#updatesWrap').classList.remove('show');
$('#btnUpdates').addEventListener('click', () => { $('#updatesWrap').classList.add('show'); loadUpdates(); });
$('#updClose').addEventListener('click', closeUpdates);
$('#updatesWrap').addEventListener('click', e => { if (e.target === $('#updatesWrap')) closeUpdates(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeUpdates(); });
$('#updPost').addEventListener('click', async () => {
  const title = $('#updTitle').value.trim(), message = $('#updMsg').value.trim();
  if (title.length < 3 || message.length < 3) return toast('Add a title and a message.', 'warn');
  try {
    updates = (await api('postUpdate', {title, message, minTier:$('#updTier').value}, {auth:true})).updates; renderUpdates();
    $('#updTitle').value = ''; $('#updMsg').value = ''; toast('Update posted to the Member Portal.');
  } catch (e) { toast(e.message, 'bad'); }
});
$('#updList').addEventListener('click', async e => {
  const b = e.target.closest('[data-uact]'); if (!b) return;
  if (!confirm('Delete this update?')) return;
  try { updates = (await api('deleteUpdate', {id:b.closest('.admItem').dataset.id}, {auth:true})).updates; renderUpdates(); toast('Update deleted.', 'warn'); }
  catch (err) { toast(err.message, 'bad'); }
});

/* ============================================================
   APPLICANT RESPONSE PAGE  (?respond=TOKEN from the email)
   ============================================================ */
const tierItems = (k, block) => { const art = $('#tier-' + k); const bl = art && art.querySelectorAll('.tierBlock')[block]; return bl ? Array.from(bl.querySelectorAll('li')).map(li => li.textContent.trim()) : []; };
const tierTheme = k => { const b = $('#tier-' + k + ' .tierTag b'); return b ? b.textContent : ''; };
let respondToken = null;

async function openRespond(token){
  respondToken = token;
  showView('respond');
  $('#rTitle').textContent = 'Checking your link…'; $('#rSub').textContent = ''; $('#rBody').innerHTML = ''; $('#rBtns').classList.add('hidden');
  try {
    const i = await api('respondInfo', {token});
    $('#rTitle').textContent = `A better fit, ${i.name.split(' ')[0]}`;
    $('#rSub').innerHTML = `We couldn’t confirm the criteria for the <b>${esc(TIERS[i.tier].label)}</b>. Based on your record we’d like to offer you the <b>${esc(TIERS[i.suggestedTier].label)}</b> (Theme: ${esc(tierTheme(i.suggestedTier))}). <span class="mono">REF ${esc(i.ref)}</span>`;
    $('#rBody').innerHTML = `<div class="rList"><b>Criteria · ${esc(TIERS[i.suggestedTier].short)}</b><ul>${tierItems(i.suggestedTier, 0).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
    $('#rBtns').classList.remove('hidden');
  } catch (e) { $('#rTitle').textContent = 'Link unavailable'; $('#rSub').textContent = e.message; }
}
async function sendRespond(decision){
  const btns = $$('#rBtns button'); btns.forEach(b => b.disabled = true);
  try {
    await api('respond', {token:respondToken, decision});
    $('#rBtns').classList.add('hidden'); $('#rBody').innerHTML = '';
    if (decision === 'accept'){ $('#rTitle').textContent = 'Thank you — accepted'; $('#rSub').textContent = 'An administrator will confirm your placement shortly. You will receive an email when it is done.'; }
    else { $('#rTitle').textContent = 'No problem'; $('#rSub').textContent = 'We have recorded your decision. You are welcome to apply again whenever you meet the criteria.'; }
  } catch (e) { toast(e.message, 'bad'); btns.forEach(b => b.disabled = false); }
}
$('#rAccept').addEventListener('click', () => sendRespond('accept'));
$('#rDecline').addEventListener('click', () => sendRespond('decline'));
$('#rBack').addEventListener('click', () => showView('site'));

/* ============================================================
   MEMBER PORTAL — login · set/reset password · dashboard
   ============================================================ */
const FACE = {
  general:{icon:'credit-card', chip:'Standard', name:'LBD'},
  gold:   {icon:'award',       chip:'Gold',     name:'Gold'},
  vip:    {icon:'gem',         chip:'VIP',      name:'VIP'},
};
let mMode = 'login', mSetToken = null;

function mError(msg){
  $('#mErrTxt').textContent = msg || '';
  $('#mErr').classList.toggle('show', !!msg);
  if (msg){ const c = $('#mLoginForm'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
}
function paintMember(){
  ['#mEmailField','#mPassField','#mPass2Field','#mForgotBtn'].forEach(s => $(s).classList.add('hidden'));
  const cfg = {
    login: {title:'Member Sign-in', sub:'Sign in with the email on your application to see your tier benefits and updates.', btn:'Sign in', show:['#mEmailField','#mPassField','#mForgotBtn'], pl:'Password', ac:'current-password'},
    forgot:{title:'Reset password', sub:'Enter your email and we will send a link to choose a new password.', btn:'Email me a reset link', show:['#mEmailField'], pl:'Password', ac:'current-password'},
    set:   {title:'Set your password', sub:'Checking your link…', btn:'Save password & sign in', show:['#mPassField','#mPass2Field'], pl:'New Password', ac:'new-password'},
  }[mMode];
  $('#mTitle').textContent = cfg.title; $('#mSub').textContent = cfg.sub;
  $('#mBtn').textContent = cfg.btn; $('#mBtn').disabled = false;
  cfg.show.forEach(s => $(s).classList.remove('hidden'));
  $('#mPassLabel').textContent = cfg.pl; $('#mPass').autocomplete = cfg.ac;
  mError('');
}
async function openMemberLogin(mode = 'login', token = null){
  mMode = mode; mSetToken = token;
  showView('mlogin');
  if (mode === 'login' && sessionStorage.getItem(MTOKEN_KEY)){
    try { await api('mHome', {}, {auth:'member'}); showView('member'); return; }
    catch (e) { sessionStorage.removeItem(MTOKEN_KEY); }
  }
  paintMember();
  if (mode === 'set'){
    try { const i = await api('mTokenInfo', {token}); $('#mSub').textContent = `Welcome, ${i.name}. Choose a password (8+ characters) for your member account.`; }
    catch (e) { $('#mSub').textContent = ''; mError(e.message); $('#mBtn').disabled = true; $('#mForgotBtn').classList.remove('hidden'); }
  }
}
$('#mForgotBtn').addEventListener('click', () => { mMode = 'forgot'; paintMember(); });
$('#mBack').addEventListener('click', () => showView('site'));

$('#mLoginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#mEmail').value.trim(), pass = $('#mPass').value;
  const btn = $('#mBtn'), label = btn.textContent;
  mError('');
  try {
    if (mMode === 'login'){
      if (!email || !pass) return mError('Enter your email and password.');
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Signing in…';
      sessionStorage.setItem(MTOKEN_KEY, (await api('mLogin', {email, password:pass})).token);
    } else if (mMode === 'forgot'){
      if (!EMAIL_RE.test(email)) return mError('Enter the email on your application.');
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Sending…';
      await api('mForgot', {email});
      toast('If that email belongs to a member, a reset link is on its way.');
      mMode = 'login'; paintMember(); return;
    } else {
      if (pass.length < 8) return mError('Password must be at least 8 characters.');
      if (pass !== $('#mPass2').value) return mError('The two passwords do not match.');
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Saving…';
      sessionStorage.setItem(MTOKEN_KEY, (await api('mActivate', {token:mSetToken, password:pass})).token);
    }
    $('#mPass').value = ''; $('#mPass2').value = '';
    showView('member');
  } catch (err) { mError(err.message); }
  finally { if (btn.disabled) { btn.disabled = false; btn.textContent = label; } }
});

async function loadMember(){
  try { renderMember(await api('mHome', {}, {auth:'member'})); }
  catch (e) {
    if (e.code === 'AUTH'){ sessionStorage.removeItem(MTOKEN_KEY); openMemberLogin(); toast('Please sign in again.', 'warn'); }
    else toast(e.message, 'bad');
  }
}
function renderMember(o){
  const m = o.member, f = FACE[m.tier] || FACE.general, first = m.name.split(' ')[0];
  const yy = isNaN(new Date(m.since)) ? '' : String(new Date(m.since).getFullYear()).slice(2);
  $('#mUserName').textContent = m.name;
  $('#mAvatar').textContent = m.name.charAt(0).toUpperCase();
  $('#mWelcome').innerHTML = `Welcome, <em>${esc(first)}.</em>`;
  $('#mMeta').textContent = `${TIERS[m.tier].label} · Theme: ${tierTheme(m.tier)} · Reference ${m.ref}`;
  $('#mCard').innerHTML = `
    <div class="cardface cf-${esc(m.tier)}">
      <div class="guil" aria-hidden="true"></div>
      <div class="cfTop"><div class="cfMark"><img src="assets/logo.png" alt=""></div><div class="cfTierChip"><i class="ic ic-${f.icon}"></i>${esc(f.chip)}</div></div>
      <div class="cfMid"><div class="cfName">${esc(f.name)}</div><div class="cfSub">${esc(m.name.toUpperCase().slice(0, 24))}</div></div>
      <div class="cfBot"><div class="cfChip"></div><div class="cfNum">•••• ${esc(m.ref.slice(-4))}</div><div class="cfSince">SINCE '${esc(yy)}</div></div>
    </div>`;
  const idx = TIER_KEYS.indexOf(m.tier);
  let ben = '';
  for (let i = idx; i >= 0; i--){
    const k = TIER_KEYS[i];
    ben += `<div class="benGroup${i === idx ? ' own' : ''}"><h4>${i === idx ? 'Your tier' : 'Included from'} · ${esc(TIERS[k].label)}</h4><ul>${tierItems(k, 1).map(x => `<li><i class="bi bi-check-lg"></i><span>${esc(x)}</span></li>`).join('')}</ul></div>`;
  }
  $('#mBenefits').innerHTML = ben;
  $('#mUpdates').innerHTML = (o.updates || []).map(u => `<div class="updItem"><b>${esc(u.title)}</b><span>${esc(fmtDate(u.posted))}</span><p>${esc(u.message)}</p></div>`).join('')
    || '<p class="updEmpty">No benefit updates yet. New perks and announcements will appear here.</p>';
}
$('#mSignout').addEventListener('click', async () => {
  try { await api('mLogout', {}, {auth:'member'}); } catch (e) {}
  sessionStorage.removeItem(MTOKEN_KEY); showView('site'); toast('Signed out of the Member Portal.');
});

/* ============================================================
   CARD TILT + SHEEN · HERO PARALLAX · TIER JUMP
   ============================================================ */
$$('.cardface').forEach(c => {
  c.addEventListener('pointermove', e => {
    if (reduced()) return;
    const r = c.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    c.style.setProperty('--mx', (px * 100) + '%');
    c.style.setProperty('--my', (py * 100) + '%');
    c.style.setProperty('--rx', ((.5 - py) * 9) + 'deg');
    c.style.setProperty('--ry', ((px - .5) * 11) + 'deg');
  });
  c.addEventListener('pointerleave', () => { c.style.setProperty('--rx','0deg'); c.style.setProperty('--ry','0deg'); });
});

const fan = $('#fan');
if (fan){
  $('.hero').addEventListener('pointermove', e => {
    if (reduced()) return;
    const r = fan.getBoundingClientRect();
    fan.style.setProperty('--px', ((((e.clientX - r.left) / r.width) - .5) * 2).toFixed(3));
    fan.style.setProperty('--py', ((((e.clientY - r.top) / r.height) - .5) * 2).toFixed(3));
  });
  $$('.fanCard').forEach(fc => fc.addEventListener('click', () => gotoTier(fc.dataset.gotoTier)));
}
function gotoTier(key){
  const el = $('#tier-' + key); if (!el) return;
  el.scrollIntoView({behavior:'smooth', block:'center'});
  el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
}
$$('.selectTier[data-goto-tier]').forEach(b =>
  b.addEventListener('click', () => {
    const k = b.dataset.gotoTier;
    selTier.set(k, true);
    updateLetterUI(k); updateSteps();
    $('#apply').scrollIntoView({behavior:'smooth'});
    const selRoot = $('#selTier');
    setTimeout(() => { selRoot.classList.remove('open'); selRoot.animate(
      [{boxShadow:'0 0 0 0 rgba(200,80,26,.55)'},{boxShadow:'0 0 0 10px rgba(200,80,26,0)'}], {duration:900, easing:'ease'}); }, 500);
  })
);

/* ============================================================
   COUNTERS · SCROLLSPY · REVEAL
   ============================================================ */
$$('.statN').forEach(el => {
  const target = +el.dataset.v, t0 = performance.now(), dur = 1100;
  const p2 = n => String(n).padStart(2,'0');
  if (reduced()){ el.textContent = p2(target); return; }
  (function tick(t){
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = p2(Math.round(target * e));
    if (k < 1) requestAnimationFrame(tick);
  })(t0);
});
const spy = new IntersectionObserver(es => es.forEach(en => {
  if (en.isIntersecting) $$('.navA').forEach(a => a.classList.toggle('active', a.dataset.sec === en.target.id));
}), {rootMargin:'-40% 0px -55% 0px'});
['tiers','apply'].forEach(id => spy.observe($('#' + id)));
const rvIO = new IntersectionObserver(es => es.forEach(en => {
  if (en.isIntersecting){ en.target.classList.add('in'); rvIO.unobserve(en.target); }
}), {threshold:.1});
$$('.rv').forEach(el => rvIO.observe(el));

/* ============================================================
   EMAIL LINKS: ?respond=TOKEN · ?mtoken=TOKEN · ?member=1
   ============================================================ */
(function routeFromUrl(){
  const p = new URLSearchParams(location.search);
  const clean = () => history.replaceState(null, '', location.pathname);
  if (p.get('respond')){ const t = p.get('respond'); clean(); openRespond(t); }
  else if (p.get('mtoken')){ const t = p.get('mtoken'); clean(); openMemberLogin('set', t); }
  else if (p.has('member')){ clean(); openMemberLogin('login'); }
})();
