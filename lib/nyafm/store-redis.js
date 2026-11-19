// Upstash Redis storage backend.
// Layout (all keys start with NYAFM_REDIS_PREFIX, default "nyafm:"):
//   users:next / users:count / users:first, u:<id> (hash), uname:<lower> -> id, utok:<token> -> id
//   <uid>:s      zset  ts -> scrobble id          <uid>:sd   hash id -> scrobble JSON
//   <uid>:sx     hash  dedup key -> id            <uid>:sid  id counter
//   <uid>:sa:<artist> zset ts -> id (per artist)
//   <uid>:ca / ct / cal  hash play counts for artists / tracks / albums (all-time, so top lists are instant)
//   <uid>:n      hash  display names              <uid>:ta   hash track -> album
//   <uid>:h      hash  hour bucket -> plays (timeline, clock, weekdays)   <uid>:secs  listening seconds
//   <uid>:np     now playing (expires on its own) <uid>:lv   loved tracks
//   at:<token>, ws:<sid>, art (hash)
import { cmd, pipe, toObj, P, LUA_HSETNX_MANY, LUA_HINCR_MANY } from './redis.js';
import { now, clean, int, periodRange, isOverall, hashPw, checkPw, randomToken, artKey, validateUser, prepareScrobbles, finish } from './util.js';

const SEP = '\u0001';
const K = {
  next: () => `${P()}users:next`, count: () => `${P()}users:count`, first: () => `${P()}users:first`,
  user: (id) => `${P()}u:${id}`, uname: (n) => `${P()}uname:${String(n).toLowerCase()}`, utok: (t) => `${P()}utok:${t}`,
  at: (t) => `${P()}at:${t}`, ws: (s) => `${P()}ws:${s}`, art: () => `${P()}art`,
  u: (uid, k) => `${P()}${uid}:${k}`,
};
const lc = (s) => clean(s).toLowerCase();
const trackKey = (artist, track) => `${lc(artist)}${SEP}${lc(track)}`;
const albumKey = (r) => `${lc(r.album_artist || r.artist)}${SEP}${lc(r.album)}`;
const dedupKey = (r) => `${r.ts}${SEP}${r.artist}${SEP}${r.track}`;
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
// Upstash returns flat arrays (["a","1","b","2"]); tolerate map/nested forms from other REST proxies too.
const pairs = (v) => {
  if (!v) return [];
  if (!Array.isArray(v)) return Object.entries(v).map(([k, x]) => [k, Number(x)]);
  if (v.length && Array.isArray(v[0])) return v.map(([k, x]) => [k, Number(x)]);
  const o = []; for (let i = 0; i < v.length; i += 2) o.push([v[i], Number(v[i + 1])]); return o;
};
const firstScore = (v) => { const p = pairs(v); return p.length ? int(p[0][1]) : null; };

// ------------------------------------------------------------- users
function userFrom(h) {
  const o = toObj(h);
  if (!o.id) return null;
  return { id: int(o.id), username: o.username, password_hash: o.password_hash, token: o.token, created_at: int(o.created_at) };
}
export const userCount = async () => int(await cmd('GET', K.count()), 0);
export const getUserById = async (id) => (id ? userFrom(await cmd('HGETALL', K.user(id))) : null);
export const getUser = async (name) => getUserById(await cmd('GET', K.uname(clean(name))));
export const getUserByToken = async (t) => (t ? getUserById(await cmd('GET', K.utok(clean(t)))) : null);
export const firstUser = async () => getUserById(await cmd('GET', K.first()));

export async function createUser(username, password) {
  username = validateUser(username, password);
  if (await cmd('GET', K.uname(username))) throw new Error('That username is taken.');
  const id = await cmd('INCR', K.next());
  const token = randomToken();
  const [claimed] = await pipe([['SET', K.uname(username), id, 'NX']]);
  if (!claimed) throw new Error('That username is taken.');
  await pipe([
    ['HSET', K.user(id), 'id', id, 'username', username, 'password_hash', hashPw(password), 'token', token, 'created_at', now()],
    ['SET', K.utok(token), id],
    ['INCR', K.count()],
    ['SET', K.first(), id, 'NX'],
  ]);
  return getUserById(id);
}
export async function authenticate(username, password) {
  const u = await getUser(username || '');
  return u && checkPw(password || '', u.password_hash) ? u : null;
}
export async function regenerateToken(uid) {
  const u = await getUserById(uid);
  const t = randomToken();
  await pipe([['DEL', K.utok(u.token)], ['SET', K.utok(t), uid], ['HSET', K.user(uid), 'token', t]]);
  return t;
}
export async function changePassword(uid, pw) {
  if (!pw || pw.length < 6) throw new Error('Password must be at least 6 characters.');
  await cmd('HSET', K.user(uid), 'password_hash', hashPw(pw));
}

