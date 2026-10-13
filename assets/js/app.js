/* ============================================================
   LBD MEMBERSHIP PORTAL — central script
   ============================================================ */

/* ---------- CONFIG: paste your Apps Script Web App URL here ---------- */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwrit00oGc5mEZFPV2ka_sBnxDw-9y7mSBzy56Isf9ttGamIocdoFEMT7GasLco_r9Y/exec',   // https://script.google.com/macros/s/XXXX/exec
  MAX_FILE_MB: 5,
  POLL_MS: 45000,                            // admin queue auto-refresh
};
const TOKEN_KEY = 'lbd_admin_token';

/* ============================================================
   DATA
   ============================================================ */
const TIERS = {
  general:{label:'General Card',   short:'General',   color:'#C98A4B', commit:'Criteria-based', order:0},
  silver: {label:'Silver MAP Card',short:'Silver MAP',color:'#B0A692', commit:'₦1M – ₦2M',      order:1},
  gold:   {label:'MAP Card Gold',  short:'Gold MAP',  color:'#DFA92E', commit:'₦3M – ₦4M',      order:2},
  vip:    {label:'VIP Card',       short:'VIP',       color:'#2A1C10', commit:'₦5M and above',  order:3},
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

/* ============================================================
   HELPERS
   ============================================================ */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const refreshIcons = () => { if (window.lucide) lucide.createIcons(); };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => /^https:\/\/(drive|docs)\.google\.com\//.test(u || '') ? u : '';

function toast(msg, kind = 'ok'){
  const icons = {ok:'check-circle-2', warn:'info', bad:'x-circle'};
  const t = document.createElement('div');
  t.className = 'toast' + (kind !== 'ok' ? ' ' + kind : '');
  t.innerHTML = `<i data-lucide="${icons[kind]}"></i><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  refreshIcons();
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
  if (auth) body.token = sessionStorage.getItem(TOKEN_KEY) || '';
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(body)});
  } catch (e) { throw Object.assign(new Error('Could not reach the server. Check your connection.'), {code:'NETWORK'}); }
  let json;
  try { json = await res.json(); } catch (e) { throw Object.assign(new Error('Unexpected server response.'), {code:'BAD_RESPONSE'}); }
  if (!json.ok) throw Object.assign(new Error(json.error || 'Request failed.'), {code:json.code || 'ERROR'});
  return json.data;
}

/* ============================================================
   LOGO — all marks use assets/logo.png (see index.html)
   ============================================================ */
function guilloche(svg, {n = 26, R = 64, d = 22, size = 220, stroke = 'rgba(122,62,20,.10)'} = {}){
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const c = size / 2; let s = '';
  for (let i = 0; i < n; i++){
    const a = i / n * Math.PI * 2;
    s += `<circle cx="${(c + Math.cos(a) * d).toFixed(2)}" cy="${(c + Math.sin(a) * d).toFixed(2)}" r="${R}" fill="none" stroke="${stroke}" stroke-width="1"/>`;
  }
  svg.innerHTML = s;
}
$$('.fanGuil').forEach(el => guilloche(el, {n:40, R:130, d:46, size:600, stroke:'rgba(224,90,30,.12)'}));
$$('.cardface .guil').forEach(el => {
  const light = el.closest('.cf-general, .cf-silver, .cf-gold');
  guilloche(el, light ? {stroke:'rgba(122,62,20,.10)'} : {stroke:'rgba(240,150,60,.14)'});
  el.style.cssText = 'right:-26%;top:-30%;width:130%;height:auto;aspect-ratio:1;opacity:.9';
});

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
      li.innerHTML = `${this.swatch ? `<span class="sw" style="--c:${o.color}"></span>` : ''}<span>${o.label}</span><i data-lucide="check" class="ck"></i>`;
      if (this.value === o.value) li.classList.add('on');
      li.addEventListener('click', () => { this.set(o.value); this.close(); this.btn.focus(); });
      this.list.appendChild(li);
    }
    refreshIcons();
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
  Sel.closeAll(); closeTierPop();
  document.title = name === 'admin' ? 'LBD · Admin Review Desk' : 'LBD — Living By Design · Membership Portal';
  clearInterval(pollTimer);
  if (name === 'admin'){
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
  refreshIcons();
}

async function initLoginCard(){
  const btn = $('#loginBtn');
  setLoginError('');
  ['#codeField','#passField','#confirmField','#pwHint'].forEach(s => $(s).classList.add('hidden'));
  btn.disabled = true; btn.textContent = 'Please wait…';
  $('#loginTitle').textContent = 'Admin Sign-in';
  $('#loginSub').textContent = 'Checking the review desk…';

  /* an existing session? skip straight in */
  if (sessionStorage.getItem(TOKEN_KEY)){
    try { await api('list', {}, {auth:true}); showView('admin'); return; }
    catch (e) { sessionStorage.removeItem(TOKEN_KEY); }
  }

  try {
    const st = await api('status');
    authMode = st.configured ? 'login' : 'setup';
    $('#passField').classList.remove('hidden');
    if (authMode === 'setup'){
      $('#loginEyebrow').textContent = 'LBD — First-time setup';
      $('#loginTitle').textContent = 'Create Admin Password';
      $('#loginSub').textContent = 'No administrator exists yet. Choose a password to secure the Review Desk — it is stored only as a salted hash.';
      $('#passLabel').textContent = 'New Password';
      $('#adminPass').autocomplete = 'new-password';
      $('#confirmField').classList.remove('hidden');
      $('#pwHint').classList.remove('hidden');
      if (st.requiresCode) $('#codeField').classList.remove('hidden');
      btn.innerHTML = 'Create password &amp; sign in <i data-lucide="arrow-right"></i>';
    } else {
      $('#loginEyebrow').textContent = 'LBD — Review Desk';
      $('#loginTitle').textContent = 'Admin Sign-in';
      $('#loginSub').textContent = 'Restricted area. This console is reserved for LBD membership administrators reviewing card applications.';
      $('#passLabel').textContent = 'Password';
      $('#adminPass').autocomplete = 'current-password';
      btn.innerHTML = 'Sign in to Review Desk <i data-lucide="arrow-right"></i>';
    }
    btn.disabled = false;
    refreshIcons();
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
  $('#pwToggle').innerHTML = `<i data-lucide="${show ? 'eye-off' : 'eye'}"></i>`;
  refreshIcons();
});

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pass = $('#adminPass').value;
  if (!authMode) return;
  if (authMode === 'setup'){
    if (pass.length < 8) return setLoginError('Password must be at least 8 characters.');
    if (pass !== $('#adminPass2').value) return setLoginError('The two passwords do not match.');
  } else if (!pass) return setLoginError('Enter your password.');

  const btn = $('#loginBtn'), label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spin"></span>${authMode === 'setup' ? 'Creating…' : 'Verifying credentials…'}`;
  setLoginError('');
  try {
    const out = await api(authMode, {password:pass, setupCode:$('#setupCode').value.trim()});
    sessionStorage.setItem(TOKEN_KEY, out.token);
    $('#adminPass').value = ''; $('#adminPass2').value = ''; $('#setupCode').value = '';
    showView('admin');
    toast(authMode === 'setup' ? 'Admin password created — welcome, Administrator.' : 'Signed in — welcome back, Administrator.');
  } catch (err) {
    setLoginError(err.message);
  } finally {
    btn.disabled = false; btn.innerHTML = label; refreshIcons();
  }
});

