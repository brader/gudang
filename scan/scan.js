const API = '../api';
const MODES = {
  cek: 'Cek',
  masuk: 'Masuk',
  keluar: 'Keluar',
  pindah: 'Pindah',
  opname: 'Opname',
};
const S = {
  me: null,
  mode: 'cek',
  rak: null,
  tujuan: null,
  items: [],
  cek: null,
  op: null,
  opRak: null,
  opDirty: {},
};
const CODE_CACHE = {};
const STOK_CACHE = {};
let SCANNER = null;
let LAST = { code: '', at: 0 };

function getToken() { try { return localStorage.getItem('rs_token'); } catch { return null; } }
function setToken(t) { try { t ? localStorage.setItem('rs_token', t) : localStorage.removeItem('rs_token'); } catch {} }
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

async function api(path, method = 'GET', body = null) {
  const opt = { method, headers: {} };
  const t = getToken();
  if (t) { opt.headers.Authorization = 'Bearer ' + t; opt.headers['X-Auth-Token'] = t; }
  if (body !== null) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(API + path, opt); } catch { throw new Error('Tidak ada koneksi ke server'); }
  let data = null;
  try { data = await r.json(); } catch {}
  if (r.status === 401 && path !== '/auth/login') { logout(); throw new Error(data?.error || 'Sesi berakhir, login ulang'); }
  if (!r.ok) throw new Error(data?.error || 'Gagal (' + r.status + ')');
  return data;
}

const $ = id => document.getElementById(id);
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fq(n) { return Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 }); }
function pq(s) {
  const t = String(s ?? '').trim().replace(',', '.');
  return /^-?\d*\.?\d+$/.test(t) ? parseFloat(t) : null;
}
function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('toast').appendChild(el);
  setTimeout(() => el.remove(), err ? 3500 : 1800);
}

// ─── Umpan balik scan ────────────────────────────────────
let AUDIO = null;
function beep(ok = true) {
  try {
    AUDIO ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = AUDIO.createOscillator(), g = AUDIO.createGain();
    o.frequency.value = ok ? 1100 : 300;
    g.gain.value = 0.15;
    o.connect(g); g.connect(AUDIO.destination);
    o.start(); o.stop(AUDIO.currentTime + (ok ? 0.08 : 0.25));
  } catch {}
  try { navigator.vibrate?.(ok ? 60 : [80, 60, 80]); } catch {}
  const f = $('flash');
  if (f && ok) { f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 120); }
}

// ─── Login ───────────────────────────────────────────────
function renderLogin() {
  stopCamera();
  $('app').innerHTML = `<div class="login"><div class="card">
    <div style="font-size:20px;font-weight:800">📷 RakStok Scan</div>
    <div class="hint" style="margin-bottom:16px">Masuk dengan akun RakStok</div>
    <div class="field"><label>Username</label><input id="l-u" class="inp" autocapitalize="off" autocomplete="username"></div>
    <div class="field"><label>Password</label><input id="l-p" class="inp" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')login(this)"></div>
    <button class="btn btn-p" style="width:100%" onclick="login(this)">Masuk</button>
  </div></div>`;
}

async function login(btn) {
  btn.disabled = true;
  try {
    const r = await api('/auth/login', 'POST', { username: $('l-u').value.trim(), password: $('l-p').value });
    setToken(r.token);
    S.me = r.user;
    renderShell();
  } catch (e) { toast(e.message, true); }
  finally { btn.disabled = false; }
}

function logout() {
  setToken(null);
  S.me = null;
  renderLogin();
}

