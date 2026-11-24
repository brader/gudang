let TRX = null;
const STOK_CACHE = {};

const TRX_INFO = {
  masuk: { label: '⬇ Barang Masuk', rakAktif: 'Rak tujuan', help: 'Scan label rak tujuan, lalu scan barang satu per satu (scan berulang = jumlah bertambah).' },
  keluar: { label: '⬆ Barang Keluar', rakAktif: 'Rak asal', help: 'Scan barang — sistem memilih rak yang ada stoknya. Scan label rak dulu bila ingin mengambil dari rak tertentu.' },
  pindah: { label: '⇄ Pindah Rak', rakAktif: 'Rak asal', help: 'Pilih rak tujuan, scan rak asal, lalu scan barang yang dipindahkan.' },
};

async function renderTransaksi(jenis) {
  await loadRef();
  if (!TRX_INFO[jenis]) jenis = 'masuk';
  if (!TRX || TRX.jenis !== jenis) {
    TRX = { jenis, rakAktif: '', tujuanDefault: '', items: [] };
    for (const k in STOK_CACHE) delete STOK_CACHE[k];
  }
  const info = TRX_INFO[jenis];
  document.getElementById('page').innerHTML = `
    <div class="tabs">${Object.entries(TRX_INFO).map(([k, v]) => `<button class="tab ${k === jenis ? 'on' : ''}" onclick="TRX=null;navigate('transaksi','${k}')">${v.label}</button>`).join('')}</div>
    ${REF.lokasi.length && REF.barang.length ? '' : `<div class="card card-b" style="margin-bottom:12px;background:#fffbeb;border-color:#fde68a">Isi data <a href="#barang">Barang</a> dan <a href="#lokasi">Rak</a> dulu sebelum mencatat transaksi.</div>`}
    <div class="card" style="margin-bottom:14px"><div class="card-b">
      <div class="grid3">
        <div class="field"><label>Tanggal</label><input id="tr-tanggal" type="date" class="inp" value="${todayStr()}"></div>
        <div class="field"><label>No. Referensi</label><input id="tr-ref" class="inp" placeholder="${jenis === 'masuk' ? 'No. PO / surat jalan' : jenis === 'keluar' ? 'No. SO / permintaan' : 'opsional'}"></div>
        <div class="field"><label>Catatan</label><input id="tr-catatan" class="inp"></div>
      </div>
      ${jenis === 'pindah' ? `<div class="field" style="max-width:320px"><label class="req">Rak Tujuan</label><select id="tr-tujuan-default" class="inp" onchange="setTujuanDefault(this.value)">${lokasiOptions(TRX.tujuanDefault)}</select></div>` : ''}
      <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Scan / ketik kode rak atau barang, lalu Enter</label>
          <input id="tr-scan" class="inp scan" list="dl-trx-barang" autocomplete="off" autocapitalize="characters" placeholder="mis. A-01-02 atau SKU / nama barang" onkeydown="if(event.key==='Enter'){event.preventDefault();onScan(this.value)}" onchange="if(findBarang(this.value))onScan(this.value)">
          ${barangDatalist('dl-trx-barang')}
        </div>
        <div style="font-size:13px;padding-bottom:10px">${info.rakAktif} aktif: <b id="tr-rak-aktif" class="mono">${TRX.rakAktif ? escHtml(REF.lokasiById[TRX.rakAktif]?.kode) : '—'}</b>
          ${TRX.rakAktif ? `<a href="#" onclick="TRX.rakAktif='';renderTransaksi(TRX.jenis);return false" style="font-size:12px">reset</a>` : ''}</div>
      </div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:6px">${info.help}</div>
    </div></div>
    <div class="card"><div id="tr-items"></div>
      <div style="padding:12px 16px;display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--border);flex-wrap:wrap">
        <button class="btn btn-o" onclick="addTrxRow()">+ Baris manual</button>
        <button class="btn btn-o" onclick="if(confirm('Kosongkan daftar?')){TRX.items=[];renderTrxItems()}">Kosongkan</button>
        <button id="tr-save" class="btn btn-p" onclick="saveTransaksi(this)">Simpan Transaksi</button>
      </div>
    </div>`;
  renderTrxItems();
  document.getElementById('tr-scan').focus();
}