// ------------------------------------------------------------- sessions, auth tokens, artwork
export const sessionCreate = (sid, uid) => cmd('SET', K.ws(sid), uid, 'EX', 60 * 60 * 24 * 365);
export const sessionUser = async (sid) => int(await cmd('GET', K.ws(sid)));
export const sessionDelete = (sid) => cmd('DEL', K.ws(sid));

export const authTokenCreate = (t) => cmd('SET', K.at(t), '0', 'EX', 3600);
export async function authTokenGet(t) {
  const v = await cmd('GET', K.at(t));
  return v === null || v === undefined ? null : { token: t, user_id: v === '0' || v === 0 ? null : int(v) };
}
export const authTokenDelete = (t) => cmd('DEL', K.at(t));
export async function authTokenApprove(t, uid) {
  const v = await cmd('GET', K.at(t));
  if (v !== '0' && v !== 0) return false;
  await cmd('SET', K.at(t), uid, 'EX', 600);
  return true;
}

export const artGet = async (key) => parse(await cmd('HGET', K.art(), key));
export const artSet = (key, url) => cmd('HSET', K.art(), key, JSON.stringify({ url, fetched_at: now() }));
export async function artMany(keys) {
  const uniq = [...new Set(keys)];
  const map = {};
  if (!uniq.length) return map;
  const vals = await cmd('HMGET', K.art(), ...uniq);
  uniq.forEach((k, i) => { const v = parse(vals[i]); if (v?.url) map[k] = v.url; });
  return map;
}

// ------------------------------------------------------------- scrobbling
export async function addScrobbles(uid, items, source = '') {
  const { results, valid } = prepareScrobbles(items, source);
  if (!valid.length) return finish(results);
  const U = (k) => K.u(uid, k);
  const last = await cmd('INCRBY', U('sid'), valid.length);
  valid.forEach((v, i) => (v.id = last - valid.length + 1 + i));

  // Dedup in one command (also catches duplicates inside the same batch)
  const nx = await cmd('EVAL', LUA_HSETNX_MANY, 1, U('sx'), ...valid.flatMap((v) => [dedupKey(v), v.id]));
  const ok = valid.filter((v, i) => Number(nx[i]) === 1);
  valid.forEach((v, i) => { if (Number(nx[i]) !== 1) results[v._i].ignored = 'duplicate'; });
  if (!ok.length) return finish(results);

  const byArtist = {}, ca = {}, ct = {}, cal = {}, hours = {}, names = {}, trackAlbum = {}, covers = {};
  let secs = 0;
  for (const v of ok) {
    const a = lc(v.artist), tk = trackKey(v.artist, v.track);
    (byArtist[a] ||= []).push(v.ts, v.id);
    ca[a] = (ca[a] || 0) + 1;
    ct[tk] = (ct[tk] || 0) + 1;
    names[`a${SEP}${a}`] = JSON.stringify({ artist: v.artist });
    names[`t${SEP}${tk}`] = JSON.stringify({ artist: v.artist, track: v.track });
    if (v.album) {
      const ak = albumKey(v);
      cal[ak] = (cal[ak] || 0) + 1;
      names[`al${SEP}${ak}`] = JSON.stringify({ artist: v.album_artist || v.artist, album: v.album });
      trackAlbum[tk] = v.album;
    }
    const hb = Math.floor(v.ts / 3600);
    hours[hb] = (hours[hb] || 0) + 1;
    secs += v.duration || 210;
    if (v.cover.startsWith('http')) covers[artKey(v.artist, v.album || v.track)] = JSON.stringify({ url: v.cover, fetched_at: now() });
  }
  const rec = (v) => JSON.stringify({ id: v.id, ts: v.ts, artist: v.artist, track: v.track, album: v.album, album_artist: v.album_artist, duration: v.duration, source: v.source });
  const incr = (key, m) => (Object.keys(m).length ? [['EVAL', LUA_HINCR_MANY, 1, key, ...Object.entries(m).flat()]] : []);
  const hset = (key, m) => (Object.keys(m).length ? [['HSET', key, ...Object.entries(m).flat()]] : []);
  await pipe([
    ['ZADD', U('s'), ...ok.flatMap((v) => [v.ts, v.id])],
    ['HSET', U('sd'), ...ok.flatMap((v) => [v.id, rec(v)])],
    ...Object.entries(byArtist).map(([a, m]) => ['ZADD', U(`sa:${a}`), ...m]),
    ...incr(U('ca'), ca), ...incr(U('ct'), ct), ...incr(U('cal'), cal), ...incr(U('h'), hours),
    ...hset(U('n'), names), ...hset(U('ta'), trackAlbum), ...hset(K.art(), covers),
    ['INCRBY', U('secs'), secs],
  ]);
  return finish(results);
}

