const API = 'api';
let ME = null;
let META = null;
let CURRENT_PAGE = null;

function getToken() { try { return localStorage.getItem('rs_token'); } catch { return null; } }
function setToken(t) { try { localStorage.setItem('rs_token', t); } catch {} }
function clearToken() { try { localStorage.removeItem('rs_token'); } catch {} }

async function api(path, method = 'GET', body = null) {
  const opt = { method, headers: {} };
  const t = getToken();
  if (t) { opt.headers.Authorization = 'Bearer ' + t; opt.headers['X-Auth-Token'] = t; }
  if (body !== null) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(API + path, opt);
  let data = null;
  try { data = await r.json(); } catch {}
  if (r.status === 401 && path !== '/auth/login') { doLogout(); throw new Error(data?.error || 'Sesi berakhir'); }
  if (!r.ok) throw new Error(data?.error || 'Gagal (' + r.status + ')');
  return data;
}

// ─── Auth ────────────────────────────────────────────────
async function boot() {
  if (!getToken()) return showLogin();
  try {
    ME = await api('/me');
    await showApp();
  } catch { showLogin(); }
}

function showLogin() {
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('l-username').focus(), 50);
}

async function doLogin() {
  const username = document.getElementById('l-username').value.trim();
  const password = document.getElementById('l-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  errEl.style.display = 'none';
  btn.textContent = 'Memuat...'; btn.disabled = true;
  try {
    const data = await api('/auth/login', 'POST', { username, password });
    setToken(data.token);
    ME = data.user;
    document.getElementById('l-password').value = '';
    await showApp();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  } finally {
    btn.textContent = 'Masuk →'; btn.disabled = false;
  }
}

function doLogout() {
  clearToken();
  ME = null;
  showLogin();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('login-overlay').style.display !== 'none') doLogin();
  if (e.key === 'Escape') {
    const open = [...document.querySelectorAll('.modal-bg.open')].pop();
    if (open) closeModal(open.id);
  }
});

async function loadMeta() {
  META = await api('/meta');
  document.getElementById('company-name').textContent = META.company_name;
  document.title = META.company_name;
}

async function showApp() {
  await loadMeta();
  document.getElementById('login-overlay').style.display = 'none';
  document.getElementById('app-shell').style.display = 'flex';
  document.getElementById('me-name').textContent = ME.nama;
  document.getElementById('me-role').textContent = META.peran[ME.peran] || ME.peran;
  document.getElementById('app-version').textContent = 'Versi ' + (META.version || 'dev');
  renderNav();
  route();
  if (isAdmin()) checkUpdateBadge();
}

function isAdmin() { return ME?.peran === 'admin'; }

// ─── Navigasi ────────────────────────────────────────────
const NAV = [
  { page: 'dashboard', icon: '📊', label: 'Dashboard' },
  { page: 'transaksi', icon: '🔄', label: 'Transaksi' },
  { page: 'stok', icon: '📋', label: 'Stok' },
  { page: 'riwayat', icon: '🕘', label: 'Riwayat' },
  { page: 'opname', icon: '✅', label: 'Stok Opname' },
  { page: 'barang', icon: '🏷️', label: 'Barang' },
  { page: 'lokasi', icon: '🗄️', label: 'Rak / Lokasi' },
  { page: 'users', icon: '👥', label: 'User', admin: true },
  { page: 'pengaturan', icon: '⚙️', label: 'Pengaturan', admin: true },
];
const titles = { dashboard: 'Dashboard', transaksi: 'Transaksi Barang', stok: 'Stok per Rak', riwayat: 'Riwayat Mutasi', opname: 'Stok Opname', opnamed: 'Stok Opname', barang: 'Barang', barangd: 'Detail Barang', lokasi: 'Rak / Lokasi', lokasid: 'Detail Lokasi', users: 'User', pengaturan: 'Pengaturan' };
const navMap = { barangd: 'barang', lokasid: 'lokasi', opnamed: 'opname' };
const addLabels = { barang: '+ Barang', lokasi: '+ Rak', users: '+ User', opname: '+ Opname Baru' };
const PAGES = {
  dashboard: () => renderDashboard(),
  transaksi: p => renderTransaksi(p),
  stok: () => renderStok(),
  riwayat: () => renderRiwayat(),
  opname: () => renderOpnameList(),
  opnamed: id => renderOpnameDetail(id),
  barang: () => renderBarang(),
  barangd: id => renderBarangDetail(id),
  lokasi: () => renderLokasi(),
  lokasid: id => renderLokasiDetail(id),
  users: () => renderUsers(),
  pengaturan: () => renderPengaturan(),
};

