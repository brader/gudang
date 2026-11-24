let LOKASI_LIST = [];
const LOKASI_F = { rak: '', aktif: '1' };

async function renderLokasi() {
  document.getElementById('page').innerHTML = `
    <div class="filters">
      <select class="inp" onchange="LOKASI_F.rak=this.value;loadLokasi()">${optionsHtml(rakList().map(r => ({ value: r, label: 'Rak ' + r })), LOKASI_F.rak, 'Semua rak')}</select>
      <select class="inp" onchange="LOKASI_F.aktif=this.value;loadLokasi()">${optionsHtml([{ value: '1', label: 'Aktif' }, { value: '0', label: 'Termasuk nonaktif' }], LOKASI_F.aktif)}</select>
      <button class="btn btn-o" onclick="printLokasiLabels()">🏷 Cetak Label Rak</button>
    </div>
    <div id="lokasi-list"></div>`;
  await loadLokasi();
}

async function loadLokasi() {
  LOKASI_LIST = await api('/lokasi' + qs({ ...LOKASI_F, gudang_id: GUDANG }));
  const el = document.getElementById('lokasi-list');
  if (!el) return;
  if (!LOKASI_LIST.length) { el.innerHTML = `<div class="card card-b" style="color:var(--muted)">Belum ada lokasi rak.${isAdmin() ? ' Klik <b>+ Rak</b> untuk membuat.' : ''}</div>`; return; }
  const perRak = {};
  LOKASI_LIST.forEach(l => (perRak[l.gudang_id + '|' + l.rak] ??= []).push(l));
  el.innerHTML = Object.entries(perRak).map(([key, list]) => {
    const rak = list[0].rak;
    const cb = key.replace('|', '-');
    const tingkat = {};
    list.forEach(l => (tingkat[l.tingkat] ??= []).push(l));
    return `<div class="card" style="margin-bottom:14px">
      <div class="card-h">Rak ${escHtml(rak)}${multiGudang() ? ` <span class="badge" style="background:#eff6ff;color:var(--primary)">${escHtml(list[0].gudang)}</span>` : ''} <span style="font-weight:400;color:var(--muted);font-size:12.5px">${list.length} lokasi · ${list.filter(l => Number(l.jml_barang) > 0).length} terisi</span>
        <label style="margin-left:auto;font-weight:400;font-size:12.5px;display:flex;gap:6px;align-items:center"><input type="checkbox" onchange="document.querySelectorAll('.cb-rak-${escHtml(cb)}').forEach(c=>c.checked=this.checked)"> pilih semua</label></div>
      <div class="card-b" style="display:flex;flex-direction:column-reverse;gap:8px">
        ${Object.entries(tingkat).map(([t, ls]) => `<div style="display:flex;gap:8px;align-items:stretch">
          <div style="width:28px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted)">T${t}</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;flex:1">
          ${ls.map(l => {
            const isi = Number(l.jml_barang) > 0;
            return `<div onclick="if(event.target.type!=='checkbox')navigate('lokasid',${l.id})" style="cursor:pointer;border:1px solid ${isi ? '#93c5fd' : 'var(--border)'};background:${Number(l.aktif) ? (isi ? '#eff6ff' : '#fff') : '#f1f5f9'};border-radius:8px;padding:7px 9px;position:relative">
              <input type="checkbox" class="cb-lokasi cb-rak-${escHtml(cb)}" value="${l.id}" style="position:absolute;top:7px;right:7px">
              <div class="mono" style="font-weight:700">${escHtml(l.kode)}</div>
              <div style="font-size:11.5px;color:var(--muted)">${isi ? `${l.jml_barang} jenis barang` : 'kosong'}${Number(l.aktif) ? '' : ' · nonaktif'}</div>
            </div>`;
          }).join('')}</div></div>`).join('')}
      </div></div>`;
  }).join('');
}

function printLokasiLabels() {
  const ids = [...document.querySelectorAll('.cb-lokasi:checked')].map(c => c.value);
  const list = ids.length ? LOKASI_LIST.filter(l => ids.includes(String(l.id))) : LOKASI_LIST;
  printLabels(list.map(l => ({ kode: l.kode, judul: l.kode, sub: `${multiGudang() ? l.gudang + ' · ' : ''}Rak ${l.rak} · Tingkat ${l.tingkat} · Slot ${l.slot}${l.keterangan ? ' · ' + l.keterangan : ''}` })), 'Label Rak');
}