$('#btnSignout').addEventListener('click', async () => {
  try { await api('logout', {}, {auth:true}); } catch (e) {}
  sessionStorage.removeItem(TOKEN_KEY);
  apps = [];
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
    hint.textContent = 'Required for the General Card — issued by your Priestley division';
  } else {
    tag.textContent = 'Optional'; tag.className = 'tagReq opt';
    hint.textContent = tier
      ? 'Not required for this tier — attach only if it strengthens your review'
      : 'Required only for General Card applications · PDF, JPG or PNG · max 5MB';
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
    $('#mCheckHolder').innerHTML = `<svg class="mCheck" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28"/><path d="M20 33 l8.5 8.5 L45 24"/></svg>`;
    openModal();
  } catch (err) {
    toast(err.message, 'bad');
  } finally {
    btn.disabled = false; btn.innerHTML = label; refreshIcons();
  }
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

$('#btnLogin').addEventListener('click', () =>
  toast('The member portal unlocks once your application is approved.', 'warn'));

/* ============================================================
   ADMIN QUEUE — reads/writes through the backend
   ============================================================ */
const statusOrder = {pending:0, upgraded:1, approved:2, rejected:3};
const statusLabel = a => a.status === 'upgraded' ? `Upgraded · ${TIERS[a.tier].short}` :
  {pending:'Pending review', approved:'Approved', rejected:'Rejected'}[a.status];
const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'}); };

let curTab = 'all', curQ = '';

async function loadApps(silent){
  try {
    const out = await api('list', {}, {auth:true});
    apps = (out.apps || []).filter(a => TIERS[a.tier]);
    renderQueue();
  } catch (e) {
    if (e.code === 'AUTH') return sessionExpired();
    if (!silent) toast(e.message, 'bad');
  }
}
$('#btnRefresh').addEventListener('click', async () => { await loadApps(); toast('Queue refreshed.'); });

function renderQueue(flashId){
  const counts = {pending:0, upgraded:0, approved:0, rejected:0};
  apps.forEach(a => counts[a.status]++);
  const statDefs = [
    {k:'pending',  label:'Pending review', c:'#B0A692', icon:'inbox'},
    {k:'approved', label:'Approved',       c:'#C8501A', icon:'check-circle-2'},
    {k:'upgraded', label:'Upgraded',       c:'#E8A020', icon:'arrow-up-circle'},
    {k:'rejected', label:'Rejected',       c:'#C22B1B', icon:'x-circle'},
  ];
  $('#statStrip').innerHTML = statDefs.map(s => `
    <button type="button" class="statCard ${curTab === s.k ? 'on' : ''}" data-tab="${s.k}" style="--c:${s.c}">
      <span class="scTop"><i data-lucide="${s.icon}"></i>${s.label}</span>
      <b>${String(counts[s.k]).padStart(2,'0')}</b>
    </button>`).join('');

  const tabs = [['all','All queue'],['pending','Pending'],['upgraded','Upgraded'],['approved','Approved'],['rejected','Rejected']];
  $('#conTabs').innerHTML = tabs.map(([k, l]) => {
    const c = k === 'all' ? apps.length : counts[k];
    return `<button type="button" class="conTab ${curTab === k ? 'active' : ''}" data-tab="${k}">${l.toUpperCase()} <i>${c}</i></button>`;
  }).join('');

  const q = curQ.toLowerCase();
  const list = apps
    .filter(a => curTab === 'all' || a.status === curTab)
    .filter(a => !q || [a.ref, a.name, a.email, a.phone, a.colony, a.hub, a.tribe, TIERS[a.tier].short].join(' ').toLowerCase().includes(q))
    .sort((a,b) => statusOrder[a.status] - statusOrder[b.status] || String(b.submitted).localeCompare(String(a.submitted)));

  $('#qBody').innerHTML = list.map(a => {
    const url = safeUrl(a.letterUrl);
    const letter = url
      ? `<div class="aLetter"><i data-lucide="file-text"></i><a href="${esc(url)}" target="_blank" rel="noopener">View rec. letter</a></div>`
      : (a.tier === 'general' ? '<div class="aLetter missing"><i data-lucide="file-x"></i>Letter missing</div>' : '');
    return `
    <tr data-id="${esc(a.ref)}" ${a.ref === flashId ? 'class="flash"' : ''}>
      <td>
        <div class="aName">${esc(a.name)}</div>
        <div class="aMail mono">${esc(a.email)}</div>
        <div class="aMail mono">${esc(a.phone)}</div>
        <div class="aRec mono">${esc(a.ref)} · ${esc(fmtDate(a.submitted))}</div>
      </td>
      <td>
        <div class="aAff">${esc(a.colony)}</div>
        <div class="aSub mono">${esc(a.hub)} · ${esc(a.tribe)}</div>
        ${letter}
      </td>
      <td><span class="tierChip"><span class="dot" style="--c:${TIERS[a.tier].color}"></span>${TIERS[a.tier].short}</span></td>
      <td class="aCommit mono">${esc(TIERS[a.tier].commit)}</td>
      <td><span class="pill p-${a.status}">${esc(statusLabel(a))}</span></td>
      <td style="text-align:right">${
        a.status === 'pending'
          ? `<div class="actRow">
               <button class="actBtn ok" data-act="approve" title="Approve"><i data-lucide="check"></i></button>
               <button class="actBtn up" data-act="upgrade" title="Upgrade to higher tier"><i data-lucide="arrow-up"></i></button>
               <button class="actBtn no" data-act="reject" title="Reject"><i data-lucide="x"></i></button>
             </div>`
          : `<button class="undoBtn" data-act="undo"><i data-lucide="rotate-ccw"></i>Undo</button>`
      }</td>
    </tr>`;
  }).join('');

  $('#qEmpty').classList.toggle('show', list.length === 0);
  $('#qCount').textContent = `${list.length} RECORD${list.length === 1 ? '' : 'S'} · ${counts.pending} PENDING`;
  refreshIcons();
}

$('#conTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; curTab = b.dataset.tab; renderQueue(); });
$('#statStrip').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; curTab = b.dataset.tab; renderQueue(); });
$('#qSearch').addEventListener('input', e => { curQ = e.target.value; renderQueue(); });

