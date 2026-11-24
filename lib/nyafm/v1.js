// NyaFM REST API v1 — clean JSON for your own apps, widgets, bots and sites.
// Reads are public (unless NYAFM_PRIVATE=1). Writes need:  Authorization: Bearer <your token>
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import * as core from './core.js';
import { lookup } from './art.js';
import { syncAppleMusic } from './applemusic.js';
import { getCookie } from 'hono/cookie';

export const v1 = new Hono();
v1.use('*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));

const fail = (c, status, error) => c.json({ ok: false, error }, status);
const num = (c, k, d = null) => { const v = c.req.query(k); if (v === undefined || v === '') return d; const n = Number(v); return Number.isFinite(n) ? n : d; };
const clampLimit = (c, d = 50) => Math.min(Math.max(num(c, 'limit', d), 1), 500);
const origin = (c) => {
  const u = new URL(c.req.url);
  const proto = c.req.header('x-forwarded-proto') || u.protocol.replace(':', '');
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || u.host;
  return `${proto}://${host}`;
};
const iso = (ts) => (ts ? new Date(ts * 1000).toISOString() : null);

function tokenFrom(c) {
  const h = c.req.header('authorization') || '';
  return h.replace(/^(bearer|token)\s+/i, '').trim() || c.req.query('token') || '';
}
async function authed(c) {
  return core.getUserByToken(tokenFrom(c));
}
// Reading: your token, or being logged in to the dashboard in the same browser.
async function viewer(c) {
  const u = await authed(c);
  if (u) return u;
  const sid = getCookie(c, 'nyafm_sid');
  const uid = sid ? await core.sessionUser(sid) : null;
  return uid ? core.getUserById(uid) : null;
}

// Resolve :user, enforcing private mode
const profile = async (c, next) => {
  const u = await core.getUser(c.req.param('user'));
  if (!u) return fail(c, 404, 'User not found');
  if (await core.isPrivate(u.id)) {
    const me = await viewer(c);
    if (!me || me.id !== u.id) return fail(c, 401, 'This profile is private — send your token');
  }
  c.set('u', u);
  await next();
};
const requireAuth = async (c, next) => {
  const u = await authed(c);
  if (!u) return fail(c, 401, 'Missing or invalid token. Use: Authorization: Bearer <token>');
  c.set('me', u);
  await next();
};

// Image URLs: cached art if we have it, otherwise our /api/art proxy (resolves lazily, cached by CDN)
const cachedArt = (keys) => core.artMany(keys);
function artUrl(c, map, { artist, album, track, kind }) {
  if (kind === 'artist') {
    return map[`artist:${String(artist).toLowerCase()}`] || `${origin(c)}/fm/api/art?kind=artist&artist=${encodeURIComponent(artist)}`;
  }
  return map[core.artKey(artist, album || track)] ||
    `${origin(c)}/fm/api/art?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album || '')}&track=${encodeURIComponent(track || '')}`;
}
const keyFor = (r, kind) => (kind === 'artist' ? `artist:${r.artist.toLowerCase()}` : core.artKey(r.artist, r.album || r.track));

const scrobbleOut = (c, map) => (r) => ({
  id: r.id, artist: r.artist, track: r.track, album: r.album || null, album_artist: r.album_artist || null,
  duration: r.duration ?? null, timestamp: r.ts, date: iso(r.ts), source: r.source || null, image: artUrl(c, map, r),
});
const paging = (page, limit, total) => ({ page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });

// ------------------------------------------------------------------ index
v1.get('/', (c) => c.json({
  name: 'NyaFM API', version: 1, docs: `${origin(c)}/fm#/api`,
  endpoints: [
    'GET  /v1/users/:user', 'GET  /v1/users/:user/now-playing', 'GET  /v1/users/:user/recent',
    'GET  /v1/users/:user/top/:kind  (artists|albums|tracks)', 'GET  /v1/users/:user/stats', 'GET  /v1/users/:user/timeline',
    'GET  /v1/users/:user/artists/:artist', 'GET  /v1/users/:user/track?artist=&track=', 'GET  /v1/users/:user/loved',
    'GET  /v1/users/:user/now-playing.svg', 'GET  /v1/me',
    'POST /v1/scrobbles', 'POST /v1/now-playing', 'DELETE /v1/now-playing', 'DELETE /v1/scrobbles/:id', 'POST /v1/love', 'DELETE /v1/love',
  ],
}));

// ------------------------------------------------------------------ reads
v1.get('/users/:user', profile, async (c) => {
  const u = c.get('u');
  const [s, np] = await Promise.all([core.summary(u.id), core.visibleNowPlaying(u.id, await viewer(c))]);
  return c.json({
    ok: true,
    user: { username: u.username, joined: iso(u.created_at), first_scrobble: iso(s.first_scrobble) },
    totals: { scrobbles: s.scrobbles, artists: s.artists, tracks: s.tracks, albums: s.albums, listening_hours: Math.round(s.listening_seconds / 360) / 10 },
    now_playing: !!np,
  });
});

v1.get('/users/:user/now-playing', profile, async (c) => {
  const u = c.get('u');
  const np = await core.visibleNowPlaying(u.id, await viewer(c));
  if (np) {
    const image = await lookup({ artist: np.artist, album: np.album, track: np.track }).catch(() => null);
    const elapsed = Math.floor(Date.now() / 1000) - np.started_at;
    return c.json({
      ok: true, playing: true,
      track: {
        artist: np.artist, track: np.track, album: np.album || null, duration: np.duration ?? null,
        started_at: iso(np.started_at), elapsed: np.duration ? Math.min(elapsed, np.duration) : elapsed,
        image, source: np.source || null,
      },
    });
  }
  // Nothing playing: return the last scrobble so widgets always have something to show
  const { rows } = await core.recent(u.id, { limit: 1 });
  const last = rows[0];
  if (!last) return c.json({ ok: true, playing: false, track: null });
  const image = await lookup({ artist: last.artist, album: last.album, track: last.track }).catch(() => null);
  return c.json({ ok: true, playing: false, last_played: { artist: last.artist, track: last.track, album: last.album || null, date: iso(last.ts), timestamp: last.ts, image } });
});

v1.get('/users/:user/recent', profile, async (c) => {
  const u = c.get('u');
  const limit = clampLimit(c), page = Math.max(num(c, 'page', 1), 1);
  const { total, rows } = await core.recent(u.id, {
    limit, page, from: num(c, 'from'), to: num(c, 'to'), artist: c.req.query('artist') || null, q: c.req.query('q') || null,
  });
  const map = await cachedArt(rows.map((r) => keyFor(r)));
  return c.json({ ok: true, ...paging(page, limit, total), scrobbles: rows.map(scrobbleOut(c, map)) });
});

v1.get('/users/:user/top/:kind', profile, async (c) => {
  const kind = c.req.param('kind');
  if (!['artists', 'albums', 'tracks'].includes(kind)) return fail(c, 400, 'kind must be artists, albums or tracks');
  const u = c.get('u');
  const limit = clampLimit(c), page = Math.max(num(c, 'page', 1), 1);
  const period = c.req.query('period') || 'overall';
  const { total, rows } = await core.top(u.id, kind, { period, limit, page, from: num(c, 'from'), to: num(c, 'to'), artist: c.req.query('artist') || null });
  const k = kind === 'artists' ? 'artist' : 'album';
  const map = await cachedArt(rows.map((r) => keyFor(r, k)));
  return c.json({
    ok: true, period, ...paging(page, limit, total),
    [kind]: rows.map((r) => ({
      rank: r.rank, artist: r.artist, ...(r.album !== undefined && kind !== 'artists' ? { album: r.album || null } : {}),
      ...(r.track ? { track: r.track } : {}), plays: r.plays, last_played: iso(r.last_ts), image: artUrl(c, map, { ...r, kind: k }),
    })),
  });
});

v1.get('/users/:user/stats', profile, async (c) => {
  const s = await core.summary(c.get('u').id, { period: c.req.query('period') || 'overall', from: num(c, 'from'), to: num(c, 'to'), tz: num(c, 'tz', 0) });
  return c.json({
    ok: true, period: c.req.query('period') || 'overall',
    scrobbles: s.scrobbles, artists: s.artists, tracks: s.tracks, albums: s.albums,
    listening_hours: Math.round(s.listening_seconds / 360) / 10,
    by_hour: s.hours, by_weekday: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d, i) => [d, s.weekdays[i]])),
  });
});