function updateRakPreview() {
  const g = META.gudang.find(x => String(x.id) === val('mr-gudang'));
  const rak = (g?.awalan ? g.awalan + '-' : '') + (val('mr-rak').toUpperCase() || 'A');
  const t = parseInt(val('mr-tingkat')) || 0, s = parseInt(val('mr-slot')) || 0;
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('mr-preview').innerHTML = t && s
    ? `Akan dibuat <b>${t * s}</b> lokasi: <span class="mono">${rak}-01-01</span> s/d <span class="mono">${rak}-${pad(t)}-${pad(s)}</span>` : '';
}

function openRakModal() {
  setVal('mr-rak', '');
  document.getElementById('mr-gudang').innerHTML = optionsHtml(gudangAktifList().map(g => ({ value: g.id, label: g.nama + (g.awalan ? ` (${g.awalan})` : '') })), GUDANG || gudangAktifList()[0]?.id);
  document.getElementById('mr-gudang-wrap').style.display = multiGudang() ? '' : 'none';
  ['mr-gudang', 'mr-rak', 'mr-tingkat', 'mr-slot'].forEach(id => { document.getElementById(id).oninput = updateRakPreview; document.getElementById(id).onchange = updateRakPreview; });
  updateRakPreview();
  openModal('modal-rak');
  setTimeout(() => document.getElementById('mr-rak').focus(), 50);
}

async function generateRak(btn) {
  try {
    const r = await withBtn(btn, () => api('/lokasi/generate', 'POST', { gudang_id: val('mr-gudang'), rak: val('mr-rak'), tingkat: val('mr-tingkat'), slot: val('mr-slot') }));
    closeModal('modal-rak');
    toast(`${r.dibuat} lokasi baru dibuat${r.total > r.dibuat ? ` (${r.total - r.dibuat} sudah ada)` : ''}`);
    invalidateRef();
    await loadMeta();
    renderLokasi();
  } catch (e) { toast(e.message, true); }
}

async function renderLokasiDetail(id) {
  const l = await api('/lokasi/' + id);
  window._lokasi = l;
  document.getElementById('page-title').textContent = 'Lokasi ' + l.kode;
  document.getElementById('page').innerHTML = `
    <div class="card card-b" style="margin-bottom:16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div style="width:84px;height:84px;flex-shrink:0">${qrSvg(l.kode)}</div>
      <div style="flex:1;min-width:200px">
        <div class="mono" style="font-size:20px;font-weight:800">${escHtml(l.kode)} ${aktifBadge(l.aktif)}</div>
        <div style="color:var(--muted);font-size:13px">${multiGudang() ? escHtml(l.gudang) + ' · ' : ''}Rak ${escHtml(l.rak)} · Tingkat ${l.tingkat} · Slot ${l.slot}</div>
        ${isAdmin() ? `<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <input id="ld-ket" class="inp" style="max-width:280px" placeholder="Keterangan (mis. khusus bahan baku)" value="${escHtml(l.keterangan || '')}">
          <label style="display:flex;gap:6px;align-items:center;font-size:13px"><input type="checkbox" id="ld-aktif" ${Number(l.aktif) ? 'checked' : ''}> Aktif</label>
          <button class="btn btn-o btn-sm" onclick="saveLokasi(${l.id}, this)">Simpan</button></div>`
          : `<div style="font-size:13px">${escHtml(l.keterangan || '')}</div>`}
      </div>
      <button class="btn btn-o btn-sm" onclick="printLabels([{kode:_lokasi.kode,judul:_lokasi.kode,sub:'Rak '+_lokasi.rak}])">🏷 Cetak Label</button>
    </div>
    <div class="two-col">
      <div class="card"><div class="card-h">Isi Rak</div>
        ${l.stok.length ? `<table class="tbl"><tbody>${l.stok.map(s => `<tr class="click" onclick="navigate('barangd',${s.barang_id})"><td>${escHtml(s.nama)}<div class="mono" style="color:var(--muted)">${escHtml(s.sku)}</div></td><td class="r" style="white-space:nowrap"><b>${fmtQty(s.qty)}</b> ${escHtml(s.satuan)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="card-b" style="color:var(--muted)">Rak kosong.</div>'}
      </div>
      <div class="card"><div class="card-h">50 Mutasi Terakhir</div>${mutasiTable(l.mutasi, true)}</div>
    </div>`;
}

async function saveLokasi(id, btn) {
  try {
    await withBtn(btn, () => api('/lokasi/' + id, 'PUT', { keterangan: val('ld-ket'), aktif: document.getElementById('ld-aktif').checked }));
    toast('Lokasi disimpan');
    invalidateRef();
    renderLokasiDetail(id);
  } catch (e) { toast(e.message, true); }
}