export async function deleteScrobble(uid, id) {
  const U = (k) => K.u(uid, k);
  const r = parse(await cmd('HGET', U('sd'), id));
  if (!r) return false;
  const a = lc(r.artist);
  const cmds = [
    ['ZREM', U('s'), id], ['HDEL', U('sd'), id], ['ZREM', U(`sa:${a}`), id], ['HDEL', U('sx'), dedupKey(r)],
    ['EVAL', LUA_HINCR_MANY, 1, U('ca'), a, -1],
    ['EVAL', LUA_HINCR_MANY, 1, U('ct'), trackKey(r.artist, r.track), -1],
    ['EVAL', LUA_HINCR_MANY, 1, U('h'), Math.floor(r.ts / 3600), -1],
    ['INCRBY', U('secs'), -(r.duration || 210)],
  ];
  if (r.album) cmds.push(['EVAL', LUA_HINCR_MANY, 1, U('cal'), albumKey(r), -1]);
  await pipe(cmds);
  return true;
}

export async function setNowPlaying(uid, { artist, track, album = '', duration = null, cover = '', source = '' }) {
  const t = now();
  const dur = int(duration);
  const ttl = (dur || 300) + 30;
  const np = { user_id: uid, artist: clean(artist), track: clean(track), album: clean(album), duration: dur, started_at: t, expires_at: t + ttl, source: clean(source) };
  const cmds = [['SET', K.u(uid, 'np'), JSON.stringify(np), 'EX', ttl]];
  if (clean(cover).startsWith('http')) cmds.push(['HSET', K.art(), artKey(artist, album || track), JSON.stringify({ url: clean(cover), fetched_at: t })]);
  await pipe(cmds);
}
export async function getNowPlaying(uid) {
  const np = parse(await cmd('GET', K.u(uid, 'np')));
  return np && np.expires_at > now() ? np : null;
}
export const clearNowPlaying = (uid) => cmd('DEL', K.u(uid, 'np'));

const loveKey = (a, t) => `${lc(a)}${SEP}${lc(t)}`;
export async function setLoved(uid, artist, track, loved = true) {
  if (loved) await cmd('HSET', K.u(uid, 'lv'), loveKey(artist, track), JSON.stringify({ artist: clean(artist), track: clean(track), ts: now() }));
  else await cmd('HDEL', K.u(uid, 'lv'), loveKey(artist, track));
}
export const isLoved = async (uid, a, t) => Number(await cmd('HEXISTS', K.u(uid, 'lv'), loveKey(a, t))) === 1;
async function lovedAll(uid) {
  return ((await cmd('HVALS', K.u(uid, 'lv'))) || []).map(parse).filter(Boolean).sort((x, y) => y.ts - x.ts);
}
export async function lovedTracks(uid, limit = 50, page = 1) {
  const rows = await lovedAll(uid);
  return { total: rows.length, rows: rows.slice((page - 1) * limit, page * limit) };
}
export async function lovedSet(uid) {
  return new Set((await lovedAll(uid)).map((r) => `${r.artist}|${r.track}`.toLowerCase()));
}

// ------------------------------------------------------------- reading scrobbles
async function fetchRecords(uid, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    if (!chunk.length) continue;
    const vals = await cmd('HMGET', K.u(uid, 'sd'), ...chunk);
    vals.forEach((v) => { const r = parse(v); if (r) out.push(r); });
  }
  return out;
}
/** All scrobbles with lo <= ts < hi (optionally for one artist), newest first. */
async function scan(uid, lo, hi, artist = null) {
  const key = artist ? K.u(uid, `sa:${lc(artist)}`) : K.u(uid, 's');
  const ids = await cmd('ZREVRANGEBYSCORE', key, `(${hi}`, lo);
  return fetchRecords(uid, ids || []);
}

