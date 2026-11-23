// SQL storage backend (Turso / libSQL / local SQLite file).
import { all, one, scalar, run, batch } from './db.js';
import { now, clean, int, periodRange, hashPw, checkPw, randomToken, artKey, validateUser, prepareScrobbles, finish } from './util.js';

// ------------------------------------------------------------- users
export const userCount = () => scalar('SELECT COUNT(*) FROM users');

export async function createUser(username, password) {
  username = validateUser(username, password);
  try {
    await run('INSERT INTO users(username, password_hash, token, created_at) VALUES (?,?,?,?)',
      [username, hashPw(password), randomToken(), now()]);
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw new Error('That username is taken.');
    throw e;
  }
  return getUser(username);
}
export const getUser = (name) => one('SELECT * FROM users WHERE username = ?', [clean(name)]);
export const getUserById = (id) => one('SELECT * FROM users WHERE id = ?', [id]);
export const getUserByToken = (t) => (t ? one('SELECT * FROM users WHERE token = ?', [clean(t)]) : null);
export const firstUser = () => one('SELECT * FROM users ORDER BY id LIMIT 1');

export async function authenticate(username, password) {
  const u = await getUser(username || '');
  return u && checkPw(password || '', u.password_hash) ? u : null;
}
export async function regenerateToken(uid) {
  const t = randomToken();
  await run('UPDATE users SET token = ? WHERE id = ?', [t, uid]);
  return t;
}
export async function changePassword(uid, pw) {
  if (!pw || pw.length < 6) throw new Error('Password must be at least 6 characters.');
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPw(pw), uid]);
}

// ------------------------------------------------------------- sessions, auth tokens, artwork
export const sessionCreate = (sid, uid) => run('INSERT INTO web_sessions(sid, user_id, created_at) VALUES (?,?,?)', [sid, uid, now()]);
export const sessionUser = async (sid) => (await one('SELECT user_id FROM web_sessions WHERE sid = ?', [sid]))?.user_id ?? null;
export const sessionDelete = (sid) => run('DELETE FROM web_sessions WHERE sid = ?', [sid]);

export const authTokenCreate = (token) => run('INSERT INTO auth_tokens(token, user_id, created_at) VALUES (?, NULL, ?)', [token, now()]);
export const authTokenGet = (token) => one('SELECT token, user_id FROM auth_tokens WHERE token = ? AND created_at > ?', [token, now() - 3600]);
export const authTokenDelete = (token) => run('DELETE FROM auth_tokens WHERE token = ?', [token]);
export async function authTokenApprove(token, uid) {
  const r = await run('UPDATE auth_tokens SET user_id = ? WHERE token = ? AND user_id IS NULL AND created_at > ?', [uid, token, now() - 3600]);
  return r.rowsAffected > 0;
}

export const artGet = (key) => one('SELECT url, fetched_at FROM artwork WHERE key = ?', [key]);
export const artSet = (key, url) => run('INSERT OR REPLACE INTO artwork(key, url, fetched_at) VALUES (?,?,?)', [key, url, now()]);
export async function artMany(keys) {
  const uniq = [...new Set(keys)];
  const map = {};
  for (let i = 0; i < uniq.length; i += 200) {
    const chunk = uniq.slice(i, i + 200);
    (await all(`SELECT key, url FROM artwork WHERE key IN (${chunk.map(() => '?').join(',')})`, chunk)).forEach((r) => (map[r.key] = r.url));
  }
  return map;
}

// ------------------------------------------------------------- scrobbling
export async function addScrobbles(uid, items, source = '') {
  const { results, valid } = prepareScrobbles(items, source);
  const t = now();
  const stmts = [];
  const idx = [];
  for (const v of valid) {
    idx.push(v._i);
    stmts.push({
      sql: 'INSERT OR IGNORE INTO scrobbles(user_id, ts, artist, track, album, album_artist, duration, source) VALUES (?,?,?,?,?,?,?,?)',
      args: [uid, v.ts, v.artist, v.track, v.album, v.album_artist, v.duration, v.source],
    });
    if (v.cover.startsWith('http')) {
      stmts.push({ sql: 'INSERT OR REPLACE INTO artwork(key, url, fetched_at) VALUES (?,?,?)', args: [artKey(v.artist, v.album || v.track), v.cover, t] });
      idx.push(-1);
    }
  }
  for (let i = 0; i < stmts.length; i += 400) {
    const res = await batch(stmts.slice(i, i + 400));
    res.forEach((r, j) => {
      const k = idx[i + j];
      if (k >= 0 && r.rowsAffected === 0) results[k].ignored = 'duplicate';
    });
  }
  return finish(results);
}