function renderNav() {
  document.getElementById('nav').innerHTML = NAV
    .filter(n => !n.admin || isAdmin())
    .map(n => `<div class="nav-item" data-page="${n.page}" onclick="navigate('${n.page}')"><span>${n.icon}</span><span>${n.label}</span></div>`)
    .join('');
}

function navigate(page, param) {
  const hash = '#' + page + (param ? '/' + param : '');
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  if (!ME) return;
  const [page, param] = (location.hash.slice(1) || 'dashboard').split('/');
  let p = PAGES[page] ? page : 'dashboard';
  if (NAV.find(n => n.page === p)?.admin && !isAdmin()) p = 'dashboard';
  CURRENT_PAGE = p;
  document.getElementById('page-title').textContent = titles[p];
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === (navMap[p] || p)));
  const btn = document.getElementById('add-btn');
  btn.style.display = addLabels[p] && isAdmin() ? '' : 'none';
  btn.textContent = addLabels[p] || '';
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('page').innerHTML = '<div style="color:var(--muted);padding:20px">Memuat...</div>';
  Promise.resolve(PAGES[p](param ? decodeURIComponent(param) : undefined)).catch(e => {
    document.getElementById('page').innerHTML = `<div class="card card-b" style="color:var(--danger)">${escHtml(e.message)}</div>`;
  });
}
window.addEventListener('hashchange', route);

function onAddClick() {
  if (CURRENT_PAGE === 'barang') openBarangModal();
  else if (CURRENT_PAGE === 'lokasi') openRakModal();
  else if (CURRENT_PAGE === 'users') openUserModal();
  else if (CURRENT_PAGE === 'opname') openOpnameModal();
}

// ─── Utils ───────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtQty(n) {
  const v = Number(n || 0);
  return v.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}
function parseQty(s) {
  const t = String(s ?? '').trim().replace(',', '.');
  const v = /^-?\d*\.?\d+$/.test(t) ? parseFloat(t) : NaN;
  return isNaN(v) ? null : v;
}

function parseDate(d) {
  if (!d) return null;
  const dt = new Date(String(d).replace(' ', 'T'));
  return isNaN(dt) ? null : dt;
}
function fmtDate(d) {
  const dt = parseDate(d);
  return dt ? dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
}
function fmtDateTime(d) {
  const dt = parseDate(d);
  return dt ? dt.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
}
function timeAgo(d) {
  const dt = parseDate(d);
  if (!dt) return '-';
  const s = (Date.now() - dt.getTime()) / 1000;
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' mnt lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  return fmtDate(d);
}
function todayStr() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

const JENIS = {
  masuk: ['Masuk', '#16a34a'],
  keluar: ['Keluar', '#dc2626'],
  pindah: ['Pindah', '#2563eb'],
  koreksi: ['Koreksi', '#d97706'],
};
function jenisBadge(j) {
  const [l, c] = JENIS[j] || [j, '#64748b'];
  return `<span class="badge" style="background:${c}1a;color:${c};border:1px solid ${c}40">${l}</span>`;
}
function aktifBadge(a) {
  return Number(a) ? '' : '<span class="badge" style="background:#f1f5f9;color:#64748b">Nonaktif</span>';
}

function optionsHtml(list, selected, placeholder) {
  const sel = selected ?? '';
  let html = placeholder !== undefined ? `<option value="">${escHtml(placeholder)}</option>` : '';
  const items = list.map(o => typeof o === 'object' ? o : { value: o, label: o });
  return html + items.map(o => `<option value="${escHtml(o.value)}" ${String(o.value) === String(sel) ? 'selected' : ''}>${escHtml(o.label)}</option>`).join('');
}

function toast(msg, isErr = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), isErr ? 5000 : 3000);
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function val(id) { return document.getElementById(id).value.trim(); }
function setVal(id, v) { document.getElementById(id).value = v ?? ''; }

async function withBtn(btn, fn) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  try { return await fn(); }
  finally { btn.disabled = false; btn.textContent = old; }
}

