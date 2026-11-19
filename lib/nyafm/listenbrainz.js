// ListenBrainz-compatible API. Web Scrobbler, Pano Scrobbler, Navidrome, Jellyfin, multi-scrobbler etc.
// all let you set a custom ListenBrainz URL: use https://your-host  (endpoints live under /1/)
import { Hono } from 'hono';
import * as core from './core.js';

export const lb = new Hono();

async function auth(c) {
  const h = c.req.header('authorization') || '';
  const token = h.replace(/^(token|bearer)\s+/i, '').trim() || c.req.query('token');
  return core.getUserByToken(token);
}

const err = (c, code, error) => c.json({ code, error }, code);

lb.get('/validate-token', async (c) => {
  const u = await auth(c);
  if (!u) return c.json({ code: 200, message: 'Token invalid.', valid: false });
  return c.json({ code: 200, message: 'Token valid.', valid: true, user_name: u.username });
});

function toItem(l) {
  const m = l.track_metadata || {};
  const info = m.additional_info || {};
  const ms = info.duration_ms ?? (info.duration ? info.duration * 1000 : null);
  return {
    ts: l.listened_at,
    artist: m.artist_name,
    track: m.track_name,
    album: m.release_name || '',
    album_artist: info.release_artist_name || info.albumartist || '',
    duration: ms ? Math.round(ms / 1000) : null,
    cover: info.cover_url || info.image_url || '',
    source: info.submission_client || info.media_player || info.music_service_name || 'listenbrainz-api',
  };
}

lb.post('/submit-listens', async (c) => {
  const u = await auth(c);
  if (!u) return err(c, 401, 'Invalid authorization token.');
  let body;
  try { body = await c.req.json(); } catch { return err(c, 400, 'Invalid JSON document submitted.'); }
  const type = body.listen_type;
  const payload = Array.isArray(body.payload) ? body.payload : [];
  if (!['single', 'import', 'playing_now'].includes(type)) return err(c, 400, 'JSON document must contain listen_type.');
  if (!payload.length) return err(c, 400, 'JSON document does not contain any listens.');
  if (type === 'playing_now') {
    const it = toItem(payload[0]);
    if (!it.artist || !it.track) return err(c, 400, 'artist_name and track_name are required.');
    await core.setNowPlaying(u.id, it);
    return c.json({ status: 'ok' });
  }
  const res = await core.addScrobbles(u.id, payload.map(toItem), 'listenbrainz-api');
  return c.json({ status: 'ok', accepted: res.accepted, ignored: res.ignored });
});

async function viewUser(c) {
  const u = await core.getUser(c.req.param('user'));
  if (!u) return null;
  if (['1', 'true', 'yes'].includes(String(process.env.NYAFM_PRIVATE || '').toLowerCase())) {
    const me = await auth(c);
    if (!me || me.id !== u.id) return false;
  }
  return u;
}

const asListen = (r, u) => ({
  listened_at: r.ts, user_name: u.username,
  track_metadata: { artist_name: r.artist, track_name: r.track, release_name: r.album || null, additional_info: { duration: r.duration || undefined, submission_client: r.source || undefined } },
});

lb.get('/user/:user/listens', async (c) => {
  const u = await viewUser(c);
  if (u === null) return err(c, 404, 'Cannot find user');
  if (u === false) return err(c, 401, 'This profile is private.');
  const count = Math.min(parseInt(c.req.query('count')) || 25, 1000);
  const max = c.req.query('max_ts'), min = c.req.query('min_ts');
  const { rows } = await core.recent(u.id, { limit: count, from: min ? +min + 1 : null, to: max ? +max : null });
  return c.json({ payload: { count: rows.length, user_id: u.username, latest_listen_ts: rows[0]?.ts || 0, listens: rows.map((r) => asListen(r, u)) } });
});

lb.get('/user/:user/playing-now', async (c) => {
  const u = await viewUser(c);
  if (u === null) return err(c, 404, 'Cannot find user');
  if (u === false) return err(c, 401, 'This profile is private.');
  const np = await core.getNowPlaying(u.id);
  const listens = np ? [{ playing_now: true, user_name: u.username, track_metadata: { artist_name: np.artist, track_name: np.track, release_name: np.album || null, additional_info: { duration: np.duration || undefined } } }] : [];
  return c.json({ payload: { count: listens.length, user_id: u.username, playing_now: true, listens } });
});

lb.get('/user/:user/listen-count', async (c) => {
  const u = await viewUser(c);
  if (!u) return err(c, u === null ? 404 : 401, 'Cannot view user');
  const s = await core.summary(u.id);
  return c.json({ payload: { count: s.scrobbles } });
});
