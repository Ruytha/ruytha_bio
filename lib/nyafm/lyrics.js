/**
 * GET /api/lyrics   (no parameters)
 *   -> 200 { found: true, track: { artist, track }, provider, sync: 'word' | 'line', credits: [{ role, name, url }], lines: [AMLL LyricLine] }
 *   -> 404 { found: false }
 *
 * It only ever answers for the song the site owner is playing right now (read from NyaFM on the server). There is no artist/track
 * input, so it can't be used as a general lyrics lookup for anything else (Spicy Lyrics developer terms, section 5).
 *
 * Asks Spicy Lyrics (only when SPICY_LYRICS_SECRET_KEY is set), BiniLyrics, LRCLIB and NetEase at the same time and keeps the best answer:
 * word-by-word beats line-by-line, and on a tie Spicy Lyrics > BiniLyrics > NetEase > LRCLIB.
 * Every line is already in the shape AMLL's LyricPlayer.setLyricLines() takes
 * ({ words: [{ word, startTime, endTime }], startTime, endTime, isBG, isDuet, ... }, times in ms),
 * so the page can hand it over untouched.
 *
 * Neither NetEase nor BiniLyrics' TTML host allows browsers to call them directly, which is why this runs
 * on the server. It lives in the NyaFM function (api/nyafm.mjs) because the Hobby plan caps a deployment at 12 functions. The answer depends on what is playing, so it is never cached at the edge; each song is looked up once and kept in memory instead.
 */

import * as core from './core.js';

const UA = 'Mozilla/5.0 (compatible; ruytha.dev lyrics preview)';
const TIMEOUT = 7000;
const BINI_HOSTS = new Set(['lrc.red', 'lyrics-storage.binimum.org']);

function get(url, headers) {
  return fetch(url, { headers: { 'user-agent': UA, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT) })
    .then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r; });
}

const norm = (s) => String(s || '').toLowerCase()
  .replace(/\(.*?\)|\[.*?\]/g, ' ')                       // "(feat. x)", "[Remastered]"
  .replace(/\s*[-–—]\s*(remaster(ed)?|live|single|radio edit|mono|stereo|\d{4}).*$/i, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// How well does a search hit match the song that's playing? Higher is better, < 0 means "not this song".
function score(hit, want) {
  let s = 0;
  const a = norm(hit.name), b = norm(want.track);
  if (a === b) s += 10; else if (a && b && (a.includes(b) || b.includes(a))) s += 4; else return -1;
  const hitArtist = norm(hit.artist), wantArtist = norm(want.artist);
  if (hitArtist && wantArtist && (hitArtist.includes(wantArtist.split(' ')[0]) || wantArtist.includes(hitArtist.split(' ')[0]))) s += 5;
  else if (hitArtist && wantArtist) return -1;
  if (want.duration && hit.duration) {
    const d = Math.abs(hit.duration - want.duration);
    if (d <= 2) s += 6; else if (d <= 6) s += 3; else if (d > 20) return -1;
  }
  return s;
}
const best = (hits, want) => hits.map((h) => [score(h, want), h]).filter((x) => x[0] >= 0).sort((x, y) => y[0] - x[0]).map((x) => x[1])[0];

/* ---------------------------------------------------------------- shared line builders */

function line(words, extra) {
  const start = Math.min(...words.map((w) => w.startTime));
  const end = Math.max(...words.map((w) => w.endTime));
  return { words, translatedLyric: '', romanLyric: '', startTime: start, endTime: end, isBG: false, isDuet: false, ...extra };
}

// Line-synced lyrics only know where a line starts; it ends when the next one begins (capped so a long gap doesn't glow forever).
function fromTimedText(rows) {
  rows = rows.filter((r) => r.time != null).sort((a, b) => a.time - b.time);
  const out = [];
  rows.forEach((r, i) => {
    const text = r.text.trim();
    if (!text) return;
    const next = rows[i + 1] ? rows[i + 1].time : r.time + 5000;
    const end = Math.min(next, r.time + 12000);
    out.push(line([{ word: text, startTime: r.time, endTime: Math.max(end, r.time + 400) }]));
  });
  return out;
}

const CREDIT = /^\s*(作词|作曲|编曲|制作人|混音|母带|录音|吉他|贝斯|鼓|和声|监制|企划|词|曲|lyrics?|words?|music|composer|lyricist|arranger|producer|written|mix(ed)?|master(ed)?)\s*(by)?\s*[:：]/i;

/* ---------------------------------------------------------------- LRC / NetEase YRC */

function parseLrc(text) {
  const rows = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:[.:]\d+)?)\]/g)];
    if (!stamps.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, '').trim();
    if (CREDIT.test(body)) continue;
    for (const m of stamps) rows.push({ time: Math.round((+m[1] * 60 + parseFloat(m[2].replace(':', '.'))) * 1000), text: body });
  }
  return fromTimedText(rows);
}