function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v !== null && v !== undefined) p.set(k, v);
  const s = p.toString();
  return s ? '?' + s : '';
}

function downloadCsv(filename, header, rows) {
  const esc = v => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Angka CSV pakai koma desimal agar langsung terbaca Excel berbahasa Indonesia.
function csvNum(n) { return String(Number(n || 0)).replace('.', ','); }

// ─── Data referensi (barang & lokasi aktif) untuk pilihan cepat ──
let REF = null;
async function loadRef(force = false) {
  if (REF && !force) return REF;
  const [barang, lokasi] = await Promise.all([api('/barang'), api('/lokasi')]);
  REF = {
    barang, lokasi,
    barangById: Object.fromEntries(barang.map(b => [String(b.id), b])),
    barangBySku: Object.fromEntries(barang.map(b => [b.sku.toUpperCase(), b])),
    lokasiById: Object.fromEntries(lokasi.map(l => [String(l.id), l])),
    lokasiByKode: Object.fromEntries(lokasi.map(l => [l.kode.toUpperCase(), l])),
  };
  return REF;
}
function invalidateRef() { REF = null; }

function barangLabel(b) { return `${b.sku} — ${b.nama}`; }
function barangDatalist(id) {
  return `<datalist id="${id}">${(REF?.barang || []).map(b => `<option value="${escHtml(barangLabel(b))}">`).join('')}</datalist>`;
}
// Terima "SKU — Nama", SKU saja, atau nama persis.
function findBarang(text) {
  const t = String(text || '').trim();
  if (!t || !REF) return null;
  const sku = t.split(' — ')[0].trim().toUpperCase();
  return REF.barangBySku[sku] || REF.barang.find(b => b.nama.toLowerCase() === t.toLowerCase()) || null;
}
function lokasiOptions(selected, placeholder = '— pilih rak —', list = null) {
  return optionsHtml((list || REF?.lokasi || []).map(l => ({ value: l.id, label: l.label || l.kode })), selected, placeholder);
}

// ─── Label QR ────────────────────────────────────────────
function qrSvg(text, cell = 4) {
  const qr = qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  return qr.createSvgTag({ cellSize: cell, margin: 0, scalable: true });
}

// items: [{kode, judul, sub}]
function printLabels(items, title = 'Label') {
  if (!items.length) return toast('Tidak ada label untuk dicetak', true);
  const w = window.open('', '_blank');
  if (!w) return toast('Popup diblokir browser, izinkan popup untuk mencetak', true);
  const cards = items.map(i => `<div class="lbl"><div class="qr">${qrSvg(i.kode)}</div><div class="tx"><div class="k">${escHtml(i.judul || i.kode)}</div>${i.sub ? `<div class="s">${escHtml(i.sub)}</div>` : ''}</div></div>`).join('');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>
    @page { size: A4; margin: 8mm; }
    body { font-family: -apple-system, 'Segoe UI', sans-serif; margin: 0; }
    .bar { padding: 10px; background: #f1f5f9; display: flex; gap: 10px; align-items: center; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; padding: 3mm; }
    .lbl { border: 1px dashed #94a3b8; border-radius: 2mm; padding: 3mm; display: flex; gap: 3mm; align-items: center; break-inside: avoid; height: 30mm; }
    .qr { width: 24mm; height: 24mm; flex-shrink: 0; } .qr svg { width: 100%; height: 100%; }
    .tx { min-width: 0; } .k { font-family: Menlo, monospace; font-size: 15pt; font-weight: 800; word-break: break-all; line-height: 1.1; }
    .s { font-size: 8.5pt; color: #334155; margin-top: 1mm; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
    @media print { .bar { display: none; } }
  </style></head><body><div class="bar"><b>${items.length} label</b><button onclick="print()">🖨 Cetak</button><span>Atur skala di dialog cetak bila perlu.</span></div><div class="grid">${cards}</div></body></html>`);
  w.document.close();
}

async function changePassword(btn) {
  try {
    await withBtn(btn, () => api('/me/password', 'PUT', { old_password: document.getElementById('pw-old').value, new_password: document.getElementById('pw-new').value }));
    setVal('pw-old', ''); setVal('pw-new', '');
    closeModal('modal-password');
    toast('Password diganti');
  } catch (e) { toast(e.message, true); }
}
