/**
 * GET  /api/stats?id=afk-cine-cam                 -> { views, downloads }
 * POST /api/stats?id=afk-cine-cam&event=view      -> counts after +1 view
 * POST /api/stats?id=afk-cine-cam&event=download  -> counts after +1 download
 *
 * Counters live in Upstash Redis (Vercel → Storage → Upstash for Redis).
 * Connecting the store to the project sets these for you:
 *
 *   KV_REST_API_URL / KV_REST_API_TOKEN
 *   (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
 */

// Only these pages can be counted, so nobody can fill the store with junk keys.
const IDS = new Set(['afk-cine-cam']);
const EVENTS = { view: 'views', download: 'downloads' };

module.exports = async function handler(req, res) {
  const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    res.status(503).json({
      error: 'not_configured',
      message: 'Connect an Upstash Redis store to the project in Vercel → Storage.'
    });
    return;
  }

  const id = String(req.query.id || '');
  if (!IDS.has(id)) {
    res.status(404).json({ error: 'unknown_id' });
    return;
  }

  let field = null;
  if (req.method === 'POST') {
    field = EVENTS[req.query.event];
    if (!field) {
      res.status(400).json({ error: 'bad_event' });
      return;
    }
  } else if (req.method !== 'GET') {
    res.setHeader('allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const key = 'stats:' + id;
  const commands = [];
  if (field) commands.push(['HINCRBY', key, field, 1]);
  commands.push(['HMGET', key, 'views', 'downloads']);

  try {
    const upstream = await fetch(url.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(commands)
    });

    if (!upstream.ok) {
      res.status(502).json({ error: 'upstream_error', message: 'Redis returned ' + upstream.status });
      return;
    }

    const results = await upstream.json();
    const [views, downloads] = results[results.length - 1].result || [];

    res.setHeader('cache-control', 'no-store');
    res.status(200).json({
      views: parseInt(views, 10) || 0,
      downloads: parseInt(downloads, 10) || 0
    });
  } catch (err) {
    res.status(502).json({
      error: 'fetch_failed',
      message: err && err.message ? err.message : 'Could not reach Redis'
    });
  }
};
