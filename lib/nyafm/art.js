// Cover art + artist pictures with no API keys: Deezer first, iTunes fallback. Cached in the DB.
import { artKey, artGet, artSet } from './core.js';

const MISS_RETRY = 7 * 86400;

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'NyaFM/1.0' }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function deezer(artist, album, track, kind) {
  const base = 'https://api.deezer.com/search';
  if (kind === 'artist') {
    const d = await getJSON(`${base}/artist?limit=1&q=${encodeURIComponent(artist)}`);
    const pic = d.data?.[0]?.picture_xl;
    return pic && !pic.includes('/artist//') ? pic : null; // Deezer's blank placeholder
  }
  if (album) {
    const d = await getJSON(`${base}/album?limit=1&q=${encodeURIComponent(`artist:"${artist}" album:"${album}"`)}`);
    if (d.data?.[0]?.cover_xl) return d.data[0].cover_xl;
  }
  const d = await getJSON(`${base}/track?limit=1&q=${encodeURIComponent(`artist:"${artist}" track:"${track || album}"`)}`);
  return d.data?.[0]?.album?.cover_xl || null;
}

async function itunes(artist, album, track, kind) {
  if (kind === 'artist') return null;
  const term = encodeURIComponent(`${artist} ${album || track}`);
  const d = await getJSON(`https://itunes.apple.com/search?limit=1&entity=${album ? 'album' : 'song'}&term=${term}`);
  const u = d.results?.[0]?.artworkUrl100;
  return u ? u.replace('100x100bb', '600x600bb') : null;
}

export async function lookup({ artist = '', album = '', track = '', kind = 'album' }) {
  artist = String(artist).trim();
  if (!artist) return null;
  const key = kind === 'artist' ? `artist:${artist.toLowerCase()}` : artKey(artist, album || track);
  const hit = await artGet(key);
  if (hit && (hit.url || Date.now() / 1000 - hit.fetched_at < MISS_RETRY)) return hit.url;
  let url = null;
  for (const fn of [deezer, itunes]) {
    try { url = await fn(artist, album, track, kind); } catch { url = null; }
    if (url) break;
  }
  await artSet(key, url);
  return url;
}
