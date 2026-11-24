// Storage facade: Upstash Redis if its env vars are set, otherwise Turso/libSQL (or a local SQLite file).
// Also where per-user settings are applied: cleanup rules and filters on the way in, privacy on the way out.
import * as sql from './store-sql.js';
import * as redis from './store-redis.js';
import { useRedis } from './redis.js';

import { isBlocked, clean, int, now } from './util.js';
export { periodRange, randomToken, artKey } from './util.js';
export const backend = () => (useRedis() ? 'upstash-redis' : 'libsql');
const B = () => (useRedis() ? redis : sql);

const FNS = [
  'userCount', 'createUser', 'getUser', 'getUserById', 'getUserByToken', 'firstUser', 'authenticate', 'regenerateToken', 'changePassword',
  'sessionCreate', 'sessionUser', 'sessionDelete', 'authTokenCreate', 'authTokenGet', 'authTokenApprove', 'authTokenDelete',
  'artGet', 'artSet', 'artMany',
  'addScrobbles', 'setNowPlaying', 'getNowPlaying', 'clearNowPlaying', 'deleteScrobble', 'getScrobble', 'deleteScrobbles',
  'setLoved', 'isLoved', 'lovedTracks', 'lovedSet',
  'recent', 'top', 'summary', 'timeline', 'artistInfo', 'trackInfo', 'exportPage',
  'rows', 'countRange', 'nthScrobble', 'firstPlays', 'sources',
  'playCountsGet', 'playCountsSet', 'settingsGet', 'settingsSet',
];
for (const f of FNS) {
  if (typeof sql[f] !== 'function' || typeof redis[f] !== 'function') throw new Error(`storage backend missing ${f}`);
}

export const userCount = (...a) => B().userCount(...a);
export const createUser = (...a) => B().createUser(...a);
export const getUser = (...a) => B().getUser(...a);
export const getUserById = (...a) => B().getUserById(...a);
export const getUserByToken = (...a) => B().getUserByToken(...a);
export const firstUser = (...a) => B().firstUser(...a);
export const authenticate = (...a) => B().authenticate(...a);
export const regenerateToken = (...a) => B().regenerateToken(...a);
export const changePassword = (...a) => B().changePassword(...a);
export const sessionCreate = (...a) => B().sessionCreate(...a);
export const sessionUser = (...a) => B().sessionUser(...a);
export const sessionDelete = (...a) => B().sessionDelete(...a);
export const authTokenCreate = (...a) => B().authTokenCreate(...a);
export const authTokenGet = (...a) => B().authTokenGet(...a);
export const authTokenApprove = (...a) => B().authTokenApprove(...a);
export const authTokenDelete = (...a) => B().authTokenDelete(...a);
export const artGet = (...a) => B().artGet(...a);
export const artSet = (...a) => B().artSet(...a);
export const artMany = (...a) => B().artMany(...a);
export const getNowPlaying = (...a) => B().getNowPlaying(...a);
export const clearNowPlaying = (...a) => B().clearNowPlaying(...a);
export const deleteScrobble = (...a) => B().deleteScrobble(...a);
export const getScrobble = (...a) => B().getScrobble(...a);
export const deleteScrobbles = (...a) => B().deleteScrobbles(...a);
export const setLoved = (...a) => B().setLoved(...a);
export const isLoved = (...a) => B().isLoved(...a);
export const lovedTracks = (...a) => B().lovedTracks(...a);
export const lovedSet = (...a) => B().lovedSet(...a);
export const recent = (...a) => B().recent(...a);
export const top = (...a) => B().top(...a);
export const summary = (...a) => B().summary(...a);
export const timeline = (...a) => B().timeline(...a);
export const artistInfo = (...a) => B().artistInfo(...a);
export const trackInfo = (...a) => B().trackInfo(...a);
export const exportPage = (...a) => B().exportPage(...a);
export const rows = (...a) => B().rows(...a);
export const countRange = (...a) => B().countRange(...a);
export const nthScrobble = (...a) => B().nthScrobble(...a);
export const firstPlays = (...a) => B().firstPlays(...a);
export const sources = (...a) => B().sources(...a);
export const playCountsGet = (...a) => B().playCountsGet(...a);
export const playCountsSet = (...a) => B().playCountsSet(...a);

