// ============================================================
// K8s Demo App - Backend Server
// Auteur: KHLIFI HOUCEM / FORMATEUR DEVSECOPS & CLOUD
// Description: API REST pour gestion de notes avec stockage
//              persistant, upload de fichiers, et endpoints
//              de santé/configuration pour démo Kubernetes.
// ============================================================

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const app = express();

// ── Configuration (injectée via ConfigMap & Secret K8s) ─────
const APP_NAME = process.env.APP_NAME || 'K8s Demo Notes';
const APP_ENV = process.env.APP_ENV || 'development';
const APP_VERSION = process.env.APP_VERSION || '1.0.0';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const STORAGE_PATH = process.env.STORAGE_PATH || './data';
const FEATURE_UPLOAD_ENABLED = (process.env.FEATURE_UPLOAD_ENABLED || 'true') === 'true';
const APP_SECRET = process.env.APP_SECRET || 'default-secret';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const PORT = parseInt(process.env.PORT || '3000', 10);

// ── Chemins de stockage ─────────────────────────────────────
const NOTES_FILE = path.join(STORAGE_PATH, 'notes.json');
const UPLOADS_DIR = path.join(STORAGE_PATH, 'uploads');
const startTime = new Date();

// Créer les répertoires nécessaires
fs.mkdirSync(STORAGE_PATH, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Fonctions utilitaires ───────────────────────────────────
function generateId() {
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function readNotes() {
  try {
    if (fs.existsSync(NOTES_FILE)) {
      return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('[ERROR] Lecture notes:', err.message);
  }
  return [];
}

function writeNotes(notes) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2), 'utf-8');
}

function log(level, message) {
  const levels = { error: 0, warn: 1, info: 2, debug: 3 };
  if (levels[level] <= levels[LOG_LEVEL]) {
    console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
  }
}

// ── Authentification (utilise APP_SECRET et ADMIN_PASSWORD) ─
// Génère un token HMAC signé avec APP_SECRET (depuis le Secret K8s)
function generateToken(username) {
  const payload = JSON.stringify({
    user: username,
    iat: Date.now(),
    exp: Date.now() + 3600000, // 1 heure
  });
  const payloadB64 = Buffer.from(payload).toString('base64');
  const signature = crypto.createHmac('sha256', APP_SECRET).update(payloadB64).digest('hex');
  return `${payloadB64}.${signature}`;
}

// Vérifie un token signé avec APP_SECRET
function verifyToken(token) {
  try {
    const [payloadB64, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', APP_SECRET).update(payloadB64).digest('hex');
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Middleware d'authentification
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise. Connectez-vous d\'abord.' });
  }
  const token = authHeader.substring(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Token invalide ou expiré. Reconnectez-vous.' });
  }
  req.user = payload;
  next();
}

// ── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  log('info', `${req.method} ${req.url} - ${req.ip}`);
  next();
});

// ── Authentification API ────────────────────────────────────

// Login - vérifie le mot de passe ADMIN_PASSWORD (depuis le Secret K8s)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Nom d\'utilisateur et mot de passe requis' });
  }
  // ADMIN_PASSWORD provient du Secret Kubernetes
  if (password !== ADMIN_PASSWORD) {
    log('warn', `Tentative de login échouée pour: ${username}`);
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }
  // Générer un token signé avec APP_SECRET (depuis le Secret K8s)
  const token = generateToken(username);
  log('info', `Login réussi pour: ${username}`);
  res.json({
    message: 'Connexion réussie',
    user: username,
    token,
    expiresIn: '1h',
    secretUsed: 'APP_SECRET (HMAC-SHA256)',
  });
});

// Vérifier le statut d'authentification
app.get('/api/auth/status', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ authenticated: false });
  }
  const payload = verifyToken(authHeader.substring(7));
  if (!payload) {
    return res.json({ authenticated: false, reason: 'Token expiré ou invalide' });
  }
  res.json({
    authenticated: true,
    user: payload.user,
    expiresAt: new Date(payload.exp).toISOString(),
    tokenSignedWith: 'APP_SECRET (K8s Secret)',
  });
});

// ── Endpoints de santé et configuration ─────────────────────

// Health check (utilisé par readinessProbe/livenessProbe K8s)
app.get('/health', (req, res) => {
  const storageOk = fs.existsSync(STORAGE_PATH);
  res.status(storageOk ? 200 : 503).json({
    status: storageOk ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    storage: storageOk ? 'accessible' : 'unavailable',
    hostname: os.hostname(),
  });
});

// Version de l'application
app.get('/version', (req, res) => {
  res.json({
    app: APP_NAME,
    version: APP_VERSION,
    environment: APP_ENV,
    node: process.version,
    hostname: os.hostname(),
    startedAt: startTime.toISOString(),
    author: 'KHLIFI HOUCEM / FORMATEUR DEVSECOPS & CLOUD',
  });
});

// Configuration non sensible (ConfigMap visible, Secret masqué)
app.get('/config', (req, res) => {
  res.json({
    APP_NAME,
    APP_ENV,
    APP_VERSION,
    LOG_LEVEL,
    STORAGE_PATH,
    FEATURE_UPLOAD_ENABLED,
    PORT,
    APP_SECRET: '●●●●●●●●',
    ADMIN_PASSWORD: '●●●●●●●●',
  });
});