export async function recent(uid, { limit = 50, page = 1, from = null, to = null, artist = null, q = null } = {}) {
  const [lo, hi] = periodRange('overall', from, to);
  const off = (Math.max(page, 1) - 1) * limit;
  if (q) {
    const needle = String(q).toLowerCase();
    const rows = (await scan(uid, lo, hi, artist)).filter((r) =>
      [r.artist, r.track, r.album].some((x) => String(x || '').toLowerCase().includes(needle)));
    return { total: rows.length, rows: rows.slice(off, off + limit) };
  }
  const key = artist ? K.u(uid, `sa:${lc(artist)}`) : K.u(uid, 's');
  const [total, ids] = await pipe([
    ['ZCOUNT', key, lo, `(${hi}`],
    ['ZREVRANGEBYSCORE', key, `(${hi}`, lo, 'LIMIT', off, limit],
  ]);
  return { total: Number(total), rows: await fetchRecords(uid, ids || []) };
}

function aggregate(records, kind) {
  const m = new Map();
  for (const r of records) {
    let key, base;
    if (kind === 'artists') { key = lc(r.artist); base = { artist: r.artist }; }
    else if (kind === 'tracks') { key = trackKey(r.artist, r.track); base = { artist: r.artist, track: r.track, album: r.album || '' }; }
    else { if (!r.album) continue; key = albumKey(r); base = { artist: r.album_artist || r.artist, album: r.album }; }
    const e = m.get(key) || { ...base, plays: 0, last_ts: 0 };
    e.plays++;
    if (r.ts > e.last_ts) e.last_ts = r.ts;
    if (kind === 'tracks' && !e.album && r.album) e.album = r.album;
    m.set(key, e);
  }
  return [...m.values()].sort((a, b) => b.plays - a.plays || b.last_ts - a.last_ts);
}

export async function top(uid, kind, { period = 'overall', limit = 50, page = 1, from = null, to = null, artist = null } = {}) {
  if (!['artists', 'tracks', 'albums'].includes(kind)) throw new Error('bad kind');
  const p = Math.max(page, 1);
  const rank = (rows) => rows.map((r, i) => ({ ...r, rank: (p - 1) * limit + i + 1 }));
  if (isOverall(period, from, to) && !artist) {
    // Instant: all-time counters
    const h = { artists: 'ca', tracks: 'ct', albums: 'cal' }[kind];
    const pre = { artists: 'a', tracks: 't', albums: 'al' }[kind];
    const all = pairs(await cmd('HGETALL', K.u(uid, h))).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const slice = all.slice((p - 1) * limit, p * limit);
    if (!slice.length) return { total: all.length, rows: [] };
    const cmds = [['HMGET', K.u(uid, 'n'), ...slice.map(([k]) => `${pre}${SEP}${k}`)]];
    if (kind === 'tracks') cmds.push(['HMGET', K.u(uid, 'ta'), ...slice.map(([k]) => k)]);
    const [nm, albums] = await pipe(cmds);
    return {
      total: all.length,
      rows: rank(slice.map(([k, plays], i) => {
        const n = parse(nm[i]) || {};
        const [a, b] = k.split(SEP);
        if (kind === 'artists') return { artist: n.artist || a, plays, last_ts: null };
        if (kind === 'tracks') return { artist: n.artist || a, track: n.track || b, album: albums?.[i] || '', plays, last_ts: null };
        return { artist: n.artist || a, album: n.album || b, plays, last_ts: null };
      })),
    };
  }
  const [lo, hi] = periodRange(period, from, to);
  const rows = aggregate(await scan(uid, lo, hi, artist), kind);
  return { total: rows.length, rows: rank(rows.slice((p - 1) * limit, p * limit)) };
}

function clockFromTimestamps(entries, off) {
  // entries: [[ts, count]]
  const hours = Array(24).fill(0), weekdays = Array(7).fill(0);
  for (const [ts, n] of entries) {
    const local = ts + off;
    hours[((Math.floor(local / 3600) % 24) + 24) % 24] += n;
    weekdays[(((Math.floor(local / 86400) + 3) % 7) + 7) % 7] += n; // 0 = Monday
  }
  return { hours, weekdays };
}

