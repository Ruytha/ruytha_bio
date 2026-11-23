// JSON API for the NyaFM dashboard: setup, login, stats, artwork, import/export.
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import * as core from './core.js';
import { lookup } from './art.js';
import { artistDetails, trackDetails } from './info.js';

export const web = new Hono();
const COOKIE = 'nyafm_sid';
const isPrivate = () => ['1', 'true', 'yes'].includes(String(process.env.NYAFM_PRIVATE || '').toLowerCase());
const now = () => Math.floor(Date.now() / 1000);

async function me(c) {
  const sid = getCookie(c, COOKIE);
  if (sid) {
    const uid = await core.sessionUser(sid);
    if (uid) return core.getUserById(uid);
  }
  const h = c.req.header('authorization') || '';
  const tok = h.replace(/^(token|bearer)\s+/i, '').trim();
  return tok ? core.getUserByToken(tok) : null;
}

async function startSession(c, user) {
  const sid = core.randomToken(24);
  await core.sessionCreate(sid, user.id);
  const https = (c.req.header('x-forwarded-proto') || new URL(c.req.url).protocol).startsWith('https');
  setCookie(c, COOKIE, sid, { httpOnly: true, sameSite: 'Lax', secure: https, path: '/', maxAge: 60 * 60 * 24 * 365 });
}

const requireLogin = async (c, next) => {
  const u = await me(c);
  if (!u) return c.json({ error: 'Login required' }, 401);
  c.set('user', u);
  await next();
};

// Who's profile is being viewed; enforces private mode.
const profile = async (c, next) => {
  const u = await core.getUser(c.req.param('user'));
  if (!u) return c.json({ error: 'User not found' }, 404);
  if (isPrivate()) {
    const viewer = await me(c);
    if (!viewer || viewer.id !== u.id) return c.json({ error: 'This profile is private' }, 401);
  }
  c.set('profile', u);
  await next();
};

const qnum = (c, k, d = null) => { const v = c.req.query(k); return v === undefined || v === '' ? d : Number(v); };

// ------------------------------------------------------------ account
web.get('/status', async (c) => {
  const [count, viewer, first] = await Promise.all([core.userCount(), me(c), core.firstUser()]);
  return c.json({
    setup_needed: count === 0,
    setup_key_required: !!process.env.NYAFM_SETUP_KEY,
    private: isPrivate(),
    default_user: first?.username || null,
    me: viewer ? viewer.username : null,
  });
});

web.post('/setup', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const allowSignup = ['1', 'true', 'yes'].includes(String(process.env.NYAFM_ALLOW_SIGNUP || '').toLowerCase());
  if ((await core.userCount()) > 0 && !allowSignup) return c.json({ error: 'Setup already done. Signups are closed.' }, 403);
  if (process.env.NYAFM_SETUP_KEY && b.setup_key !== process.env.NYAFM_SETUP_KEY) return c.json({ error: 'Wrong setup key.' }, 403);
  try {
    const u = await core.createUser(b.username, b.password);
    await startSession(c, u);
    return c.json({ ok: true, username: u.username });
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

web.post('/login', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const u = await core.authenticate(b.username, b.password);
  if (!u) return c.json({ error: 'Wrong username or password.' }, 401);
  await startSession(c, u);
  return c.json({ ok: true, username: u.username });
});

web.post('/logout', async (c) => {
  const sid = getCookie(c, COOKIE);
  if (sid) await core.sessionDelete(sid);
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
});

web.get('/me', requireLogin, (c) => {
  const u = c.get('user');
  return c.json({ username: u.username, token: u.token, created_at: u.created_at });
});
web.post('/token/regenerate', requireLogin, async (c) => c.json({ token: await core.regenerateToken(c.get('user').id) }));
web.post('/password', requireLogin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!(await core.authenticate(c.get('user').username, b.current))) return c.json({ error: 'Current password is wrong.' }, 401);
  try { await core.changePassword(c.get('user').id, b.new); } catch (e) { return c.json({ error: e.message }, 400); }
  return c.json({ ok: true });
});

