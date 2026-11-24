const OPN_STATUS = { hitung: ['Sedang dihitung', '#d97706'], selesai: ['Selesai', '#16a34a'], batal: ['Dibatalkan', '#64748b'] };
function opnBadge(s) {
  const [l, c] = OPN_STATUS[s] || [s, '#64748b'];
  return `<span class="badge" style="background:${c}1a;color:${c};border:1px solid ${c}40">${l}</span>`;
}

async function renderOpnameList() {
  const list = await api('/opname' + qs({ gudang_id: GUDANG }));
  document.getElementById('page').innerHTML = `<div class="card">${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>
      <th>Kode</th><th>Tanggal</th><th>Cakupan</th><th>Status</th><th class="r">Progres</th><th class="r">Selisih</th><th class="hide-m">Dibuat</th></tr></thead><tbody>
    ${list.map(o => `<tr class="click" onclick="navigate('opnamed',${o.id})">
      <td class="mono"><b>${escHtml(o.kode)}</b></td><td>${fmtDate(o.tanggal)}</td>
      <td>${multiGudang() ? escHtml(o.gudang) + ' · ' : ''}${o.cakupan ? 'Rak ' + escHtml(o.cakupan.replaceAll(',', ', ')) : 'Semua rak'}</td>
      <td>${opnBadge(o.status)}</td>
      <td class="r">${o.jml_dihitung} / ${o.jml_item}</td>
      <td class="r" style="${Number(o.jml_selisih) ? 'color:var(--danger);font-weight:700' : ''}">${o.jml_selisih}</td>
      <td class="hide-m" style="color:var(--muted);font-size:12.5px">${escHtml(o.dibuat_nama || '')}${o.catatan ? ' · ' + escHtml(o.catatan) : ''}</td></tr>`).join('')}
  </tbody></table></div>` : `<div class="card-b" style="color:var(--muted)">Belum ada sesi stok opname.${isAdmin() ? ' Klik <b>+ Opname Baru</b> untuk memulai.' : ''}</div>`}</div>`;
}

function openOpnameModal() {
  document.getElementById('mo-semua').checked = true;
  document.getElementById('mo-rak').style.display = 'none';
  document.getElementById('mo-gudang').innerHTML = optionsHtml(gudangAktifList().map(g => ({ value: g.id, label: g.nama })), GUDANG || gudangAktifList()[0]?.id);
  document.getElementById('mo-gudang-wrap').style.display = multiGudang() ? '' : 'none';
  renderOpnameRakPick();
  setVal('mo-catatan', '');
  openModal('modal-opname');
}

function renderOpnameRakPick() {
  const raks = rakList(val('mo-gudang'));
  document.getElementById('mo-rak').innerHTML = raks.length
    ? raks.map(r => `<label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" class="mo-cb" value="${escHtml(r)}"> Rak ${escHtml(r)}</label>`).join('')
    : '<span style="color:var(--muted)">Belum ada rak di gudang ini</span>';
}

async function createOpname(btn) {
  const semua = document.getElementById('mo-semua').checked;
  const rak = semua ? [] : [...document.querySelectorAll('.mo-cb:checked')].map(c => c.value);
  if (!semua && !rak.length) return toast('Pilih minimal satu rak', true);
  try {
    const r = await withBtn(btn, () => api('/opname', 'POST', { gudang_id: val('mo-gudang'), rak, catatan: val('mo-catatan') }));
    closeModal('modal-opname');
    navigate('opnamed', r.id);
  } catch (e) { toast(e.message, true); }
}

// ─── Detail / layar hitung ───────────────────────────────
let OPN = null;
const OPN_DIRTY = {};
let OPN_FILTER = { lokasi: '', tampil: 'semua' };

