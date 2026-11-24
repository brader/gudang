let GUDANG_LIST = [];

async function renderGudang() {
  GUDANG_LIST = await api('/gudang');
  document.getElementById('page').innerHTML = `
    <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Gudang</th><th>Awalan Kode</th><th class="r">Lokasi</th><th class="r">Terisi</th><th class="hide-m">Alamat</th></tr></thead><tbody>
      ${GUDANG_LIST.map((g, i) => `<tr class="click" onclick="openGudangModal(GUDANG_LIST[${i}])">
        <td><b>${escHtml(g.nama)}</b> ${aktifBadge(g.aktif)}</td>
        <td class="mono">${g.awalan ? escHtml(g.awalan) + '-A-01-01' : '<span style="color:var(--muted)">tanpa awalan</span> A-01-01'}</td>
        <td class="r">${g.jml_lokasi}</td><td class="r">${g.lokasi_terisi}</td>
        <td class="hide-m" style="color:var(--muted)">${escHtml(g.alamat || '')}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div style="font-size:12.5px;color:var(--muted);margin-top:10px;max-width:720px">
      Awalan kode ditambahkan di depan kode rak gudang itu, misalnya <span class="mono">CKR-A-01-01</span>, supaya label antar gudang tidak tertukar.
      Barang dipindah antar gudang lewat <a href="#transaksi/pindah">Transaksi → Pindah Rak</a>. Pilihan gudang di kanan atas menyaring tampilan Dashboard, Stok, Rak, Riwayat, dan Opname.
    </div>`;
}

function openGudangModal(g = null) {
  document.getElementById('mg-title').textContent = g ? 'Edit Gudang' : 'Gudang Baru';
  setVal('mg-id', g?.id);
  setVal('mg-nama', g?.nama);
  setVal('mg-awalan', g?.awalan);
  setVal('mg-alamat', g?.alamat);
  document.getElementById('mg-aktif').checked = g ? !!Number(g.aktif) : true;
  document.getElementById('mg-aktif-wrap').style.display = g ? 'flex' : 'none';
  const terkunci = g && Number(g.jml_lokasi) > 0;
  document.getElementById('mg-awalan').disabled = !!terkunci;
  document.getElementById('mg-awalan-help').textContent = terkunci
    ? 'Tidak bisa diubah karena rak gudang ini sudah punya label.'
    : g && !g.awalan ? 'Kosong = tanpa awalan (hanya untuk satu gudang).' : 'Huruf/angka tanpa spasi, maks 10 karakter. Tidak bisa diubah setelah rak dibuat.';
  openModal('modal-gudang');
  setTimeout(() => document.getElementById('mg-nama').focus(), 50);
}

async function saveGudang(btn) {
  const id = val('mg-id');
  const body = { nama: val('mg-nama'), awalan: val('mg-awalan'), alamat: val('mg-alamat'), aktif: document.getElementById('mg-aktif').checked };
  try {
    await withBtn(btn, () => api('/gudang' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', body));
    closeModal('modal-gudang');
    toast('Gudang disimpan');
    invalidateRef();
    await loadMeta();
    renderGudang();
  } catch (e) { toast(e.message, true); }
}