// ─── Shell ───────────────────────────────────────────────
function renderShell() {
  $('app').innerHTML = `
    <header><b>📷 RakStok Scan</b><span style="font-size:13px;color:#bfdbfe">${esc(S.me.nama)}</span>
      <a href="../">Aplikasi</a><button onclick="if(confirm('Keluar?'))logout()">Keluar</button></header>
    <div class="modes" id="modes"></div>
    <main>
      <div class="cam"><div id="reader"></div><div class="flash" id="flash"></div>
        <div class="cam-off" id="cam-off">Kamera mati<br><span class="hint" style="color:#94a3b8">Tekan Mulai Kamera untuk scan</span></div>
        <button class="btn btn-p btn-sm cam-btn" id="cam-btn" onclick="toggleCamera()">📷 Mulai Kamera</button></div>
      <div class="manual"><input id="manual" class="inp" placeholder="atau ketik kode lalu Enter" autocapitalize="characters" autocomplete="off"
        onkeydown="if(event.key==='Enter'){event.preventDefault();const v=this.value;this.value='';onCode(v,true)}"><button class="btn btn-o" onclick="const i=$('manual');const v=i.value;i.value='';onCode(v,true)">OK</button></div>
      <div id="panel"></div>
    </main>
    <div id="footer"></div>`;
  setMode(lsGet('rs_scan_mode') || 'cek');
  if (lsGet('rs_scan_cam') === '1') startCamera();
}

function setMode(m) {
  if (!MODES[m]) m = 'cek';
  if (S.items.length && m !== S.mode && !confirm('Daftar yang belum disimpan akan dikosongkan. Lanjut?')) return;
  if (Object.keys(S.opDirty).length && m !== S.mode && !confirm('Hitungan opname belum disimpan akan hilang. Lanjut?')) return;
  S.mode = m;
  S.rak = null; S.tujuan = null; S.items = []; S.cek = null; S.opRak = null; S.opDirty = {};
  lsSet('rs_scan_mode', m);
  $('modes').innerHTML = Object.entries(MODES).map(([k, l]) => `<button class="mode ${k === m ? 'on' : ''}" onclick="setMode('${k}')">${l}</button>`).join('');
  if (m === 'opname') loadOpnameList(); else render();
}

// ─── Kamera ──────────────────────────────────────────────
async function startCamera() {
  if (SCANNER) return;
  if (!window.isSecureContext) return toast('Kamera hanya bisa dipakai lewat https', true);
  if (typeof Html5Qrcode === 'undefined') return toast('Library kamera gagal dimuat', true);
  try {
    SCANNER = new Html5Qrcode('reader', { verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
    await SCANNER.start({ facingMode: 'environment' },
      { fps: 12, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.7); return { width: s, height: Math.floor(s * 0.75) }; } },
      text => onCode(text), () => {});
    $('cam-off').style.display = 'none';
    $('cam-btn').textContent = '■ Stop';
    lsSet('rs_scan_cam', '1');
  } catch (e) {
    SCANNER = null;
    const m = String(e?.message || e);
    toast(/NotAllowed|Permission/i.test(m) ? 'Izin kamera ditolak. Izinkan kamera untuk situs ini di pengaturan browser.'
      : /NotFound|Requested device/i.test(m) ? 'Kamera tidak ditemukan di perangkat ini.' : 'Kamera tidak bisa dibuka: ' + m, true);
  }
}

async function stopCamera() {
  if (!SCANNER) return;
  try { await SCANNER.stop(); SCANNER.clear(); } catch {}
  SCANNER = null;
  if ($('cam-off')) { $('cam-off').style.display = ''; $('cam-btn').textContent = '📷 Mulai Kamera'; }
}

function toggleCamera() {
  if (SCANNER) { stopCamera(); lsSet('rs_scan_cam', '0'); } else startCamera();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCamera();
  else if (S.me && lsGet('rs_scan_cam') === '1') startCamera();
});

// ─── Proses kode ─────────────────────────────────────────
async function lookup(code) {
  const k = code.toUpperCase();
  if (!CODE_CACHE[k]) CODE_CACHE[k] = api('/scan/' + encodeURIComponent(k)).catch(e => { delete CODE_CACHE[k]; throw e; });
  return CODE_CACHE[k];
}

async function stokBarang(id, fresh = false) {
  if (fresh || !STOK_CACHE[id]) STOK_CACHE[id] = api('/barang/' + id).then(b => b.stok.filter(s => Number(s.qty) > 0));
  return STOK_CACHE[id];
}

let BUSY = false;
async function onCode(raw, manual = false) {
  const code = String(raw || '').trim();
  if (!code) return;
  const now = Date.now();
  if (!manual && (BUSY || (code === LAST.code && now - LAST.at < 1500))) return;
  LAST = { code, at: now };
  BUSY = true;
  try {
    const r = await lookup(code);
    if (!Number(r.aktif)) { beep(false); return toast(`${r.kode || r.sku} nonaktif`, true); }
    const ok = await HANDLERS[S.mode](r);
    beep(ok !== false);
    render();
  } catch (e) {
    beep(false);
    toast(e.message, true);
  } finally { BUSY = false; }
}

