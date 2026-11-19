// Server-side Spotify sync: no Spicetify needed. Polls Spotify's Web API for what you played
// and writes it into NyaFM (scrobbles + now playing). Duplicates are skipped automatically,
// so it is safe to call /sync as often as you like.
//
// Env: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET  (developer.spotify.com/dashboard)
//      CRON_SECRET  (any long random string; lets a cron/pinger call /sync without a login)
// Spotify redirect URI to register:  https://YOURDOMAIN/fm/api/spotify/callback
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import * as core from './core.js';
import { cmd, P, useRedis } from './redis.js';

export const spotify = new Hono();

const COOKIE = 'nyafm_sid';
const SCOPES = 'user-read-recently-played user-read-currently-playing';
const KEY = () => `${P()}spotify`;
const configured = () => !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

const origin = (c) => {
  const u = new URL(c.req.url);
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || u.host;
  const proto = (c.req.header('x-forwarded-proto') || u.protocol.replace(':', '')).split(',')[0];
  return `${proto}://${host}`;
};
const redirectUri = (c) => `${origin(c)}/fm/api/spotify/callback`;

async function sessionUser(c) {
  const sid = getCookie(c, COOKIE);
  const uid = sid ? await core.sessionUser(sid) : 0;
  return uid ? core.getUserById(uid) : null;
}

const basic = () =>
  'Basic ' + Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');

async function tokenRequest(params) {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: basic(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Spotify token: ${j.error_description || j.error || r.status}`);
  return j;
}

async function link() {
  const h = await cmd('HGETALL', KEY());
  if (!Array.isArray(h) || !h.length) return null;
  const o = {};
  for (let i = 0; i < h.length; i += 2) o[h[i]] = h[i + 1];
  return o.refresh ? o : null;
}

const secretOk = (c) => {
  const s = process.env.CRON_SECRET;
  if (!s) return false;
  const h = (c.req.header('authorization') || '').replace(/^bearer\s+/i, '').trim();
  return h === s || c.req.query('key') === s;
};

// ---- connect (must be logged in to NyaFM)
spotify.get('/connect', async (c) => {
  if (!configured()) return c.text('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Vercel first.', 503);
  if (!useRedis()) return c.text('Spotify sync needs the Upstash Redis backend.', 503);
  const user = await sessionUser(c);
  if (!user) return c.redirect('/fm#/settings');
  const state = core.randomToken(16);
  setCookie(c, 'nyafm_sp_state', state, { httpOnly: true, sameSite: 'Lax', secure: true, path: '/', maxAge: 600 });
  const q = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(c),
    scope: SCOPES,
    state,
    show_dialog: 'true',
  });
  return c.redirect(`https://accounts.spotify.com/authorize?${q}`);
});

spotify.get('/callback', async (c) => {
  const user = await sessionUser(c);
  if (!user) return c.text('Log in to NyaFM first.', 401);
  const state = c.req.query('state');
  if (!state || state !== getCookie(c, 'nyafm_sp_state')) return c.text('State mismatch, try connecting again.', 400);
  if (c.req.query('error')) return c.text(`Spotify said: ${c.req.query('error')}`, 400);
  const t = await tokenRequest({
    grant_type: 'authorization_code',
    code: c.req.query('code') || '',
    redirect_uri: redirectUri(c),
  });
  await cmd('HSET', KEY(), 'refresh', t.refresh_token, 'uid', String(user.id), 'connected_at', String(Math.floor(Date.now() / 1000)));
  return c.redirect('/fm#/settings');
});

spotify.get('/status', async (c) => {
  const user = await sessionUser(c);
  if (!user) return c.json({ error: 'Login required' }, 401);
  const l = useRedis() ? await link() : null;
  return c.json({
    configured: configured(),
    cron_secret_set: !!process.env.CRON_SECRET,
    connected: !!l,
    last_sync: l?.last_sync ? Number(l.last_sync) : null,
    last_count: l?.last_count ? Number(l.last_count) : null,
    redirect_uri: redirectUri(c),
  });
});

spotify.post('/disconnect', async (c) => {
  if (!(await sessionUser(c))) return c.json({ error: 'Login required' }, 401);
  await cmd('DEL', KEY());
  return c.json({ ok: true });
});

// ---- sync (logged in, or Authorization: Bearer CRON_SECRET / ?key=CRON_SECRET)
async function sync(c) {
  if (!secretOk(c) && !(await sessionUser(c))) return c.json({ error: 'Not allowed' }, 401);
  if (!configured() || !useRedis()) return c.json({ error: 'Spotify not configured' }, 503);
  const l = await link();
  if (!l) return c.json({ error: 'Spotify not connected' }, 409);
  const uid = Number(l.uid);

  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: l.refresh });
  if (t.refresh_token && t.refresh_token !== l.refresh) await cmd('HSET', KEY(), 'refresh', t.refresh_token);
  const auth = { Authorization: `Bearer ${t.access_token}` };
  const cover = (a) => a?.images?.[1]?.url || a?.images?.[0]?.url;

  // Finished plays. Dedup is by (time, artist, track), so repeats are ignored.
  const rp = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', { headers: auth });
  if (!rp.ok) return c.json({ error: `Spotify recently-played: ${rp.status}` }, 502);
  const items = ((await rp.json()).items || [])
    .filter((i) => i.track && !i.track.is_local && (i.track.duration_ms || 0) >= 30000)
    .map((i) => ({
      artist: i.track.artists?.[0]?.name,
      track: i.track.name,
      album: i.track.album?.name,
      album_artist: i.track.album?.artists?.[0]?.name,
      duration: Math.round((i.track.duration_ms || 0) / 1000),
      ts: Math.floor(new Date(i.played_at).getTime() / 1000),
      cover: cover(i.track.album),
    }));
  const res = items.length ? await core.addScrobbles(uid, items, 'spotify-sync') : { accepted: 0 };

  // Now playing
  let playing = null;
  const np = await fetch('https://api.spotify.com/v1/me/player/currently-playing', { headers: auth });
  if (np.status === 200) {
    const j = await np.json().catch(() => null);
    if (j?.is_playing && j.item && j.currently_playing_type === 'track') {
      playing = `${j.item.artists?.[0]?.name} - ${j.item.name}`;
      const remaining = Math.max(10, Math.round(((j.item.duration_ms || 0) - (j.progress_ms || 0)) / 1000));
      await core.setNowPlaying(uid, {
        artist: j.item.artists?.[0]?.name,
        track: j.item.name,
        album: j.item.album?.name,
        duration: remaining,
        cover: cover(j.item.album),
        source: 'spotify-sync',
      });
    }
  }
  if (!playing) await core.clearNowPlaying(uid);

  await cmd('HSET', KEY(), 'last_sync', String(Math.floor(Date.now() / 1000)), 'last_count', String(res.accepted || 0));
  return c.json({ ok: true, new_scrobbles: res.accepted || 0, now_playing: playing });
}
spotify.get('/sync', sync);
spotify.post('/sync', sync);
