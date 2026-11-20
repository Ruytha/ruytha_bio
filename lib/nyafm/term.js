// NyaFM for the terminal:  curl https://ruytha.dev/term
//   ?user=name     whose listening to show (default: NYAFM_USER or the first user)
//   ?period=       7day | 1month | 3month | 6month | 12month | overall   (default 1month)
//   ?n=5           rows in each top list (1-10)
//   ?plain         no colours (for piping or dumb terminals)
import { Hono } from 'hono';
import * as core from './core.js';

export const term = new Hono();

const INK = [238, 241, 255], BLUE = [168, 216, 255], PINK = [255, 179, 217], MUTED = [166, 174, 211], LILAC = [201, 182, 255], MINT = [162, 240, 210];
const PERIODS = ['7day', '1month', '3month', '6month', '12month', 'overall'];
const BLOCKS = ' ▁▂▃▄▅▆▇█';

const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const dur = (sec) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };

term.get('/', handle);
term.get('/:user', handle);

async function handle(c) {
  const q = (k) => c.req.query(k);
  const plain = c.req.query('plain') !== undefined;
  const fg = (col, s) => (plain ? s : `\x1b[38;2;${col[0]};${col[1]};${col[2]}m${s}\x1b[0m`);
  const bold = (s) => (plain ? s : `\x1b[1m${s}\x1b[22m`);
  const send = (text, status = 200) => c.body(text + '\n', status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });

  const name = c.req.param('user') || q('user') || process.env.NYAFM_USER || process.env.LASTFM_USER;
  const u = name ? await core.getUser(name) : await core.firstUser();
  if (!u) return send(`no NyaFM user${name ? ` called "${clip(name, 30)}"` : ''}`, 404);

  const period = PERIODS.includes(q('period')) ? q('period') : '1month';
  const n = Math.min(Math.max(parseInt(q('n'), 10) || 5, 1), 10);
  const tz = Number.isFinite(Number(q('tz'))) ? Number(q('tz')) : 0;

  const [np, sum, artists, tracks, tl, rec] = await Promise.all([
    core.getNowPlaying(u.id),
    core.summary(u.id, { period, tz }),
    core.top(u.id, 'artists', { period, limit: n }),
    core.top(u.id, 'tracks', { period, limit: n }),
    core.timeline(u.id, { days: 28, tz }),
    core.recent(u.id, { limit: 1 }),
  ]);

  const out = [''];
  out.push('  ' + bold(fg(PINK, 'NyaFM')) + fg(MUTED, '  ·  ') + fg(INK, u.username) + fg(MUTED, '  ·  ' + (period === 'overall' ? 'all time' : 'last ' + period)));
  out.push('  ' + fg(MUTED, '─'.repeat(54)));

  // now playing / last played
  const last = rec.rows && rec.rows[0];
  if (np) {
    const pct = np.duration ? Math.min(1, (Date.now() / 1000 - np.started_at) / np.duration) : null;
    out.push('  ' + fg(PINK, '♪ now playing  ') + fg(INK, clip(np.track, 28)) + fg(MUTED, ' · ' + clip(np.artist, 20)));
    if (pct !== null) {
      const w = 30, f = Math.round(pct * w);
      out.push('    ' + fg(PINK, '━'.repeat(f)) + fg(MUTED, '─'.repeat(w - f)));
    }
  } else if (last) {
    out.push('  ' + fg(MUTED, '♪ last played   ') + fg(INK, clip(last.track, 28)) + fg(MUTED, ' · ' + clip(last.artist, 20)));
  } else {
    out.push('  ' + fg(MUTED, '♪ nothing scrobbled yet'));
  }
  out.push('');

  // totals
  const stat = (v, l) => bold(fg(INK, String(v))) + ' ' + fg(MUTED, l);
  out.push('  ' + [stat(sum.scrobbles.toLocaleString('en-US'), 'scrobbles'), stat(sum.artists, 'artists'), stat(sum.tracks, 'tracks'), stat(dur(sum.listening_seconds || 0), 'listened')].join(fg(MUTED, '  ·  ')));
  out.push('');

  // top lists, with bars scaled to the leader
  const list = (title, rows, label) => {
    out.push('  ' + fg(LILAC, title));
    const max = Math.max(1, ...rows.map((r) => r.plays));
    if (!rows.length) out.push('    ' + fg(MUTED, 'nothing yet'));
    rows.forEach((r, i) => {
      const bar = '█'.repeat(Math.max(1, Math.round((r.plays / max) * 14)));
      const col = mix(BLUE, PINK, rows.length > 1 ? i / (rows.length - 1) : 0);
      out.push('    ' + fg(MUTED, String(i + 1).padStart(2)) + '  ' + fg(INK, clip(label(r), 34).padEnd(35)) + fg(col, bar.padEnd(15)) + fg(MUTED, String(r.plays).padStart(4)));
    });
    out.push('');
  };
  list('top artists', artists.rows, (r) => r.artist);
  list('top tracks', tracks.rows, (r) => `${r.track} · ${r.artist}`);

  // last 28 days as a sparkline
  const byDay = new Map((tl || []).map((r) => [r.bucket, r.plays]));
  const today = Math.floor(Date.now() / 1000) + tz * 60;
  const days = Array.from({ length: 28 }, (_, i) => byDay.get(new Date((today - (27 - i) * 86400) * 1000).toISOString().slice(0, 10)) || 0);
  if (days.some(Boolean)) {
    const hi = Math.max(1, ...days);
    out.push('  ' + fg(LILAC, 'last 28 days'));
    out.push('    ' + days.map((v, i) => fg(mix(BLUE, PINK, i / Math.max(1, days.length - 1)), BLOCKS[Math.round((v / hi) * 8)])).join(''));
    out.push('');
  }

  // hour of day
  if (sum.hours && sum.hours.some(Boolean)) {
    const hi = Math.max(1, ...sum.hours);
    out.push('  ' + fg(LILAC, 'when i listen') + fg(MUTED, '  (hour of day, UTC' + (tz ? (tz > 0 ? '+' : '') + tz : '') + ')'));
    out.push('    ' + sum.hours.map((v) => fg(MINT, BLOCKS[Math.round((v / hi) * 8)])).join(''));
    out.push('    ' + fg(MUTED, '0     6     12    18   23'));
    out.push('');
  }

  out.push('  ' + fg(MUTED, 'try  ') + fg(BLUE, '?period=7day') + fg(MUTED, '  ') + fg(BLUE, '?n=10') + fg(MUTED, '  ') + fg(BLUE, '?plain') + fg(MUTED, '   json: ') + fg(BLUE, `/v1/users/${u.username}`));
  out.push('');
  return send(out.join('\n'));
}
