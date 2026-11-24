async function renderDashboard() {
  const d = await api('/dashboard');
  const hari = Object.fromEntries(d.hari_ini.map(r => [r.jenis, Number(r.n)]));
  const stat = (n, l, onclick = '') => `<div class="card stat" ${onclick ? `style="cursor:pointer" onclick="${onclick}"` : ''}><div class="n">${n}</div><div class="l">${l}</div></div>`;
  document.getElementById('page').innerHTML = `
    <div class="tabs">
      <button class="tab" style="border-color:#86efac" onclick="navigate('transaksi','masuk')">⬇ Barang Masuk</button>
      <button class="tab" style="border-color:#fca5a5" onclick="navigate('transaksi','keluar')">⬆ Barang Keluar</button>
      <button class="tab" style="border-color:#93c5fd" onclick="navigate('transaksi','pindah')">⇄ Pindah Rak</button>
    </div>
    <div class="stat-grid" style="margin-bottom:16px">
      ${stat(d.jml_barang, 'Barang aktif', "navigate('barang')")}
      ${stat(`${d.lokasi_terisi}<span style="font-size:14px;color:var(--muted)"> / ${d.jml_lokasi}</span>`, 'Lokasi rak terisi', "navigate('lokasi')")}
      ${stat(`<span style="color:var(--success)">${hari.masuk || 0}</span> · <span style="color:var(--danger)">${hari.keluar || 0}</span>`, 'Transaksi masuk · keluar hari ini', "navigate('riwayat')")}
      ${stat(`<span style="color:${d.menipis.length ? 'var(--danger)' : 'inherit'}">${d.menipis.length}</span>`, 'Barang di bawah stok minimum')}
    </div>
    ${d.opname_aktif.length ? `<div class="card card-b" style="margin-bottom:16px;background:#fffbeb;border-color:#fde68a">
      <b>Stok opname sedang berjalan:</b> ${d.opname_aktif.map(o => `<a href="#opnamed/${o.id}">${escHtml(o.kode)}</a> (${o.cakupan ? 'rak ' + escHtml(o.cakupan) : 'semua rak'})`).join(', ')}
    </div>` : ''}
    <div class="two-col">
      <div class="card">
        <div class="card-h">Stok Menipis</div>
        ${d.menipis.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Barang</th><th class="r">Stok</th><th class="r">Min</th></tr></thead><tbody>
          ${d.menipis.map(b => `<tr class="click" onclick="navigate('barangd',${b.id})"><td><div>${escHtml(b.nama)}</div><div class="mono" style="color:var(--muted)">${escHtml(b.sku)}</div></td>
            <td class="r" style="color:var(--danger);font-weight:700">${fmtQty(b.total)}</td><td class="r">${fmtQty(b.stok_min)} ${escHtml(b.satuan)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="card-b" style="color:var(--muted)">Semua stok aman.</div>'}
      </div>
      <div class="card">
        <div class="card-h">Mutasi Terakhir <a href="#riwayat" style="margin-left:auto;font-size:12px;font-weight:600">Lihat semua →</a></div>
        ${mutasiTable(d.terakhir, true)}
      </div>
    </div>`;
}

function mutasiArah(m) {
  if (m.jenis === 'pindah') return `<span class="mono">${escHtml(m.asal)}</span> → <span class="mono">${escHtml(m.tujuan)}</span>`;
  if (m.jenis === 'koreksi') return `<span class="mono">${escHtml(m.tujuan || m.asal)}</span> <b style="color:${m.tujuan ? 'var(--success)' : 'var(--danger)'}">${m.tujuan ? '+' : '−'}</b>`;
  return `<span class="mono">${escHtml(m.tujuan || m.asal)}</span>`;
}

function mutasiTable(list, compact = false) {
  if (!list.length) return '<div class="card-b" style="color:var(--muted)">Belum ada mutasi.</div>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tanggal</th><th>Jenis</th>${compact ? '' : '<th>Barang</th>'}<th>Rak</th><th class="r">Qty</th>${compact ? '' : '<th class="hide-m">Ref / Catatan</th><th class="hide-m">Oleh</th>'}</tr></thead><tbody>
    ${list.map(m => `<tr>
      <td style="white-space:nowrap">${fmtDate(m.tanggal)}</td>
      <td>${jenisBadge(m.jenis)}${compact ? `<div style="font-size:12.5px;margin-top:2px">${escHtml(m.barang)}</div>` : ''}</td>
      ${compact ? '' : `<td><a href="#barangd/${m.barang_id}">${escHtml(m.barang)}</a><div class="mono" style="color:var(--muted)">${escHtml(m.sku)}</div></td>`}
      <td style="white-space:nowrap">${mutasiArah(m)}</td>
      <td class="r" style="white-space:nowrap">${fmtQty(m.qty)} ${escHtml(m.satuan)}</td>
      ${compact ? '' : `<td class="hide-m" style="font-size:12.5px">${escHtml(m.referensi || '')}${m.referensi && m.catatan ? ' · ' : ''}<span style="color:var(--muted)">${escHtml(m.catatan || '')}</span></td>
      <td class="hide-m" style="font-size:12.5px;color:var(--muted);white-space:nowrap">${escHtml(m.oleh || '')}<div>${fmtDateTime(m.created_at)}</div></td>`}
    </tr>`).join('')}
  </tbody></table></div>`;
}
