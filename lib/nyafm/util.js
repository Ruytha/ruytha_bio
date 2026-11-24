// Pure helpers shared by both storage backends.
import crypto from 'node:crypto';

export const now = () => Math.floor(Date.now() / 1000);
export const clean = (s) => (s === undefined || s === null ? '' : String(s)).trim();
export const int = (v, d = null) => {
  if (v === undefined || v === null || v === '') return d;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : d;
};

const PERIODS = { '7day': 7, '1month': 30, '3month': 90, '6month': 180, '12month': 365, overall: null };
export function periodRange(period = 'overall', from = null, to = null) {
  const t = now();
  if (from !== null || to !== null) return [int(from, 0), int(to, t + 86400)];
  const days = PERIODS[period] ?? null;
  return [days ? t - days * 86400 : 0, t + 86400];
}
export const isOverall = (period, from, to) => (!period || period === 'overall' || !(period in PERIODS)) && from === null && to === null;

export function hashPw(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const dk = crypto.pbkdf2Sync(pw, salt, 120000, 32, 'sha256').toString('hex');
  return `pbkdf2$${salt}$${dk}`;
}
export function checkPw(pw, stored) {
  const [, salt] = String(stored).split('$');
  if (!salt) return false;
  const a = Buffer.from(hashPw(pw, salt));
  const b = Buffer.from(String(stored));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export const randomToken = (n = 20) => crypto.randomBytes(n).toString('hex');
export const artKey = (artist, albumOrTrack) => `${clean(artist).toLowerCase()}|${clean(albumOrTrack).toLowerCase()}`;

export function validateUser(username, password) {
  username = clean(username);
  if (!/^[A-Za-z0-9_.-]{2,32}$/.test(username)) throw new Error('Username: 2–32 letters, numbers, _ . -');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
  return username;
}

/** Normalise + validate incoming scrobbles. Returns {results, valid:[{...item, _i}]} */
// Things you never want recorded. Matches artist, track or album, case-insensitive.
// Default: lofi / lo-fi / lo fi. Add more with NYAFM_BLOCK="word one,word two" (comma separated).
// Per-user settings can turn the lofi rule off and add their own words (opts = { blockLofi, words }).
const wordRe = (w) => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const BLOCK = (opts = {}) => [
  ...(opts.blockLofi === false ? [] : [/lo[\s\-_]?fi/i]),
  ...String(process.env.NYAFM_BLOCK || '').split(',').map((w) => w.trim()).filter(Boolean).map(wordRe),
  ...(opts.words || []).map((w) => String(w).trim()).filter(Boolean).map(wordRe),
];
export const isBlocked = (artist, track, album = '', opts = {}) => {
  const text = `${artist} ${track} ${album}`;
  return BLOCK(opts).some((re) => re.test(text));
};

// opts: { blockLofi, words, drop: Map(index -> reason) } — drop marks items the caller already rejected.
export function prepareScrobbles(items, source = '', opts = {}) {
  const t = now();
  const results = [];
  const valid = [];
  for (const [i, it] of items.entries()) {
    const artist = clean(it.artist), track = clean(it.track), album = clean(it.album);
    const ts = int(it.ts, t);
    let reason = opts.drop?.get(i) || null;
    if (reason) { /* already decided */ }
    else if (!artist || !track) reason = 'missing artist or track';
    else if (isBlocked(artist, track, album, opts)) reason = 'filtered';
    else if (ts > t + 600) reason = 'timestamp in the future';
    else if (ts < 1000000000) reason = 'timestamp too old';
    results.push({ artist, track, album, ts, ignored: reason });
    if (!reason) {
      valid.push({
        _i: results.length - 1, ts, artist, track, album, album_artist: clean(it.album_artist),
        duration: int(it.duration), source: clean(it.source) || source, cover: clean(it.cover),
      });
    }
  }
  return { results, valid };
}

export const finish = (results) => {
  const accepted = results.filter((r) => !r.ignored).length;
  return { accepted, ignored: results.length - accepted, results };
};