// "[28190,4800](28190,540,0)It's (28730,630,0)always ..."  line start/length, then each word's start/length
function parseYrc(text) {
  const out = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.match(/^\[(\d+),(\d+)\](.*)$/);
    if (!m) { continue; }
    const words = [];
    for (const w of m[3].matchAll(/\((\d+),(\d+),\d+\)([^(]*)/g)) {
      if (!w[3]) continue;
      words.push({ word: w[3], startTime: +w[1], endTime: +w[1] + Math.max(+w[2], 1) });
    }
    if (!words.length) continue;
    const joined = words.map((w) => w.word).join('');
    if (CREDIT.test(joined)) continue;
    out.push(line(words));
  }
  return out;
}

/* ---------------------------------------------------------------- TTML (BiniLyrics) */

function clock(v) {
  if (v == null) return null;
  v = String(v).trim();
  let m;
  if ((m = v.match(/^([\d.]+)ms$/))) return Math.round(+m[1]);
  if ((m = v.match(/^([\d.]+)s$/))) return Math.round(+m[1] * 1000);
  const parts = v.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  return Math.round(parts.reduce((t, p) => t * 60 + p, 0) * 1000);
}
const attr = (s, name) => { const m = s.match(new RegExp('(?:^|\\s)(?:[\\w-]+:)?' + name + '="([^"]*)"')); return m ? m[1] : null; };
const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&');

function parseTtml(xml) {
  const lines = [];
  for (const p of xml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
    const pAttrs = p[1], inner = p[2];
    const isDuet = /^v(?!1$)\d+$/i.test(attr(pAttrs, 'agent') || '') && attr(pAttrs, 'agent') !== 'v1000';
    const main = [], bg = [];
    let bgDepth = 0;
    const stack = [];
    for (const t of inner.matchAll(/<(\/?)span\b([^>]*?)(\/?)>|([^<]+)/g)) {
      if (t[4] !== undefined) {                                  // text between spans: only the spaces matter, word text is read with its span
        if (/^\s+$/.test(t[4])) { const list = bgDepth ? bg : main; if (list.length) list[list.length - 1].word += ' '; }
        continue;
      }
      if (t[1]) {                                                // closing </span>
        const top = stack.pop();
        if (top && top.bg) bgDepth--;
        continue;
      }
      if (t[3]) continue;                                        // self-closing
      const begin = clock(attr(t[2], 'begin')), end = clock(attr(t[2], 'end'));
      const isBg = attr(t[2], 'role') === 'x-bg';
      stack.push({ bg: isBg, hasTime: begin != null });
      if (isBg) bgDepth++;
      if (begin != null && end != null) {
        // a timed span: its text is the next text node, picked up below
        const idx = t.index + t[0].length;
        const textM = inner.slice(idx).match(/^([^<]*)/);
        const word = unescapeXml(textM ? textM[1] : '');
        if (word) (bgDepth ? bg : main).push({ word, startTime: begin, endTime: Math.max(end, begin + 1) });
      }
    }
    const pBegin = clock(attr(pAttrs, 'begin')), pEnd = clock(attr(pAttrs, 'end'));
    if (!main.length && !bg.length) {                            // line-timed TTML: no word spans at all
      const text = unescapeXml(inner.replace(/<[^>]+>/g, '')).trim();
      if (text && pBegin != null) lines.push(line([{ word: text, startTime: pBegin, endTime: pEnd != null ? pEnd : pBegin + 4000 }], { isDuet }));
      continue;
    }
    const clean = (ws) => ws.filter((w) => w.word.trim());
    if (clean(main).length) lines.push(line(clean(main), { isDuet }));
    if (clean(bg).length) {
      const ws = clean(bg);
      ws[0].word = ws[0].word.replace(/^\(/, ''); ws[ws.length - 1].word = ws[ws.length - 1].word.replace(/\)\s*$/, '');
      lines.push(line(ws, { isBG: true, isDuet }));
    }
  }
  return lines.filter((l) => isFinite(l.startTime));
}

/* ---------------------------------------------------------------- providers: each returns { provider, sync, lines } or null */

