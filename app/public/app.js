// ============================================================
// K8s Demo App - Frontend Application
// Auteur: KHLIFI HOUCEM / FORMATEUR DEVSECOPS & CLOUD
// ============================================================

// ── État global ─────────────────────────────────────────────
let state = {
  notes: [],
  files: [],
  config: {},
  health: null,
  version: null,
  info: null,
  currentTab: 'notes',
  editingNoteId: null,
  authToken: null,
  authUser: null,
};

// ── Utilitaires API ─────────────────────────────────────────
async function api(path, options = {}) {
  try {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    // Ajouter le token d'auth si connecté (signé avec APP_SECRET)
    if (state.authToken) {
      headers['Authorization'] = `Bearer ${state.authToken}`;
    }
    const res = await fetch(path, { headers, ...options });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data;
  } catch (err) {
    console.error(`[API] ${path}:`, err);
    throw err;
  }
}

// ── Fonctions de données ────────────────────────────────────
async function fetchNotes() {
  const data = await api('/api/notes');
  state.notes = data.notes || [];
  renderNotes();
  fetchStats();
}

async function createNote(noteData) {
  await api('/api/notes', { method: 'POST', body: JSON.stringify(noteData) });
  showToast('Note créée avec succès', 'success');
  fetchNotes();
}

async function updateNote(id, noteData) {
  await api(`/api/notes/${id}`, { method: 'PUT', body: JSON.stringify(noteData) });
  showToast('Note modifiée avec succès', 'success');
  fetchNotes();
}