export async function setNowPlaying(uid, { artist, track, album = '', duration = null, cover = '', source = '' }) {
  const t = now();
  const dur = int(duration);
  await run('INSERT OR REPLACE INTO now_playing(user_id, artist, track, album, duration, started_at, expires_at, source) VALUES (?,?,?,?,?,?,?,?)',
    [uid, clean(artist), clean(track), clean(album), dur, t, t + (dur || 300) + 30, clean(source)]);
  if (clean(cover).startsWith('http')) await artSet(artKey(artist, album || track), clean(cover));
}
export const getNowPlaying = (uid) => one('SELECT * FROM now_playing WHERE user_id = ? AND expires_at > ?', [uid, now()]);
export const clearNowPlaying = (uid) => run('DELETE FROM now_playing WHERE user_id = ?', [uid]);
export const deleteScrobble = async (uid, id) => (await run('DELETE FROM scrobbles WHERE id = ? AND user_id = ?', [id, uid])).rowsAffected > 0;

export async function setLoved(uid, artist, track, loved = true) {
  if (loved) await run('INSERT OR REPLACE INTO loved(user_id, artist, track, ts) VALUES (?,?,?,?)', [uid, clean(artist), clean(track), now()]);
  else await run('DELETE FROM loved WHERE user_id = ? AND artist = ? AND track = ?', [uid, clean(artist), clean(track)]);
}
export const isLoved = async (uid, a, t) => !!(await one('SELECT 1 FROM loved WHERE user_id = ? AND artist = ? AND track = ?', [uid, a, t]));
export async function lovedTracks(uid, limit = 50, page = 1) {
  const total = await scalar('SELECT COUNT(*) FROM loved WHERE user_id = ?', [uid]);
  const rows = await all('SELECT artist, track, ts FROM loved WHERE user_id = ? ORDER BY ts DESC LIMIT ? OFFSET ?', [uid, limit, (page - 1) * limit]);
  return { total, rows };
}
export async function lovedSet(uid) {
  return new Set((await all('SELECT artist, track FROM loved WHERE user_id = ?', [uid])).map((r) => `${r.artist}|${r.track}`.toLowerCase()));
}

// ------------------------------------------------------------- stats
export async function recent(uid, { limit = 50, page = 1, from = null, to = null, artist = null, track = null, q = null } = {}) {
  const [lo, hi] = periodRange('overall', from, to);
  let where = 'user_id = ? AND ts >= ? AND ts < ?';
  const args = [uid, lo, hi];
  if (artist) { where += ' AND artist = ? COLLATE NOCASE'; args.push(artist); }
  if (track) { where += ' AND track = ? COLLATE NOCASE'; args.push(track); }
  if (q) { where += ' AND (artist LIKE ? OR track LIKE ? OR album LIKE ?)'; const l = `%${q}%`; args.push(l, l, l); }
  const total = await scalar(`SELECT COUNT(*) FROM scrobbles WHERE ${where}`, args);
  const rows = await all(`SELECT id, ts, artist, track, album, album_artist, duration, source FROM scrobbles WHERE ${where} ORDER BY ts DESC LIMIT ? OFFSET ?`,
    [...args, limit, (Math.max(page, 1) - 1) * limit]);
  return { total, rows };
}

const TOP = {
  artists: { sel: 'MIN(artist) AS artist', grp: 'artist COLLATE NOCASE', extra: '' },
  tracks: { sel: 'MIN(artist) AS artist, MIN(track) AS track, MAX(album) AS album', grp: 'artist COLLATE NOCASE, track COLLATE NOCASE', extra: '' },
  albums: {
    sel: "MIN(COALESCE(NULLIF(album_artist,''), artist)) AS artist, MIN(album) AS album",
    grp: "COALESCE(NULLIF(album_artist,''), artist) COLLATE NOCASE, album COLLATE NOCASE",
    extra: " AND album != ''",
  },
};

export async function top(uid, kind, { period = 'overall', limit = 50, page = 1, from = null, to = null, artist = null } = {}) {
  const k = TOP[kind];
  if (!k) throw new Error('bad kind');
  const [lo, hi] = periodRange(period, from, to);
  let extra = k.extra;
  const args = [uid, lo, hi];
  if (artist) { extra += ' AND artist = ? COLLATE NOCASE'; args.push(artist); }
  const base = `FROM scrobbles WHERE user_id = ? AND ts >= ? AND ts < ?${extra}`;
  const total = await scalar(`SELECT COUNT(*) FROM (SELECT 1 ${base} GROUP BY ${k.grp})`, args);
  const p = Math.max(page, 1);
  const rows = await all(`SELECT ${k.sel}, COUNT(*) AS plays, MAX(ts) AS last_ts ${base} GROUP BY ${k.grp} ORDER BY plays DESC, last_ts DESC LIMIT ? OFFSET ?`,
    [...args, limit, (p - 1) * limit]);
  return { total, rows: rows.map((r, i) => ({ ...r, rank: (p - 1) * limit + i + 1 })) };
}