async function decide(a, action, tier){
  try {
    const out = await api('update', {ref:a.ref, op:action, tier}, {auth:true});
    Object.assign(a, out.app);
    renderQueue(a.ref);
    return true;
  } catch (e) {
    if (e.code === 'AUTH') sessionExpired(); else toast(e.message, 'bad');
    return false;
  }
}

$('#qBody').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  const tr = btn.closest('tr'); const a = apps.find(x => x.ref === tr.dataset.id); if (!a) return;
  const act = btn.dataset.act;
  if (act === 'upgrade') return openTierPop(a, btn);
  btn.disabled = true;
  if (act === 'approve'){ if (await decide(a, 'approve')) toast(`Approved — ${a.name} joins the ${TIERS[a.tier].short} tier.`); }
  else if (act === 'reject'){ if (await decide(a, 'reject')) toast('Rejected — decision saved.', 'bad'); }
  else if (act === 'undo'){ if (await decide(a, 'undo')) toast('Decision reverted — back to pending review.', 'warn'); }
  btn.disabled = false;
});

/* upgrade popover */
const tierPop = $('#tierPop');
function openTierPop(a, btn){
  const higher = TIER_KEYS.filter(k => TIERS[k].order > TIERS[a.tier].order);
  if (!higher.length){ toast('VIP is the highest tier — nothing above it.', 'warn'); return; }
  tierPop.innerHTML = `<div class="tpHead">Upgrade to higher tier</div>` + higher.map(k =>
    `<button data-tp="${k}"><span class="sw" style="--c:${TIERS[k].color}"></span>${TIERS[k].label}<span class="tpC">${TIERS[k].commit}</span></button>`).join('');
  const r = btn.getBoundingClientRect();
  tierPop.classList.add('show');
  const pw = tierPop.offsetWidth;
  tierPop.style.left = Math.max(12, Math.min(r.right - pw, innerWidth - pw - 12)) + 'px';
  tierPop.style.top = (r.bottom + 8) + 'px';
  tierPop.onclick = async e => {
    const b = e.target.closest('[data-tp]'); if (!b) return;
    closeTierPop();
    if (await decide(a, 'upgrade', b.dataset.tp)) toast(`Upgraded — ${a.name} moved to the ${TIERS[a.tier].label}.`);
  };
}
function closeTierPop(){ tierPop.classList.remove('show'); }
addEventListener('scroll', closeTierPop, {passive:true});
document.addEventListener('click', e => { if (!e.target.closest('.tierPop, [data-act="upgrade"]')) closeTierPop(); });

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

refreshIcons();
