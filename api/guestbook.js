/**
 * GET    /api/guestbook            -> { entries: [{ id, name, msg, sticker, t }] } newest first
 * POST   /api/guestbook            -> { entry }   body: { name, msg, sticker, website }
 * DELETE /api/guestbook?id=<id>    -> { ok: true } (signed-in admins only, same Clerk check as the admin panel)
 *
 * Notes live in the same Upstash Redis store as /api/stats:
 *   KV_REST_API_URL / KV_REST_API_TOKEN
 *   (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
 *
 * Optional: GUESTBOOK_BLOCKED = comma-separated words that get a note rejected.
 */
const crypto = require('crypto');
const { requireAuth } = require('../lib/auth');

const KEY = 'guestbook:entries';
const KEEP = 300;          // oldest notes fall off after this many
const SHOW = 60;           // how many the site shows
const COOLDOWN = 60;       // seconds between notes from the same visitor
const STICKERS = ['💖', '✨', '🎬', '🎧', '🌸', '🦘', '🍙', '⭐'];

function redis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return async function run(commands) {
    const upstream = await fetch(url.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(commands)
    });
    if (!upstream.ok) throw new Error('Redis returned ' + upstream.status);
    return upstream.json();
  };
}

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function blocked(text) {
  if (/(https?:\/\/|www\.|\.(com|net|org|xyz|ru|io|gg)\b)/i.test(text)) return true;   // no links: keeps spam out
  const words = (process.env.GUESTBOOK_BLOCKED || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

function visitorKey(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  // Only a hash is stored, and only for the cooldown.
  return 'guestbook:cooldown:' + crypto.createHash('sha256').update('gb:' + ip).digest('hex').slice(0, 32);
}

function parse(list) {
  return (list || []).map((raw) => {
    try { return JSON.parse(raw); } catch (e) { return null; }
  }).filter(Boolean);
}

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const run = redis();
  if (!run) {
    res.status(503).json({ error: 'not_configured', message: 'Connect an Upstash Redis store to the project in Vercel → Storage.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const [list] = await run([['LRANGE', KEY, 0, SHOW - 1]]);
      res.status(200).json({ entries: parse(list.result) });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body || {};
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

      // Bots fill in every field, people never see this one.
      if (body.website) { res.status(200).json({ entry: null }); return; }

      const name = clean(body.name, 24);
      const msg = clean(body.msg, 160);
      const sticker = STICKERS.includes(body.sticker) ? body.sticker : STICKERS[0];
      if (!name || !msg) { res.status(400).json({ error: 'missing', message: 'Add your name and a message.' }); return; }
      if (blocked(name + ' ' + msg)) { res.status(400).json({ error: 'blocked', message: 'Links and some words aren’t allowed in notes.' }); return; }

      const [slot] = await run([['SET', visitorKey(req), '1', 'EX', COOLDOWN, 'NX']]);
      if (slot.result !== 'OK') { res.status(429).json({ error: 'slow_down', message: 'You just signed! Give it a minute.' }); return; }

      const entry = { id: crypto.randomBytes(6).toString('hex'), name, msg, sticker, t: Date.now() };
      await run([['LPUSH', KEY, JSON.stringify(entry)], ['LTRIM', KEY, 0, KEEP - 1]]);
      res.status(201).json({ entry });
      return;
    }

    if (req.method === 'DELETE') {
      const claims = await requireAuth(req, res);
      if (!claims) return;
      const id = String(req.query.id || '');
      const [list] = await run([['LRANGE', KEY, 0, -1]]);
      const raw = (list.result || []).find((r) => { try { return JSON.parse(r).id === id; } catch (e) { return false; } });
      if (!raw) { res.status(404).json({ error: 'not_found' }); return; }
      await run([['LREM', KEY, 1, raw]]);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('allow', 'GET, POST, DELETE');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    res.status(502).json({ error: 'upstream_error', message: err && err.message ? err.message : 'Could not reach Redis' });
  }
};
