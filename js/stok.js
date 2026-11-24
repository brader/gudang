const STOK_F = { q: '', rak: '', kategori: '', urut: 'barang' };
let STOK_LIST = [];

async function renderStok() {
  document.getElementById('page').innerHTML = `
    <div class="filters">
      <input class="inp" placeholder="Cari SKU / nama / kode rak..." value="${escHtml(STOK_F.q)}" oninput="STOK_F.q=this.value;loadStokDebounced()">
      <select class="inp" onchange="STOK_F.rak=this.value;loadStok()">${optionsHtml(rakList().map(r => ({ value: r, label: 'Rak ' + r })), STOK_F.rak, 'Semua rak')}</select>
      <select class="inp" onchange="STOK_F.kategori=this.value;loadStok()">${optionsHtml(META.kategori, STOK_F.kategori, 'Semua kategori')}</select>
      <select class="inp" onchange="STOK_F.urut=this.value;loadStok()">${optionsHtml([{ value: 'barang', label: 'Urut per barang' }, { value: 'rak', label: 'Urut per rak' }], STOK_F.urut)}</select>
      <button class="btn btn-o" onclick="exportStok()">⬇ CSV</button>
      <button class="btn btn-o" onclick="printStok()">🖨 Cetak</button>
    </div>
    <div class="card" id="stok-list"></div>`;
  await loadStok();
}

async function loadStok() {
  STOK_LIST = await api('/stok' + qs({ ...STOK_F, gudang_id: GUDANG }));
  const el = document.getElementById('stok-list');
  if (!el) return;
  if (!STOK_LIST.length) { el.innerHTML = '<div class="card-b" style="color:var(--muted)">Tidak ada stok.</div>'; return; }
  const byRak = STOK_F.urut === 'rak';
  el.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${byRak ? '<th>Rak</th><th>Barang</th>' : '<th>Barang</th><th>Rak</th>'}<th class="r">Qty</th></tr></thead><tbody>
    ${STOK_LIST.map(s => {
      const brg = `<td><a href="#barangd/${s.barang_id}">${escHtml(s.nama)}</a><div class="mono" style="color:var(--muted)">${escHtml(s.sku)}</div></td>`;
      const rak = `<td><a class="mono" href="#lokasid/${s.lokasi_id}">${escHtml(s.kode)}</a>${multiGudang() && !GUDANG ? `<div style="font-size:12px;color:var(--muted)">${escHtml(s.gudang)}</div>` : ''}</td>`;
      return `<tr>${byRak ? rak + brg : brg + rak}<td class="r" style="white-space:nowrap;${Number(s.qty) < 0 ? 'color:var(--danger)' : ''}"><b>${fmtQty(s.qty)}</b> ${escHtml(s.satuan)}</td></tr>`;
    }).join('')}
  </tbody></table></div><div style="padding:10px 12px;font-size:12px;color:var(--muted)">${STOK_LIST.length} baris</div>`;
}
const loadStokDebounced = debounce(loadStok);

function exportStok() {
  downloadCsv('stok-' + todayStr() + '.csv', ['Gudang', 'Rak', 'SKU', 'Nama', 'Kategori', 'Qty', 'Satuan'],
    STOK_LIST.map(s => [s.gudang, s.kode, s.sku, s.nama, s.kategori, csvNum(s.qty), s.satuan]));
}

function printStok() {
  const w = window.open('', '_blank');
  if (!w) return toast('Popup diblokir browser', true);
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Stok ${todayStr()}</title><style>
    body{font-family:-apple-system,'Segoe UI',sans-serif;font-size:11pt;margin:12mm} table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left} td.r{text-align:right} .m{font-family:Menlo,monospace}
  </style></head><body><h3>${escHtml(META.company_name)}${GUDANG ? ' · ' + escHtml(gudangNama(GUDANG)) : ''} — Stok per ${fmtDateTime(new Date().toISOString())}</h3>
  <table><thead><tr><th>Rak</th><th>SKU</th><th>Nama</th><th>Qty</th><th>Satuan</th><th style="width:22mm">Cek Fisik</th></tr></thead><tbody>
  ${STOK_LIST.map(s => `<tr><td class="m">${escHtml(s.kode)}</td><td class="m">${escHtml(s.sku)}</td><td>${escHtml(s.nama)}</td><td class="r">${fmtQty(s.qty)}</td><td>${escHtml(s.satuan)}</td><td></td></tr>`).join('')}
  </tbody></table><script>print()<\/script></body></html>`);
  w.document.close();
}

// ─── Riwayat mutasi ──────────────────────────────────────
const MUT_F = { dari: '', sampai: '', jenis: '', q: '' };
let MUT_LIST = [];

async function renderRiwayat() {
  if (!MUT_F.dari) {
    const d = new Date(); d.setDate(d.getDate() - 30);
    MUT_F.dari = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  document.getElementById('page').innerHTML = `
    <div class="filters">
      <input type="date" class="inp" value="${MUT_F.dari}" onchange="MUT_F.dari=this.value;loadMutasi()" title="Dari tanggal">
      <input type="date" class="inp" value="${MUT_F.sampai}" onchange="MUT_F.sampai=this.value;loadMutasi()" title="Sampai tanggal">
      <select class="inp" onchange="MUT_F.jenis=this.value;loadMutasi()">${optionsHtml(Object.entries(JENIS).map(([k, [l]]) => ({ value: k, label: l })), MUT_F.jenis, 'Semua jenis')}</select>
      <input class="inp" placeholder="Cari barang / rak / referensi..." value="${escHtml(MUT_F.q)}" oninput="MUT_F.q=this.value;loadMutasiDebounced()">
      <button class="btn btn-o" onclick="exportMutasi()">⬇ CSV</button>
    </div>
    <div class="card" id="mutasi-list"></div>`;
  await loadMutasi();
}

async function loadMutasi() {
  MUT_LIST = await api('/mutasi' + qs({ ...MUT_F, gudang_id: GUDANG }));
  const el = document.getElementById('mutasi-list');
  if (!el) return;
  el.innerHTML = mutasiTable(MUT_LIST) + (MUT_LIST.length >= 500 ? '<div style="padding:10px 12px;font-size:12px;color:var(--muted)">Menampilkan 500 terbaru — persempit filter tanggal, atau export CSV untuk semua.</div>' : '');
}
const loadMutasiDebounced = debounce(loadMutasi);

async function exportMutasi() {
  try {
    const list = await api('/mutasi' + qs({ ...MUT_F, gudang_id: GUDANG, export: 1 }));
    downloadCsv('mutasi-' + todayStr() + '.csv', ['Tanggal', 'Jenis', 'SKU', 'Barang', 'Rak Asal', 'Rak Tujuan', 'Qty', 'Satuan', 'Referensi', 'Catatan', 'Oleh', 'Dicatat'],
      list.map(m => [m.tanggal, JENIS[m.jenis]?.[0] || m.jenis, m.sku, m.barang, m.asal, m.tujuan, csvNum(m.qty), m.satuan, m.referensi, m.catatan, m.oleh, m.created_at]));
  } catch (e) { toast(e.message, true); }
}