export async function summary(uid, { period = 'overall', from = null, to = null, tz = 0 } = {}) {
  const off = int(tz, 0) * 60;
  const U = (k) => K.u(uid, k);
  if (isOverall(period, from, to)) {
    const [scrobbles, artists, tracks, albums, secs, first, h] = await pipe([
      ['ZCARD', U('s')], ['HLEN', U('ca')], ['HLEN', U('ct')], ['HLEN', U('cal')], ['GET', U('secs')],
      ['ZRANGE', U('s'), 0, 0, 'WITHSCORES'], ['HGETALL', U('h')],
    ]);
    const clock = clockFromTimestamps(pairs(h).map(([b, n]) => [Number(b) * 3600, n]), off);
    return {
      scrobbles: Number(scrobbles), artists: Number(artists), tracks: Number(tracks), albums: Number(albums),
      listening_seconds: int(secs, 0), first_scrobble: firstScore(first), ...clock,
    };
  }
  const [lo, hi] = periodRange(period, from, to);
  const [recs, first] = await Promise.all([scan(uid, lo, hi), cmd('ZRANGE', U('s'), 0, 0, 'WITHSCORES')]);
  const set = (f) => new Set(recs.filter(f || (() => true)).map((r) => r._k)).size;
  recs.forEach((r) => (r._k = lc(r.artist)));
  const artists = set();
  recs.forEach((r) => (r._k = trackKey(r.artist, r.track)));
  const tracks = set();
  recs.forEach((r) => (r._k = r.album ? albumKey(r) : ''));
  const albums = set((r) => r.album);
  return {
    scrobbles: recs.length, artists, tracks, albums,
    listening_seconds: recs.reduce((s, r) => s + (r.duration || 210), 0),
    first_scrobble: firstScore(first),
    ...clockFromTimestamps(recs.map((r) => [r.ts, 1]), off),
  };
}

export async function timeline(uid, { days = 30, tz = 0, artist = null } = {}) {
  const off = int(tz, 0) * 60;
  days = int(days, 30);
  const cutoff = days > 0 ? now() - days * 86400 : 0;
  const len = days <= 0 || days > 400 ? 7 : 10; // YYYY-MM or YYYY-MM-DD
  let entries;
  if (artist) {
    const flat = await cmd('ZRANGEBYSCORE', K.u(uid, `sa:${lc(artist)}`), cutoff, '+inf', 'WITHSCORES');
    entries = pairs(flat).map(([, ts]) => [ts, 1]);
  } else {
    entries = pairs(await cmd('HGETALL', K.u(uid, 'h'))).map(([b, n]) => [Number(b) * 3600, n]).filter(([ts]) => ts + 3599 >= cutoff);
  }
  const m = {};
  for (const [ts, n] of entries) {
    const k = new Date((ts + off) * 1000).toISOString().slice(0, len);
    m[k] = (m[k] || 0) + n;
  }
  return Object.keys(m).sort().map((bucket) => ({ bucket, plays: m[bucket] }));
}

export async function artistInfo(uid, artist) {
  const a = lc(artist);
  const U = (k) => K.u(uid, k);
  const [plays, name, firstR, lastR] = await pipe([
    ['HGET', U('ca'), a], ['HGET', U('n'), `a${SEP}${a}`],
    ['ZRANGE', U(`sa:${a}`), 0, 0, 'WITHSCORES'], ['ZRANGE', U(`sa:${a}`), -1, -1, 'WITHSCORES'],
  ]);
  const n = int(plays, 0);
  let rank = null;
  if (n) rank = 1 + ((await cmd('HVALS', U('ca'))) || []).filter((v) => Number(v) > n).length;
  return {
    artist: parse(name)?.artist || artist, plays: n, rank,
    first_ts: firstScore(firstR), last_ts: firstScore(lastR),
  };
}

export async function trackInfo(uid, artist, track) {
  const recs = (await scan(uid, 0, now() + 86400, artist)).filter((r) => lc(r.track) === lc(track));
  const base = { artist: recs[0]?.artist || artist, track: recs[0]?.track || track, plays: recs.length, loved: await isLoved(uid, artist, track) };
  if (!recs.length) return { ...base, album: null, first_ts: null, last_ts: null, duration: null };
  return {
    ...base,
    album: recs.find((r) => r.album)?.album || null,
    first_ts: Math.min(...recs.map((r) => r.ts)), last_ts: Math.max(...recs.map((r) => r.ts)),
    duration: Math.max(0, ...recs.map((r) => r.duration || 0)) || null,
  };
}

/** Export in pages. cursor = offset (0 to start). */
export async function exportPage(uid, cursor = 0, limit = 5000) {
  const start = int(cursor, 0);
  const ids = await cmd('ZRANGE', K.u(uid, 's'), start, start + limit - 1);
  const rows = await fetchRecords(uid, ids || []);
  return { rows, next: (ids || []).length === limit ? start + limit : null };
}
