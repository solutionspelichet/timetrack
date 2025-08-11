/* TimeTrack Simple – Front */

const el = (id) => document.getElementById(id);
const rows = el('rows');

const cfg = {
  get user(){ return localStorage.getItem('tt_user') || ''; },
  set user(v){ localStorage.setItem('tt_user', v || ''); },
  get base(){ return localStorage.getItem('tt_base') || ''; },
  set base(v){ localStorage.setItem('tt_base', v || ''); },
};

function isoNow(){ return new Date().toISOString(); }
function ymd(d){ return d.toISOString().slice(0,10); }

async function pingBackend(){
  const base = cfg.base;
  if(!base){ el('backendState').textContent = 'Backend: (non défini)'; return; }
  try{
    const url = `${base}?fn=ping`; // GET
    const r = await fetch(url, { method:'GET' });
    if(!r.ok){ throw new Error('HTTP '+r.status); }
    const data = await r.json();
    el('backendState').textContent = `Backend: ${data?.status || 'ok'}`;
  }catch(e){ el('backendState').textContent = 'Backend: indisponible'; }
}

function bindPWA(){
  const p = el('pwaState');
  if('serviceWorker' in navigator){
    window.addEventListener('load', async ()=>{
      try{
        await navigator.serviceWorker.register('./sw.js');
        p.textContent = 'PWA: SW actif';
      }catch(e){ p.textContent = 'PWA: SW échec'; }
    });
  } else { p.textContent = 'PWA: non supporté'; }
}

function renderRows(items){
  rows.innerHTML = '';
  (items||[]).forEach(it=>{
    const tr = document.createElement('tr');
    const dt = new Date(it.timestamp);
    tr.innerHTML = `<td>${dt.toLocaleString()}</td><td>${it.type}</td><td>${it.note||''}</td>`;
    rows.appendChild(tr);
  });
}

async function sendPunch(type){
  const base = cfg.base; const user = cfg.user; const note = el('note').value.trim();
  if(!base || !user){ alert('Renseignez identifiant et Backend URL.'); return; }
  const payload = { user, type, note, timestamp: isoNow() };
  const url = `${base}?fn=punch`;
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  if(!r.ok){ alert('Erreur réseau/serveur'); return; }
  const data = await r.json();
  if(data?.ok){
    // rafraîchit la journée
    const today = new Date();
    await loadRange(ymd(today), ymd(today));
  } else {
    alert('Erreur serveur');
  }
}

async function loadRange(start, end){
  const base = cfg.base; const user = cfg.user;
  if(!base || !user){ alert('Renseignez identifiant et Backend URL.'); return; }
  const url = `${base}?fn=range&user=${encodeURIComponent(user)}&start=${start}&end=${end}`;
  const r = await fetch(url);
  if(!r.ok){ alert('Erreur chargement'); return; }
  const data = await r.json();
  renderRows(data?.items || []);
}

function initUI(){
  // pré-remplir
  el('userId').value = cfg.user;
  el('baseUrl').value = cfg.base;

  // dates
  const today = new Date();
  el('startDate').value = ymd(today);
  el('endDate').value = ymd(today);

  // boutons punch
  document.querySelectorAll('button[data-type]').forEach(btn=>{
    btn.addEventListener('click', ()=> sendPunch(btn.dataset.type));
  });

  el('saveCfg').addEventListener('click', ()=>{
    cfg.user = el('userId').value.trim();
    cfg.base = el('baseUrl').value.trim();
    pingBackend();
  });
  el('logout').addEventListener('click', ()=>{
    localStorage.removeItem('tt_user');
    localStorage.removeItem('tt_base');
    el('userId').value = '';
    el('baseUrl').value = '';
    rows.innerHTML = '';
    el('backendState').textContent = 'Backend: …';
  });

  el('loadRange').addEventListener('click', ()=>{
    loadRange(el('startDate').value, el('endDate').value);
  });
  el('today').addEventListener('click', ()=>{
    const t = new Date();
    const s = ymd(t); const e = ymd(t);
    el('startDate').value = s; el('endDate').value = e;
    loadRange(s,e);
  });
}

// boot
bindPWA();
window.addEventListener('DOMContentLoaded', ()=>{
  initUI();
  pingBackend();
  console.log('🚀 TimeTrack initialisé');
});