export async function summary(uid, { period = 'overall', from = null, to = null, tz = 0 } = {}) {
  const [lo, hi] = periodRange(period, from, to);
  const off = int(tz, 0) * 60;
  const base = 'FROM scrobbles WHERE user_id = ? AND ts >= ? AND ts < ?';
  const a = [uid, lo, hi];
  const [scrobbles, artists, tracks, albums, secs, first, hourRows, dayRows] = await Promise.all([
    scalar(`SELECT COUNT(*) ${base}`, a),
    scalar(`SELECT COUNT(DISTINCT artist COLLATE NOCASE) ${base}`, a),
    scalar(`SELECT COUNT(*) FROM (SELECT 1 ${base} GROUP BY artist COLLATE NOCASE, track COLLATE NOCASE)`, a),
    scalar(`SELECT COUNT(*) FROM (SELECT 1 ${base} AND album != '' GROUP BY COALESCE(NULLIF(album_artist,''), artist) COLLATE NOCASE, album COLLATE NOCASE)`, a),
    scalar(`SELECT COALESCE(SUM(COALESCE(duration, 210)), 0) ${base}`, a),
    scalar('SELECT MIN(ts) FROM scrobbles WHERE user_id = ?', [uid]),
    all(`SELECT CAST(((ts + ?) % 86400) / 3600 AS INTEGER) AS h, COUNT(*) AS n ${base} GROUP BY h`, [off, ...a]),
    all(`SELECT CAST(((ts + ?) / 86400 + 3) % 7 AS INTEGER) AS d, COUNT(*) AS n ${base} GROUP BY d`, [off, ...a]),
  ]);
  const hours = Array(24).fill(0); hourRows.forEach((r) => (hours[r.h] = r.n));
  const weekdays = Array(7).fill(0); dayRows.forEach((r) => (weekdays[r.d] = r.n)); // 0 = Monday
  return { scrobbles, artists, tracks, albums, listening_seconds: secs, first_scrobble: first, hours, weekdays };
}

export async function timeline(uid, { days = 30, tz = 0, artist = null, track = null } = {}) {
  const off = int(tz, 0) * 60;
  const args = [off, uid];
  let extra = '';
  days = int(days, 30);
  if (days > 0) { extra += ' AND ts >= ?'; args.push(now() - days * 86400); }
  if (artist) { extra += ' AND artist = ? COLLATE NOCASE'; args.push(artist); }
  if (track) { extra += ' AND track = ? COLLATE NOCASE'; args.push(track); }
  const fmt = days <= 0 || days > 400 ? '%Y-%m' : '%Y-%m-%d';
  return all(`SELECT strftime('${fmt}', ts + ?, 'unixepoch') AS bucket, COUNT(*) AS plays FROM scrobbles WHERE user_id = ?${extra} GROUP BY bucket ORDER BY bucket`, args);
}

export async function artistInfo(uid, artist) {
  const r = await one('SELECT MIN(artist) AS artist, COUNT(*) AS plays, MIN(ts) AS first_ts, MAX(ts) AS last_ts FROM scrobbles WHERE user_id = ? AND artist = ? COLLATE NOCASE', [uid, artist]);
  let rank = null;
  if (r && r.plays) {
    rank = await scalar('SELECT COUNT(*) + 1 FROM (SELECT COUNT(*) AS p FROM scrobbles WHERE user_id = ? GROUP BY artist COLLATE NOCASE HAVING p > ?)', [uid, r.plays]);
  }
  return { ...(r || { artist, plays: 0 }), artist: r?.artist || artist, rank };
}

export async function trackInfo(uid, artist, track) {
  const r = await one('SELECT MIN(artist) AS artist, MIN(track) AS track, MAX(album) AS album, COUNT(*) AS plays, MIN(ts) AS first_ts, MAX(ts) AS last_ts, MAX(duration) AS duration FROM scrobbles WHERE user_id = ? AND artist = ? COLLATE NOCASE AND track = ? COLLATE NOCASE', [uid, artist, track]);
  return { ...(r || {}), artist: r?.artist || artist, track: r?.track || track, loved: await isLoved(uid, artist, track) };
}

/** Export in pages. cursor = last id seen (0 to start). */
export async function exportPage(uid, cursor = 0, limit = 5000) {
  const rows = await all('SELECT id, ts, artist, track, album, album_artist, duration, source FROM scrobbles WHERE user_id = ? AND id > ? ORDER BY id LIMIT ?', [uid, int(cursor, 0), limit]);
  return { rows, next: rows.length === limit ? rows[rows.length - 1].id : null };
}