const HANDLERS = {
  async cek(r) {
    S.cek = r.tipe === 'lokasi' ? { tipe: 'lokasi', data: await api('/lokasi/' + r.id) } : { tipe: 'barang', data: await api('/barang/' + r.id) };
  },
  async masuk(r) {
    if (r.tipe === 'lokasi') { S.rak = r; toast('Rak tujuan ' + r.kode); return; }
    if (!S.rak) { toast('Scan label rak tujuan dulu', true); return false; }
    addItem(r, S.rak);
  },
  async keluar(r) {
    if (r.tipe === 'lokasi') { S.rak = r; toast('Rak asal ' + r.kode); return; }
    const stok = await stokBarang(r.id);
    let asal = S.rak && stok.find(s => String(s.lokasi_id) === String(S.rak.id));
    if (!asal && !S.rak && stok.length === 1) asal = stok[0];
    if (!asal) {
      toast(!stok.length ? `${r.nama} tidak ada stok` : S.rak ? `${r.nama} tidak ada di rak ${S.rak.kode}` : `${r.nama} ada di ${stok.length} rak, scan rak asalnya dulu`, true);
      return false;
    }
    const it = addItem(r, { id: asal.lokasi_id, kode: asal.kode });
    if (it.qty > Number(asal.qty)) { it.qty = Number(asal.qty); toast(`Stok di ${asal.kode} hanya ${fq(asal.qty)}`, true); return false; }
  },
  async pindah(r) {
    if (r.tipe === 'lokasi') {
      if (!S.tujuan) { S.tujuan = r; toast('Rak tujuan ' + r.kode + '. Sekarang scan rak asal'); return; }
      if (String(r.id) === String(S.tujuan.id)) { toast('Itu rak tujuan. Scan rak asal', true); return false; }
      S.rak = r; toast('Rak asal ' + r.kode); return;
    }
    if (!S.tujuan) { toast('Scan rak tujuan dulu', true); return false; }
    if (!S.rak) { toast('Scan rak asal dulu', true); return false; }
    const stok = await stokBarang(r.id);
    const asal = stok.find(s => String(s.lokasi_id) === String(S.rak.id));
    if (!asal) { toast(`${r.nama} tidak ada di rak ${S.rak.kode}`, true); return false; }
    const it = addItem(r, S.rak, S.tujuan);
    if (it.qty > Number(asal.qty)) { it.qty = Number(asal.qty); toast(`Stok di ${asal.kode} hanya ${fq(asal.qty)}`, true); return false; }
  },
  async opname(r) {
    if (!S.op) { toast('Pilih sesi opname dulu', true); return false; }
    if (r.tipe === 'lokasi') {
      const l = S.op.lokasi.find(x => String(x.id) === String(r.id));
      if (!l) { toast(`Rak ${r.kode} di luar cakupan opname ini`, true); return false; }
      S.opRak = l;
      return;
    }
    if (!S.opRak) { toast('Scan label rak dulu', true); return false; }
    let x = S.op.items.find(i => String(i.barang_id) === String(r.id) && String(i.lokasi_id) === String(S.opRak.id));
    if (!x) {
      x = { barang_id: r.id, lokasi_id: S.opRak.id, kode: S.opRak.kode, sku: r.sku, nama: r.nama, satuan: r.satuan, qty_sistem: null, qty_fisik: null, baru: true };
      S.op.items.push(x);
    }
    x.qty_fisik = (x.qty_fisik === null ? 0 : Number(x.qty_fisik)) + 1;
    S.opDirty[S.op.items.indexOf(x)] = true;
  },
};

function addItem(b, asal, tujuan = null) {
  const key = `${b.id}|${asal?.id || ''}|${tujuan?.id || ''}`;
  let it = S.items.find(x => x.key === key);
  if (it) it.qty += 1;
  else { it = { key, barang: b, asal: S.mode === 'masuk' ? null : asal, tujuan: S.mode === 'masuk' ? asal : tujuan, qty: 1 }; S.items.unshift(it); }
  return it;
}