// ================================================================== settings
export const PERIOD_KEYS = ['7day', '1month', '3month', '12month', 'overall'];
export const DEFAULT_SETTINGS = Object.freeze({
  // privacy
  private: false,            // only you (logged in, or with your token) can see your stats
  hide_now_playing: false,   // others don't see what's playing right now
  // what gets recorded
  block_lofi: true,          // skip anything called lofi / lo-fi
  block_words: [],           // skip anything whose artist, title or album contains one of these
  skip_cross_dupes: true,    // the same song from two apps within a few minutes counts once
  strip_feat: false,         // "Song (feat. X)" -> "Song"
  strip_remaster: false,     // "Song - Remastered 2011" -> "Song"
  strip_edition: false,      // "Album (Deluxe Edition)" -> "Album"
  rules: [],                 // renames applied to every new scrobble: { kind: artist|track|album, artist, from, to }
  // look and feel (applies to everyone viewing your profile)
  accent: '#ff6fae',
  default_period: '1month',
  clock: '24h',
  show_lyrics: true,
  effects: true,
  show_milestones: true,
});
const BOOLS = ['private', 'hide_now_playing', 'block_lofi', 'skip_cross_dupes', 'strip_feat', 'strip_remaster', 'strip_edition', 'show_lyrics', 'effects', 'show_milestones'];
const RULE_KINDS = ['artist', 'track', 'album'];
const lc = (s) => clean(s).toLowerCase();
const str = (v, max = 200) => clean(v).slice(0, max);

function cleanRule(r) {
  if (!r || !RULE_KINDS.includes(r.kind)) return null;
  const rule = { kind: r.kind, artist: str(r.artist), from: str(r.from), to: str(r.to) };
  if (!rule.from || !rule.to || lc(rule.from) === lc(rule.to) && rule.from === rule.to) return null;
  if (rule.kind !== 'artist' && !rule.artist) return null;
  if (rule.kind === 'artist') rule.artist = '';
  return rule;
}