async function bini(want) {
  const q = new URLSearchParams({ song: want.track, artist: want.artist });
  const data = await get('https://lyrics-api.binimum.org/getLyrics?' + q, { accept: 'application/json' }).then((r) => r.json());
  const hit = best((data.results || []).map((r) => ({ ...r, name: r.track_name, artist: r.artist_name })), want);
  if (!hit) return null;
  const u = new URL(hit.lyricsUrl);
  if (u.protocol !== 'https:' || !BINI_HOSTS.has(u.hostname) || !u.pathname.endsWith('.ttml')) return null;
  const lines = parseTtml(await get(u.href).then((r) => r.text()));
  if (!lines.length) return null;
  return { provider: 'BiniLyrics', sync: hit.timing_type === 'line' ? 'line' : 'word', lines };
}

async function lrclib(want) {
  const q = new URLSearchParams({ track_name: want.track, artist_name: want.artist });
  if (want.album) q.set('album_name', want.album);
  if (want.duration) q.set('duration', String(Math.round(want.duration)));
  let rec = await get('https://lrclib.net/api/get?' + q, { accept: 'application/json' }).then((r) => r.json()).catch(() => null);
  if (!rec || !rec.syncedLyrics) {
    const s = new URLSearchParams({ track_name: want.track, artist_name: want.artist });
    const list = await get('https://lrclib.net/api/search?' + s, { accept: 'application/json' }).then((r) => r.json()).catch(() => []);
    rec = best((list || []).filter((r) => r.syncedLyrics).map((r) => ({ ...r, name: r.trackName, artist: r.artistName })), want) || null;
  }
  if (!rec || !rec.syncedLyrics) return null;
  const lines = parseLrc(rec.syncedLyrics);
  return lines.length ? { provider: 'LRCLIB', sync: 'line', lines } : null;
}

async function netease(want) {
  const h = { referer: 'https://music.163.com/', accept: 'application/json' };
  const q = new URLSearchParams({ s: want.artist + ' ' + want.track, type: '1', limit: '8' });
  const found = await get('https://music.163.com/api/search/get?' + q, h).then((r) => r.json());
  const songs = ((found.result || {}).songs || []).map((s) => ({
    id: s.id, name: s.name, artist: (s.artists || []).map((a) => a.name).join(' '), duration: (s.duration || 0) / 1000
  }));
  const hit = best(songs, want);
  if (!hit) return null;
  const d = await get('https://music.163.com/api/song/lyric?id=' + hit.id + '&lv=1&yv=1&tv=-1', h).then((r) => r.json());
  const yrc = parseYrc(d.yrc && d.yrc.lyric);
  if (yrc.length) return { provider: 'NetEase', sync: 'word', lines: yrc };
  const lrc = parseLrc(d.lrc && d.lrc.lyric);
  return lrc.length ? { provider: 'NetEase', sync: 'line', lines: lrc } : null;
}

/* ---------------------------------------------------------------- Spicy Lyrics (needs SPICY_LYRICS_SECRET_KEY) */

// api.spicylyrics.org answers by Spotify track id, ISRC or Apple Music track id, not by title, so the song is found on iTunes
// first (no key needed) and its Apple Music id is used. Times are in seconds; a "Syllable" sync is word-by-word.
async function appleMusicId(want) {
  const q = new URLSearchParams({ term: want.artist + ' ' + want.track, entity: 'song', limit: '8' });
  const data = await get('https://itunes.apple.com/search?' + q, { accept: 'application/json' }).then((r) => r.json());
  const hit = best((data.results || []).map((r) => ({ id: r.trackId, name: r.trackName, artist: r.artistName, duration: (r.trackTimeMillis || 0) / 1000 })), want);
  return hit ? String(hit.id) : null;
}

const ms = (sec) => Math.round(Number(sec) * 1000);
function spicyWords(syllables, fallbackEnd) {
  const out = [];
  (syllables || []).forEach((s, i) => {
    if (s == null || !s.Text || !isFinite(s.StartTime)) return;
    const next = syllables[i + 1];
    const end = isFinite(s.EndTime) ? s.EndTime : next && isFinite(next.StartTime) ? next.StartTime : fallbackEnd;
    out.push({ word: s.Text + (s.IsPartOfWord ? '' : ' '), startTime: ms(s.StartTime), endTime: Math.max(ms(end), ms(s.StartTime) + 1) });
  });
  if (out.length) out[out.length - 1].word = out[out.length - 1].word.replace(/\s+$/, '');
  return out;
}

