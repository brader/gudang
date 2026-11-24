async function renderUsers() {
  const list = await api('/users');
  window._users = list;
  document.getElementById('page').innerHTML = `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nama</th><th>Username</th><th>Peran</th><th class="hide-m">Dibuat</th></tr></thead><tbody>
    ${list.map((u, i) => `<tr class="click" onclick="openUserModal(_users[${i}])">
      <td>${escHtml(u.nama)} ${aktifBadge(u.aktif)}</td><td class="mono">${escHtml(u.username)}</td>
      <td>${escHtml(META.peran[u.peran] || u.peran)}</td><td class="hide-m" style="color:var(--muted)">${fmtDate(u.created_at)}</td></tr>`).join('')}
  </tbody></table></div></div>
  <div style="font-size:12.5px;color:var(--muted);margin-top:10px"><b>Admin</b>: semua menu termasuk master data, mulai/selesaikan opname, user, update. <b>Staf Gudang</b>: transaksi, hitung opname, lihat stok.</div>`;
}

function openUserModal(u = null) {
  document.getElementById('mu-title').textContent = u ? 'Edit User' : 'User Baru';
  setVal('mu-id', u?.id);
  setVal('mu-nama', u?.nama);
  setVal('mu-username', u?.username);
  setVal('mu-password', '');
  document.getElementById('mu-peran').innerHTML = optionsHtml(Object.entries(META.peran).map(([value, label]) => ({ value, label })), u?.peran || 'staf');
  document.getElementById('mu-aktif').checked = u ? !!Number(u.aktif) : true;
  document.getElementById('mu-pw-label').textContent = u ? 'Password baru (kosongkan jika tidak diganti)' : 'Password (min 6)';
  openModal('modal-user');
  setTimeout(() => document.getElementById('mu-nama').focus(), 50);
}

async function saveUser(btn) {
  const id = val('mu-id');
  const body = { nama: val('mu-nama'), username: val('mu-username'), peran: val('mu-peran'), password: document.getElementById('mu-password').value, aktif: document.getElementById('mu-aktif').checked };
  try {
    await withBtn(btn, () => api('/users' + (id ? '/' + id : ''), id ? 'PUT' : 'POST', body));
    closeModal('modal-user');
    toast('User disimpan');
    renderUsers();
  } catch (e) { toast(e.message, true); }
}

async function renderPengaturan() {
  const s = await api('/settings');
  document.getElementById('page').innerHTML = `
    <div class="card" style="max-width:480px;margin-bottom:16px">
      <div class="card-h">Umum</div>
      <div class="card-b">
        <div class="field"><label>Nama Gudang / Perusahaan</label><input id="st-company" class="inp" value="${escHtml(s.company_name || '')}"></div>
        <button class="btn btn-p" onclick="saveSettings(this)">Simpan</button>
      </div>
    </div>
    <div id="update-card" class="card" style="max-width:720px"><div class="card-b" style="color:var(--muted)">Memuat info update...</div></div>`;
  renderUpdateCard();
}

async function saveSettings(btn) {
  try {
    await withBtn(btn, () => api('/settings', 'PUT', { company_name: val('st-company') }));
    await loadMeta();
    toast('Pengaturan disimpan');
  } catch (e) { toast(e.message, true); }
}

// ─── Update aplikasi ─────────────────────────────────────
let UPDATE_INFO = null;

function shortSha(c) { return c ? c.slice(0, 7) : ''; }

async function checkUpdateBadge() {
  try {
    const r = await api('/system/update/status');
    document.getElementById('update-btn').style.display = r.available ? '' : 'none';
  } catch {}
}