// Last.fm desktop auth: approve a token from auth.getToken
web.post('/authorize', requireLogin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const ok = await core.authTokenApprove(b.token || '', c.get('user').id);
  return ok ? c.json({ ok: true }) : c.json({ error: 'Token not found or expired.' }, 400);
});

// ------------------------------------------------------------ stats (per profile)
web.get('/u/:user/summary', profile, async (c) =>
  c.json(await core.summary(c.get('profile').id, { period: c.req.query('period') || 'overall', from: qnum(c, 'from'), to: qnum(c, 'to'), tz: qnum(c, 'tz', 0) })));

web.get('/u/:user/recent', profile, async (c) =>
  c.json(await core.recent(c.get('profile').id, {
    limit: Math.min(qnum(c, 'limit', 50), 500), page: qnum(c, 'page', 1),
    artist: c.req.query('artist') || null, track: c.req.query('track') || null, q: c.req.query('q') || null, from: qnum(c, 'from'), to: qnum(c, 'to'),
  })));

web.get('/u/:user/top/:kind', profile, async (c) => {
  try {
    return c.json(await core.top(c.get('profile').id, c.req.param('kind'), {
      period: c.req.query('period') || 'overall', limit: Math.min(qnum(c, 'limit', 50), 500), page: qnum(c, 'page', 1),
      artist: c.req.query('artist') || null, from: qnum(c, 'from'), to: qnum(c, 'to'),
    }));
  } catch { return c.json({ error: 'kind must be artists, tracks or albums' }, 400); }
});

web.get('/u/:user/timeline', profile, async (c) =>
  c.json(await core.timeline(c.get('profile').id, { days: qnum(c, 'days', 30), tz: qnum(c, 'tz', 0), artist: c.req.query('artist') || null, track: c.req.query('track') || null })));

web.get('/u/:user/artist', profile, async (c) => c.json(await core.artistInfo(c.get('profile').id, c.req.query('name') || '')));
web.get('/u/:user/track', profile, async (c) => c.json(await core.trackInfo(c.get('profile').id, c.req.query('artist') || '', c.req.query('track') || '')));
web.get('/u/:user/nowplaying', profile, async (c) => c.json({ nowplaying: await core.getNowPlaying(c.get('profile').id) }));
web.get('/u/:user/loved', profile, async (c) => c.json(await core.lovedTracks(c.get('profile').id, qnum(c, 'limit', 50), qnum(c, 'page', 1))));

// ------------------------------------------------------------ editing
web.delete('/scrobble/:id', requireLogin, async (c) =>
  c.json({ ok: await core.deleteScrobble(c.get('user').id, Number(c.req.param('id'))) }));

web.post('/love', requireLogin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  await core.setLoved(c.get('user').id, b.artist, b.track, b.loved !== false);
  return c.json({ ok: true });
});

web.post('/import', requireLogin, async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const items = Array.isArray(b.items) ? b.items.slice(0, 2000) : [];
  const res = await core.addScrobbles(c.get('user').id, items, b.source || 'import');
  return c.json({ accepted: res.accepted, ignored: res.ignored });
});

web.get('/export', requireLogin, async (c) => {
  return c.json(await core.exportPage(c.get('user').id, qnum(c, 'after', 0), 5000));
});

// ------------------------------------------------------------ public details about an artist / song (not user data)
const shared = (c) => c.header('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
web.get('/artist-info', async (c) => { shared(c); return c.json(await artistDetails(c.req.query('name'))); });
web.get('/track-info', async (c) => { shared(c); return c.json(await trackDetails(c.req.query('artist'), c.req.query('track'))); });

// ------------------------------------------------------------ artwork (img src target)
web.get('/art', async (c) => {
  const url = await lookup({ artist: c.req.query('artist'), album: c.req.query('album'), track: c.req.query('track'), kind: c.req.query('kind') || 'album' });
  if (!url) return c.body(null, 404, { 'Cache-Control': 'public, max-age=86400' });
  return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'public, max-age=604800' } });
});
