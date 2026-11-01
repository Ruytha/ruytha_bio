/**
 * Minecraft server shops. Each shop has its own price list and its own secret edit key;
 * the site admin (same Clerk check as the admin panel) can create, edit and remove any shop.
 *
 * GET    /api/mc-shops                         -> { shops }            every shop, for the directory and price comparison
 * POST   /api/mc-shops?action=create           -> { shop, editKey }    admin; body { title, owner }
 * POST   /api/mc-shops?action=rotate&slug=x    -> { editKey }          admin; the old key stops working
 * POST   /api/mc-shops?action=verify&slug=x    -> { ok: true }         header x-shop-key
 * PUT    /api/mc-shops?slug=x                  -> { shop }             header x-shop-key, or admin; body { shop }
 * DELETE /api/mc-shops?slug=x                  -> { ok: true }         admin
 *
 * Stored in the same Upstash Redis store as /api/guestbook. Only a hash of each edit key is kept.
 */
const crypto = require('crypto');
const { requireAuth } = require('../lib/auth');

const SET = 'mc:shops';
const shopKey = (slug) => 'mc:shop:' + slug;
const hashKey = (slug) => 'mc:shopkey:' + slug;
const MAX_SHOPS = 50;
const MAX_CATEGORIES = 30;
const MAX_ITEMS = 200;          // per category

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

// A blank price means "not for sale", so it stays null rather than 0.
function price(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function slugify(title) {
  return clean(title, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'shop';
}

function sanitize(shop, slug) {
  if (!shop || typeof shop !== 'object' || !Array.isArray(shop.categories)) return null;
  return {
    slug,
    title: clean(shop.title, 60) || 'Untitled shop',
    owner: clean(shop.owner, 32),
    currency: clean(shop.currency, 16) || 'diamond',
    note: clean(shop.note, 240),
    categories: shop.categories.slice(0, MAX_CATEGORIES).map((c) => ({
      name: clean(c && c.name, 40) || 'Untitled',
      items: (Array.isArray(c && c.items) ? c.items : []).slice(0, MAX_ITEMS).map((it) => ({
        icon: clean(it && it.icon, 40),
        name: clean(it && it.name, 48),
        unit: clean(it && it.unit, 16),
        buy: price(it && it.buy)
      })).filter((it) => it.name)
    })),
    updated: Date.now()
  };
}

const digest = (key) => crypto.createHash('sha256').update('mcshop:' + key).digest('hex');
const newKey = () => crypto.randomBytes(18).toString('base64url');

async function keyMatches(run, slug, key) {
  if (!key) return false;
  const [got] = await run([['GET', hashKey(slug)]]);
  if (!got.result) return false;
  const a = Buffer.from(got.result), b = Buffer.from(digest(key));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parse(raw) { try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  const run = redis();
  if (!run) {
    res.status(503).json({ error: 'not_configured', message: 'Connect an Upstash Redis store to the project in Vercel → Storage.' });
    return;
  }

  const slug = String(req.query.slug || '').replace(/[^a-z0-9-]/g, '').slice(0, 32);
  const action = String(req.query.action || '');
  const key = String(req.headers['x-shop-key'] || '');
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  try {
    if (req.method === 'GET') {
      const [members] = await run([['SMEMBERS', SET]]);
      const slugs = members.result || [];
      if (!slugs.length) { res.status(200).json({ shops: [] }); return; }
      const [got] = await run([['MGET', ...slugs.map(shopKey)]]);
      const shops = (got.result || []).map(parse).filter(Boolean).sort((a, b) => a.title.localeCompare(b.title));
      res.status(200).json({ shops });
      return;
    }

    if (req.method === 'POST' && action === 'verify') {
      if (!slug || !(await keyMatches(run, slug, key))) { res.status(403).json({ error: 'bad_key', message: 'That edit link isn’t valid any more.' }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === 'PUT') {
      if (!slug) { res.status(400).json({ error: 'missing_slug' }); return; }
      if (!key || !(await keyMatches(run, slug, key))) {
        if (key) { res.status(403).json({ error: 'bad_key', message: 'That edit link isn’t valid any more.' }); return; }
        if (!(await requireAuth(req, res))) return;
      }
      const [existing] = await run([['EXISTS', shopKey(slug)]]);
      if (!existing.result) { res.status(404).json({ error: 'not_found', message: 'That shop doesn’t exist.' }); return; }
      const shop = sanitize(body.shop, slug);
      if (!shop) { res.status(400).json({ error: 'invalid', message: 'That price list could not be read.' }); return; }
      await run([['SET', shopKey(slug), JSON.stringify(shop)]]);
      res.status(200).json({ shop });
      return;
    }

    // Everything below is admin-only.
    if (!(await requireAuth(req, res))) return;

    if (req.method === 'POST' && action === 'create') {
      const [count] = await run([['SCARD', SET]]);
      if (count.result >= MAX_SHOPS) { res.status(400).json({ error: 'too_many', message: 'There are already ' + MAX_SHOPS + ' shops.' }); return; }
      const base = slugify(body.title);
      let candidate = base;
      for (let n = 2; ; n++) {
        const [taken] = await run([['SISMEMBER', SET, candidate]]);
        if (!taken.result) break;
        candidate = base.slice(0, 28) + '-' + n;
      }
      const shop = sanitize({ title: body.title, owner: body.owner, currency: 'diamond', note: '', categories: [] }, candidate);
      const editKey = newKey();
      await run([['SET', shopKey(candidate), JSON.stringify(shop)], ['SET', hashKey(candidate), digest(editKey)], ['SADD', SET, candidate]]);
      res.status(201).json({ shop, editKey });
      return;
    }

    if (req.method === 'POST' && action === 'rotate') {
      const [existing] = await run([['EXISTS', shopKey(slug)]]);
      if (!slug || !existing.result) { res.status(404).json({ error: 'not_found' }); return; }
      const editKey = newKey();
      await run([['SET', hashKey(slug), digest(editKey)]]);
      res.status(200).json({ editKey });
      return;
    }

    if (req.method === 'DELETE') {
      if (!slug) { res.status(400).json({ error: 'missing_slug' }); return; }
      await run([['DEL', shopKey(slug), hashKey(slug)], ['SREM', SET, slug]]);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('allow', 'GET, POST, PUT, DELETE');
    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    res.status(502).json({ error: 'upstream_error', message: err && err.message ? err.message : 'Could not reach Redis' });
  }
};
