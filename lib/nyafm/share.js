// Share links with link previews: /fm/s/artist/<name>, /fm/s/track/<artist>/<track>, /fm/s/album/<artist>/<album>,
// /fm/s/recap/<2026 | 2026-11>, /fm/s (profile). Optional ?u=<user>.
// The dashboard uses #hash routes, which link-preview bots never see, so these pages carry the preview tags
// (title, description, picture) and then send people on to the real page.
import * as core from './core.js';
import { lookup } from './art.js';

const x = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n = (v) => Number(v || 0).toLocaleString('en-US');
const enc = encodeURIComponent;
const plays = (p) => `${n(p)} play${p === 1 ? '' : 's'}`;

function origin(c) {
  const u = new URL(c.req.url);
  const proto = c.req.header('x-forwarded-proto') || u.protocol.replace(':', '');
  const host = c.req.header('x-forwarded-host') || c.req.header('host') || u.host;
  return `${proto}://${host}`;
}

// "2026" -> the whole year, "2026-11" -> that month (UTC)
export function recapRange(key) {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(String(key || ''));
  if (!m) return null;
  const y = Number(m[1]), mo = m[2] ? Number(m[2]) - 1 : null;
  const from = Date.UTC(y, mo ?? 0, 1) / 1000;
  const to = (mo === null ? Date.UTC(y + 1, 0, 1) : Date.UTC(y, mo + 1, 1)) / 1000;
  const label = mo === null ? String(y) : new Date(from * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { from, to, label };
}

export async function share(c) {
  const base = origin(c);
  const parts = c.req.path.replace(/^\/fm\/s\/?/, '').split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const name = c.req.query('u');
  const u = name ? await core.getUser(name) : await core.firstUser();
  const kind = parts[0] || 'u';
  const userQ = u && name ? `?user=${enc(u.username)}` : '';
  const who = u?.username || 'NyaFM';
  const hidden = !u || (await core.isPrivate(u.id));
  const accent = u ? (await core.getSettings(u.id)).accent : '#ff6fae';

  let title = `${who} on NyaFM`, desc = 'Music stats, scrobbles and listening history.', image = null, target = `/fm#/${userQ}`;
  try {
    if (kind === 'artist' && parts[1]) {
      const a = parts.slice(1).join('/');
      target = `/fm#/artist/${enc(a)}${userQ}`;
      title = a;
      image = await lookup({ artist: a, kind: 'artist' });
      if (!hidden) {
        const i = await core.artistInfo(u.id, a);
        title = i.artist || a;
        desc = i.plays ? `${plays(i.plays)} by ${who}${i.rank ? ` · #${i.rank} all-time` : ''}` : `${who} hasn't played ${title} yet`;
      }
    } else if (kind === 'track' && parts[2]) {
      const [, a, t] = parts;
      target = `/fm#/track/${enc(a)}/${enc(t)}${userQ}`;
      title = `${t} · ${a}`;
      if (!hidden) {
        const i = await core.trackInfo(u.id, a, t);
        title = `${i.track || t} · ${i.artist || a}`;
        image = await lookup({ artist: i.artist || a, album: i.album || '', track: i.track || t });
        if (i.plays) desc = `${plays(i.plays)} by ${who}${i.loved ? ' · ♥ loved' : ''}`;
      } else image = await lookup({ artist: a, track: t });
    } else if (kind === 'album' && parts[2]) {
      const [, a, al] = parts;
      target = `/fm#/album/${enc(a)}/${enc(al)}${userQ}`;
      title = `${al} · ${a}`;
      image = await lookup({ artist: a, album: al });
      if (!hidden) {
        const top = await core.top(u.id, 'albums', { q: al, limit: 50 });
        const hit = top.rows.find((r) => r.album.toLowerCase() === al.toLowerCase() && r.artist.toLowerCase() === a.toLowerCase());
        if (hit) desc = `${plays(hit.plays)} by ${who} · #${hit.rank} album`;
      }
    } else if (kind === 'recap' && recapRange(parts[1])) {
      const r = recapRange(parts[1]);
      target = `/fm#/recap/${parts[1]}${userQ}`;
      title = `${who}'s ${r.label} on NyaFM`;
      if (!hidden) {
        const rc = await core.recap(u.id, { from: r.from, to: r.to });
        const ta = rc.top_artists[0], tt = rc.top_tracks[0];
        desc = [`${n(Math.round(rc.listening_seconds / 3600))} hours`, `${n(rc.scrobbles)} plays`, ta && `top artist ${ta.artist}`, tt && `top song ${tt.track}`].filter(Boolean).join(' · ');
        if (ta) image = await lookup({ artist: ta.artist, kind: 'artist' });
      }
    } else if (u && !hidden) {
      const [np, sum, ta] = await Promise.all([core.visibleNowPlaying(u.id, null), core.summary(u.id), core.top(u.id, 'artists', { period: '1month', limit: 1 })]);
      if (np) {
        desc = `▶ Now playing: ${np.track} · ${np.artist}`;
        image = await lookup({ artist: np.artist, album: np.album, track: np.track });
      } else {
        desc = `${n(sum.scrobbles)} scrobbles${ta.rows[0] ? ` · this month's top artist: ${ta.rows[0].artist}` : ''}`;
        if (ta.rows[0]) image = await lookup({ artist: ta.rows[0].artist, kind: 'artist' });
      }
    }
  } catch (e) { console.error('share preview', e); }

  image ||= `${base}/fm/icon.png`;
  const url = base + c.req.path + (name ? `?u=${enc(name)}` : '');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${x(title)}</title>
<meta name="description" content="${x(desc)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="NyaFM">
<meta property="og:title" content="${x(title)}"><meta property="og:description" content="${x(desc)}">
<meta property="og:image" content="${x(image)}"><meta property="og:url" content="${x(url)}">
<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${x(title)}"><meta name="twitter:description" content="${x(desc)}"><meta name="twitter:image" content="${x(image)}">
<meta name="theme-color" content="${x(accent)}">
<link rel="canonical" href="${x(url)}">
<meta http-equiv="refresh" content="0;url=${x(target)}">
</head><body style="background:#0f0d14;color:#eee;font-family:system-ui,sans-serif">
<script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')})</script>
<p><a href="${x(target)}" style="color:${x(accent)}">Open on NyaFM →</a></p></body></html>`;
  return c.html(html, 200, { 'Cache-Control': 'public, max-age=300, s-maxage=600' });
}