function setTujuanDefault(v) {
  TRX.tujuanDefault = v;
  TRX.items.forEach(it => { if (!it.tujuan) it.tujuan = v; });
  renderTrxItems();
}

async function stokBarang(id) {
  if (!STOK_CACHE[id]) STOK_CACHE[id] = (await api('/barang/' + id)).stok.filter(s => Number(s.qty) > 0);
  return STOK_CACHE[id];
}

async function onScan(raw) {
  const input = document.getElementById('tr-scan');
  const text = String(raw || '').trim();
  input.value = '';
  if (!text) return;
  const kode = text.toUpperCase();
  const lok = REF.lokasiByKode[kode];
  if (lok) {
    TRX.rakAktif = String(lok.id);
    document.getElementById('tr-rak-aktif').textContent = lok.kode;
    toast(`${TRX_INFO[TRX.jenis].rakAktif}: ${lok.kode}`);
    return;
  }
  const b = findBarang(text);
  if (!b) {
    try {
      const r = await api('/scan/' + encodeURIComponent(kode));
      if (r.tipe === 'barang' || r.tipe === 'lokasi') { await loadRef(true); return onScan(text); }
    } catch (e) { return toast(e.message, true); }
    return;
  }
  await addBarangToTrx(b, true);
  input.focus();
}

async function addBarangToTrx(b, fromScan) {
  const it = { barang_id: String(b.id), asal: '', tujuan: '', qty: fromScan ? 1 : '' };
  if (TRX.jenis === 'masuk') it.tujuan = TRX.rakAktif || TRX.items.at(-1)?.tujuan || '';
  if (TRX.jenis === 'pindah') it.tujuan = TRX.tujuanDefault;
  if (TRX.jenis !== 'masuk') {
    const stok = await stokBarang(b.id);
    if (!stok.length) return toast(`${b.nama} tidak ada stok di rak manapun`, true);
    if (TRX.rakAktif && stok.some(s => String(s.lokasi_id) === TRX.rakAktif)) it.asal = TRX.rakAktif;
    else if (stok.length === 1) it.asal = String(stok[0].lokasi_id);
    else if (TRX.rakAktif) toast(`${b.nama} tidak ada di rak ${REF.lokasiById[TRX.rakAktif]?.kode}, pilih rak asal`, true);
  }
  const same = TRX.items.find(x => x.barang_id === it.barang_id && x.asal === it.asal && x.tujuan === it.tujuan);
  if (same && fromScan) same.qty = (parseQty(same.qty) || 0) + 1;
  else TRX.items.push(it);
  renderTrxItems();
  if (!fromScan) document.querySelector(`#tr-items tr:last-child .tr-qty`)?.focus();
}

function addTrxRow() {
  TRX.items.push({ barang_id: '', asal: '', tujuan: TRX.jenis === 'masuk' ? TRX.rakAktif : TRX.tujuanDefault, qty: '' });
  renderTrxItems();
  document.querySelector('#tr-items tr:last-child .tr-barang')?.focus();
}

