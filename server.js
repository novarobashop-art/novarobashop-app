const express = require('express');
const { WebcastPushConnection } = require('tiktok-live-connector');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = express();
app.use(express.json());

// ── CORS ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── API Token Auth ──
// Setzt SERVER_SECRET als Umgebungsvariable (z.B. in Railway)
const SERVER_SECRET = process.env.SERVER_SECRET || '';
function requireAuth(req, res, next) {
  if (!SERVER_SECRET) return next(); // kein Secret gesetzt → offen (Entwicklungsmodus)
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== SERVER_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Rate Limiting (einfach, ohne externe Bibliothek) ──
const rateLimitMap = {};
function rateLimit(maxReq = 10, windowMs = 60000) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    if (!rateLimitMap[ip]) rateLimitMap[ip] = [];
    rateLimitMap[ip] = rateLimitMap[ip].filter(t => now - t < windowMs);
    if (rateLimitMap[ip].length >= maxReq) {
      return res.status(429).json({ error: 'Too many requests. Please wait.' });
    }
    rateLimitMap[ip].push(now);
    next();
  };
}
// Alle 5 Minuten alten Rate-Limit-Cache leeren
setInterval(() => {
  const now = Date.now();
  for (const ip of Object.keys(rateLimitMap)) {
    rateLimitMap[ip] = rateLimitMap[ip].filter(t => now - t < 60000);
    if (!rateLimitMap[ip].length) delete rateLimitMap[ip];
  }
}, 5 * 60 * 1000);

// ── Firebase Admin ──
let db;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  if (!serviceAccount.project_id) throw new Error('FIREBASE_SERVICE_ACCOUNT nicht gesetzt oder ungültig');
  initializeApp({ credential: cert(serviceAccount) });
  db = getFirestore();
  console.log('✅ Firebase connected');
} catch(e) {
  console.error('❌ Firebase error:', e.message);
  console.warn('⚠️  Server läuft ohne Firebase — Chat wird nicht gespeichert');
}

// ── Aktive TikTok Verbindungen ──
// { adminId: { connection, tiktokUsername, connectedAt, msgCount, reconnectTimer, reconnectAttempts } }
const connections = {};

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 5000;