// ─── Tampilan per mode ───────────────────────────────────
function chip(label, l, hint) {
  return l ? `<span class="chip">${label} <code>${esc(l.kode)}</code></span>` : `<span class="chip empty">${hint}</span>`;
}

function render() {
  const p = $('panel'), f = $('footer');
  if (!p) return;
  const m = S.mode;
  if (m === 'cek') { p.innerHTML = renderCek(); f.innerHTML = ''; return; }
  if (m === 'opname') { renderOpname(); return; }
  const ctx = m === 'masuk' ? chip('Rak tujuan', S.rak, '① Scan label rak tujuan')
    : m === 'keluar' ? chip('Rak asal', S.rak, 'Scan barang (atau rak asal dulu)')
    : chip('Tujuan', S.tujuan, '① Scan rak TUJUAN') + (S.tujuan ? chip('Asal', S.rak, '② Scan rak ASAL') : '');
  const total = S.items.reduce((a, x) => a + x.qty, 0);
  p.innerHTML = `<div class="ctx">${ctx}</div>
    <div class="card"><div class="card-h">${esc(MODES[m])} <span class="hint" style="font-weight:400">${S.items.length} barang · ${fq(total)} unit</span></div>
      ${S.items.length ? S.items.map((x, i) => `<div class="item">
        <div class="nm"><div>${esc(x.barang.nama)}</div><div class="sub">${esc(x.barang.sku)} · ${x.asal ? esc(x.asal.kode) : ''}${x.asal && x.tujuan ? ' → ' : ''}${x.tujuan ? esc(x.tujuan.kode) : ''}</div></div>
        <div class="qty"><button onclick="chgQty(${i},-1)">−</button><input inputmode="decimal" value="${fq(x.qty)}" onchange="setQty(${i},this.value)"><button onclick="chgQty(${i},1)">+</button></div>
      </div>`).join('') : '<div class="card-b hint">Belum ada barang. Scan barang satu per satu; scan ulang = jumlah +1.</div>'}
    </div>
    <div class="field" style="margin:0"><input id="ref" class="inp" placeholder="No. referensi (opsional): PO / SJ / SO" value="${esc(S.ref || '')}" oninput="S.ref=this.value"></div>`;
  f.innerHTML = `<div class="footer-bar"><button class="btn btn-o" onclick="if(confirm('Kosongkan daftar?')){S.items=[];render()}">Kosongkan</button>
    <button class="btn btn-p" ${S.items.length ? '' : 'disabled'} onclick="simpanTrx(this)">Simpan ${esc(MODES[m])}</button></div>`;
}

function chgQty(i, d) {
  const x = S.items[i];
  x.qty = Math.max(0, Math.round((x.qty + d) * 100) / 100);
  if (x.qty === 0) S.items.splice(i, 1);
  render();
}
function setQty(i, v) {
  const q = pq(v);
  if (q === null || q < 0) { toast('Jumlah tidak valid', true); return render(); }
  if (q === 0) S.items.splice(i, 1); else S.items[i].qty = q;
  render();
}

async function simpanTrx(btn) {
  btn.disabled = true;
  try {
    const items = S.items.map(x => ({ barang_id: x.barang.id, lokasi_asal_id: x.asal?.id || null, lokasi_tujuan_id: x.tujuan?.id || null, qty: x.qty }));
    const cek = await api('/transaksi/cek-opname', 'POST', { lokasi_ids: items.flatMap(x => [x.lokasi_asal_id, x.lokasi_tujuan_id]).filter(Boolean) });
    if (cek.opname.length && !confirm(`Rak sedang stok opname (${cek.opname.join(', ')}). Tetap simpan?`)) return;
    const r = await api('/transaksi', 'POST', { jenis: S.mode, referensi: S.ref || '', items });
    toast(`✓ ${r.jumlah} baris ${MODES[S.mode].toLowerCase()} tersimpan`);
    S.items = []; S.ref = '';
    for (const k in STOK_CACHE) delete STOK_CACHE[k];
    render();
  } catch (e) { toast(e.message, true); }
  finally { btn.disabled = false; }
}