async function renderOpnameDetail(id) {
  await loadRef();
  OPN = await api('/opname/' + id);
  for (const k in OPN_DIRTY) delete OPN_DIRTY[k];
  if (OPN_FILTER.id !== OPN.id) OPN_FILTER = { id: OPN.id, lokasi: '', tampil: 'semua' };
  const o = OPN;
  const buka = o.status === 'hitung';
  document.getElementById('page-title').textContent = 'Stok Opname ' + o.kode;
  document.getElementById('page').innerHTML = `
    <div class="card card-b" style="margin-bottom:14px">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:220px">
          <div style="font-size:17px;font-weight:800"><span class="mono">${escHtml(o.kode)}</span> ${opnBadge(o.status)}</div>
          <div style="color:var(--muted);font-size:13px">${fmtDate(o.tanggal)} · ${multiGudang() ? escHtml(o.gudang) + ' · ' : ''}${o.cakupan ? 'Rak ' + escHtml(o.cakupan.replaceAll(',', ', ')) : 'Semua rak'} · dibuat ${escHtml(o.dibuat_nama || '')}${o.catatan ? ' · ' + escHtml(o.catatan) : ''}
            ${o.selesai_at ? `<br>${o.status === 'selesai' ? 'Diselesaikan' : 'Ditutup'} ${escHtml(o.selesai_nama || '')} ${fmtDateTime(o.selesai_at)}` : ''}</div>
        </div>
        <div id="opn-sum" style="text-align:right"></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn-o btn-sm" onclick="printOpname()">🖨 Cetak Lembar / Hasil</button>
        ${buka && isAdmin() ? `<button class="btn btn-g btn-sm" onclick="selesaikanOpname(this)">✓ Selesaikan & Koreksi Stok</button>
          <button class="btn btn-d btn-sm" onclick="batalOpname(this)">Batalkan</button>` : ''}
      </div>
    </div>
    ${buka ? `<div class="card card-b" style="margin-bottom:14px">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:220px"><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Scan label rak untuk mulai menghitung</label>
          <input id="opn-scan" class="inp scan" autocapitalize="characters" placeholder="mis. A-01-02" onkeydown="if(event.key==='Enter'){event.preventDefault();opnScan(this.value)}"></div>
      </div></div>` : ''}
    <div class="filters">
      <select id="opn-lok" class="inp" onchange="OPN_FILTER.lokasi=this.value;renderOpnItems()">${lokasiOptions(OPN_FILTER.lokasi, 'Semua lokasi', o.lokasi)}</select>
      <select class="inp" onchange="OPN_FILTER.tampil=this.value;renderOpnItems()">${optionsHtml([
        { value: 'semua', label: 'Semua baris' }, { value: 'belum', label: 'Belum dihitung' }, { value: 'selisih', label: 'Ada selisih' }], OPN_FILTER.tampil)}</select>
    </div>
    <div class="card"><div id="opn-items"></div></div>`;
  renderOpnItems();
}

function opnSummary() {
  const it = OPN.items;
  const done = it.filter(x => x.qty_fisik !== null);
  const sel = done.filter(x => Number(x.qty_fisik) !== Number(x.qty_sistem));
  document.getElementById('opn-sum').innerHTML = `<div style="font-size:22px;font-weight:800">${done.length} / ${it.length}</div>
    <div style="font-size:12px;color:var(--muted)">baris dihitung · <span style="color:${sel.length ? 'var(--danger)' : 'inherit'}">${sel.length} selisih</span></div>`;
}

function opnVisible() {
  return OPN.items.filter(x => (!OPN_FILTER.lokasi || String(x.lokasi_id) === OPN_FILTER.lokasi)
    && (OPN_FILTER.tampil !== 'belum' || x.qty_fisik === null)
    && (OPN_FILTER.tampil !== 'selisih' || (x.qty_fisik !== null && Number(x.qty_fisik) !== Number(x.qty_sistem))));
}

