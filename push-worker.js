/**
 * Novarobashop — Cloudflare Push Worker
 * Deployed at: https://novarobashop-push.novarobashop.workers.dev
 *
 * Unterstützt:
 *  - Einzelner Empfänger:  { token, title, body, icon?, badge?, tag?, data? }
 *  - Multicast (Live):     { tokens: [...], title, body, icon?, badge?, tag?, data? }
 */

const FCM_URL = 'https://fcm.googleapis.com/v1/projects/novarobashop-e2a61/messages:send';

// ── Haupt-Handler ──────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return jsonRes({ error: 'Invalid JSON' }, 400);
    }

    const { token, tokens, title, body, icon, badge, tag, data } = payload;

    // Google OAuth2 Access Token holen
    let accessToken;
    try {
      accessToken = await getAccessToken(env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      return jsonRes({ error: 'Auth failed: ' + e.message }, 500);
    }

    // Notification-Objekt zusammenbauen
    const notification = {
      title: title || 'Novarobashop',
      body:  body  || '',
    };
    const androidConfig = {
      priority: 'high',
      notification: {
        icon:  icon  || '',
        sound: 'default',
        tag:   tag   || 'novarobashop',
        ...(icon ? { image: icon } : {}),
      },
    };
    const webpushConfig = {
      headers: { Urgency: 'high' },
      notification: {
        icon:    icon   || '',
        badge:   badge  || '',
        tag:     tag    || 'novarobashop',
        renotify: true,
        vibrate:  tag === 'chat'     ? [100, 50, 100, 50, 100]
                : tag === 'live'     ? [300, 100, 300]
                : tag === 'racun'    ? [200, 100, 200]
                : tag === 'mahnung'  ? [200, 100, 200, 100, 200]
                : tag === 'blokiran' ? [500, 200, 500, 200, 500]
                :                     [200, 100, 200],
        requireInteraction: tag === 'racun' || tag === 'live' || tag === 'blokiran',
      },
      fcm_options: {
        link: (data && data.url) || 'https://novarobashop-art.github.io/novarobashop-app/novarobashop.html',
      },
    };

    // Einzelner Token
    if (token) {
      const res = await sendFCM(accessToken, {
        token,
        notification,
        android: androidConfig,
        webpush: webpushConfig,
        data: { tab: (data && data.tab) || 'home', tag: tag || '' },
      });
      return jsonRes(res.ok ? { ok: true } : { error: await res.text() }, res.ok ? 200 : 500);
    }

    // Multicast: tokens Array
    if (tokens && tokens.length) {
      const results = await Promise.allSettled(
        tokens.map(t =>
          sendFCM(accessToken, {
            token: t,
            notification,
            android: androidConfig,
            webpush: webpushConfig,
            data: { tab: (data && data.tab) || 'home', tag: tag || '' },
          })
        )
      );
      const ok      = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
      const failed  = results.length - ok;
      return jsonRes({ ok: true, sent: ok, failed });
    }

    return jsonRes({ error: 'Kein token oder tokens angegeben' }, 400);
  },
};

// ── FCM-Anfrage senden ─────────────────────────────────────────────────────
async function sendFCM(accessToken, message) {
  return fetch(FCM_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + accessToken,
    },
    body: JSON.stringify({ message }),
  });
}

// ── Google OAuth2 Access Token via Service Account ─────────────────────────
async function getAccessToken(serviceAccountJson) {
  const sa  = typeof serviceAccountJson === 'string'
    ? JSON.parse(serviceAccountJson)
    : serviceAccountJson;

  const now = Math.floor(Date.now() / 1000);
  const header  = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimset = btoa(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }));

  const unsigned = `${header}.${claimset}`;
  const key      = await importPrivateKey(sa.private_key);
  const sig      = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;

  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:   `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(json.error || 'No access_token');
  return json.access_token;
}

async function importPrivateKey(pem) {
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

// ── Hilfsfunktionen ────────────────────────────────────────────────────────
function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