function renderCek() {
  if (!S.cek) return '<div class="card card-b hint">Scan label rak untuk melihat isinya, atau scan barang untuk melihat di rak mana saja barang itu disimpan.</div>';
  const d = S.cek.data;
  if (S.cek.tipe === 'lokasi') {
    return `<div class="card"><div class="card-h">🗄️ Rak <code>${esc(d.kode)}</code> <span class="hint" style="font-weight:400">${esc(d.gudang || '')}</span><span class="hint" style="margin-left:auto;font-weight:400">${d.stok.length} jenis barang</span></div>
      ${d.stok.length ? d.stok.map(s => `<div class="row"><div><div style="font-weight:600">${esc(s.nama)}</div><div class="sub">${esc(s.sku)}</div></div><b style="white-space:nowrap">${fq(s.qty)} ${esc(s.satuan)}</b></div>`).join('')
        : '<div class="card-b hint">Rak kosong.</div>'}</div>`;
  }
  const low = Number(d.stok_min) > 0 && d.total < Number(d.stok_min);
  return `<div class="card"><div class="card-h" style="flex-direction:column;align-items:flex-start;gap:2px"><div>🏷️ ${esc(d.nama)}</div><div class="sub">${esc(d.sku)}</div></div>
    <div class="row" style="background:#f8fafc"><span>Total stok</span><b style="color:${low ? 'var(--danger)' : 'inherit'}">${fq(d.total)} ${esc(d.satuan)}${low ? ' · di bawah minimum' : ''}</b></div>
    ${d.stok.length ? d.stok.map(s => `<div class="row"><div><code>${esc(s.kode)}</code> <span class="hint">${esc(s.gudang || '')}</span></div><b>${fq(s.qty)} ${esc(d.satuan)}</b></div>`).join('') : '<div class="card-b hint">Tidak ada stok di rak manapun.</div>'}</div>`;
}

// ─── Opname ──────────────────────────────────────────────
async function loadOpnameList() {
  S.op = null;
  const p = $('panel');
  $('footer').innerHTML = '';
  p.innerHTML = '<div class="hint">Memuat sesi opname...</div>';
  try {
    const list = (await api('/opname')).filter(o => o.status === 'hitung');
    const saved = lsGet('rs_scan_op');
    if (list.length === 1 || list.some(o => String(o.id) === saved)) return pilihOpname(list.length === 1 ? list[0].id : saved);
    p.innerHTML = list.length
      ? `<div class="card"><div class="card-h">Pilih sesi opname</div>${list.map(o => `<div class="row" onclick="pilihOpname(${o.id})" style="cursor:pointer"><div><b>${esc(o.kode)}</b><div class="sub">${esc(o.gudang)} · ${o.cakupan ? 'Rak ' + esc(o.cakupan) : 'Semua rak'} · ${o.jml_dihitung}/${o.jml_item}</div></div><span>›</span></div>`).join('')}</div>`
      : '<div class="card card-b hint">Tidak ada stok opname yang sedang berjalan. Admin memulai opname dari aplikasi utama (menu Stok Opname).</div>';
  } catch (e) { p.innerHTML = `<div class="card card-b" style="color:var(--danger)">${esc(e.message)}</div>`; }
}

async function pilihOpname(id, keepRak = false) {
  try {
    S.op = await api('/opname/' + id);
    if (S.op.status !== 'hitung') { lsSet('rs_scan_op', ''); return loadOpnameList(); }
    lsSet('rs_scan_op', String(id));
    S.opDirty = {};
    if (!keepRak) S.opRak = null;
    else if (S.opRak) S.opRak = S.op.lokasi.find(l => String(l.id) === String(S.opRak.id)) || null;
    render();
  } catch (e) { toast(e.message, true); }
}