v1.get('/users/:user/timeline', profile, async (c) => {
  const rows = await core.timeline(c.get('u').id, { days: num(c, 'days', 30), tz: num(c, 'tz', 0), artist: c.req.query('artist') || null });
  return c.json({ ok: true, timeline: rows.map((r) => ({ date: r.bucket, plays: r.plays })) });
});

v1.get('/users/:user/artists/:artist', profile, async (c) => {
  const u = c.get('u');
  const name = c.req.param('artist');
  const [info, tracks, albums] = await Promise.all([
    core.artistInfo(u.id, name),
    core.top(u.id, 'tracks', { artist: name, limit: 10 }),
    core.top(u.id, 'albums', { artist: name, limit: 10 }),
  ]);
  if (!info.plays) return fail(c, 404, 'No scrobbles for that artist');
  return c.json({
    ok: true, artist: info.artist, plays: info.plays, rank: info.rank, first_played: iso(info.first_ts), last_played: iso(info.last_ts),
    image: artUrl(c, {}, { artist: info.artist, kind: 'artist' }),
    top_tracks: tracks.rows.map((r) => ({ rank: r.rank, track: r.track, plays: r.plays })),
    top_albums: albums.rows.map((r) => ({ rank: r.rank, album: r.album, plays: r.plays })),
  });
});