// Info runtime complète
app.get('/info', (req, res) => {
  res.json({
    config: {
      APP_NAME, APP_ENV, APP_VERSION, LOG_LEVEL,
      STORAGE_PATH, FEATURE_UPLOAD_ENABLED,
    },
    runtime: {
      hostname: os.hostname(),
      platform: process.platform,
      arch: os.arch(),
      nodeVersion: process.version,
      uptime: Math.floor(process.uptime()),
      memory: {
        total: `${Math.round(os.totalmem() / 1024 / 1024)} MB`,
        free: `${Math.round(os.freemem() / 1024 / 1024)} MB`,
        usage: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
      },
      pid: process.pid,
      cpus: os.cpus().length,
    },
    author: 'KHLIFI HOUCEM / FORMATEUR DEVSECOPS & CLOUD',
  });
});

// ── API CRUD - Notes ────────────────────────────────────────

// Lister toutes les notes
app.get('/api/notes', (req, res) => {
  const notes = readNotes();
  res.json({ count: notes.length, notes });
});

// Récupérer une note par ID
app.get('/api/notes/:id', (req, res) => {
  const notes = readNotes();
  const note = notes.find(n => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: 'Note introuvable' });
  res.json(note);
});

// Créer une note
app.post('/api/notes', (req, res) => {
  const { title, content, category } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Le titre est requis' });
  }
  const notes = readNotes();
  const note = {
    id: generateId(),
    title: title.trim(),
    content: content || '',
    category: category || 'general',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  notes.push(note);
  writeNotes(notes);
  log('info', `Note créée: ${note.id} - ${note.title}`);
  res.status(201).json(note);
});

// Modifier une note
app.put('/api/notes/:id', (req, res) => {
  const notes = readNotes();
  const idx = notes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Note introuvable' });

  const { title, content, category } = req.body;
  if (title !== undefined) notes[idx].title = title.trim();
  if (content !== undefined) notes[idx].content = content;
  if (category !== undefined) notes[idx].category = category;
  notes[idx].updatedAt = new Date().toISOString();

  writeNotes(notes);
  log('info', `Note modifiée: ${notes[idx].id}`);
  res.json(notes[idx]);
});

// Supprimer une note (protégé par authentification)
app.delete('/api/notes/:id', requireAuth, (req, res) => {
  const notes = readNotes();
  const idx = notes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Note introuvable' });

  const deleted = notes.splice(idx, 1)[0];
  writeNotes(notes);
  log('info', `Note supprimée par ${req.user.user}: ${deleted.id}`);
  res.json({ message: 'Note supprimée', note: deleted });
});

// ── API Upload de fichiers ──────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!FEATURE_UPLOAD_ENABLED) {
    return res.status(403).json({ error: 'Upload désactivé par configuration' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Aucun fichier fourni' });
  }
  log('info', `Fichier uploadé: ${req.file.originalname} (${req.file.size} bytes)`);
  res.status(201).json({
    message: 'Fichier uploadé avec succès',
    file: {
      name: req.file.originalname,
      storedName: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    },
  });
});

app.get('/api/files', (req, res) => {
  if (!FEATURE_UPLOAD_ENABLED) {
    return res.status(403).json({ error: 'Upload désactivé' });
  }
  try {
    const files = fs.readdirSync(UPLOADS_DIR).map(name => {
      const stats = fs.statSync(path.join(UPLOADS_DIR, name));
      return { name, size: stats.size, createdAt: stats.birthtime };
    });
    res.json({ count: files.length, files });
  } catch {
    res.json({ count: 0, files: [] });
  }
});

app.get('/api/files/:filename', (req, res) => {
  const filePath = path.join(UPLOADS_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Fichier introuvable' });
  }
  res.download(filePath);
});

app.delete('/api/files/:filename', requireAuth, (req, res) => {
  const filePath = path.join(UPLOADS_DIR, path.basename(req.params.filename));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Fichier introuvable' });
  }
  fs.unlinkSync(filePath);
  log('info', `Fichier supprimé par ${req.user.user}: ${req.params.filename}`);
  res.json({ message: 'Fichier supprimé' });
});

// ── Statistiques ────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const notes = readNotes();
  let filesCount = 0, filesSize = 0;
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    filesCount = files.length;
    files.forEach(f => {
      filesSize += fs.statSync(path.join(UPLOADS_DIR, f)).size;
    });
  } catch {}
  res.json({
    notes: {
      total: notes.length,
      categories: notes.reduce((acc, n) => {
        acc[n.category] = (acc[n.category] || 0) + 1;
        return acc;
      }, {}),
    },
    files: { total: filesCount, totalSize: filesSize },
    hostname: os.hostname(),
  });
});

// ── Démarrage du serveur ────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  ${APP_NAME.padEnd(54)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Environnement : ${APP_ENV.padEnd(38)}║`);
  console.log(`║  Port          : ${String(PORT).padEnd(38)}║`);
  console.log(`║  Stockage      : ${STORAGE_PATH.padEnd(38)}║`);
  console.log(`║  Upload        : ${(FEATURE_UPLOAD_ENABLED ? 'activé' : 'désactivé').padEnd(38)}║`);
  console.log(`║  Log Level     : ${LOG_LEVEL.padEnd(38)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Auteur: KHLIFI HOUCEM / FORMATEUR DEVSECOPS & CLOUD   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
});
