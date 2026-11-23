// Extra details about an artist or a song, for the dashboard's detail pages. No API keys:
//   Deezer       picture, fans, popular tracks (30s previews), similar artists, release date, BPM
//   MusicBrainz  type, country, start year, genre tags
//   Wikipedia    a short bio
// Every source is optional: if one is down or has no match, its fields are just left out.

const UA = 'NyaFM/1.0';
const TTL = 12 * 60 * 60 * 1000;
const RETRY = 5 * 60 * 1000;
const memo = new Map();

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// make() returns [value, complete]. A result with a source missing because it errored is only kept for a few minutes.
async function cached(key, make) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.v;
  const [v, complete] = await make();
  if (memo.size > 300) memo.delete(memo.keys().next().value);
  memo.set(key, { at: Date.now(), ttl: complete ? TTL : RETRY, v });
  return v;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const ok = (r) => (r.status === 'fulfilled' ? r.value : null);

// ------------------------------------------------------------------ Deezer
async function deezerArtist(name) {
  const s = await getJSON(`https://api.deezer.com/search/artist?limit=5&q=${encodeURIComponent(name)}`);
  const a = (s.data || []).filter((x) => norm(x.name) === norm(name)).sort((x, y) => (y.nb_fan || 0) - (x.nb_fan || 0))[0] || null;
  if (!a) return null;
  const [top, related] = await Promise.allSettled([
    getJSON(`https://api.deezer.com/artist/${a.id}/top?limit=6`),
    getJSON(`https://api.deezer.com/artist/${a.id}/related?limit=8`),
  ]);
  const pic = (x) => (x && !String(x).includes('/artist//') ? x : null);
  return {
    name: a.name,
    picture: pic(a.picture_xl),
    fans: a.nb_fan ?? null,
    albums_count: a.nb_album ?? null,
    deezer_url: a.link || null,
    top: (ok(top)?.data || []).filter((t) => t.title).map((t) => ({
      title: t.title, album: t.album?.title || null, cover: t.album?.cover_medium || null,
      duration: t.duration || null, preview: t.preview || null,
    })),
    related: (ok(related)?.data || []).filter((r) => r.name).map((r) => ({ name: r.name, picture: pic(r.picture_medium) })),
  };
}

// ------------------------------------------------------------------ MusicBrainz
async function musicbrainz(name) {
  const q = encodeURIComponent(`artist:"${name.replace(/"/g, '')}"`);
  const d = await getJSON(`https://musicbrainz.org/ws/2/artist/?query=${q}&fmt=json&limit=5`);
  const a = (d.artists || []).find((x) => (x.score ?? 0) >= 90 && norm(x.name) === norm(name));
  if (!a) return null;
  const span = a['life-span'] || {};
  return {
    type: a.type || null,
    country: a.country || null,
    area: a.area?.name || null,
    begin: span.begin ? String(span.begin).slice(0, 4) : null,
    end: span.end ? String(span.end).slice(0, 4) : null,
    ended: !!span.ended,
    tags: (a.tags || []).sort((x, y) => y.count - x.count).slice(0, 6).map((t) => t.name),
    disambiguation: a.disambiguation || null,
  };
}

// ------------------------------------------------------------------ Wikipedia
const MUSICY = /band|singer|rapper|musician|duo|group|producer|dj\b|composer|songwriter|vocalist|trio|quartet|artist|orchestra|ensemble|guitarist|pianist|violinist|drummer|recording/i;

async function wikipedia(name) {
  const s = await getJSON(`https://en.wikipedia.org/w/rest.php/v1/search/page?limit=5&q=${encodeURIComponent(name + ' music')}`);
  const n = norm(name);
  const page = (s.pages || []).find((p) => MUSICY.test(p.description || '') && (norm(p.title) === n || norm(p.title).startsWith(n + ' ')));
  if (!page) return null;
  const d = await getJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`);
  if (!d.extract) return null;
  return { text: d.extract, url: d.content_urls?.desktop?.page || null, description: d.description || null };
}

// ------------------------------------------------------------------ public
export function artistDetails(name) {
  name = String(name || '').trim();
  if (!name) return Promise.resolve({});
  return cached(`artist:${norm(name)}`, async () => {
    const [dz, mb, wp] = await Promise.allSettled([deezerArtist(name), musicbrainz(name), wikipedia(name)]);
    const out = { name };
    Object.assign(out, ok(dz) || {}, { name: ok(dz)?.name || name });
    const m = ok(mb);
    if (m) Object.assign(out, m);
    const w = ok(wp);
    if (w) out.bio = w;
    return [out, [dz, mb, wp].every((r) => r.status === 'fulfilled')];
  });
}

export function trackDetails(artist, track) {
  artist = String(artist || '').trim(); track = String(track || '').trim();
  if (!artist || !track) return Promise.resolve({});
  return cached(`track:${norm(artist)}|${norm(track)}`, async () => {
    try {
      // Deezer's strict field search misses titles with "(feat. …)" tails, so use the plain one and match loosely.
      const s = await getJSON(`https://api.deezer.com/search/track?limit=10&q=${encodeURIComponent(`${artist} ${track}`)}`);
      const mine = (s.data || []).filter((t) => norm(t.artist?.name) === norm(artist));
      const nt = norm(track);
      const hit = mine.find((t) => norm(t.title) === nt)
        || mine.find((t) => norm(t.title).startsWith(nt + ' ') && !/radio edit|remix|live|karaoke/i.test(t.title))
        || mine.find((t) => norm(t.title).startsWith(nt + ' '));
      if (!hit) return [{}, true];
      const full = await getJSON(`https://api.deezer.com/track/${hit.id}`).catch(() => hit);
      return [{
        title: full.title, album: full.album?.title || null, cover: full.album?.cover_xl || full.album?.cover_medium || null,
        release_date: full.release_date || full.album?.release_date || null,
        bpm: full.bpm || null, explicit: !!full.explicit_lyrics, duration: full.duration || null,
        preview: full.preview || null, deezer_url: full.link || null,
        contributors: (full.contributors || []).map((c) => c.name).filter(Boolean),
      }, true];
    } catch { return [{}, false]; }
  });
}
