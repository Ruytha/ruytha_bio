// Apple Music → scrobbles, from an iPhone Shortcut.
// Apple has no "what did I just play" API, but the Music library on the phone keeps a play count and a
// last-played date for every song. The Shortcut sends those for recently played songs; we remember each
// song's count and scrobble the difference. The newest play gets its real time (the last-played date);
// any earlier plays since the last sync are placed back to back before it.
//
// Body: plain text, one song per line:  artist|||title|||album|||play count|||last played (ISO 8601)|||duration
//   or JSON: { songs: [{ artist, title|track, album, plays|play_count, last_played, duration }] }
import * as core from './core.js';

const LAST = 'am:last_sync';                     // plain text: SQLite drops NUL characters in keys
const SEP = '␟';                             // ␟ between key parts
const MAX_PER_SONG = 30;
const nowSec = () => Math.floor(Date.now() / 1000);
const lc = (s) => String(s || '').trim().toLowerCase();
const keyOf = (s) => `am${SEP}${lc(s.artist)}${SEP}${lc(s.track)}${SEP}${lc(s.album)}`;

// "2026-11-24T10:15:03+01:00", "Nov 24, 2026 at 10:15 AM", unix seconds or ms
function parseDate(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (/^\d{9,13}$/.test(s)) { const n = Number(s); return n > 1e12 ? Math.floor(n / 1000) : n; }
  const t = Date.parse(s.replace(/\s+at\s+/i, ' ').replace(/ /g, ' '));
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

// "225", "225.4", "225000" (ms), "3:45", "1:02:03", "3 min 45 sec", "3m 45s"
function parseDuration(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); return Math.round(n > 20000 ? n / 1000 : n) || null; }
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) return s.split(':').reduce((a, x) => a * 60 + Number(x), 0) || null;
  const h = /(\d+)\s*h/i.exec(s), m = /(\d+)\s*m(?!s)/i.exec(s), sec = /(\d+(\.\d+)?)\s*s/i.exec(s);
  const total = (h ? Number(h[1]) * 3600 : 0) + (m ? Number(m[1]) * 60 : 0) + (sec ? Number(sec[1]) : 0);
  return total ? Math.round(total) : null;
}

export function parseSongs(raw) {
  let list = null;
  const text = String(raw || '').trim();
  if (text.startsWith('{') || text.startsWith('[')) {
    try { const j = JSON.parse(text); list = Array.isArray(j) ? j : j.songs || j.items || null; } catch { list = null; }
  }
  if (list) {
    return list.map((x) => ({
      artist: x.artist, track: x.track ?? x.title ?? x.name, album: x.album || '',
      plays: Number(x.plays ?? x.play_count ?? x.playCount), last: parseDate(x.last_played ?? x.lastPlayed), duration: parseDuration(x.duration),
    })).filter((s) => s.artist && s.track && Number.isFinite(s.plays));
  }
  return text.split(/\r?\n/).map((line) => {
    const f = line.split('|||').map((x) => x.trim());
    if (f.length < 4) return null;
    return { artist: f[0], track: f[1], album: f[2] || '', plays: Number(String(f[3]).replace(/[^\d]/g, '')), last: parseDate(f[4]), duration: parseDuration(f[5]) };
  }).filter((s) => s && s.artist && s.track && Number.isFinite(s.plays));
}

export async function syncAppleMusic(uid, raw) {
  const t = nowSec();
  // one entry per song (a list can repeat a song); keep the highest count and the latest date
  const byKey = new Map();
  for (const s of parseSongs(raw)) {
    const k = keyOf(s);
    const e = byKey.get(k);
    if (!e || s.plays > e.plays) byKey.set(k, { ...s, last: Math.max(s.last || 0, e?.last || 0) || null });
  }
  const songs = [...byKey.entries()];
  if (!songs.length) return { ok: false, scrobbled: 0, songs: 0, message: 'No songs came through. Check the Shortcut sends one song per line.' };

  const prev = await core.playCountsGet(uid, [...songs.map(([k]) => k), LAST]);
  const lastSync = prev[LAST] || 0;
  const firstRun = !lastSync;
  const items = [];
  const next = {};

  for (const [k, s] of songs) {
    next[k] = s.plays;
    let n;
    if (prev[k] === undefined) n = !firstRun && s.last && s.last > lastSync ? 1 : 0;   // new to us: count only the play we can date
    else n = Math.min(Math.max(0, s.plays - prev[k]), MAX_PER_SONG);
    if (!n) continue;
    const end = Math.min(s.last || t, t);
    const step = s.duration || 210;
    let stamps = Array.from({ length: n }, (_, i) => end - i * step);
    if (lastSync && stamps[n - 1] < lastSync) {            // too many to fit back to back: spread them since the last sync
      const span = Math.max(end - lastSync, n);
      stamps = Array.from({ length: n }, (_, i) => Math.round(end - (i * span) / n));
    }
    for (const ts of stamps) items.push({ artist: s.artist, track: s.track, album: s.album, duration: s.duration, ts });
  }

  let accepted = 0;
  for (let i = 0; i < items.length; i += 500) accepted += (await core.addScrobbles(uid, items.slice(i, i + 500), 'apple-music')).accepted;
  next[LAST] = t;
  await core.playCountsSet(uid, next);

  const message = firstRun
    ? `Set up! Remembered play counts for ${songs.length} songs. New plays will be scrobbled from now on.`
    : accepted ? `Scrobbled ${accepted} play${accepted === 1 ? '' : 's'} from Apple Music 🎧` : 'Up to date, no new plays.';
  return { ok: true, first_sync: firstRun, songs: songs.length, scrobbled: accepted, message };
}