export function sanitizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...base };
  for (const k of BOOLS) if (k in input) s[k] = !!input[k];
  if ('block_words' in input) {
    const list = Array.isArray(input.block_words) ? input.block_words : String(input.block_words || '').split(/[,\n]/);
    s.block_words = [...new Set(list.map((w) => str(w, 80)).filter(Boolean))].slice(0, 100);
  }
  if ('accent' in input && /^#[0-9a-f]{6}$/i.test(String(input.accent))) s.accent = String(input.accent).toLowerCase();
  if ('default_period' in input && PERIOD_KEYS.includes(input.default_period)) s.default_period = input.default_period;
  if ('clock' in input && ['12h', '24h'].includes(input.clock)) s.clock = input.clock;
  if ('rules' in input && Array.isArray(input.rules)) {
    const seen = new Set();
    s.rules = input.rules.map(cleanRule).filter(Boolean).filter((r) => {
      const k = `${r.kind}|${lc(r.artist)}|${lc(r.from)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 500);
  }
  return s;
}

const cfgCache = new Map();
export async function getSettings(uid) {
  const hit = cfgCache.get(uid);
  if (hit && Date.now() - hit.at < 15000) return hit.v;
  const v = sanitizeSettings(await B().settingsGet(uid).catch(() => null) || {});
  cfgCache.set(uid, { at: Date.now(), v });
  return v;
}
export async function saveSettings(uid, patch) {
  const v = sanitizeSettings(patch, await getSettings(uid));
  await B().settingsSet(uid, v);
  cfgCache.set(uid, { at: Date.now(), v });
  return v;
}

// ================================================================== privacy
const envPrivate = () => ['1', 'true', 'yes'].includes(String(process.env.NYAFM_PRIVATE || '').toLowerCase());
export const isPrivate = async (uid) => envPrivate() || !!(uid && (await getSettings(uid)).private);
/** Can `viewer` (a user or null) see `user`'s stats? */
export async function canView(user, viewer) {
  if (!user) return false;
  if (viewer && viewer.id === user.id) return true;
  return !(await isPrivate(user.id));
}
/** Now playing as `viewer` is allowed to see it. */
export async function visibleNowPlaying(uid, viewer) {
  if (!(viewer && viewer.id === uid) && (await getSettings(uid)).hide_now_playing) return null;
  return B().getNowPlaying(uid);
}

// ================================================================== cleanup on the way in
const FEAT = /\s*[([](?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi;
const FEAT_DASH = /\s+-\s+(?:feat\.?|ft\.?|featuring)\s.*$/i;
const REMASTER = /\s*[([][^)\]]*remaster[^)\]]*[)\]]/gi;
const REMASTER_DASH = /\s+-\s+(?:\d{4}\s+)?(?:digital(?:ly)?\s+)?remaster(?:ed)?(?:\s+\d{4})?(?:\s+version)?\s*$/i;
const EDITION = /\s*[([][^)\]]*(?:deluxe|expanded|anniversary|special edition|bonus track|collector'?s edition|edition)[^)\]]*[)\]]/gi;
const EDITION_DASH = /\s+-\s+[^-]*(?:deluxe|edition)[^-]*$/i;
const keep = (orig, next) => (next.trim() ? next.trim() : orig);

export function applyCleanup(item, s) {
  const it = { ...item };
  let artist = clean(it.artist), track = clean(it.track), album = clean(it.album), albumArtist = clean(it.album_artist);
  if (s.strip_feat) track = keep(track, track.replace(FEAT, '').replace(FEAT_DASH, ''));
  if (s.strip_remaster) {
    track = keep(track, track.replace(REMASTER, '').replace(REMASTER_DASH, ''));
    album = keep(album, album.replace(REMASTER, '').replace(REMASTER_DASH, ''));
  }
  if (s.strip_edition) album = keep(album, album.replace(EDITION, '').replace(EDITION_DASH, ''));
  const origArtist = artist;
  for (const r of s.rules) {
    if (r.kind !== 'artist') continue;
    if (lc(artist) === lc(r.from)) artist = r.to;
    if (albumArtist && lc(albumArtist) === lc(r.from)) albumArtist = r.to;
  }
  const isArtist = (name) => name && (lc(name) === lc(artist) || lc(name) === lc(origArtist));
  for (const r of s.rules) {
    if (r.kind === 'track' && isArtist(r.artist) && lc(track) === lc(r.from)) track = r.to;
    if (r.kind === 'album' && (isArtist(r.artist) || lc(r.artist) === lc(albumArtist)) && album && lc(album) === lc(r.from)) album = r.to;
  }
  Object.assign(it, { artist, track, album, album_artist: albumArtist });
  return it;
}
const blockOpts = (s) => ({ blockLofi: s.block_lofi, words: s.block_words });

// Same song from a different app a moment apart (e.g. Spotify sync + a browser scrobbler) -> keep the first one.
async function crossSourceDupes(uid, items, source) {
  const drop = new Map();
  const tss = items.map((i) => int(i.ts, now()));
  const lo = Math.min(...tss) - 300, hi = Math.max(...tss) + 300;
  if (!items.length || hi - lo > 2 * 86400) return drop;                // imports of old history are left alone
  const existing = await B().rows(uid, { from: lo, to: hi });
  if (!existing.length) return drop;
  items.forEach((it, i) => {
    const src = clean(it.source) || source;
    const window = Math.max(30, Math.min(int(it.duration, 0) || 180, 480) * 0.5);
    const hit = existing.find((e) => (e.source || '') !== src && lc(e.artist) === lc(it.artist) && lc(e.track) === lc(it.track) && Math.abs(e.ts - tss[i]) < window);
    if (hit) drop.set(i, 'duplicate');
  });
  return drop;
}

export async function addScrobbles(uid, items, source = '') {
  const s = await getSettings(uid);
  const list = items.map((it) => applyCleanup(it, s));
  const drop = s.skip_cross_dupes && list.length <= 300 ? await crossSourceDupes(uid, list, source).catch(() => new Map()) : new Map();
  return B().addScrobbles(uid, list, source, { ...blockOpts(s), drop });
}

// Filtered tracks (lofi etc.) never show as now playing either.
export async function setNowPlaying(uid, np, ...r) {
  const s = await getSettings(uid);
  const it = applyCleanup(np || {}, s);
  if (isBlocked(it.artist, it.track, it.album, blockOpts(s))) return B().clearNowPlaying(uid);
  return B().setNowPlaying(uid, { ...np, artist: it.artist, track: it.track, album: it.album }, ...r);
}

// ================================================================== editing history
const RAW = { blockLofi: false };   // re-adding what's already stored: never filter it away

export async function editScrobble(uid, id, patch = {}) {
  const r = await B().getScrobble(uid, id);
  if (!r) return null;
  const next = {
    ...r,
    artist: str(patch.artist) || r.artist,
    track: str(patch.track) || r.track,
    album: patch.album !== undefined ? str(patch.album) : r.album,
    ts: patch.ts !== undefined && int(patch.ts) ? int(patch.ts) : r.ts,
  };
  await B().deleteScrobbles(uid, [r.id]);
  const res = await B().addScrobbles(uid, [next], r.source || '', RAW);
  return { ok: true, merged: res.accepted === 0 };
}

const matchRows = async (uid, artist, test) => {
  let rs = (await B().rows(uid, { artist })).filter(test);
  if (!rs.length) rs = (await B().rows(uid, {})).filter(test);   // e.g. an album filed under a different album artist
  return rs;
};

/** Rename across your whole history. kind: artist | track | album. Merges into an existing name if it's already there. */
export async function renameAll(uid, { kind, artist, from, to, remember = false }) {
  const rule = cleanRule({ kind, artist, from, to });
  if (!rule) throw new Error('Pick what to rename and give it a new name.');
  let rs;
  if (kind === 'artist') rs = (await B().rows(uid, { artist: rule.from })).filter((r) => lc(r.artist) === lc(rule.from));
  else if (kind === 'track') rs = await matchRows(uid, rule.artist, (r) => lc(r.artist) === lc(rule.artist) && lc(r.track) === lc(rule.from));
  else rs = await matchRows(uid, rule.artist, (r) => lc(r.album) === lc(rule.from) && (lc(r.artist) === lc(rule.artist) || lc(r.album_artist) === lc(rule.artist)));

  const items = rs.map((r) => {
    const n = { ...r };
    if (kind === 'artist') { n.artist = rule.to; if (lc(r.album_artist) === lc(rule.from)) n.album_artist = rule.to; }
    if (kind === 'track') n.track = rule.to;
    if (kind === 'album') n.album = rule.to;
    return n;
  });
  if (rs.length) {
    await B().deleteScrobbles(uid, rs.map((r) => r.id));
    for (let i = 0; i < items.length; i += 500) await B().addScrobbles(uid, items.slice(i, i + 500), '', RAW);
  }

  // loved tracks follow the rename
  if (kind !== 'album') {
    const { rows: loved } = await B().lovedTracks(uid, 100000, 1);
    for (const l of loved) {
      const hit = kind === 'artist' ? lc(l.artist) === lc(rule.from) : lc(l.artist) === lc(rule.artist) && lc(l.track) === lc(rule.from);
      if (!hit) continue;
      await B().setLoved(uid, l.artist, l.track, false);
      await B().setLoved(uid, kind === 'artist' ? rule.to : l.artist, kind === 'track' ? rule.to : l.track, true);
    }
  }
  if (remember) {
    const s = await getSettings(uid);
    await saveSettings(uid, { rules: [...s.rules.filter((r) => !(r.kind === rule.kind && lc(r.artist) === lc(rule.artist) && lc(r.from) === lc(rule.from))), rule] });
  }
  return { changed: rs.length };
}

/** Plays of the same song that started before the previous one could have finished. */
export async function findDuplicates(uid, { days = 90 } = {}) {
  const from = days > 0 ? now() - days * 86400 : 0;
  const rs = (await B().rows(uid, { from })).slice().reverse();      // oldest first
  const last = new Map();
  const groups = new Map();
  for (const r of rs) {
    const k = `${lc(r.artist)}|${lc(r.track)}`;
    const p = last.get(k);
    const gap = Math.max(30, Math.min(r.duration || p?.duration || 180, 480) * 0.5);
    if (p && r.ts - p.ts < gap) {
      if (!groups.has(p.id)) groups.set(p.id, { keep: p, dupes: [] });
      groups.get(p.id).dupes.push(r);
    } else last.set(k, r);
  }
  const list = [...groups.values()].sort((a, b) => b.keep.ts - a.keep.ts);
  return { groups: list.slice(0, 300), total_groups: list.length, total_dupes: list.reduce((n, g) => n + g.dupes.length, 0), ids: list.flatMap((g) => g.dupes.map((d) => d.id)) };
}

/** Delete every scrobble from one source, optionally only between from and to. */
export async function deleteWhere(uid, { source = null, from = null, to = null } = {}) {
  const rs = (await B().rows(uid, { from, to })).filter((r) => !source || (r.source || 'unknown') === source);
  return { deleted: rs.length ? await B().deleteScrobbles(uid, rs.map((r) => r.id)) : 0 };
}

// ================================================================== aggregates built from raw rows
const bucket = (ts, off, len) => new Date((ts + off) * 1000).toISOString().slice(0, len);

export async function albumInfo(uid, artist, album, { tz = 0 } = {}) {
  const test = (r) => lc(r.album) === lc(album) && (lc(r.album_artist || r.artist) === lc(artist) || lc(r.artist) === lc(artist));
  const rs = await matchRows(uid, artist, test);
  const off = int(tz, 0) * 60;
  const tracks = new Map(), months = {};
  let secs = 0;
  for (const r of rs) {
    const k = lc(r.track);
    const t = tracks.get(k) || { track: r.track, artist: r.artist, plays: 0, first_ts: r.ts, last_ts: r.ts, duration: r.duration || null };
    t.plays++; t.first_ts = Math.min(t.first_ts, r.ts); t.last_ts = Math.max(t.last_ts, r.ts);
    if (!t.duration && r.duration) t.duration = r.duration;
    tracks.set(k, t);
    const m = bucket(r.ts, off, 7);
    months[m] = (months[m] || 0) + 1;
    secs += r.duration || 210;
  }
  return {
    artist: rs[0] ? rs[0].album_artist || rs[0].artist : artist,
    album: rs[0]?.album || album,
    plays: rs.length,
    first_ts: rs.length ? rs[rs.length - 1].ts : null,
    last_ts: rs[0]?.ts || null,
    listening_seconds: secs,
    tracks: [...tracks.values()].sort((a, b) => b.plays - a.plays || b.last_ts - a.last_ts),
    months: Object.keys(months).sort().map((k) => ({ bucket: k, plays: months[k] })),
    recent: rs.slice(0, 25),
  };
}

export async function recap(uid, { from, to, tz = 0 }) {
  from = int(from, 0); to = int(to, now());
  const off = int(tz, 0) * 60;
  const [rs, prev] = await Promise.all([B().rows(uid, { from, to }), B().countRange(uid, from - (to - from), from)]);
  const artists = new Map(), tracks = new Map(), albums = new Map(), days = {}, months = {};
  const hours = Array(24).fill(0), weekdays = Array(7).fill(0);
  let secs = 0;
  const add = (m, k, base, d) => { const e = m.get(k) || { ...base, plays: 0, seconds: 0 }; e.plays++; e.seconds += d; m.set(k, e); };
  for (const r of rs) {
    const d = r.duration || 210;
    secs += d;
    add(artists, lc(r.artist), { artist: r.artist }, d);
    add(tracks, `${lc(r.artist)}|${lc(r.track)}`, { artist: r.artist, track: r.track, album: r.album || '' }, d);
    if (r.album) add(albums, `${lc(r.album_artist || r.artist)}|${lc(r.album)}`, { artist: r.album_artist || r.artist, album: r.album }, d);
    const day = bucket(r.ts, off, 10);
    days[day] = (days[day] || 0) + 1;
    const mo = day.slice(0, 7);
    months[mo] = (months[mo] || 0) + 1;
    const local = r.ts + off;
    hours[Math.floor(local / 3600) % 24]++;
    weekdays[(Math.floor(local / 86400) + 3) % 7]++;
  }
  const sorted = (m, n = 5) => [...m.values()].sort((a, b) => b.plays - a.plays).slice(0, n);

  // streaks, counted over every day in the range
  let best = 0, bestEnd = null, run = 0, active = 0;
  for (let t = from; t < Math.min(to, now() + 86400); t += 86400) {
    const k = bucket(t, off, 10);
    if (days[k]) { run++; active++; if (run > best) { best = run; bestEnd = k; } } else run = 0;
  }
  const busiest = Object.entries(days).sort((a, b) => b[1] - a[1])[0] || null;

  // artists you heard for the first time in this range
  const names = [...new Set(rs.map((r) => r.artist))];
  const firsts = names.length ? await B().firstPlays(uid, names) : {};
  const fresh = [...artists.entries()].filter(([k]) => firsts[k] !== undefined && firsts[k] >= from).map(([, v]) => v).sort((a, b) => b.plays - a.plays);

  return {
    from, to,
    scrobbles: rs.length, previous_scrobbles: prev,
    listening_seconds: secs,
    artists_count: artists.size, tracks_count: tracks.size, albums_count: albums.size,
    top_artists: sorted(artists, 10), top_tracks: sorted(tracks, 10), top_albums: sorted(albums, 6),
    new_artists_count: fresh.length, new_artists: fresh.slice(0, 6),
    busiest_day: busiest ? { day: busiest[0], plays: busiest[1] } : null,
    active_days: active, longest_streak: best, longest_streak_end: bestEnd,
    hours, weekdays,
    months: Object.keys(months).sort().map((k) => ({ bucket: k, plays: months[k] })),
    first: rs.length ? rs[rs.length - 1] : null,
  };
}

const MARKS = [1, 100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 75000, 100000, 150000, 200000, 250000, 300000, 400000, 500000, 750000, 1000000];
export async function milestones(uid) {
  const t = now();
  const [total, month] = await Promise.all([B().countRange(uid, 0, t + 86400), B().countRange(uid, t - 30 * 86400, t + 86400)]);
  const reached = await Promise.all(MARKS.filter((m) => m <= total).map(async (n) => ({ n, scrobble: await B().nthScrobble(uid, n) })));
  const next = MARKS.find((m) => m > total) || Math.ceil((total + 1) / 100000) * 100000;
  const perDay = month / 30;
  return {
    total, per_day: perDay, next,
    next_eta: perDay > 0 ? t + Math.round(((next - total) / perDay) * 86400) : null,
    reached: reached.filter((m) => m.scrobble).reverse(),
  };
}