function renderTrxItems() {
  const el = document.getElementById('tr-items');
  if (!el) return;
  const j = TRX.jenis;
  if (!TRX.items.length) { el.innerHTML = '<div class="card-b" style="color:var(--muted);text-align:center;padding:28px">Belum ada barang. Scan atau ketik di kolom di atas.</div>'; return; }
  el.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Barang</th>${j !== 'masuk' ? '<th>Rak Asal</th>' : ''}${j !== 'keluar' ? '<th>Rak Tujuan</th>' : ''}<th class="r">Qty</th><th></th></tr></thead><tbody>
    ${TRX.items.map((it, i) => {
      const b = REF.barangById[it.barang_id];
      const stok = STOK_CACHE[it.barang_id] || [];
      const asalList = stok.map(s => ({ id: s.lokasi_id, label: `${s.kode} (stok ${fmtQty(s.qty)})` }));
      return `<tr>
        <td style="color:var(--muted)">${i + 1}</td>
        <td style="min-width:220px">${b ? `<div>${escHtml(b.nama)}</div><div class="mono" style="color:var(--muted)">${escHtml(b.sku)}</div>`
          : `<input class="inp tr-barang" list="dl-trx-barang" placeholder="Ketik SKU / nama" onchange="setTrxBarang(${i}, this.value)">`}</td>
        ${j !== 'masuk' ? `<td style="min-width:170px"><select class="inp" onchange="TRX.items[${i}].asal=this.value">${lokasiOptions(it.asal, '— pilih —', asalList)}</select></td>` : ''}
        ${j !== 'keluar' ? `<td style="min-width:140px"><select class="inp" onchange="TRX.items[${i}].tujuan=this.value">${lokasiOptions(it.tujuan)}</select></td>` : ''}
        <td style="width:130px"><div style="display:flex;gap:4px;align-items:center"><input class="inp num tr-qty" inputmode="decimal" value="${escHtml(it.qty)}" onchange="TRX.items[${i}].qty=this.value" onkeydown="if(event.key==='Enter')document.getElementById('tr-scan').focus()"><span style="font-size:12px;color:var(--muted)">${escHtml(b?.satuan || '')}</span></div></td>
        <td><button class="btn-x" title="Hapus baris" onclick="TRX.items.splice(${i},1);renderTrxItems()">×</button></td>
      </tr>`;
    }).join('')}
  </tbody></table></div>`;
}

async function setTrxBarang(i, text) {
  const b = findBarang(text);
  if (!b) return toast('Barang tidak ditemukan', true);
  TRX.items.splice(i, 1);
  await addBarangToTrx(b, false);
}

async function saveTransaksi(btn) {
  const j = TRX.jenis;
  const items = [];
  for (const [i, it] of TRX.items.entries()) {
    const n = i + 1;
    if (!it.barang_id) return toast(`Baris ${n}: pilih barang`, true);
    const qty = parseQty(it.qty);
    if (!qty || qty <= 0) return toast(`Baris ${n}: jumlah harus lebih dari 0`, true);
    if (j !== 'masuk' && !it.asal) return toast(`Baris ${n}: pilih rak asal`, true);
    if (j !== 'keluar' && !it.tujuan) return toast(`Baris ${n}: pilih rak tujuan`, true);
    items.push({ barang_id: it.barang_id, lokasi_asal_id: it.asal || null, lokasi_tujuan_id: it.tujuan || null, qty });
  }
  if (!items.length) return toast('Belum ada barang', true);
  try {
    const lokIds = items.flatMap(x => [x.lokasi_asal_id, x.lokasi_tujuan_id]).filter(Boolean);
    const cek = await api('/transaksi/cek-opname', 'POST', { lokasi_ids: lokIds });
    if (cek.opname.length && !confirm(`Rak ini sedang dalam stok opname (${cek.opname.join(', ')}). Transaksi tetap dicatat dan tidak akan tertimpa hasil opname. Lanjutkan?`)) return;
    const r = await withBtn(btn, () => api('/transaksi', 'POST', { jenis: j, tanggal: val('tr-tanggal'), referensi: val('tr-ref'), catatan: val('tr-catatan'), items }));
    toast(`${TRX_INFO[j].label.slice(2)}: ${r.jumlah} baris tersimpan`);
    TRX.items = [];
    setVal('tr-ref', ''); setVal('tr-catatan', '');
    for (const k in STOK_CACHE) delete STOK_CACHE[k];
    renderTrxItems();
    document.getElementById('tr-scan').focus();
  } catch (e) { toast(e.message, true); }
}
