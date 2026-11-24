let BARANG_LIST = [];
const BARANG_F = { q: '', kategori: '', menipis: '', aktif: '1' };

async function renderBarang() {
  document.getElementById('page').innerHTML = `
    <div class="filters">
      <input id="fb-q" class="inp" placeholder="Cari SKU / nama..." value="${escHtml(BARANG_F.q)}" oninput="BARANG_F.q=this.value;loadBarangDebounced()">
      <select id="fb-kat" class="inp" onchange="BARANG_F.kategori=this.value;loadBarang()">${optionsHtml(META.kategori, BARANG_F.kategori, 'Semua kategori')}</select>
      <select class="inp" onchange="BARANG_F.menipis=this.value;loadBarang()">${optionsHtml([{ value: '1', label: 'Hanya stok menipis' }], BARANG_F.menipis, 'Semua stok')}</select>
      <select class="inp" onchange="BARANG_F.aktif=this.value;loadBarang()">${optionsHtml([{ value: '1', label: 'Aktif' }, { value: '0', label: 'Termasuk nonaktif' }], BARANG_F.aktif)}</select>
      <button class="btn btn-o" onclick="printBarangLabels()">🏷 Cetak Label</button>
      <button class="btn btn-o" onclick="exportBarang()">⬇ CSV</button>
    </div>
    <div class="card" id="barang-list"></div>`;
  await loadBarang();
}

