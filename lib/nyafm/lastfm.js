// Last.fm / Audioscrobbler 2.0-compatible API at /2.0/
// Point any "custom Last.fm / Libre.fm / GNU FM" scrobbler at https://your-host/2.0/
import * as core from './core.js';

const PRIVATE = () => ['1', 'true', 'yes'].includes(String(process.env.NYAFM_PRIVATE || '').toLowerCase());

class LfmError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ---------- XML output (Last.fm's default format)
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function toXml(name, v) {
  if (Array.isArray(v)) return v.map((x) => toXml(name, x)).join('');
  if (v === null || v === undefined) return `<${name}/>`;
  if (typeof v !== 'object') return `<${name}>${esc(v)}</${name}>`;
  // Last.fm's JSON is a mirror of its XML: when an object has '#text', its plain siblings are XML attributes.
  const hasText = v['#text'] !== undefined;
  const attrObj = { ...(v['@attr'] || {}) };
  const kidsArr = [];
  for (const [k, x] of Object.entries(v)) {
    if (k === '@attr' || k === '#text') continue;
    if (hasText && (x === null || typeof x !== 'object')) attrObj[k] = x ?? '';
    else kidsArr.push([k, x]);
  }
  const attrs = Object.entries(attrObj).map(([k, x]) => ` ${k}="${esc(x)}"`).join('');
  const text = hasText ? esc(v['#text']) : '';
  const kids = kidsArr.map(([k, x]) => toXml(k, x)).join('');
  return `<${name}${attrs}>${text}${kids}</${name}>`;
}

function respond(c, fmt, body) {
  if (fmt === 'json') return c.json(body);
  const entries = Object.entries(body);
  if (!entries.length) return c.body('<?xml version="1.0" encoding="utf-8"?>\n<lfm status="ok"></lfm>', 200, { 'Content-Type': 'text/xml; charset=utf-8' });
  const [[root, val]] = entries;
  return c.body(`<?xml version="1.0" encoding="utf-8"?>\n<lfm status="ok">${toXml(root, val)}</lfm>`, 200,
    { 'Content-Type': 'text/xml; charset=utf-8' });
}
function respondError(c, fmt, code, message) {
  if (fmt === 'json') return c.json({ error: code, message }, code === 29 ? 429 : 200);
  return c.body(`<?xml version="1.0" encoding="utf-8"?>\n<lfm status="failed"><error code="${code}">${esc(message)}</error></lfm>`,
    200, { 'Content-Type': 'text/xml; charset=utf-8' });
}

// ---------- helpers
async function params(c) {
  const p = { ...c.req.query() };
  if (c.req.method === 'POST') {
    const ct = c.req.header('content-type') || '';
    try {
      if (ct.includes('json')) Object.assign(p, await c.req.json());
      else Object.assign(p, await c.req.parseBody());
    } catch { /* empty body */ }
  }
  return p;
}

async function needSession(p) {
  const u = await core.getUserByToken(p.sk);
  if (!u) throw new LfmError(9, 'Invalid session key - Please re-authenticate');
  return u;
}

async function targetUser(p) {
  let u;
  if (p.user || p.username) u = await core.getUser(p.user || p.username);
  else if (p.sk) u = await core.getUserByToken(p.sk);
  else u = await core.firstUser();
  if (!u) throw new LfmError(6, 'User not found');
  if (PRIVATE()) {
    const me = await core.getUserByToken(p.sk || p.api_key);
    if (!me || me.id !== u.id) throw new LfmError(17, 'Login: User required to be logged in (NYAFM_PRIVATE is on)');
  }
  return u;
}

const artMap = (keys) => core.artMany(keys);
const images = (url) => ['small', 'medium', 'large', 'extralarge'].map((size) => ({ size, '#text': url || '' }));
const pageAttr = (user, page, limit, total) => ({
  user: user.username, page: String(page), perPage: String(limit), total: String(total),
  totalPages: String(Math.max(1, Math.ceil(total / limit))),
});
const lim = (p, d = 50) => Math.min(Math.max(parseInt(p.limit) || d, 1), 1000);
const pg = (p) => Math.max(parseInt(p.page) || 1, 1);

// Collect indexed batch params: artist[0], track[0]... or plain artist/track
function scrobbleItems(p) {
  const items = [];
  const field = (name, i) => (i === null ? p[name] : p[`${name}[${i}]`]);
  const indices = new Set();
  for (const k of Object.keys(p)) { const m = k.match(/^artist\[(\d+)\]$/); if (m) indices.add(+m[1]); }
  const list = indices.size ? [...indices].sort((a, b) => a - b) : [null];
  for (const i of list) {
    items.push({
      artist: field('artist', i), track: field('track', i), ts: field('timestamp', i),
      album: field('album', i), album_artist: field('albumArtist', i), duration: field('duration', i),
    });
  }
  return items;
}

// ---------- methods
const methods = {
  async 'auth.getmobilesession'(p) {
    const u = await core.authenticate(p.username, p.password);
    if (!u) throw new LfmError(4, 'Authentication Failed - You do not have permissions to access the service');
    return { session: { name: u.username, key: u.token, subscriber: '0' } };
  },
  async 'auth.gettoken'() {
    const token = core.randomToken(16);
    await core.authTokenCreate(token);
    return { token };
  },
  async 'auth.getsession'(p) {
    const t = await core.authTokenGet(p.token || '');
    if (!t) throw new LfmError(15, 'Invalid authentication token supplied');
    if (!t.user_id) throw new LfmError(14, 'This token has not been authorized');
    await core.authTokenDelete(p.token);
    const u = await core.getUserById(t.user_id);
    return { session: { name: u.username, key: u.token, subscriber: '0' } };
  },

  async 'track.scrobble'(p) {
    const u = await needSession(p);
    const res = await core.addScrobbles(u.id, scrobbleItems(p), 'lastfm-api');
    return {
      scrobbles: {
        '@attr': { accepted: res.accepted, ignored: res.ignored },
        scrobble: res.results.map((r) => ({
          track: { '#text': r.track, '@attr': { corrected: '0' } },
          artist: { '#text': r.artist, '@attr': { corrected: '0' } },
          album: { '#text': r.album, '@attr': { corrected: '0' } },
          albumArtist: { '#text': '', '@attr': { corrected: '0' } },
          timestamp: String(r.ts),
          ignoredMessage: { '#text': r.ignored || '', '@attr': { code: r.ignored ? (r.ignored === 'duplicate' ? '0' : '1') : '0' } },
        })),
      },
    };
  },
  async 'track.updatenowplaying'(p) {
    const u = await needSession(p);
    if (!p.artist || !p.track) throw new LfmError(6, 'Invalid parameters - artist and track required');
    await core.setNowPlaying(u.id, { artist: p.artist, track: p.track, album: p.album, duration: p.duration, source: 'lastfm-api' });
    const t = (x) => ({ '#text': x || '', '@attr': { corrected: '0' } });
    return { nowplaying: { track: t(p.track), artist: t(p.artist), album: t(p.album), albumArtist: t(p.albumArtist), ignoredMessage: { '#text': '', '@attr': { code: '0' } } } };
  },
  async 'track.love'(p) { const u = await needSession(p); await core.setLoved(u.id, p.artist, p.track, true); return {}; },
  async 'track.unlove'(p) { const u = await needSession(p); await core.setLoved(u.id, p.artist, p.track, false); return {}; },

  async 'user.getinfo'(p) {
    const u = await targetUser(p);
    const s = await core.summary(u.id);
    return {
      user: {
        name: u.username, realname: '', url: `/user/${u.username}`, image: images(''),
        playcount: String(s.scrobbles), artist_count: String(s.artists), track_count: String(s.tracks), album_count: String(s.albums),
        registered: { unixtime: String(u.created_at), '#text': u.created_at }, subscriber: '0', type: 'user',
      },
    };
  },
  async 'user.getrecenttracks'(p) {
    const u = await targetUser(p);
    const limit = lim(p), page = pg(p);
    const { total, rows } = await core.recent(u.id, { limit, page, from: p.from ?? null, to: p.to ?? null });
    const np = page === 1 ? await core.getNowPlaying(u.id) : null;
    const all_ = np ? [{ ...np, nowplaying: true }, ...rows] : rows;
    const art = await artMap(all_.map((r) => core.artKey(r.artist, r.album || r.track)));
    const loved = p.extended === '1' ? await core.lovedSet(u.id) : null;
    const track = all_.map((r) => {
      const t = {
        artist: p.extended === '1' ? { name: r.artist, image: images('') } : { '#text': r.artist, mbid: '' },
        streamable: '0', image: images(art[core.artKey(r.artist, r.album || r.track)]),
        mbid: '', album: { '#text': r.album || '', mbid: '' }, name: r.track, url: '',
      };
      if (r.nowplaying) t['@attr'] = { nowplaying: 'true' };
      else t.date = { uts: String(r.ts), '#text': new Date(r.ts * 1000).toUTCString().slice(5, 22) };
      if (loved) t.loved = loved.has(`${r.artist}|${r.track}`.toLowerCase()) ? '1' : '0';
      return t;
    });
    return { recenttracks: { track, '@attr': pageAttr(u, page, limit, total) } };
  },
  async 'user.gettopartists'(p) {
    const u = await targetUser(p);
    const limit = lim(p), page = pg(p);
    const { total, rows } = await core.top(u.id, 'artists', { period: p.period, limit, page });
    const art = await artMap(rows.map((r) => `artist:${r.artist.toLowerCase()}`));
    return {
      topartists: {
        artist: rows.map((r) => ({ name: r.artist, playcount: String(r.plays), mbid: '', url: '', streamable: '0', image: images(art[`artist:${r.artist.toLowerCase()}`]), '@attr': { rank: String(r.rank) } })),
        '@attr': pageAttr(u, page, limit, total),
      },
    };
  },
  async 'user.gettoptracks'(p) {
    const u = await targetUser(p);
    const limit = lim(p), page = pg(p);
    const { total, rows } = await core.top(u.id, 'tracks', { period: p.period, limit, page });
    const art = await artMap(rows.map((r) => core.artKey(r.artist, r.album || r.track)));
    return {
      toptracks: {
        track: rows.map((r) => ({ name: r.track, playcount: String(r.plays), duration: '0', mbid: '', url: '', artist: { name: r.artist, mbid: '', url: '' }, image: images(art[core.artKey(r.artist, r.album || r.track)]), '@attr': { rank: String(r.rank) } })),
        '@attr': pageAttr(u, page, limit, total),
      },
    };
  },
  async 'user.gettopalbums'(p) {
    const u = await targetUser(p);
    const limit = lim(p), page = pg(p);
    const { total, rows } = await core.top(u.id, 'albums', { period: p.period, limit, page });
    const art = await artMap(rows.map((r) => core.artKey(r.artist, r.album)));
    return {
      topalbums: {
        album: rows.map((r) => ({ name: r.album, playcount: String(r.plays), mbid: '', url: '', artist: { name: r.artist, mbid: '', url: '' }, image: images(art[core.artKey(r.artist, r.album)]), '@attr': { rank: String(r.rank) } })),
        '@attr': pageAttr(u, page, limit, total),
      },
    };
  },
  async 'user.getlovedtracks'(p) {
    const u = await targetUser(p);
    const limit = lim(p), page = pg(p);
    const { total, rows } = await core.lovedTracks(u.id, limit, page);
    return {
      lovedtracks: {
        track: rows.map((r) => ({ name: r.track, artist: { name: r.artist }, date: { uts: String(r.ts) }, image: images('') })),
        '@attr': pageAttr(u, page, limit, total),
      },
    };
  },
  async 'track.getinfo'(p) {
    const u = await targetUser({ ...p, user: p.username || p.user });
    const t = await core.trackInfo(u.id, p.artist || '', p.track || '');
    return { track: { name: t.track, artist: { name: t.artist }, album: { title: t.album || '' }, duration: String((t.duration || 0) * 1000), userplaycount: String(t.plays || 0), userloved: t.loved ? '1' : '0' } };
  },
  async 'artist.getinfo'(p) {
    const u = await targetUser({ ...p, user: p.username || p.user });
    const a = await core.artistInfo(u.id, p.artist || '');
    return { artist: { name: a.artist, stats: { userplaycount: String(a.plays || 0) }, image: images('') } };
  },
};

export async function handle(c) {
  let p = {};
  let fmt = 'xml';
  try {
    p = await params(c);
    fmt = p.format === 'json' ? 'json' : 'xml';
    const fn = methods[String(p.method || '').toLowerCase()];
    if (!fn) throw new LfmError(3, 'Invalid Method - No method with that name in this package');
    return respond(c, fmt, await fn(p));
  } catch (e) {
    if (e instanceof LfmError) return respondError(c, fmt, e.code, e.message);
    console.error('lastfm api error', e);
    return respondError(c, fmt, 16, 'There was a temporary error processing your request. Please try again');
  }
}