function parseSpicy(body) {
  const lines = [];
  if (body.Type === 'Syllable') {
    for (const l of body.Content || []) {
      if (l.Type && l.Type !== 'Vocal') continue;
      const lead = l.Lead || {};
      const words = spicyWords(lead.Syllables, lead.EndTime != null ? lead.EndTime : lead.StartTime + 4);
      const isDuet = !!l.OppositeAligned;
      if (words.length) lines.push(line(words, { isDuet }));
      for (const g of l.Background || []) {
        const bg = spicyWords(g.Syllables, g.EndTime != null ? g.EndTime : (g.StartTime || lead.StartTime) + 3);
        if (bg.length) lines.push(line(bg, { isBG: true, isDuet }));
      }
    }
  } else if (body.Type === 'Line') {
    lines.push(...fromTimedText((body.Content || []).filter((l) => !l.Type || l.Type === 'Vocal').map((l) => ({ time: isFinite(l.StartTime) ? ms(l.StartTime) : null, text: l.Text || '' }))));
  }
  return lines;
}

async function spicy(want) {
  const key = process.env.SPICY_LYRICS_SECRET_KEY;
  if (!key || !key.startsWith('sl_sk_')) return null;       // off until a secret key is set; a publishable key (sl_pk_) is for browsers
  const id = await appleMusicId(want);
  if (!id) return null;
  const r = await fetch('https://api.spicylyrics.org/v1/lyrics/' + encodeURIComponent(id), {
    headers: { 'user-agent': UA, accept: 'application/json', authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(TIMEOUT)
  });
  if (!r.ok) return null;
  const body = ((await r.json()) || {}).Body;
  if (!body) return null;
  const lines = parseSpicy(body);
  if (!lines.length) return null;
  // Spicy Lyrics' terms (section 6): always name the provider, and for a community sync ('spicy_lyrics') credit and link the
  // uploader and the maker. For the other sources (apple_music, spotify) those fields are absent, so nothing is credited.
  const source = String(body.source || '');
  const provider = SPICY_SOURCES[source] || (source ? source.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()) : 'Spicy Lyrics');
  const credits = [];
  if (source === 'spicy_lyrics') {
    const a = body.UploadAttribution || {};
    for (const [role, who] of [['uploaded by', a.Uploader], ['made by', a.Maker]]) {
      if (who && who.username) credits.push({ role, name: String(who.username).slice(0, 60), url: profileUrl(who.url) });
    }
  }
  return { provider, sync: body.Type === 'Syllable' ? 'word' : 'line', credits, lines };
}

const SPICY_SOURCES = { spicy_lyrics: 'Spicy Lyrics', apple_music: 'Apple Music', spotify: 'Spotify' };
// only ever hand the page an https link on spicylyrics.org
function profileUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && (x.hostname === 'spicylyrics.org' || x.hostname.endsWith('.spicylyrics.org')) ? x.href : '';
  } catch (e) { return ''; }
}

// Kept in memory per song so polling doesn't hit the providers again and again.
const memo = new Map();
const MEMO_TTL = 60 * 60 * 1000;

async function currentSong() {
  const name = process.env.NYAFM_USER || process.env.LASTFM_USER;
  const u = name ? await core.getUser(name) : await core.firstUser();
  const np = u && !(await core.isPrivate(u.id)) && (await core.visibleNowPlaying(u.id, null));
  if (!np || !np.artist || !np.track) return null;
  return {
    artist: String(np.artist).slice(0, 200).trim(),
    track: String(np.track).slice(0, 200).trim(),
    album: String(np.album || '').slice(0, 200).trim(),
    duration: Math.max(0, Math.min(Number(np.duration) || 0, 3600)),
  };
}

async function find(want) {
  // Order is the tie-break: Spicy Lyrics (when a key is set), BiniLyrics, NetEase, then LRCLIB.
  const results = (await Promise.allSettled([spicy(want), bini(want), netease(want), lrclib(want)])).map((r) => (r.status === 'fulfilled' ? r.value : null)).filter(Boolean);
  return results.find((r) => r.sync === 'word') || results[0] || null;
}

export async function lyrics(c) {
  c.header('cache-control', 'no-store');                      // the answer depends on what is playing right now
  const want = await currentSong();
  if (!want) return c.json({ found: false }, 404);

  const key = [want.artist, want.track, want.duration].join('|').toLowerCase();
  let hit = memo.get(key);
  if (!hit || Date.now() - hit.at > MEMO_TTL) {
    hit = { at: Date.now(), pick: await find(want) };
    if (memo.size > 200) memo.delete(memo.keys().next().value);
    memo.set(key, hit);
  }
  if (!hit.pick) return c.json({ found: false, track: { artist: want.artist, track: want.track } }, 404);
  return c.json({ found: true, track: { artist: want.artist, track: want.track }, ...hit.pick });
}