async function loadBarang() {
  BARANG_LIST = await api('/barang' + qs(BARANG_F));
  const el = document.getElementById('barang-list');
  if (!el) return;
  if (!BARANG_LIST.length) { el.innerHTML = `<div class="card-b" style="color:var(--muted)">Belum ada barang.${isAdmin() ? ' Klik <b>+ Barang</b> untuk menambah.' : ''}</div>`; return; }
  el.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th style="width:30px"><input type="checkbox" onchange="document.querySelectorAll('.cb-barang').forEach(c=>c.checked=this.checked)"></th>
      <th>SKU</th><th>Nama</th><th class="hide-m">Kategori</th><th class="r">Stok</th><th class="r hide-m">Min</th><th class="r hide-m">Rak</th></tr></thead><tbody>
    ${BARANG_LIST.map(b => {
      const low = Number(b.stok_min) > 0 && Number(b.total) < Number(b.stok_min);
      return `<tr class="click" onclick="if(event.target.type!=='checkbox')navigate('barangd',${b.id})">
        <td><input type="checkbox" class="cb-barang" value="${b.id}"></td>
        <td class="mono">${escHtml(b.sku)}</td>
        <td>${escHtml(b.nama)} ${aktifBadge(b.aktif)}</td>
        <td class="hide-m">${escHtml(b.kategori || '')}</td>
        <td class="r" style="white-space:nowrap;${low ? 'color:var(--danger);font-weight:700' : ''}">${fmtQty(b.total)} ${escHtml(b.satuan)}</td>
        <td class="r hide-m">${Number(b.stok_min) ? fmtQty(b.stok_min) : '-'}</td>
        <td class="r hide-m">${b.jml_rak}</td></tr>`;
    }).join('')}
  </tbody></table></div>
  <div style="padding:10px 12px;font-size:12px;color:var(--muted)">${BARANG_LIST.length} barang</div>`;
}
const loadBarangDebounced = debounce(loadBarang);

function selectedBarang() {
  const ids = [...document.querySelectorAll('.cb-barang:checked')].map(c => c.value);
  return ids.length ? BARANG_LIST.filter(b => ids.includes(String(b.id))) : BARANG_LIST;
}

function printBarangLabels() {
  printLabels(selectedBarang().map(b => ({ kode: b.sku, judul: b.sku, sub: b.nama })), 'Label Barang');
}

function exportBarang() {
  downloadCsv('barang-' + todayStr() + '.csv', ['SKU', 'Nama', 'Kategori', 'Satuan', 'Stok', 'Stok Min', 'Jumlah Rak', 'Aktif'],
    BARANG_LIST.map(b => [b.sku, b.nama, b.kategori, b.satuan, csvNum(b.total), csvNum(b.stok_min), b.jml_rak, Number(b.aktif) ? 'Ya' : 'Tidak']));
}

function openBarangModal(b = null) {
  document.getElementById('mb-title').textContent = b ? 'Edit Barang' : 'Barang Baru';
  setVal('mb-id', b?.id);
  setVal('mb-sku', b?.sku);
  setVal('mb-nama', b?.nama);
  setVal('mb-kategori', b?.kategori);
  setVal('mb-satuan', b?.satuan || 'pcs');
  setVal('mb-min', b ? fmtQty(b.stok_min) : '0');
  document.getElementById('mb-aktif').checked = b ? !!Number(b.aktif) : true;
  document.getElementById('mb-aktif-wrap').style.display = b ? 'flex' : 'none';
  document.getElementById('dl-kategori').innerHTML = META.kategori.map(k => `<option value="${escHtml(k)}">`).join('');
  document.getElementById('dl-satuan').innerHTML = META.satuan.map(k => `<option value="${escHtml(k)}">`).join('');
  openModal('modal-barang');
  setTimeout(() => document.getElementById(b ? 'mb-nama' : 'mb-sku').focus(), 50);
}

async function saveBarang(btn) {
  const id = val('mb-id');
  const min = parseQty(val('mb-min') || '0');
  if (min === null) return toast('Stok minimum harus angka', true);
  const body = { sku: val('mb-sku'), nama: val('mb-nama'), kategori: val('mb-kategori'), satuan: val('mb-satuan'), stok_min: min, aktif: document.getElementById('mb-aktif').checked };
  try {
    await withBtn(btn, () => api('/barang' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', body));
    closeModal('modal-barang');
    toast('Barang disimpan');
    invalidateRef();
    await loadMeta();
    if (CURRENT_PAGE === 'barang') loadBarang(); else route();
  } catch (e) { toast(e.message, true); }
}

async function renderBarangDetail(id) {
  const b = await api('/barang/' + id);
  window._barang = b;
  document.getElementById('page-title').textContent = b.nama;
  document.getElementById('page').innerHTML = `
    <div class="card card-b" style="margin-bottom:16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div style="width:84px;height:84px;flex-shrink:0">${qrSvg(b.sku)}</div>
      <div style="flex:1;min-width:200px">
        <div class="mono" style="font-size:16px;font-weight:800">${escHtml(b.sku)}</div>
        <div style="font-size:16px;font-weight:600">${escHtml(b.nama)} ${aktifBadge(b.aktif)}</div>
        <div style="color:var(--muted);font-size:13px">${escHtml(b.kategori || 'Tanpa kategori')} · Satuan ${escHtml(b.satuan)} · Min ${fmtQty(b.stok_min)}</div>
      </div>
      <div style="text-align:right"><div style="font-size:28px;font-weight:800">${fmtQty(b.total)}</div><div style="color:var(--muted);font-size:12px">${escHtml(b.satuan)} total</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;width:100%">
        <button class="btn btn-o btn-sm" onclick="navigate('transaksi','masuk')">⬇ Masuk</button>
        <button class="btn btn-o btn-sm" onclick="navigate('transaksi','keluar')">⬆ Keluar</button>
        <button class="btn btn-o btn-sm" onclick="printLabels([{kode:_barang.sku,judul:_barang.sku,sub:_barang.nama}])">🏷 Cetak Label</button>
        ${isAdmin() ? `<button class="btn btn-o btn-sm" onclick="openBarangModal(_barang)">✏️ Edit</button>` : ''}
      </div>
    </div>
    <div class="two-col">
      <div class="card"><div class="card-h">Stok per Rak</div>
        ${b.stok.length ? `<table class="tbl"><tbody>${b.stok.map(s => `<tr class="click" onclick="navigate('lokasid',${s.lokasi_id})"><td class="mono">${escHtml(s.kode)}</td><td class="r"><b>${fmtQty(s.qty)}</b> ${escHtml(b.satuan)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="card-b" style="color:var(--muted)">Tidak ada stok.</div>'}
      </div>
      <div class="card"><div class="card-h">50 Mutasi Terakhir</div>${mutasiTable(b.mutasi, true)}</div>
    </div>`;
}
