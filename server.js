const express = require('express');
const { WebcastPushConnection } = require('tiktok-live-connector');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = express();
app.use(express.json());

// ── CORS — dozvoli sve domene ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ── Firebase Admin (service account aus ENV) ──
let db;
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
  db = getFirestore();
  console.log('✅ Firebase connected');
} catch(e) {
  console.error('❌ Firebase error:', e.message);
}

// ── Aktive TikTok Verbindungen ──
const connections = {}; // { adminId: WebcastPushConnection }

// ── Health check ──
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Novarobashop TikTok Live Server',
    active: Object.keys(connections).length
  });
});

// ── Start Live ──
app.post('/start-live', async (req, res) => {
  const { adminId, tiktokUsername } = req.body;
  if (!adminId || !tiktokUsername) {
    return res.status(400).json({ error: 'adminId and tiktokUsername required' });
  }

  // Zaustavi staru konekciju ako postoji
  if (connections[adminId]) {
    try { connections[adminId].disconnect(); } catch(e) {}
    delete connections[adminId];
  }

  console.log(`🔴 Starting live for admin ${adminId} → @${tiktokUsername}`);

  try {
    const connection = new WebcastPushConnection(tiktokUsername, {
      processInitialData: false,
      enableExtendedGiftInfo: false,
      enableWebsocketUpgrade: true,
      requestPollingIntervalMs: 2000,
    });

    // ── Chat komenntar ──
    connection.on('chat', async (data) => {
      try {
        const tiktokId   = data.uniqueId || data.userId?.toString() || 'unknown';
        const comment    = data.comment  || '';
        const timestamp  = new Date();

        // Provjeri da li je registrovan kupac
        let statusColor = 'red'; // default: nije registrovan
        let kupacName   = '';
        let kupacId     = '';

        if (db) {
          // Traži po tiktokIme
          const snap = await db.collection('users')
            .where('role', '==', 'kupac')
            .where('tiktokIme', '==', tiktokId.toLowerCase())
            .limit(1).get();

          if (!snap.empty) {
            const kupac = snap.docs[0].data();
            kupacName = kupac.name || kupac.tiktokNick || '';
            kupacId   = snap.docs[0].id;

            // Provjeri da li kasni
            const racuniSnap = await db.collection('racuni')
              .where('adminId', '==', adminId)
              .where('kupacId', '==', kupacId)
              .where('status', '==', 'novo')
              .limit(5).get();

            const today = new Date(); today.setHours(0,0,0,0);
            let kasni = false;
            racuniSnap.forEach(r => {
              const d = r.data();
              if (d.datum) {
                const diff = Math.floor((today - new Date(d.datum)) / (1000*60*60*24));
                if (diff >= 3) kasni = true;
              }
            });
            statusColor = kasni ? 'orange' : 'green';
          }

          // Sačuvaj u Firebase
          await db.collection('live_chat').add({
            adminId,
            tiktokId,
            kupacId,
            kupacName,
            comment,
            statusColor,
            timestamp: timestamp,
          });
        }

        console.log(`💬 @${tiktokId} [${statusColor}]: ${comment}`);
      } catch(e) {
        console.error('Chat error:', e.message);
      }
    });

    // ── Gift ──
    connection.on('gift', async (data) => {
      console.log(`🎁 Gift from @${data.uniqueId}: ${data.giftName}`);
    });

    // ── Disconnect ──
    connection.on('disconnected', () => {
      console.log(`🔌 Disconnected: admin ${adminId}`);
      delete connections[adminId];
    });

    // ── Error ──
    connection.on('error', (err) => {
      console.error(`❌ Error for admin ${adminId}:`, err.message);
    });

    await connection.connect();
    connections[adminId] = connection;
    console.log(`✅ Connected to @${tiktokUsername}`);
    res.json({ success: true, message: `Connected to @${tiktokUsername}` });

  } catch(e) {
    console.error('Connect error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Stop Live ──
app.post('/stop-live', (req, res) => {
  const { adminId } = req.body;
  if (connections[adminId]) {
    try { connections[adminId].disconnect(); } catch(e) {}
    delete connections[adminId];
    console.log(`⏹️ Stopped live for admin ${adminId}`);
  }
  res.json({ success: true });
});

// ── Status ──
app.get('/status', (req, res) => {
  res.json({
    active: Object.keys(connections),
    count: Object.keys(connections).length
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