async function deleteNote(id) {
  if (!state.authToken) {
    showToast('🔒 Connexion requise pour supprimer (Secret K8s: ADMIN_PASSWORD)', 'error');
    openLoginModal();
    return;
  }
  if (!confirm('Supprimer cette note ?')) return;
  try {
    await api(`/api/notes/${id}`, { method: 'DELETE' });
    showToast('Note supprimée', 'info');
    fetchNotes();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function fetchFiles() {
  try {
    const data = await api('/api/files');
    state.files = data.files || [];
    renderFiles();
  } catch (err) {
    if (err.message.includes('désactivé')) {
      document.getElementById('upload-zone').classList.add('disabled');
      document.getElementById('upload-status').textContent = '⛔ Upload désactivé';
    }
  }
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast(`Fichier "${file.name}" uploadé`, 'success');
    fetchFiles();
  } catch (err) {
    showToast(`Erreur upload: ${err.message}`, 'error');
  }
}

async function deleteFile(filename) {
  if (!state.authToken) {
    showToast('🔒 Connexion requise pour supprimer (Secret K8s: ADMIN_PASSWORD)', 'error');
    openLoginModal();
    return;
  }
  if (!confirm('Supprimer ce fichier ?')) return;
  try {
    await api(`/api/files/${filename}`, { method: 'DELETE' });
    showToast('Fichier supprimé', 'info');
    fetchFiles();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

async function fetchConfig() {
  state.config = await api('/config');
  renderConfig();
}

async function fetchHealth() {
  try {
    state.health = await api('/health');
    updateHealthIndicator(true);
  } catch {
    updateHealthIndicator(false);
  }
}

async function fetchVersion() {
  try {
    state.version = await api('/version');
    document.getElementById('footer-version').textContent = `v${state.version.version}`;
    document.getElementById('app-title').textContent = state.version.app || 'K8s Demo Notes';
  } catch {}
}

async function fetchInfo() {
  try {
    state.info = await api('/info');
    renderInfo();
  } catch {}
}

async function fetchStats() {
  try {
    const stats = await api('/api/stats');
    renderStats(stats);
  } catch {}
}

// ── Rendu des composants ────────────────────────────────────

function renderNotes() {
  const grid = document.getElementById('notes-grid');
  if (state.notes.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>Aucune note pour le moment</p>
        <p class="empty-sub">Cliquez sur "Nouvelle Note" pour commencer</p>
      </div>`;
    return;
  }

  const categoryIcons = { general: '📌', important: '🔴', idea: '💡', todo: '✅' };

  const isAuth = !!state.authToken;

  grid.innerHTML = state.notes
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(note => `
      <div class="note-card" data-id="${note.id}">
        <span class="note-category cat-${note.category}">
          ${categoryIcons[note.category] || '📌'} ${note.category}
        </span>
        <div class="note-title">${escapeHtml(note.title)}</div>
        <div class="note-content">${escapeHtml(note.content)}</div>
        <div class="note-footer">
          <span class="note-date">${formatDate(note.updatedAt)}</span>
          <div class="note-actions">
            <button class="btn btn-ghost btn-sm" onclick="openModal('${note.id}')" title="Modifier">✏️</button>
            <button class="btn btn-danger btn-sm ${isAuth ? '' : 'btn-locked'}" onclick="deleteNote('${note.id}')" title="${isAuth ? 'Supprimer' : 'Connexion requise pour supprimer'}">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
}

function renderStats(stats) {
  const bar = document.getElementById('stats-bar');
  if (!stats) return;
  const cats = stats.notes.categories || {};
  bar.innerHTML = `
    <div class="stat-chip"><strong>${stats.notes.total}</strong> note(s)</div>
    ${Object.entries(cats).map(([k, v]) => `<div class="stat-chip">${getCatIcon(k)} <strong>${v}</strong> ${k}</div>`).join('')}
    <div class="stat-chip">📁 <strong>${stats.files.total}</strong> fichier(s)</div>
    <div class="stat-chip">🖥️ ${stats.hostname}</div>
  `;
}

function renderFiles() {
  const list = document.getElementById('files-list');
  if (state.files.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">📂</div><p>Aucun fichier uploadé</p></div>';
    return;
  }
  list.innerHTML = state.files.map(f => `
    <div class="file-item">
      <div class="file-info">
        <span class="file-icon">📄</span>
        <div>
          <div class="file-name">${escapeHtml(f.name)}</div>
          <div class="file-size">${formatSize(f.size)} • ${formatDate(f.createdAt)}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <a href="/api/files/${f.name}" class="btn btn-ghost btn-sm" download>⬇️</a>
        <button class="btn btn-danger btn-sm" onclick="deleteFile('${f.name}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

function renderConfig() {
  const grid = document.getElementById('config-grid');
  if (!state.config) return;
  grid.innerHTML = Object.entries(state.config).map(([key, value]) => {
    const isSecret = String(value).includes('●');
    return `
      <div class="config-card ${isSecret ? 'secret' : ''}">
        <div class="config-key">${key}</div>
        <div class="config-value ${isSecret ? 'masked' : ''}">${escapeHtml(String(value))}</div>
      </div>`;
  }).join('');
}

function renderInfo() {
  const grid = document.getElementById('info-grid');
  if (!state.info) return;

  let html = '<div class="info-section-title">⚙️ Configuration (ConfigMap)</div>';
  html += Object.entries(state.info.config || {}).map(([k, v]) => `
    <div class="config-card">
      <div class="config-key">${k}</div>
      <div class="config-value">${escapeHtml(String(v))}</div>
    </div>
  `).join('');

  html += '<div class="info-section-title">🖥️ Runtime (Pod)</div>';
  if (state.info.runtime) {
    const rt = state.info.runtime;
    const entries = [
      ['HOSTNAME', rt.hostname],
      ['PLATFORM', `${rt.platform} (${rt.arch})`],
      ['NODE_VERSION', rt.nodeVersion],
      ['UPTIME', `${rt.uptime} secondes`],
      ['PID', rt.pid],
      ['CPUS', rt.cpus],
    ];
    if (rt.memory) {
      entries.push(['MEMORY_TOTAL', rt.memory.total]);
      entries.push(['MEMORY_FREE', rt.memory.free]);
      entries.push(['MEMORY_USAGE', rt.memory.usage]);
    }
    html += entries.map(([k, v]) => `
      <div class="config-card runtime">
        <div class="config-key">${k}</div>
        <div class="config-value">${escapeHtml(String(v))}</div>
      </div>
    `).join('');
  }
  grid.innerHTML = html;
}

// ── UI : Onglets ────────────────────────────────────────────
function showTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.toggle('active', tc.id === `tab-${tab}`));

  if (tab === 'notes') fetchNotes();
  if (tab === 'files') fetchFiles();
  if (tab === 'config') fetchConfig();
  if (tab === 'info') fetchInfo();
}

// ── UI : Modal ──────────────────────────────────────────────
function openModal(noteId = null) {
  state.editingNoteId = noteId;
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const submitBtn = document.getElementById('modal-submit');

  if (noteId) {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;
    title.textContent = 'Modifier la Note';
    submitBtn.textContent = 'Enregistrer';
    document.getElementById('note-title').value = note.title;
    document.getElementById('note-content').value = note.content;
    document.getElementById('note-category').value = note.category;
  } else {
    title.textContent = 'Nouvelle Note';
    submitBtn.textContent = 'Créer';
    document.getElementById('note-form').reset();
  }
  overlay.classList.add('active');
  setTimeout(() => document.getElementById('note-title').focus(), 100);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  state.editingNoteId = null;
}

async function handleNoteSubmit(e) {
  e.preventDefault();
  const data = {
    title: document.getElementById('note-title').value,
    content: document.getElementById('note-content').value,
    category: document.getElementById('note-category').value,
  };
  try {
    if (state.editingNoteId) {
      await updateNote(state.editingNoteId, data);
    } else {
      await createNote(data);
    }
    closeModal();
  } catch (err) {
    showToast(`Erreur: ${err.message}`, 'error');
  }
}

// ── UI : Health Indicator ───────────────────────────────────
function updateHealthIndicator(healthy) {
  const dot = document.querySelector('.health-dot');
  const text = document.querySelector('.health-text');
  dot.className = `health-dot ${healthy ? 'healthy' : 'unhealthy'}`;
  text.textContent = healthy ? 'Healthy' : 'Unhealthy';

  if (state.health && state.health.hostname) {
    document.getElementById('hostname-display').textContent = state.health.hostname;
  }
  if (state.config && state.config.APP_ENV) {
    document.getElementById('env-badge').textContent = state.config.APP_ENV;
  }
}

// ── UI : Toast Notifications ────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ── UI : Upload ─────────────────────────────────────────────
function setupUpload() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => {
    if (input.files.length) uploadFile(input.files[0]);
    input.value = '';
  });
}

// ── Helpers ─────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return dateStr; }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function getCatIcon(cat) {
  const icons = { general: '📌', important: '🔴', idea: '💡', todo: '✅' };
  return icons[cat] || '📌';
}

// ── Raccourcis clavier ──────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeLoginModal(); }
  if (e.ctrlKey && e.key === 'n') { e.preventDefault(); openModal(); }
});

// ── UI : Login Modal ─────────────────────────────────────
function openLoginModal() {
  document.getElementById('login-overlay').classList.add('active');
  document.getElementById('login-error').style.display = 'none';
  setTimeout(() => document.getElementById('login-password').focus(), 100);
}

function closeLoginModal() {
  document.getElementById('login-overlay').classList.remove('active');
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  try {
    const data = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(r => r.json());

    if (data.error) {
      errorEl.textContent = `❌ ${data.error}`;
      errorEl.style.display = 'block';
      return;
    }

    state.authToken = data.token;
    state.authUser = data.user;
    closeLoginModal();
    updateAuthUI();
    showToast(`✅ Connecté en tant que ${data.user} (token signé avec APP_SECRET)`, 'success');
    renderNotes();
  } catch (err) {
    errorEl.textContent = `❌ Erreur: ${err.message}`;
    errorEl.style.display = 'block';
  }
}

function logout() {
  state.authToken = null;
  state.authUser = null;
  updateAuthUI();
  showToast('Déconnecté', 'info');
  renderNotes();
}

function updateAuthUI() {
  const btn = document.getElementById('login-btn');
  if (state.authToken) {
    btn.className = 'btn btn-login authenticated';
    btn.innerHTML = `✅ ${state.authUser} <span style="font-size:11px;margin-left:6px;cursor:pointer" onclick="event.stopPropagation();logout()">❌</span>`;
    btn.onclick = null;
  } else {
    btn.className = 'btn btn-login';
    btn.innerHTML = '🔐 Connexion Admin';
    btn.onclick = openLoginModal;
  }
}

// ── Initialisation ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  console.log('%c☸ K8s Demo App', 'font-size:20px;font-weight:bold;color:#7c3aed');
  console.log('%cKHLIFI HOUCEM / FORMATEUR DEVSECOPS & CLOUD', 'color:#8b949e');

  setupUpload();
  await Promise.all([fetchVersion(), fetchHealth(), fetchConfig()]);
  fetchNotes();

  // Rafraîchir la santé toutes les 15s
  setInterval(fetchHealth, 15000);
});
