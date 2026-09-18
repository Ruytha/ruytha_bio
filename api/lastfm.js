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