async function renderUpdateCard(check = null) {
  const el = document.getElementById('update-card');
  if (!el) return;
  const d = await api('/system/update');
  UPDATE_INFO = d;
  const last = check || d.last_check;
  const req = d.requirements;
  const reqOk = req.curl && req.zip && req.writable;
  const cur = d.current.commit ? `<b>${shortSha(d.current.commit)}</b>${d.current.date ? ' · ' + fmtDateTime(d.current.date) : ''}` : '<b>tidak diketahui</b> <span style="color:var(--muted)">(versi lama / development)</span>';

  let status = '';
  if (last) {
    status = last.available
      ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-top:12px">
          <div style="font-weight:700;margin-bottom:6px">Update tersedia: ${shortSha(last.latest.commit)}${last.behind ? ` · ${last.behind} perubahan` : ''}</div>
          ${last.changes?.length ? `<ul style="margin:0 0 10px 18px;font-size:13px">${last.changes.map(c => `<li>${escHtml(c.message)} <span style="color:var(--muted)">(${fmtDate(c.date)})</span></li>`).join('')}</ul>`
            : `<div style="font-size:13px;margin-bottom:10px">${escHtml(last.latest.message || '')}</div>`}
          <button class="btn btn-p" ${reqOk ? '' : 'disabled'} onclick="applyUpdate('${last.latest.commit}', this)">Update Sekarang</button>
          <span style="font-size:12px;color:var(--muted);margin-left:8px">File lama dibackup otomatis sebelum diganti.</span>
        </div>`
      : `<div style="color:var(--success);margin-top:12px">✓ Aplikasi sudah versi terbaru (dicek ${timeAgo(last.checked_at)}).</div>`;
  }

  el.innerHTML = `
    <div class="card-h">Update Aplikasi</div>
    <div class="card-b">
      <div style="font-size:13.5px">Versi terpasang: ${cur}</div>
      <div style="font-size:12.5px;color:var(--muted)">Sumber: github.com/${escHtml(d.repo)} (branch ${escHtml(d.branch)}) · Token GitHub: ${d.has_token ? 'tersimpan' : 'belum diisi'}</div>
      ${reqOk ? '' : `<div style="background:#fef2f2;color:var(--danger);border-radius:8px;padding:10px;margin-top:10px;font-size:13px">
        Server belum siap untuk update otomatis:${req.curl ? '' : ' ekstensi PHP <b>curl</b> belum aktif.'}${req.zip ? '' : ' ekstensi PHP <b>zip</b> belum aktif.'}${req.writable ? '' : ' folder aplikasi tidak bisa ditulis PHP.'}</div>`}
      <div style="margin-top:12px"><button class="btn btn-o" onclick="checkUpdate(this)">Cek Update</button></div>
      ${status}
      <details style="margin-top:16px">
        <summary style="cursor:pointer;font-weight:600;font-size:13px">Pengaturan sumber update</summary>
        <div class="grid2" style="margin-top:10px">
          <div class="field"><label>Repo GitHub (pemilik/nama)</label><input id="up-repo" class="inp" value="${escHtml(d.repo)}"></div>
          <div class="field"><label>Branch</label><input id="up-branch" class="inp" value="${escHtml(d.branch)}"></div>
        </div>
        <div class="field"><label>Token GitHub (wajib jika repo private, akses read-only)</label>
          <input id="up-token" class="inp" type="password" autocomplete="off" placeholder="${d.has_token ? 'Token tersimpan — isi untuk mengganti' : 'github_pat_...'}"></div>
        <button class="btn btn-o btn-sm" onclick="saveUpdateSettings(this)">Simpan</button>
        ${d.has_token ? `<button class="btn btn-d btn-sm" onclick="saveUpdateSettings(this, true)">Hapus Token</button>` : ''}
      </details>
      ${d.backups.length ? `<details style="margin-top:12px">
        <summary style="cursor:pointer;font-weight:600;font-size:13px">Kembalikan versi sebelumnya</summary>
        <div style="font-size:12.5px;color:var(--muted);margin:8px 0">Mengembalikan file aplikasi dari backup. Perubahan database dari update tidak ikut dibatalkan.</div>
        ${d.backups.map(b => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px">
          <span style="flex:1">${escHtml(b.file)} <span style="color:var(--muted)">· ${fmtSize(b.size)}</span></span>
          <button class="btn btn-o btn-sm" onclick="rollbackUpdate('${escHtml(b.file)}', this)">Kembalikan</button></div>`).join('')}
      </details>` : ''}
    </div>`;
}

async function checkUpdate(btn) {
  try {
    const r = await withBtn(btn, () => api('/system/update/check', 'POST', {}));
    document.getElementById('update-btn').style.display = r.available ? '' : 'none';
    renderUpdateCard(r);
  } catch (e) { toast(e.message, true); }
}

async function applyUpdate(commit, btn) {
  if (!confirm('Update aplikasi sekarang? Selama proses (± 1 menit) sebaiknya user lain tidak menyimpan data.')) return;
  try {
    const r = await withBtn(btn, () => api('/system/update/apply', 'POST', { commit }));
    toast(`Update berhasil: ${r.files} file diperbarui${r.migrations.length ? `, ${r.migrations.length} perubahan database` : ''}. Memuat ulang...`);
    setTimeout(() => location.reload(), 1500);
  } catch (e) { toast(e.message, true); }
}

async function rollbackUpdate(file, btn) {
  if (!confirm(`Kembalikan file aplikasi dari ${file}?`)) return;
  try {
    const r = await withBtn(btn, () => api('/system/update/rollback', 'POST', { file }));
    toast(`${r.files} file dikembalikan. Memuat ulang...`);
    setTimeout(() => location.reload(), 1500);
  } catch (e) { toast(e.message, true); }
}

async function saveUpdateSettings(btn, clearToken = false) {
  if (clearToken && !confirm('Hapus token GitHub yang tersimpan?')) return;
  const body = clearToken ? { clear_token: true } : { repo: val('up-repo'), branch: val('up-branch'), token: document.getElementById('up-token').value };
  try {
    await withBtn(btn, () => api('/system/update/settings', 'PUT', body));
    toast('Pengaturan update disimpan');
    renderUpdateCard();
  } catch (e) { toast(e.message, true); }
}
