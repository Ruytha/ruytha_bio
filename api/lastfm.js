/**
 * GET /api/lastfm?limit=8
 *
 * Proxies Last.fm's user.getrecenttracks so the API key never reaches the
 * browser. Set these in Vercel → Project → Settings → Environment Variables:
 *
 *   LASTFM_API_KEY   your key from https://www.last.fm/api/account/create
 *   LASTFM_USER      your Last.fm username
 *
 * Responses are cached at the edge for 45s, so refreshing the page a lot
 * won't burn through the rate limit.
 *
 * GET /api/lastfm?view=week
 *   -> { plays, artists: [{ name, plays, url }], tracks: [{ name, artist, plays, url }] }
 *   the last 7 days, cached for 10 minutes.
 */

module.exports = async function handler(req, res) {
  const key  = process.env.LASTFM_API_KEY;
  const user = process.env.LASTFM_USER;

  if (!key || !user) {
    res.status(503).json({
      error: 'not_configured',
      message: 'Set LASTFM_API_KEY and LASTFM_USER in your Vercel environment variables.'
    });
    return;
  }

  if (req.query.view === 'week') {
    await week(req, res, key, user);
    return;
  }

  const limit = Math.min(parseInt(req.query.limit, 10) || 8, 20);

  const url =
    'https://ws.audioscrobbler.com/2.0/' +
    '?method=user.getrecenttracks' +
    '&user=' + encodeURIComponent(user) +
    '&api_key=' + encodeURIComponent(key) +
    '&format=json' +
    '&limit=' + limit +
    '&extended=0';

  try {
    const upstream = await fetch(url, {
      headers: { 'user-agent': 'ruytha-site/1.0 (+https://github.com)' }
    });

    if (!upstream.ok) {
      res.status(502).json({
        error: 'upstream_error',
        message: 'Last.fm returned ' + upstream.status
      });
      return;
    }

    const data = await upstream.json();

    res.setHeader('cache-control', 's-maxage=45, stale-while-revalidate=300');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({
      error: 'fetch_failed',
      message: err && err.message ? err.message : 'Could not reach Last.fm'
    });
  }
};

async function week(req, res, key, user) {
  const base = 'https://ws.audioscrobbler.com/2.0/?format=json&user=' + encodeURIComponent(user) +
    '&api_key=' + encodeURIComponent(key);
  const since = Math.floor(Date.now() / 1000) - 7 * 24 * 3600;
  const get = (q) => fetch(base + q, { headers: { 'user-agent': 'ruytha-site/1.0 (+https://github.com)' } })
    .then((r) => { if (!r.ok) throw new Error('Last.fm returned ' + r.status); return r.json(); });

  try {
    const [artists, tracks, recent] = await Promise.all([
      get('&method=user.gettopartists&period=7day&limit=5'),
      get('&method=user.gettoptracks&period=7day&limit=5'),
      get('&method=user.getrecenttracks&limit=1&from=' + since)
    ]);
    const list = (x) => (x ? (Array.isArray(x) ? x : [x]) : []);
    res.setHeader('cache-control', 's-maxage=600, stale-while-revalidate=3600');
    res.status(200).json({
      plays: parseInt(recent && recent.recenttracks && recent.recenttracks['@attr'] && recent.recenttracks['@attr'].total, 10) || 0,
      artists: list(artists.topartists && artists.topartists.artist).map((a) => ({
        name: a.name, plays: parseInt(a.playcount, 10) || 0, url: a.url
      })),
      tracks: list(tracks.toptracks && tracks.toptracks.track).map((t) => ({
        name: t.name, artist: t.artist && t.artist.name, plays: parseInt(t.playcount, 10) || 0, url: t.url
      }))
    });
  } catch (err) {
    res.status(502).json({ error: 'fetch_failed', message: err && err.message ? err.message : 'Could not reach Last.fm' });
  }
}