v1.get('/users/:user/track', profile, async (c) => {
  const artist = c.req.query('artist'), track = c.req.query('track');
  if (!artist || !track) return fail(c, 400, 'artist and track are required');
  const t = await core.trackInfo(c.get('u').id, artist, track);
  return c.json({
    ok: true, artist: t.artist, track: t.track, album: t.album || null, plays: t.plays || 0, loved: t.loved,
    first_played: iso(t.first_ts), last_played: iso(t.last_ts), duration: t.duration ?? null,
  });
});

v1.get('/users/:user/loved', profile, async (c) => {
  const limit = clampLimit(c), page = Math.max(num(c, 'page', 1), 1);
  const { total, rows } = await core.lovedTracks(c.get('u').id, limit, page);
  return c.json({ ok: true, ...paging(page, limit, total), loved: rows.map((r) => ({ artist: r.artist, track: r.track, date: iso(r.ts) })) });
});

// Embeddable now-playing card: <img src="https://fm.ruytha.dev/v1/users/ruytha/now-playing.svg">
v1.get('/users/:user/now-playing.svg', profile, async (c) => {
  const u = c.get('u');
  const np = await core.visibleNowPlaying(u.id, await viewer(c));
  let item = np, label = 'NOW PLAYING';
  if (!np) { item = (await core.recent(u.id, { limit: 1 })).rows[0]; label = 'LAST PLAYED'; }
  const x = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
  const cut = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
  let img = '';
  if (item) {
    const url = await lookup({ artist: item.artist, album: item.album, track: item.track }).catch(() => null);
    if (url) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
        const b64 = Buffer.from(await r.arrayBuffer()).toString('base64');
        img = `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${b64}`; // inline: GitHub/Discord block external images in SVGs
      } catch { img = ''; }
    }
  }
  const accent = '#' + (c.req.query('accent') || 'ff6fae').replace(/[^0-9a-f]/gi, '').slice(0, 6);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="110" viewBox="0 0 420 110">
  <defs><clipPath id="r"><rect x="15" y="15" width="80" height="80" rx="10"/></clipPath></defs>
  <rect width="420" height="110" rx="16" fill="#18151f" stroke="#2c2738"/>
  ${img ? `<image href="${img}" x="15" y="15" width="80" height="80" clip-path="url(#r)" preserveAspectRatio="xMidYMid slice"/>` : `<rect x="15" y="15" width="80" height="80" rx="10" fill="#211d2b"/><text x="55" y="64" font-size="30" text-anchor="middle">🐾</text>`}
  <g font-family="Segoe UI, system-ui, sans-serif">
    <text x="110" y="34" fill="${accent}" font-size="11" font-weight="700" letter-spacing="1.5">${label}${np ? ' ♪' : ''}</text>
    <text x="110" y="59" fill="#ece8f4" font-size="18" font-weight="700">${x(cut(item?.track || 'Nothing yet', 30))}</text>
    <text x="110" y="80" fill="#9a93aa" font-size="13">${x(cut(item ? item.artist + (item.album ? ' · ' + item.album : '') : '', 44))}</text>
    <text x="405" y="98" fill="#5d5670" font-size="10" text-anchor="end">NyaFM · ${x(u.username)}</text>
  </g></svg>`;
  return c.body(svg, 200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=30' });
});

// ------------------------------------------------------------------ writes
v1.get('/me', requireAuth, (c) => c.json({ ok: true, username: c.get('me').username }));

// Body: one scrobble object, an array of them, or { scrobbles: [...] }  (max 1000)
// Fields: artist*, track*, timestamp (unix secs or ISO, default now), album, album_artist, duration (secs), image
v1.post('/scrobbles', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return fail(c, 400, 'Send a JSON body');
  const list = Array.isArray(body) ? body : Array.isArray(body.scrobbles) ? body.scrobbles : [body];
  if (!list.length || list.length > 1000) return fail(c, 400, 'Send between 1 and 1000 scrobbles');
  const items = list.map((s) => ({
    artist: s.artist, track: s.track, album: s.album, album_artist: s.album_artist, duration: s.duration, cover: s.image,
    ts: typeof s.timestamp === 'string' && !/^\d+$/.test(s.timestamp) ? Math.floor(Date.parse(s.timestamp) / 1000) : s.timestamp,
    source: s.source || 'api-v1',
  }));
  const res = await core.addScrobbles(c.get('me').id, items, 'api-v1');
  return c.json({
    ok: true, accepted: res.accepted, ignored: res.ignored,
    results: res.results.map((r) => ({ artist: r.artist, track: r.track, timestamp: r.ts, accepted: !r.ignored, reason: r.ignored || undefined })),
  }, res.accepted || !res.ignored ? 200 : 422);
});

// Apple Music library play counts from the iPhone Shortcut (see lib/nyafm/applemusic.js for the format)
v1.post('/apple-music', requireAuth, async (c) => {
  const raw = await c.req.text().catch(() => '');
  if (raw.length > 2_000_000) return fail(c, 413, 'Too much at once, send fewer songs');
  const res = await syncAppleMusic(c.get('me').id, raw);
  if (c.req.query('text')) return c.text(res.message, res.ok ? 200 : 400);   // ?text=1: just the sentence, for a notification
  return c.json(res, res.ok ? 200 : 400);
});

v1.post('/now-playing', requireAuth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.artist || !b.track) return fail(c, 400, 'artist and track are required');
  await core.setNowPlaying(c.get('me').id, { artist: b.artist, track: b.track, album: b.album, duration: b.duration, cover: b.image, source: b.source || 'api-v1' });
  return c.json({ ok: true });
});

v1.delete('/now-playing', requireAuth, async (c) => { await core.clearNowPlaying(c.get('me').id); return c.json({ ok: true }); });

v1.delete('/scrobbles/:id', requireAuth, async (c) => {
  const ok = await core.deleteScrobble(c.get('me').id, Number(c.req.param('id')));
  return ok ? c.json({ ok: true }) : fail(c, 404, 'Scrobble not found');
});

v1.post('/love', requireAuth, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!b.artist || !b.track) return fail(c, 400, 'artist and track are required');
  await core.setLoved(c.get('me').id, b.artist, b.track, true);
  return c.json({ ok: true, loved: true });
});
v1.delete('/love', requireAuth, async (c) => {
  const b = await c.req.json().catch(() => ({ artist: c.req.query('artist'), track: c.req.query('track') }));
  await core.setLoved(c.get('me').id, b.artist, b.track, false);
  return c.json({ ok: true, loved: false });
});

v1.notFound((c) => fail(c, 404, 'No such endpoint — see /v1'));