// ── Datum-Diff in Tagen (DST-sicher) ──
function diffInDays(dateA, dateB) {
  const a = new Date(dateA); a.setHours(0, 0, 0, 0);
  const b = new Date(dateB); b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

// ── TikTok Verbindung aufbauen ──
function buildConnection(adminId, tiktokUsername) {
  const conn = connections[adminId];
  if (!conn) return;

  const connection = new WebcastPushConnection(tiktokUsername, {
    processInitialData: false,
    enableExtendedGiftInfo: false,
    enableWebsocketUpgrade: true,
    requestPollingIntervalMs: 2000,
    sessionId: process.env.TIKTOK_SESSION_ID || '',
  });

  // ── Chat ──
  connection.on('chat', async (data) => {
    try {
      const tiktokId  = data.uniqueId || data.userId?.toString() || 'unknown';
      const comment   = data.comment  || '';
      const timestamp = new Date();

      let statusColor = 'red';
      let kupacName   = '';
      let kupacId     = '';
      let tiktokNick  = '';

      if (db) {
        const snap = await db.collection('users')
          .where('role', '==', 'kupac')
          .where('tiktokIme', '==', tiktokId.toLowerCase())
          .limit(1).get();

        if (!snap.empty) {
          const kupac = snap.docs[0].data();
          kupacName  = kupac.name || kupac.tiktokNick || '';
          kupacId    = snap.docs[0].id;
          tiktokNick = kupac.tiktokNick || '';

          const racuniSnap = await db.collection('racuni')
            .where('adminId', '==', adminId)
            .where('kupacId', '==', kupacId)
            .where('status', '==', 'novo')
            .limit(5).get();

          const today = new Date();
          let kasni = false;
          racuniSnap.forEach(r => {
            const d = r.data();
            if (d.datum) {
              const diff = diffInDays(today, new Date(d.datum));
              if (diff >= 3) kasni = true;
            }
          });
          statusColor = kasni ? 'orange' : 'green';
        }

        await db.collection('live_chat').add({
          adminId,
          tiktokId,
          kupacId,
          kupacName,
          tiktokNick,
          comment,
          statusColor,
          timestamp,
        });
      }

      if (connections[adminId]) connections[adminId].msgCount++;
      console.log(`💬 @${tiktokId} [${statusColor}]: ${comment}`);
    } catch(e) {
      console.error('Chat error:', e.message);
    }
  });

  // ── Gift ──
  connection.on('gift', (data) => {
    console.log(`🎁 Gift von @${data.uniqueId}: ${data.giftName}`);
  });

  // ── Error ──
  connection.on('error', (err) => {
    console.error(`❌ Fehler für admin ${adminId}:`, err.message);
  });

  // ── Disconnect → Auto-Reconnect ──
  connection.on('disconnected', () => {
    console.log(`🔌 Getrennt: admin ${adminId}`);
    if (!connections[adminId]) return; // manuell gestoppt → kein Reconnect

    const attempts = connections[adminId].reconnectAttempts || 0;
    if (attempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn(`⛔ Max. Reconnect-Versuche für admin ${adminId} erreicht. Aufgegeben.`);
      delete connections[adminId];
      return;
    }

    const delay = RECONNECT_DELAY_MS * Math.pow(2, attempts); // exponential backoff
    console.log(`🔄 Reconnect in ${delay / 1000}s für admin ${adminId} (Versuch ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);

    connections[adminId].reconnectAttempts = attempts + 1;
    connections[adminId].reconnectTimer = setTimeout(async () => {
      if (!connections[adminId]) return;
      try {
        await connections[adminId].connection.connect();
        connections[adminId].reconnectAttempts = 0;
        console.log(`✅ Reconnect erfolgreich für admin ${adminId}`);
      } catch(e) {
        console.error(`❌ Reconnect fehlgeschlagen für admin ${adminId}:`, e.message);
      }
    }, delay);
  });

  return connection;
}

// ── Health Check ──
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Novarobashop TikTok Live Server',
    firebase: db ? 'connected' : 'disconnected',
    active: Object.keys(connections).length,
    uptime: Math.floor(process.uptime()) + 's',
  });
});

// ── Start Live ──
app.post('/start-live', requireAuth, rateLimit(10, 60000), async (req, res) => {
  const { adminId, tiktokUsername } = req.body;
  if (!adminId || !tiktokUsername) {
    return res.status(400).json({ error: 'adminId and tiktokUsername required' });
  }

  // Alte Verbindung sauber beenden
  if (connections[adminId]) {
    clearTimeout(connections[adminId].reconnectTimer);
    try { connections[adminId].connection.disconnect(); } catch(e) {}
    delete connections[adminId];
  }

  console.log(`🔴 Start live: admin ${adminId} → @${tiktokUsername}`);

  try {
    connections[adminId] = {
      connection: null,
      tiktokUsername,
      connectedAt: new Date().toISOString(),
      msgCount: 0,
      reconnectAttempts: 0,
      reconnectTimer: null,
    };

    const connection = buildConnection(adminId, tiktokUsername);
    connections[adminId].connection = connection;

    await connection.connect();
    console.log(`✅ Verbunden mit @${tiktokUsername}`);
    res.json({ success: true, message: `Verbunden mit @${tiktokUsername}` });

  } catch(e) {
    console.error('Connect error:', e.message);
    delete connections[adminId];
    res.status(500).json({ error: e.message });
  }
});

// ── Stop Live ──
app.post('/stop-live', requireAuth, (req, res) => {
  const { adminId } = req.body;
  if (connections[adminId]) {
    clearTimeout(connections[adminId].reconnectTimer);
    try { connections[adminId].connection.disconnect(); } catch(e) {}
    delete connections[adminId];
    console.log(`⏹️ Live gestoppt für admin ${adminId}`);
  }
  res.json({ success: true });
});

// ── Status (erweitert) ──
app.get('/status', (req, res) => {
  const details = Object.entries(connections).map(([adminId, c]) => ({
    adminId,
    tiktokUsername: c.tiktokUsername,
    connectedAt: c.connectedAt,
    msgCount: c.msgCount,
    reconnectAttempts: c.reconnectAttempts,
  }));
  res.json({
    count: details.length,
    firebase: db ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()) + 's',
    connections: details,
  });
});

// ── Graceful Shutdown ──
function gracefulShutdown(signal) {
  console.log(`\n⏳ ${signal} empfangen. Trenne alle Verbindungen...`);
  for (const [adminId, c] of Object.entries(connections)) {
    clearTimeout(c.reconnectTimer);
    try { c.connection.disconnect(); } catch(e) {}
    console.log(`🔌 Admin ${adminId} getrennt`);
  }
  console.log('✅ Alle Verbindungen getrennt. Server wird beendet.');
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// ── Server Start ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
  if (!SERVER_SECRET) {
    console.warn('⚠️  SERVER_SECRET nicht gesetzt — Endpunkte sind offen!');
  }
});