function renderOpnItems() {
  opnSummary();
  const buka = OPN.status === 'hitung';
  const list = opnVisible();
  const lok = OPN_FILTER.lokasi ? OPN.lokasi.find(l => String(l.id) === OPN_FILTER.lokasi) : null;
  const el = document.getElementById('opn-items');
  el.innerHTML = `
    ${lok ? `<div class="card-h"><span class="mono">${escHtml(lok.kode)}</span>
      ${buka ? `<button class="btn btn-o btn-sm" style="margin-left:auto" onclick="opnSamaSemua()">Isi yang kosong = sistem</button>` : ''}</div>` : ''}
    ${list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${lok ? '' : '<th>Rak</th>'}<th>Barang</th><th class="r">Sistem</th><th class="r">Fisik</th><th class="r">Selisih</th></tr></thead><tbody>
      ${list.map(x => {
        const idx = OPN.items.indexOf(x);
        const f = x.qty_fisik;
        const sel = f === null ? null : Number(f) - Number(x.qty_sistem);
        return `<tr>
          ${lok ? '' : `<td class="mono" style="white-space:nowrap">${escHtml(x.kode)}</td>`}
          <td>${escHtml(x.nama)}<div class="mono" style="color:var(--muted)">${escHtml(x.sku)}</div></td>
          <td class="r" style="white-space:nowrap">${fmtQty(x.qty_sistem)} <span style="color:var(--muted);font-size:12px">${escHtml(x.satuan)}</span></td>
          <td class="r" style="width:120px">${buka ? `<input class="inp num opn-in" data-i="${idx}" inputmode="decimal" value="${f === null ? '' : fmtQty(f)}"
              onchange="opnSet(${idx}, this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();opnNext(this)}">` : (f === null ? '<span style="color:var(--muted)">-</span>' : fmtQty(f))}</td>
          <td class="r" id="opn-sel-${idx}" style="font-weight:700;color:${sel ? (sel > 0 ? 'var(--success)' : 'var(--danger)') : 'var(--muted)'}">${sel === null ? '' : (sel > 0 ? '+' : '') + fmtQty(sel)}</td>
        </tr>`;
      }).join('')}
    </tbody></table></div>` : `<div class="card-b" style="color:var(--muted)">${lok ? 'Menurut sistem rak ini kosong.' : 'Tidak ada baris.'}</div>`}
    ${buka && lok ? `<div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <span style="font-size:13px">Ada barang lain di rak ini?</span>
      <input id="opn-add-b" class="inp" list="dl-opn-barang" placeholder="SKU / nama barang" style="flex:1;min-width:180px">
      <input id="opn-add-q" class="inp num" inputmode="decimal" placeholder="Qty fisik" style="width:110px">
      <button class="btn btn-o" onclick="opnTambah(this)">Tambah</button>${barangDatalist('dl-opn-barang')}</div>` : ''}
    ${buka ? `<div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;align-items:center">
      <span id="opn-dirty" style="font-size:12.5px;color:var(--warning)"></span>
      <button class="btn btn-p" onclick="opnSimpan(this)">Simpan Hitungan</button></div>` : ''}`;
  opnDirtyInfo();
}

function opnDirtyInfo() {
  const n = Object.keys(OPN_DIRTY).length;
  const el = document.getElementById('opn-dirty');
  if (el) el.textContent = n ? `${n} baris belum disimpan` : '';
}

function opnSet(idx, v) {
  const x = OPN.items[idx];
  const q = String(v).trim() === '' ? null : parseQty(v);
  if (String(v).trim() !== '' && (q === null || q < 0)) { toast('Jumlah tidak valid', true); return; }
  x.qty_fisik = q;
  OPN_DIRTY[idx] = true;
  const sel = q === null ? null : q - Number(x.qty_sistem);
  const c = document.getElementById('opn-sel-' + idx);
  if (c) {
    c.textContent = sel === null ? '' : (sel > 0 ? '+' : '') + fmtQty(sel);
    c.style.color = sel ? (sel > 0 ? 'var(--success)' : 'var(--danger)') : 'var(--muted)';
  }
  opnSummary();
  opnDirtyInfo();
}

function opnNext(input) {
  opnSet(Number(input.dataset.i), input.value);
  const all = [...document.querySelectorAll('.opn-in')];
  const nx = all[all.indexOf(input) + 1];
  if (nx) { nx.focus(); nx.select(); }
}

function opnSamaSemua() {
  opnVisible().forEach(x => { if (x.qty_fisik === null) opnSet(OPN.items.indexOf(x), x.qty_sistem); });
  renderOpnItems();
}

function opnScan(text) {
  const kode = String(text || '').trim().toUpperCase();
  setVal('opn-scan', '');
  const l = OPN.lokasi.find(x => x.kode.toUpperCase() === kode);
  if (!l) return toast(`Rak ${kode} tidak ada di cakupan opname ini`, true);
  OPN_FILTER.lokasi = String(l.id);
  document.getElementById('opn-lok').value = OPN_FILTER.lokasi;
  renderOpnItems();
  const first = document.querySelector('.opn-in');
  if (first) { first.focus(); first.select(); } else document.getElementById('opn-add-b')?.focus();
}

async function opnSimpan(btn, silent = false) {
  const idxs = Object.keys(OPN_DIRTY);
  if (!idxs.length) { if (!silent) toast('Tidak ada perubahan'); return true; }
  const items = idxs.map(i => OPN.items[i]).map(x => ({ barang_id: x.barang_id, lokasi_id: x.lokasi_id, qty_fisik: x.qty_fisik }));
  try {
    await (btn ? withBtn(btn, () => api(`/opname/${OPN.id}/hitung`, 'POST', { items })) : api(`/opname/${OPN.id}/hitung`, 'POST', { items }));
    idxs.forEach(i => delete OPN_DIRTY[i]);
    opnDirtyInfo();
    if (!silent) toast(`${items.length} baris tersimpan`);
    return true;
  } catch (e) { toast(e.message, true); return false; }
}

async function opnTambah(btn) {
  const b = findBarang(val('opn-add-b'));
  if (!b) return toast('Barang tidak ditemukan', true);
  const q = parseQty(val('opn-add-q'));
  if (q === null || q < 0) return toast('Isi qty fisik', true);
  if (OPN.items.some(x => String(x.barang_id) === String(b.id) && String(x.lokasi_id) === OPN_FILTER.lokasi)) return toast('Barang sudah ada di daftar rak ini, isi di baris tersebut', true);
  if (!(await opnSimpan(null, true))) return;
  try {
    await withBtn(btn, () => api(`/opname/${OPN.id}/hitung`, 'POST', { items: [{ barang_id: b.id, lokasi_id: OPN_FILTER.lokasi, qty_fisik: q }] }));
    toast('Barang ditambahkan');
    await renderOpnameDetail(OPN.id);
  } catch (e) { toast(e.message, true); }
}

async function selesaikanOpname(btn) {
  if (!(await opnSimpan(null, true))) return;
  const belum = OPN.items.filter(x => x.qty_fisik === null).length;
  const sel = OPN.items.filter(x => x.qty_fisik !== null && Number(x.qty_fisik) !== Number(x.qty_sistem)).length;
  if (!confirm(`Selesaikan ${OPN.kode}?\n\n• ${sel} baris selisih akan dibuat koreksi stok\n• ${belum} baris belum dihitung → dilewati (stok tidak diubah)\n\nSetelah selesai, sesi tidak bisa diubah lagi.`)) return;
  try {
    const r = await withBtn(btn, () => api(`/opname/${OPN.id}/selesai`, 'POST', {}));
    toast(`Opname selesai, ${r.koreksi} koreksi stok dibuat`);
    renderOpnameDetail(OPN.id);
  } catch (e) { toast(e.message, true); }
}

async function batalOpname(btn) {
  if (!confirm(`Batalkan ${OPN.kode}? Hasil hitungan tidak diterapkan ke stok.`)) return;
  try {
    await withBtn(btn, () => api(`/opname/${OPN.id}/batal`, 'POST', {}));
    toast('Opname dibatalkan');
    renderOpnameDetail(OPN.id);
  } catch (e) { toast(e.message, true); }
}

function printOpname() {
  const o = OPN;
  const w = window.open('', '_blank');
  if (!w) return toast('Popup diblokir browser', true);
  const hasil = o.status !== 'hitung' || o.items.some(x => x.qty_fisik !== null);
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(o.kode)}</title><style>
    body{font-family:-apple-system,'Segoe UI',sans-serif;font-size:10.5pt;margin:10mm} table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left} td.r{text-align:right} .m{font-family:Menlo,monospace}
  </style></head><body><h3 style="margin:0">${escHtml(META.company_name)} — Stok Opname ${escHtml(o.kode)}</h3>
  <div style="margin:4px 0 10px">${fmtDate(o.tanggal)} · ${escHtml(o.gudang)} · ${o.cakupan ? 'Rak ' + escHtml(o.cakupan) : 'Semua rak'} · ${OPN_STATUS[o.status][0]}</div>
  <table><thead><tr><th>Rak</th><th>SKU</th><th>Barang</th><th>Sistem</th><th>Fisik</th><th>Selisih</th></tr></thead><tbody>
  ${o.items.map(x => {
    const sel = x.qty_fisik === null ? '' : Number(x.qty_fisik) - Number(x.qty_sistem);
    return `<tr><td class="m">${escHtml(x.kode)}</td><td class="m">${escHtml(x.sku)}</td><td>${escHtml(x.nama)}</td><td class="r">${fmtQty(x.qty_sistem)} ${escHtml(x.satuan)}</td>
      <td class="r" style="min-width:20mm">${hasil && x.qty_fisik !== null ? fmtQty(x.qty_fisik) : ''}</td><td class="r">${sel === '' ? '' : (sel > 0 ? '+' : '') + fmtQty(sel)}</td></tr>`;
  }).join('')}
  </tbody></table><p style="margin-top:24px">Dihitung oleh: ____________________ &nbsp;&nbsp; Diperiksa oleh: ____________________</p>
  <script>print()<\/script></body></html>`);
  w.document.close();
}