function renderOpname() {
  const p = $('panel'), f = $('footer');
  const o = S.op;
  if (!o) return;
  const rows = S.opRak ? o.items.filter(x => String(x.lokasi_id) === String(S.opRak.id)) : [];
  const done = o.items.filter(x => x.qty_fisik !== null).length;
  p.innerHTML = `<div class="ctx"><span class="chip">${esc(o.kode)} · ${esc(o.gudang)} · ${done}/${o.items.length}</span>${chip('Rak', S.opRak, '① Scan label rak')}
      <button class="btn btn-o btn-sm" onclick="if(!Object.keys(S.opDirty).length||confirm('Hitungan belum disimpan. Ganti sesi?')){lsSet('rs_scan_op','');S.opDirty={};loadOpnameList()}">Ganti sesi</button></div>
    ${S.opRak ? `<div class="card"><div class="card-h">Rak <code>${esc(S.opRak.kode)}</code>
        ${rows.some(x => x.qty_fisik === null) ? `<button class="btn btn-o btn-sm" style="margin-left:auto" onclick="opSamaSistem()">Kosong = sistem</button>` : ''}</div>
      ${rows.length ? rows.map(x => {
        const i = o.items.indexOf(x);
        const sel = x.qty_fisik === null || x.qty_sistem === null ? null : Number(x.qty_fisik) - Number(x.qty_sistem);
        return `<div class="item"><div class="nm"><div>${esc(x.nama)}</div><div class="sub">${esc(x.sku)} · sistem ${x.qty_sistem === null ? 'baru' : fq(x.qty_sistem)}</div></div>
          <div class="qty"><button onclick="opChg(${i},-1)">−</button><input inputmode="decimal" placeholder="–" value="${x.qty_fisik === null ? '' : fq(x.qty_fisik)}" onchange="opSet(${i},this.value)"><button onclick="opChg(${i},1)">+</button></div>
          <div class="sel" style="color:${sel ? (sel > 0 ? 'var(--success)' : 'var(--danger)') : 'var(--muted)'}">${sel === null ? '' : (sel > 0 ? '+' : '') + fq(sel)}</div></div>`;
      }).join('') : '<div class="card-b hint">Menurut sistem rak ini kosong. Scan barang yang ada di rak untuk menambahkannya.</div>'}
      </div>
      <div class="hint">Scan barang = hitungan +1. Bisa juga ketik jumlahnya langsung.</div>`
      : '<div class="card card-b hint">Scan label rak yang akan dihitung. Lalu scan setiap barang di rak itu satu per satu, atau ketik jumlahnya.</div>'}`;
  const n = Object.keys(S.opDirty).length;
  f.innerHTML = `<div class="footer-bar"><button class="btn btn-p" ${n ? '' : 'disabled'} onclick="opSimpan(this)">Simpan Hitungan${n ? ` (${n})` : ''}</button></div>`;
}

function opSetVal(i, q) {
  S.op.items[i].qty_fisik = q;
  S.opDirty[i] = true;
  render();
}
function opChg(i, d) {
  const x = S.op.items[i];
  opSetVal(i, Math.max(0, (x.qty_fisik === null ? 0 : Number(x.qty_fisik)) + d));
}
function opSet(i, v) {
  if (String(v).trim() === '') return opSetVal(i, null);
  const q = pq(v);
  if (q === null || q < 0) { toast('Jumlah tidak valid', true); return render(); }
  opSetVal(i, q);
}
function opSamaSistem() {
  S.op.items.forEach((x, i) => {
    if (String(x.lokasi_id) === String(S.opRak.id) && x.qty_fisik === null && x.qty_sistem !== null) { x.qty_fisik = Number(x.qty_sistem); S.opDirty[i] = true; }
  });
  render();
}

async function opSimpan(btn) {
  btn.disabled = true;
  const items = Object.keys(S.opDirty).map(i => S.op.items[i]).map(x => ({ barang_id: x.barang_id, lokasi_id: x.lokasi_id, qty_fisik: x.qty_fisik }));
  try {
    await api(`/opname/${S.op.id}/hitung`, 'POST', { items });
    toast(`✓ ${items.length} baris hitungan tersimpan`);
    await pilihOpname(S.op.id, true);
  } catch (e) { toast(e.message, true); btn.disabled = false; }
}

window.addEventListener('beforeunload', e => {
  if (S.items.length || Object.keys(S.opDirty).length) { e.preventDefault(); e.returnValue = ''; }
});

// ─── Mulai ───────────────────────────────────────────────
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});

(async () => {
  if (!getToken()) return renderLogin();
  try { S.me = await api('/me'); renderShell(); } catch { renderLogin(); }
})();
