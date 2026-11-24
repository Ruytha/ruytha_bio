// NyaFM dashboard — tiny hash-routed SPA, no build step.
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const TZ = -new Date().getTimezoneOffset();
const PERIODS = [['7day', '7 days'], ['1month', '30 days'], ['3month', '90 days'], ['12month', 'Year'], ['overall', 'All time']];
let status = null;
let period = localStorage.getItem('nyafm.period') || '1month';

// Look-and-feel settings of the profile owner (Settings → Look & feel). Defaults until /status says otherwise.
let prefs = { accent: '#ff6fae', default_period: '1month', clock: '24h', show_lyrics: true, effects: true, show_milestones: true };
function applyPrefs(p) {
  prefs = { ...prefs, ...(p || {}) };
  document.documentElement.style.setProperty('--accent', prefs.accent);
  document.documentElement.classList.toggle('nofx', !prefs.effects);
  if (!localStorage.getItem('nyafm.period')) period = prefs.default_period;
}
async function loadStatus() {
  status = await api('/status');
  applyPrefs(status.prefs);
  return status;
}

// ---------------------------------------------------------------- utils
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const fmtN = (n) => Number(n || 0).toLocaleString();

async function api(path, opts = {}) {
  const r = await fetch('/fm/api' + path, {
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function ago(ts) {
  const s = Date.now() / 1000 - ts;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
const hours = (secs) => (secs / 3600 >= 100 ? fmtN(Math.round(secs / 3600)) : (secs / 3600).toFixed(1));

function cover({ artist, album, track, kind = 'album' }, cls = 'cover') {
  const q = kind === 'artist' ? `kind=artist&artist=${enc(artist)}` : `artist=${enc(artist)}&album=${enc(album || '')}&track=${enc(track || '')}`;
  const initial = esc((kind === 'artist' ? artist : album || track || artist || '?').trim().charAt(0).toUpperCase());
  return `<div class="${cls}"><img loading="lazy" alt="" src="/fm/api/art?${q}" onerror="this.remove()"/><span style="position:absolute">${initial}</span></div>`;
}
// keep the initial behind the image
document.head.insertAdjacentHTML('beforeend', '<style>.cover{position:relative}.cover img{position:relative;z-index:1}</style>');

const artistLink = (a) => `<a href="#/artist/${enc(a)}">${esc(a)}</a>`;
const trackHref = (a, t) => `#/track/${enc(a)}/${enc(t)}`;
const trackLink = (a, t) => `<a href="${trackHref(a, t)}">${esc(t)}</a>`;
const albumHref = (a, al) => `#/album/${enc(a)}/${enc(al)}`;
const albumLink = (a, al) => `<a href="${albumHref(a, al)}">${esc(al)}</a>`;

// hours on the listening clock, 24h or 12h depending on Settings
const clockChart = (hrs) => barChart(hrs.map((v, i) => ({ k: prefs.clock === '12h' ? `${i % 12 || 12}${i < 12 ? 'am' : 'pm'}` : `${String(i).padStart(2, '0')}:00`, v })),
  { labelEvery: 3, fmtLabel: (k) => (prefs.clock === '12h' ? k.replace(/m$/, '') : k.slice(0, 2)) });
const hourName = (h) => (prefs.clock === '12h' ? `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}` : `${String(h).padStart(2, '0')}:00`);

const say = (msg) => (window.FX?.say ? window.FX.say(msg) : console.log(msg));

// Share links: /fm/s/... pages carry link previews for Discord, iMessage etc. and then open the dashboard page.
const shareBtn = (path, label = 'Share') => `<button type="button" class="btn" data-share="${esc(path)}">↗ ${esc(label)}</button>`;
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-share]');
  if (!b) return;
  const u = user();
  const url = location.origin + b.dataset.share + (u && status && u.toLowerCase() !== String(status.default_user).toLowerCase() ? `?u=${enc(u)}` : '');
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ url }); } catch {}
    return;
  }
  try { await navigator.clipboard.writeText(url); say('🔗 Link copied, paste it anywhere'); } catch { prompt('Copy this link:', url); }
});

// A small form in a dialog. fields: [{name, label, value, type: 'text'|'check', required}] -> values or null
function ask({ title, fields, ok = 'Save', note = '' }) {
  return new Promise((resolve) => {
    const d = $('#dlg');
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    d.innerHTML = `<form class="dlgf"><h2>${esc(title)}</h2>${note ? `<p class="hint">${note}</p>` : ''}
      ${fields.map((f) => (f.type === 'check'
        ? `<label class="chk"><input type="checkbox" name="${f.name}" ${f.value ? 'checked' : ''}/> ${esc(f.label)}</label>`
        : `<label>${esc(f.label)}</label><input type="text" name="${f.name}" value="${esc(f.value || '')}" ${f.required ? 'required' : ''}/>`)).join('')}
      <div class="dlgb"><button type="button" class="btn" id="dlgc">Cancel</button><button class="btn pri">${esc(ok)}</button></div></form>`;
    const form = d.querySelector('form');
    form.onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const out = {};
      for (const f of fields) out[f.name] = f.type === 'check' ? fd.get(f.name) === 'on' : String(fd.get(f.name) || '').trim();
      finish(out);
      d.close();
    };
    $('#dlgc').onclick = () => d.close();
    d.onclose = () => finish(null);
    d.showModal();
    form.querySelector('input[type=text]')?.select();
  });
}

// Rename an artist / song / album everywhere (owner only). Returns the new name, or null.
async function renameFlow(kind, { artist = '', from }) {
  const what = { artist: 'artist', track: 'song', album: 'album' }[kind];
  const v = await ask({
    title: `Rename ${what}`,
    note: `Changes every scrobble of <b>${esc(from)}</b>${kind !== 'artist' ? ` by ${esc(artist)}` : ''}. If the new name already exists, they're merged.`,
    fields: [{ name: 'to', label: 'New name', value: from, required: true }, { name: 'remember', label: 'Also rename it in future scrobbles', type: 'check', value: true }],
    ok: 'Rename',
  });
  if (!v || !v.to || v.to === from) return null;
  try {
    const r = await api('/edit/rename', { method: 'POST', body: { kind, artist, from, to: v.to, remember: v.remember } });
    say(`✎ Renamed ${fmtN(r.changed)} scrobble${r.changed === 1 ? '' : 's'}`);
    return v.to;
  } catch (err) { say(err.message); return null; }
}
const compact = (n) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const flag = (cc) => (/^[A-Z]{2}$/.test(cc || '') ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '');

// Rows are tappable: a song opens its page, an artist or album opens the artist's page.
document.addEventListener('click', (e) => {
  const row = e.target.closest('.row[data-go]');
  if (!row || e.target.closest('a, button')) return;
  location.hash = row.dataset.go;
});

// 30-second previews, one at a time
let pv = null, pvBtn = null, pvUrl = '';
function stopPreview() {
  if (pv) pv.pause();
  if (pvBtn) pvBtn.classList.remove('on');
  pv = pvBtn = null; pvUrl = '';
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-preview]');
  if (!btn) return;
  const url = btn.dataset.preview;
  const same = pvUrl === url;
  stopPreview();
  if (same) return;
  pv = new Audio(url); pvBtn = btn; pvUrl = url;
  btn.classList.add('on');
  pv.onended = stopPreview;
  pv.onerror = stopPreview;
  pv.play().catch(stopPreview);
});
const user = () => new URLSearchParams(location.hash.split('?')[1] || '').get('user') || status?.me || status?.default_user;
const isOwner = () => status?.me && status.me.toLowerCase() === String(user()).toLowerCase();

function periodChips(onPick) {
  const el = document.createElement('div');
  el.className = 'periods';
  el.innerHTML = PERIODS.map(([k, l]) => `<button class="chip ${k === period ? 'on' : ''}" data-p="${k}">${l}</button>`).join('');
  el.onclick = (e) => {
    const p = e.target.dataset.p;
    if (!p) return;
    period = p; localStorage.setItem('nyafm.period', p);
    onPick();
  };
  return el;
}

function barChart(data, { labelEvery = 1, fmtLabel = (x) => x } = {}) {
  if (!data.length) return '<div class="empty">no data yet</div>';
  const W = 1000, H = 160, pad = 18;
  const max = Math.max(...data.map((d) => d.v), 1);
  const bw = W / data.length;
  const bars = data.map((d, i) => {
    const h = (d.v / max) * (H - pad - 6);
    const lbl = i % labelEvery === 0 ? `<text x="${i * bw + bw / 2}" y="${H - 4}" text-anchor="middle">${esc(fmtLabel(d.k))}</text>` : '';
    return `<rect data-k="${esc(d.k)}" data-tip="${esc(d.k)}: ${fmtN(d.v)}" style="--i:${Math.min(i, 60)}" x="${i * bw + 1}" y="${H - pad - h}" width="${Math.max(bw - 2, 1)}" height="${h}" rx="2"></rect>${lbl}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${bars}</svg>`;
}

function fillDays(rows, days) {
  const map = Object.fromEntries(rows.map((r) => [r.bucket, r.plays]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA'); // YYYY-MM-DD local
    out.push({ k, v: map[k] || 0 });
  }
  return out;
}

function rowsList(items, { rank = true, max } = {}) {
  if (!items.length) return '<div class="empty">nothing here yet… go listen to something 🎧</div>';
  const top = max ?? Math.max(...items.map((i) => i.plays || 0), 1);
  return `<div class="rows">${items.map((it) => `
    <div class="row" data-go="${esc(it.track ? trackHref(it.artist, it.track) : it.album ? albumHref(it.artist, it.album) : `#/artist/${enc(it.artist)}`)}">
      ${rank ? `<div class="rk">${it.rank}</div>` : ''}
      ${cover(it.track ? it : { ...it, kind: it.album ? 'album' : 'artist' })}
      <div class="main"><div class="t">${it.track ? trackLink(it.artist, it.track) : it.album ? albumLink(it.artist, it.album) : artistLink(it.artist)}</div>
        ${it.track || it.album ? `<div class="s">${artistLink(it.artist)}</div>` : ''}</div>
      <div class="bar"><i style="width:${(100 * (it.plays || 0)) / top}%"></i><span>${fmtN(it.plays)} plays</span></div>
    </div>`).join('')}</div>`;
}

function scrobbleList(items, { canDelete = false } = {}) {
  if (!items.length) return '<div class="empty">no scrobbles yet… 🐾</div>';
  return `<div class="rows">${items.map((s) => `
    <div class="row" data-id="${s.id}" data-go="${esc(trackHref(s.artist, s.track))}"${canDelete ? ` data-artist="${esc(s.artist)}" data-track="${esc(s.track)}" data-album="${esc(s.album || '')}"` : ''}>
      ${cover(s)}
      <div class="main"><div class="t">${trackLink(s.artist, s.track)}</div><div class="s">${artistLink(s.artist)}${s.album ? ` · ${albumLink(s.album_artist || s.artist, s.album)}` : ''}</div></div>
      <div class="when" title="${new Date(s.ts * 1000).toLocaleString()}${s.source ? ` · via ${esc(sourceName(s.source))}` : ''}">${ago(s.ts)}</div>
      ${canDelete ? '<button class="ed" title="Edit scrobble" aria-label="Edit scrobble">✎</button><button class="x" title="Delete scrobble" aria-label="Delete scrobble">✕</button>' : ''}
    </div>`).join('')}</div>`;
}

const SOURCES = {
  'spotify-sync': 'Spotify sync', 'apple-music': 'Apple Music', 'lastfm-api': 'Last.fm-style apps', 'listenbrainz-api': 'ListenBrainz-style apps',
  'api-v1': 'NyaFM API', import: 'Imported files', 'spotify-history': 'Spotify history import', 'listenbrainz-import': 'ListenBrainz import', unknown: 'Unknown',
};
const sourceName = (s) => SOURCES[s] || s;

function bindDelete(root, after) {
  if (!root) return;
  root.addEventListener('click', async (e) => {
    const row = e.target.closest('.row');
    if (e.target.classList.contains('x')) {
      try { await api(`/scrobble/${row.dataset.id}`, { method: 'DELETE' }); row.remove(); after?.(); } catch (err) { say(err.message); }
    }
    if (e.target.classList.contains('ed')) {
      const v = await ask({
        title: 'Edit scrobble',
        fields: [
          { name: 'artist', label: 'Artist', value: row.dataset.artist, required: true },
          { name: 'track', label: 'Song', value: row.dataset.track, required: true },
          { name: 'album', label: 'Album', value: row.dataset.album },
        ],
        note: 'Fixes just this one play. To fix every play of a song, use ✎ Rename on its page.',
      });
      if (!v) return;
      try { await api(`/scrobble/${row.dataset.id}`, { method: 'PATCH', body: v }); say('✎ Scrobble updated'); route(); } catch (err) { say(err.message); }
    }
  });
}

function cards(items, kind) {
  if (!items.length) return '<div class="empty">nothing yet</div>';
  return `<div class="cards">${items.map((it) => `
    <a class="card" href="${kind === 'albums' ? albumHref(it.artist, it.album) : `#/artist/${enc(it.artist)}`}">
      ${cover(kind === 'artists' ? { artist: it.artist, kind: 'artist' } : it)}
      <span class="rk">#${it.rank}</span>
      <div class="meta"><div class="t">${esc(kind === 'artists' ? it.artist : it.album)}</div>
      <div class="s">${kind === 'artists' ? '' : esc(it.artist) + ' · '}${fmtN(it.plays)} plays</div></div>
    </a>`).join('')}</div>`;
}

// ---------------------------------------------------------------- pages
async function nowPlaying(u) {
  const { nowplaying: np } = await api(`/u/${enc(u)}/nowplaying`).catch(() => ({}));
  if (!np) {
    // Nothing playing: say so, and show what was played last.
    const last = (await api(`/u/${enc(u)}/recent?limit=1`).catch(() => ({ rows: [] }))).rows?.[0];
    if (!last) return '';
    return `<div class="np idle">${cover(last)}<div><div class="lbl">Not listening right now</div>
      <div style="font-size:18px;font-weight:600">${trackLink(last.artist, last.track)}</div><div class="s">${artistLink(last.artist)} · last played ${ago(last.ts)}</div></div></div>`;
  }
  return `<div class="np">${cover(np)}<div><div class="lbl"><span class="eq"><i></i><i></i><i></i></span> Now playing</div>
    <div style="font-size:18px;font-weight:600">${trackLink(np.artist, np.track)}</div><div class="s">${artistLink(np.artist)}${np.album ? ` · ${albumLink(np.artist, np.album)}` : ''}</div></div></div>`;
}

async function pageHome() {
  const u = user();
  const days = { '7day': 7, '1month': 30, '3month': 90, '12month': 365, overall: 0 }[period];
  const P = `period=${period}`;
  const [np, sum, ta, tal, tt, rec, tl] = await Promise.all([
    nowPlaying(u),
    api(`/u/${enc(u)}/summary?${P}&tz=${TZ}`),
    api(`/u/${enc(u)}/top/artists?${P}&limit=12`),
    api(`/u/${enc(u)}/top/albums?${P}&limit=12`),
    api(`/u/${enc(u)}/top/tracks?${P}&limit=10`),
    api(`/u/${enc(u)}/recent?limit=12`),
    api(`/u/${enc(u)}/timeline?days=${days}&tz=${TZ}`),
  ]);
  const series = days && days <= 400 ? fillDays(tl, days) : tl.map((r) => ({ k: r.bucket, v: r.plays }));
  view.innerHTML = `
    <div class="pagehead"><div><h1>${esc(u)}</h1>
    <p class="sub">${sum.first_scrobble ? `scrobbling since ${new Date(sum.first_scrobble * 1000).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : 'no scrobbles yet — set up a scrobbler in Settings'}</p></div>
    <div class="acts">${shareBtn('/fm/s', 'Share profile')}<a class="btn" href="#/recap">✨ ${new Date().toLocaleDateString(undefined, { month: 'long' })} recap</a></div></div>
    <div id="np">${np}</div>
    <div id="lyrics"></div>
    <div id="periods"></div>
    <div class="tiles">
      <div class="tile"><div class="n">${fmtN(sum.scrobbles)}</div><div class="l">scrobbles</div></div>
      <div class="tile"><div class="n">${fmtN(sum.artists)}</div><div class="l">artists</div></div>
      <div class="tile"><div class="n">${fmtN(sum.tracks)}</div><div class="l">tracks</div></div>
      <div class="tile"><div class="n">${fmtN(sum.albums)}</div><div class="l">albums</div></div>
      <div class="tile"><div class="n">${hours(sum.listening_seconds)}</div><div class="l">hours listened</div></div>
    </div>
    <section class="panel" id="tlpanel"><h2>Listening over time <span class="more">click a bar to see ${days && days <= 400 ? "that day" : "that month"}</span></h2>${barChart(series, { labelEvery: Math.ceil(series.length / 10), fmtLabel: (k) => k.slice(5) || k })}<div id="drill"></div></section>
    <section><h2>Top artists <a class="more" href="#/library/artists">see all →</a></h2>${cards(ta.rows, 'artists')}</section>
    <section><h2>Top albums <a class="more" href="#/library/albums">see all →</a></h2>${cards(tal.rows, 'albums')}</section>
    <div class="grid2">
      <section class="panel"><h2>Top tracks <a class="more" href="#/library/tracks">see all →</a></h2>${rowsList(tt.rows)}</section>
      <section class="panel"><h2>Recent <a class="more" href="#/recent">see all →</a></h2><div id="rec">${scrobbleList(rec.rows, { canDelete: isOwner() })}</div></section>
    </div>
    <div class="grid2">
      <section class="panel"><h2>Listening clock</h2>${clockChart(sum.hours)}</section>
      <section class="panel"><h2>By weekday</h2>${barChart(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((k, i) => ({ k, v: sum.weekdays[i] })))}</section>
    </div>`;
  $('#periods').replaceWith(periodChips(route));
  bindDelete($('#rec'));
  bindDrill($('#tlpanel'), u);
}

// Click a bar (a day, or a month for all time) to list what you played then.
function bindDrill(panel, u) {
  panel.addEventListener('click', async (e) => {
    const bar = e.target.closest('rect[data-k]');
    if (!bar) return;
    const k = bar.dataset.k;
    const month = k.length === 7;
    const start = new Date(month ? `${k}-01T00:00:00` : `${k}T00:00:00`);
    const end = new Date(start);
    if (month) end.setMonth(end.getMonth() + 1); else end.setDate(end.getDate() + 1);
    panel.querySelectorAll('rect.sel').forEach((r) => r.classList.remove('sel'));
    bar.classList.add('sel');
    const box = $('#drill');
    box.innerHTML = '<div class="drill"><div class="empty">loading…</div></div>';
    try {
      const r = await api(`/u/${enc(u)}/recent?from=${start.getTime() / 1000}&to=${end.getTime() / 1000 - 1}&limit=100`);
      const label = start.toLocaleDateString(undefined, month ? { month: 'long', year: 'numeric' } : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      box.innerHTML = `<div class="drill"><h3>${esc(label)} · ${fmtN(r.total ?? r.rows.length)} plays<button type="button" id="drillx">close ✕</button></h3>${scrobbleList(r.rows, { canDelete: isOwner() })}</div>`;
      bindDelete(box);
      $('#drillx').onclick = () => { box.innerHTML = ''; bar.classList.remove('sel'); };
      window.FX?.burst?.(e.clientX, e.clientY, 6, '🎶');
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) { box.innerHTML = `<div class="drill"><div class="empty">${esc(err.message)}</div></div>`; }
  });
}

// ---------------------------------------------------------------- stats (detailed)
function heatmap(series, compact = false) {
  // series: [{k:'YYYY-MM-DD', v}] oldest -> newest (e.g. 365 days)
  const cell = 13, gap = 3, step = cell + gap, top = 16;
  const first = new Date(series[0].k + 'T00:00:00');
  const offset = first.getDay(); // 0 = Sunday
  const max = Math.max(...series.map((d) => d.v), 1);
  const level = (v) => (v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const weeks = Math.ceil((series.length + offset) / 7);
  const W = weeks * step + 4, H = top + 7 * step;
  let rects = '', months = '', lastMonth = -1;
  series.forEach((d, i) => {
    const idx = i + offset, col = Math.floor(idx / 7), row = idx % 7;
    const dt = new Date(d.k + 'T00:00:00');
    if (row === 0 && dt.getMonth() !== lastMonth && col < weeks - 1) {
      lastMonth = dt.getMonth();
      months += `<text x="${col * step}" y="10">${dt.toLocaleDateString(undefined, { month: 'short' })}</text>`;
    }
    rects += `<rect class="l${level(d.v)}" data-tip="${esc(dt.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}: ${fmtN(d.v)} plays" x="${col * step}" y="${top + row * step}" width="${cell}" height="${cell}" rx="3"></rect>`;
  });
  return `<div class="heat"><svg viewBox="0 0 ${W} ${H}"${compact ? '' : ` style="min-width:${Math.min(W, 640)}px"`}>${months}${rects}</svg></div>
    <div class="heatkey">less ${[0, 1, 2, 3, 4].map((l) => `<svg width="13" height="13"><rect class="l${l}" width="13" height="13" rx="3"/></svg>`).join('')} more</div>`;
}

function streaks(series) {
  let best = 0, bestEnd = null, run = 0;
  series.forEach((d) => {
    run = d.v > 0 ? run + 1 : 0;
    if (run > best) { best = run; bestEnd = d.k; }
  });
  let current = 0;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].v > 0) current++;
    else if (i === series.length - 1) continue; // today may still be empty
    else break;
  }
  const busiest = series.reduce((m, d) => (d.v > m.v ? d : m), { k: '', v: 0 });
  const active = series.filter((d) => d.v > 0).length;
  return { best, bestEnd, current, busiest, active };
}

const fmtDay = (k) => (k ? new Date(k + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

async function pageStats() {
  const u = user();
  const P = `period=${period}`;
  const [sum, ta, tt, tal, daily, monthly, all] = await Promise.all([
    api(`/u/${enc(u)}/summary?${P}&tz=${TZ}`),
    api(`/u/${enc(u)}/top/artists?${P}&limit=15`),
    api(`/u/${enc(u)}/top/tracks?${P}&limit=15`),
    api(`/u/${enc(u)}/top/albums?${P}&limit=12`),
    api(`/u/${enc(u)}/timeline?days=365&tz=${TZ}`),
    api(`/u/${enc(u)}/timeline?days=0&tz=${TZ}`),
    api(`/u/${enc(u)}/summary?period=overall&tz=${TZ}`),
  ]);
  const year = fillDays(daily, 365);
  const st = streaks(year);
  const yearTotal = year.reduce((a, d) => a + d.v, 0);
  const spanDays = { '7day': 7, '1month': 30, '3month': 90, '6month': 182, '12month': 365 }[period]
    || Math.max(1, Math.ceil((Date.now() / 1000 - (all.first_scrobble || Date.now() / 1000)) / 86400));
  const perDay = sum.scrobbles / spanDays;
  const avgTrack = sum.scrobbles ? sum.listening_seconds / sum.scrobbles : 0;
  const topArtist = ta.rows[0];
  const share = topArtist && sum.scrobbles ? Math.round((100 * topArtist.plays) / sum.scrobbles) : 0;
  const busyHour = sum.hours.indexOf(Math.max(...sum.hours));
  const wdNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const busyWd = sum.weekdays.indexOf(Math.max(...sum.weekdays));
  // on a phone the whole year is too wide to read, so show the last six months fitted to the screen
  const narrow = window.matchMedia('(max-width: 640px)').matches;
  const heatSeries = narrow ? year.slice(-182) : year;
  const heatTotal = narrow ? heatSeries.reduce((n, d) => n + d.v, 0) : yearTotal;
  const heatActive = narrow ? heatSeries.filter((d) => d.v > 0).length : st.active;
  const monthSeries = monthly.map((r) => ({ k: r.bucket, v: r.plays }));
  const hh = hourName;

  view.innerHTML = `
    <div class="pagehead"><div><h1>Stats</h1>
    <p class="sub">${esc(u)} · every number, sliced a few ways</p></div>
    <div class="acts"><a class="btn" href="#/recap/${new Date().getFullYear()}">✨ Your ${new Date().getFullYear()} recap</a></div></div>
    <div id="periods"></div>
    <div class="tiles">
      <div class="tile"><div class="n">${fmtN(sum.scrobbles)}</div><div class="l">scrobbles</div></div>
      <div class="tile"><div class="n">${fmtN(sum.artists)}</div><div class="l">artists</div></div>
      <div class="tile"><div class="n">${fmtN(sum.tracks)}</div><div class="l">tracks</div></div>
      <div class="tile"><div class="n">${fmtN(sum.albums)}</div><div class="l">albums</div></div>
      <div class="tile"><div class="n">${hours(sum.listening_seconds)}</div><div class="l">hours listened</div></div>
      <div class="tile"><div class="n">${perDay >= 10 ? Math.round(perDay) : perDay.toFixed(1)}</div><div class="l">plays per day</div></div>
      <div class="tile"><div class="n">${avgTrack ? (avgTrack / 60).toFixed(1) : '—'}<small> min</small></div><div class="l">average track length</div></div>
      <div class="tile"><div class="n">${share}<small>%</small></div><div class="l">${topArtist ? `of plays are ${esc(topArtist.artist)}` : 'top artist share'}</div></div>
    </div>

    <section class="panel"><h2>${narrow ? 'The last 6 months' : 'The last year'} <span class="more">${fmtN(heatTotal)} plays on ${heatActive} days</span></h2>${heatmap(heatSeries, narrow)}</section>

    <div class="tiles">
      <div class="tile"><div class="n">${st.current}<small> day${st.current === 1 ? '' : 's'}</small></div><div class="l">current streak</div></div>
      <div class="tile"><div class="n">${st.best}<small> day${st.best === 1 ? '' : 's'}</small></div><div class="l">longest streak${st.bestEnd ? ` · ended ${fmtDay(st.bestEnd)}` : ''}</div></div>
      <div class="tile"><div class="n">${fmtN(st.busiest.v)}</div><div class="l">busiest day · ${fmtDay(st.busiest.k)}</div></div>
      <div class="tile"><div class="n">${sum.scrobbles ? hh(busyHour) : '—'}</div><div class="l">favourite hour</div></div>
      <div class="tile"><div class="n">${sum.scrobbles ? wdNames[busyWd].slice(0, 3) : '—'}</div><div class="l">favourite day of the week</div></div>
    </div>

    <div id="ms"></div>

    <section class="panel"><h2>Month by month <span class="more">all time</span></h2>${barChart(monthSeries, { labelEvery: Math.ceil(monthSeries.length / 12), fmtLabel: (k) => k.slice(2) })}</section>

    <div class="grid2">
      <section class="panel"><h2>Listening clock</h2>${clockChart(sum.hours)}</section>
      <section class="panel"><h2>By weekday</h2>${barChart(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((k, i) => ({ k, v: sum.weekdays[i] })))}</section>
    </div>

    <div class="grid2">
      <section class="panel"><h2>Top artists <a class="more" href="#/library/artists">see all →</a></h2>${rowsList(ta.rows.map((r) => ({ ...r, kind: 'artist' })))}</section>
      <section class="panel"><h2>Top tracks <a class="more" href="#/library/tracks">see all →</a></h2>${rowsList(tt.rows)}</section>
    </div>
    <section><h2>Top albums <a class="more" href="#/library/albums">see all →</a></h2>${cards(tal.rows, 'albums')}</section>`;
  $('#periods').replaceWith(periodChips(route));
  if (prefs.show_milestones) loadMilestones(u);
}

async function loadMilestones(u) {
  const m = await api(`/u/${enc(u)}/milestones`).catch(() => null);
  const box = $('#ms');
  if (!m || !box || !m.total) return;
  const eta = m.next_eta ? new Date(m.next_eta * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const left = m.next - m.total;
  box.innerHTML = `<section class="panel"><h2>Milestones <span class="more">${fmtN(m.total)} scrobbles so far</span></h2>
    <div class="nextms"><div class="bar"><i style="width:${Math.min(100, (100 * m.total) / m.next)}%"></i></div>
      <div><b>${fmtN(left)}</b> to go until your <b>${fmtN(m.next)}th</b> scrobble${eta ? ` · about <b>${eta}</b> at your pace (${m.per_day >= 10 ? Math.round(m.per_day) : m.per_day.toFixed(1)} a day)` : ''}</div></div>
    <div class="rows">${m.reached.map((x) => `
      <div class="row" data-go="${esc(trackHref(x.scrobble.artist, x.scrobble.track))}">
        <div class="msn">${x.n === 1 ? 'first' : `#${compact(x.n)}`}</div>${cover(x.scrobble)}
        <div class="main"><div class="t">${trackLink(x.scrobble.artist, x.scrobble.track)}</div><div class="s">${artistLink(x.scrobble.artist)}</div></div>
        <div class="when">${dateOf(x.scrobble.ts)}</div>
      </div>`).join('')}</div></section>`;
}

async function pageRecent(params) {
  const u = user();
  let page = Number(params.get('page') || 1);
  const q = params.get('q') || '';
  const limit = 50;
  const data = await api(`/u/${enc(u)}/recent?limit=${limit}&page=${page}&q=${enc(q)}`);
  const pages = Math.max(1, Math.ceil(data.total / limit));
  view.innerHTML = `
    <h1>Scrobbles</h1><p class="sub">${fmtN(data.total)} ${q ? 'matching' : 'total'}</p>
    <form class="toolbar" id="sf"><input type="search" name="q" placeholder="Search artist, track or album…" value="${esc(q)}"/><button class="btn">Search</button></form>
    <div class="panel" id="list">${scrobbleList(data.rows, { canDelete: isOwner() })}</div>
    <div class="pager"><button class="btn" id="prev" ${page <= 1 ? 'disabled' : ''}>← Newer</button> page ${page} / ${pages}
      <button class="btn" id="next" ${page >= pages ? 'disabled' : ''}>Older →</button></div>`;
  const go = (p) => (location.hash = `#/recent?page=${p}${q ? `&q=${enc(q)}` : ''}`);
  $('#prev').onclick = () => go(page - 1);
  $('#next').onclick = () => go(page + 1);
  $('#sf').onsubmit = (e) => { e.preventDefault(); location.hash = `#/recent?q=${enc(new FormData(e.target).get('q'))}`; };
  bindDelete($('#list'));
}

async function pageLibrary(kind, params) {
  const u = user();
  const page = Number(params.get('page') || 1);
  const limit = 50;
  const data = await api(`/u/${enc(u)}/top/${kind}?period=${period}&limit=${limit}&page=${page}`);
  const pages = Math.max(1, Math.ceil(data.total / limit));
  view.innerHTML = `
    <h1>Library</h1><p class="sub">${fmtN(data.total)} ${kind}</p>
    <div class="tabs">${['artists', 'albums', 'tracks'].map((k) => `<a class="chip ${k === kind ? 'on' : ''}" href="#/library/${k}">${k[0].toUpperCase() + k.slice(1)}</a>`).join('')}</div>
    <div id="periods"></div>
    <div class="panel">${rowsList(data.rows)}</div>
    <div class="pager"><button class="btn" id="prev" ${page <= 1 ? 'disabled' : ''}>←</button> page ${page} / ${pages}
      <button class="btn" id="next" ${page >= pages ? 'disabled' : ''}>→</button></div>`;
  $('#periods').replaceWith(periodChips(route));
  $('#prev').onclick = () => (location.hash = `#/library/${kind}?page=${page - 1}`);
  $('#next').onclick = () => (location.hash = `#/library/${kind}?page=${page + 1}`);
}

async function pageArtist(name) {
  const u = user();
  const A = `artist=${enc(name)}`;
  const [info, tracks, albums, tl, rec] = await Promise.all([
    api(`/u/${enc(u)}/artist?name=${enc(name)}`),
    api(`/u/${enc(u)}/top/tracks?${A}&limit=15`),
    api(`/u/${enc(u)}/top/albums?${A}&limit=12`),
    api(`/u/${enc(u)}/timeline?days=0&tz=${TZ}&${A}`),
    api(`/u/${enc(u)}/recent?${A}&limit=10`),
  ]);
  view.innerHTML = `
    <div class="hero">${cover({ artist: info.artist, kind: 'artist' })}
      <div class="grow"><h1>${esc(info.artist)}</h1>
      <p class="sub">${info.plays ? `${fmtN(info.plays)} plays${info.rank ? ` · #${info.rank} all-time` : ''}` : 'not in your library yet'}</p>
      <div class="facts" id="xf"></div>
      <div class="acts">${shareBtn(`/fm/s/artist/${enc(info.artist)}`)}${isOwner() && info.plays ? '<button type="button" class="btn" id="ren">✎ Rename</button>' : ''}</div></div></div>
    ${info.plays ? `<div class="tiles">
      <div class="tile"><div class="n">${fmtN(info.plays)}</div><div class="l">plays</div></div>
      <div class="tile"><div class="n">${info.rank ? `#${info.rank}` : '—'}</div><div class="l">all-time rank</div></div>
      <div class="tile"><div class="n">${fmtN(tracks.total)}</div><div class="l">tracks played</div></div>
      <div class="tile"><div class="n">${fmtN(albums.total)}</div><div class="l">albums</div></div>
      <div class="tile"><div class="n sm">${dateOf(info.first_ts)}</div><div class="l">first heard</div></div>
      <div class="tile"><div class="n sm">${info.last_ts ? ago(info.last_ts) : '—'}</div><div class="l">last heard</div></div>
    </div>` : ''}
    <div id="xa"></div>
    ${info.plays ? `<section class="panel"><h2>Plays per month</h2>${barChart(tl.map((r) => ({ k: r.bucket, v: r.plays })), { labelEvery: Math.ceil(tl.length / 10) })}</section>
    <section><h2>Albums</h2>${cards(albums.rows, 'albums')}</section>
    <div class="grid2">
      <section class="panel"><h2>Top tracks</h2>${rowsList(tracks.rows)}</section>
      <section class="panel"><h2>Recent</h2>${scrobbleList(rec.rows)}</section>
    </div>` : ''}`;
  const ren = $('#ren');
  if (ren) ren.onclick = async () => { const to = await renameFlow('artist', { from: info.artist }); if (to) location.hash = `#/artist/${enc(to)}`; };
  loadArtistExtra(info.artist);
}

const dateOf = (ts) => (ts ? new Date(ts * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const extJSON = (path) => fetch(`/fm/api${path}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const imgCover = (url, initial, cls = 'cover') => `<div class="${cls}"><img loading="lazy" alt="" src="${esc(url)}" onerror="this.remove()"/><span style="position:absolute">${esc(String(initial || '?').charAt(0).toUpperCase())}</span></div>`;
const playBtn = (url) => (url ? `<button type="button" class="pbtn" data-preview="${esc(url)}" aria-label="Play a 30 second preview" title="30 second preview"></button>` : '');

// What the web knows about an artist (Deezer, MusicBrainz, Wikipedia), filled in after the page is up.
async function loadArtistExtra(name) {
  const x = await extJSON(`/artist-info?name=${enc(name)}`);
  const facts = $('#xf'), box = $('#xa');
  if (!x || !facts || !box) return;                       // failed, or we've already navigated away
  const typeLabel = { Group: 'Band', Person: 'Solo artist', Orchestra: 'Orchestra', Choir: 'Choir' }[x.type] || x.type;
  const chips = [];
  const where = [flag(x.country), typeLabel, x.area].filter(Boolean).join(' ');
  if (where) chips.push(`<span class="fact">${esc(where)}</span>`);
  if (x.begin) chips.push(`<span class="fact">${x.ended && x.end && x.end !== x.begin ? `${esc(x.begin)}–${esc(x.end)}` : `Since ${esc(x.begin)}`}</span>`);
  if (x.fans) chips.push(`<span class="fact">${compact(x.fans)} fans on Deezer</span>`);
  if (x.albums_count) chips.push(`<span class="fact">${fmtN(x.albums_count)} releases</span>`);
  for (const t of x.tags || []) chips.push(`<span class="fact tag">${esc(t)}</span>`);
  facts.innerHTML = chips.join('');
  const links = [x.bio?.url && `<a href="${esc(x.bio.url)}" target="_blank" rel="noopener noreferrer">Wikipedia ↗</a>`, x.deezer_url && `<a href="${esc(x.deezer_url)}" target="_blank" rel="noopener noreferrer">Deezer ↗</a>`].filter(Boolean).join(' · ');
  const about = x.bio?.text ? `<section class="panel"><h2>About</h2>
      <p class="bio${x.bio.text.length > 320 ? ' clamp' : ''}" id="bio">${esc(x.bio.text)}</p>
      <div class="biof">${x.bio.text.length > 320 ? '<button type="button" class="lnk" id="bm">Read more</button>' : ''}<span class="more">${links}</span></div></section>` : '';
  const pop = x.top?.length ? `<section class="panel"><h2>Popular right now <span class="more">▶ plays a 30s preview</span></h2><div class="rows">${x.top.map((t) => `
      <div class="row" data-go="${esc(trackHref(name, t.title))}">
        ${t.cover ? imgCover(t.cover, t.title) : `<div class="cover"><span>♪</span></div>`}
        <div class="main"><div class="t">${trackLink(name, t.title)}</div><div class="s">${esc(t.album || '')}</div></div>
        <div class="when">${t.duration ? mmss(t.duration) : ''}</div>${playBtn(t.preview)}
      </div>`).join('')}</div></section>` : '';
  const similar = x.related?.length ? `<section><h2>Similar artists</h2><div class="cards">${x.related.map((r) => `
      <a class="card" href="#/artist/${enc(r.name)}">${r.picture ? imgCover(r.picture, r.name) : cover({ artist: r.name, kind: 'artist' })}
        <div class="meta"><div class="t">${esc(r.name)}</div></div></a>`).join('')}</div></section>` : '';
  box.innerHTML = `${about || pop ? `<div class="${about && pop ? 'grid2' : ''}">${about}${pop}</div>` : ''}${similar}`;
  $('#bm')?.addEventListener('click', (e) => { const c = $('#bio').classList.toggle('clamp'); e.target.textContent = c ? 'Read more' : 'Show less'; });
}

async function pageTrack(artist, track) {
  const u = user();
  const T = `artist=${enc(artist)}&track=${enc(track)}`;
  const [info, tl, rec, more] = await Promise.all([
    api(`/u/${enc(u)}/track?${T}`),
    api(`/u/${enc(u)}/timeline?days=0&tz=${TZ}&${T}`),
    api(`/u/${enc(u)}/recent?${T}&limit=25`),
    api(`/u/${enc(u)}/top/tracks?artist=${enc(artist)}&limit=8`),
  ]);
  artist = info.artist; track = info.track;
  const secs = info.duration && info.plays ? info.duration * info.plays : 0;
  const listened = secs >= 3600 ? `${hours(secs)}<small> h</small>` : `${Math.round(secs / 60)}<small> min</small>`;
  view.innerHTML = `
    <div class="hero">${cover({ artist, album: info.album, track }, 'cover sq')}
      <div class="grow"><h1>${esc(track)}</h1>
      <p class="sub">${artistLink(artist)}${info.album ? ` · ${albumLink(artist, info.album)}` : ''}</p>
      <div class="facts" id="xf"></div>
      <div class="acts">${isOwner() && info.plays ? `<button type="button" class="btn" id="love">${info.loved ? '♥ Loved' : '♡ Love'}</button>` : ''}<span id="xp"></span>${shareBtn(`/fm/s/track/${enc(artist)}/${enc(track)}`)}${isOwner() && info.plays ? '<button type="button" class="btn" id="ren">✎ Rename</button>' : ''}</div></div></div>
    ${info.plays ? `<div class="tiles">
      <div class="tile"><div class="n">${fmtN(info.plays)}</div><div class="l">plays</div></div>
      <div class="tile"><div class="n sm">${dateOf(info.first_ts)}</div><div class="l">first heard</div></div>
      <div class="tile"><div class="n sm">${info.last_ts ? ago(info.last_ts) : '—'}</div><div class="l">last heard</div></div>
      <div class="tile"><div class="n">${info.duration ? mmss(info.duration) : '—'}</div><div class="l">length</div></div>
      <div class="tile"><div class="n">${secs ? listened : '—'}</div><div class="l">time spent on it</div></div>
    </div>
    <section class="panel"><h2>Plays per month</h2>${barChart(tl.map((r) => ({ k: r.bucket, v: r.plays })), { labelEvery: Math.ceil(tl.length / 10) })}</section>`
    : `<div class="empty">You haven't played this one yet 🎧</div>`}
    <div id="xa"></div>
    <div class="grid2">
      ${info.plays ? `<section class="panel"><h2>Every play <span class="more">${fmtN(rec.total)}</span></h2><div id="plays">${scrobbleList(rec.rows, { canDelete: isOwner() })}</div></section>` : ''}
      <section class="panel"><h2>More from ${esc(artist)} <a class="more" href="#/artist/${enc(artist)}">artist page →</a></h2>${rowsList(more.rows)}</section>
    </div>`;
  bindDelete($('#plays'));
  const ren = $('#ren');
  if (ren) ren.onclick = async () => { const to = await renameFlow('track', { artist, from: track }); if (to) location.hash = trackHref(artist, to); };
  const love = $('#love');
  if (love) {
    let loved = !!info.loved;
    love.onclick = async () => {
      love.disabled = true;
      try { await api('/love', { method: 'POST', body: { artist, track, loved: !loved } }); loved = !loved; love.textContent = loved ? '♥ Loved' : '♡ Love'; if (loved) window.FX?.burst?.(love.getBoundingClientRect().left + 30, love.getBoundingClientRect().top, 8, '💖'); } catch (err) { console.error(err); }
      love.disabled = false;
    };
  }
  loadTrackExtra(artist, track);
}

async function loadTrackExtra(artist, track) {
  const [t, a] = await Promise.all([extJSON(`/track-info?artist=${enc(artist)}&track=${enc(track)}`), extJSON(`/artist-info?name=${enc(artist)}`)]);
  const facts = $('#xf'), box = $('#xa'), pbox = $('#xp');
  if (!facts || !box) return;
  const chips = [];
  if (t?.release_date) chips.push(`<span class="fact">Released ${esc(new Date(t.release_date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}</span>`);
  if (t?.bpm) chips.push(`<span class="fact">${Math.round(t.bpm)} BPM</span>`);
  if (t?.explicit) chips.push('<span class="fact">Explicit</span>');
  if (t && !t.release_date && t.album) chips.push(`<span class="fact">${esc(t.album)}</span>`);
  const others = (t?.contributors || []).filter((n) => n.toLowerCase() !== artist.toLowerCase());
  if (others.length) chips.push(`<span class="fact">with ${others.map(artistLink).join(', ')}</span>`);
  for (const tag of (a?.tags || []).slice(0, 3)) chips.push(`<span class="fact tag">${esc(tag)}</span>`);
  facts.innerHTML = chips.join('');
  if (pbox && t?.preview) pbox.innerHTML = `<button type="button" class="btn play" data-preview="${esc(t.preview)}">30s preview</button>${t.deezer_url ? ` <a class="btn" href="${esc(t.deezer_url)}" target="_blank" rel="noopener noreferrer">Deezer ↗</a>` : ''}`;
  if (a?.bio?.text) {
    const short = a.bio.text.length > 260 ? `${a.bio.text.slice(0, 260).replace(/\s+\S*$/, '')}…` : a.bio.text;
    box.innerHTML = `<section class="panel"><h2>About ${esc(artist)} <a class="more" href="#/artist/${enc(artist)}">artist page →</a></h2><p class="bio">${esc(short)}</p></section>`;
  }
}

// ---------------------------------------------------------------- album page
const songKey = (s) => String(s || '').toLowerCase().replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/\s+-\s+.*$/, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function albumTracks(list, max, { numbered = false } = {}) {
  if (!list.length) return '<div class="empty">no songs yet</div>';
  return `<div class="rows">${list.map((t) => `
    <div class="row${t.plays ? '' : ' unplayed'}" data-go="${esc(trackHref(t.artist, t.title))}">
      ${numbered ? `<div class="rk">${t.n ?? ''}</div>` : ''}
      <div class="main"><div class="t">${trackLink(t.artist, t.title)}</div>${t.featured ? `<div class="s">${esc(t.featured)}</div>` : ''}</div>
      ${t.duration ? `<div class="when">${mmss(t.duration)}</div>` : ''}
      ${playBtn(t.preview)}
      <div class="bar">${t.plays ? `<i style="width:${(100 * t.plays) / max}%"></i>` : ''}<span>${t.plays ? `${fmtN(t.plays)} plays` : 'not played'}</span></div>
    </div>`).join('')}</div>`;
}

async function pageAlbum(artist, album) {
  const u = user();
  const [info, more] = await Promise.all([
    api(`/u/${enc(u)}/album?artist=${enc(artist)}&album=${enc(album)}&tz=${TZ}`),
    api(`/u/${enc(u)}/top/albums?artist=${enc(artist)}&limit=13`),
  ]);
  artist = info.artist; album = info.album;
  const secs = info.listening_seconds;
  const mine = info.tracks.map((t) => ({ artist: t.artist, title: t.track, plays: t.plays, duration: t.duration }));
  const others = more.rows.filter((r) => r.album.toLowerCase() !== album.toLowerCase()).slice(0, 12);
  view.innerHTML = `
    <div class="hero">${cover({ artist, album }, 'cover sq')}
      <div class="grow"><h1>${esc(album)}</h1>
      <p class="sub">${artistLink(artist)}</p>
      <div class="facts" id="xf"></div>
      <div class="acts"><span id="xp"></span>${shareBtn(`/fm/s/album/${enc(artist)}/${enc(album)}`)}${isOwner() && info.plays ? '<button type="button" class="btn" id="ren">✎ Rename</button>' : ''}</div></div></div>
    ${info.plays ? `<div class="tiles">
      <div class="tile"><div class="n">${fmtN(info.plays)}</div><div class="l">plays</div></div>
      <div class="tile"><div class="n" id="heard">${fmtN(info.tracks.length)}</div><div class="l" id="heardl">songs played</div></div>
      <div class="tile"><div class="n">${secs >= 3600 ? `${hours(secs)}<small> h</small>` : `${Math.round(secs / 60)}<small> min</small>`}</div><div class="l">time spent on it</div></div>
      <div class="tile"><div class="n sm">${dateOf(info.first_ts)}</div><div class="l">first heard</div></div>
      <div class="tile"><div class="n sm">${info.last_ts ? ago(info.last_ts) : '—'}</div><div class="l">last heard</div></div>
    </div>
    <section class="panel"><h2>Plays per month</h2>${barChart(info.months.map((r) => ({ k: r.bucket, v: r.plays })), { labelEvery: Math.ceil(info.months.length / 10) })}</section>`
    : `<div class="empty">You haven't played this album yet 🎧</div>`}
    <section class="panel"><h2>Songs <span class="more" id="tlh">${info.plays ? 'your plays' : ''}</span></h2><div id="tracks">${albumTracks(mine, Math.max(1, ...mine.map((t) => t.plays)))}</div></section>
    <div class="grid2">
      ${info.plays ? `<section class="panel"><h2>Recent plays</h2><div id="plays">${scrobbleList(info.recent, { canDelete: isOwner() })}</div></section>` : ''}
      ${others.length ? `<section class="panel"><h2>More from ${esc(artist)} <a class="more" href="#/artist/${enc(artist)}">artist page →</a></h2>${rowsList(others, { rank: false })}</section>` : ''}
    </div>`;
  bindDelete($('#plays'));
  const ren = $('#ren');
  if (ren) ren.onclick = async () => { const to = await renameFlow('album', { artist, from: album }); if (to) location.hash = albumHref(artist, to); };
  loadAlbumExtra(artist, album, mine);
}

async function loadAlbumExtra(artist, album, mine) {
  const x = await extJSON(`/album-info?artist=${enc(artist)}&album=${enc(album)}`);
  const facts = $('#xf'), box = $('#tracks');
  if (!x || !facts || !box || !x.title) return;
  const chips = [];
  if (x.record_type && x.record_type !== 'album') chips.push(`<span class="fact">${esc(x.record_type[0].toUpperCase() + x.record_type.slice(1))}</span>`);
  if (x.release_date) chips.push(`<span class="fact">Released ${esc(new Date(x.release_date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }))}</span>`);
  if (x.nb_tracks) chips.push(`<span class="fact">${x.nb_tracks} song${x.nb_tracks === 1 ? '' : 's'}${x.duration ? ` · ${Math.round(x.duration / 60)} min` : ''}</span>`);
  if (x.label) chips.push(`<span class="fact">${esc(x.label)}</span>`);
  if (x.fans) chips.push(`<span class="fact">${compact(x.fans)} fans on Deezer</span>`);
  for (const g of x.genres || []) chips.push(`<span class="fact tag">${esc(g)}</span>`);
  facts.innerHTML = chips.join('');
  if (x.deezer_url && $('#xp')) $('#xp').innerHTML = `<a class="btn" href="${esc(x.deezer_url)}" target="_blank" rel="noopener noreferrer">Deezer ↗</a>`;
  if (!x.tracks?.length) return;

  // the real tracklist, with your plays matched onto it; songs you played that aren't on it go at the end
  const byKey = new Map(mine.map((t) => [songKey(t.title), t]));
  const used = new Set();
  const list = x.tracks.map((t) => {
    const k = songKey(t.title);
    const m = byKey.get(k);
    if (m) used.add(k);
    const feat = t.artist && t.artist.toLowerCase() !== artist.toLowerCase() ? t.artist : '';
    return { n: t.n, artist: m?.artist || artist, title: m?.title || t.title, plays: m?.plays || 0, duration: t.duration, preview: t.preview, featured: feat };
  });
  const extra = mine.filter((t) => !used.has(songKey(t.title)));
  const heard = list.filter((t) => t.plays).length;
  const max = Math.max(1, ...list.map((t) => t.plays), ...extra.map((t) => t.plays));
  box.innerHTML = albumTracks(list, max, { numbered: true }) + (extra.length ? `<h3 class="subh">Also played</h3>${albumTracks(extra, max)}` : '');
  $('#tlh').textContent = '▶ plays a 30s preview';
  if ($('#heard')) { $('#heard').innerHTML = `${heard}<small> / ${x.tracks.length}</small>`; $('#heardl').textContent = `songs heard · ${Math.round((100 * heard) / x.tracks.length)}% of the album`; }
}

// ---------------------------------------------------------------- search
async function pageSearch(params) {
  const q = (params.get('q') || '').trim();
  const u = user();
  const hs = $('#hsearch input');
  if (hs) hs.value = q;
  view.innerHTML = `<h1>Search</h1><p class="sub">Your whole library, all time</p>
    <form class="toolbar" id="sf2"><input type="search" name="q" value="${esc(q)}" placeholder="Artist, song or album…" /><button class="btn pri">Search</button></form>
    <div id="sr">${q ? '<div class="loading">searching…</div>' : '<div class="empty">Type an artist, song or album 🔎</div>'}</div>`;
  $('#sf2').onsubmit = (e) => { e.preventDefault(); location.hash = `#/search?q=${enc(new FormData(e.target).get('q'))}`; };
  if (!q) { $('#sf2 input').focus(); return; }
  const r = await api(`/u/${enc(u)}/search?q=${enc(q)}`);
  const sec = (title, items, total) => (items.length ? `<section class="panel"><h2>${title} <span class="more">${fmtN(total)} found</span></h2>${rowsList(items, { rank: false })}</section>` : '');
  const nothing = !r.artists.length && !r.albums.length && !r.tracks.length;
  $('#sr').innerHTML = `
    ${nothing ? `<div class="empty">Nothing in your library matches “${esc(q)}”.</div>` : ''}
    <div class="grid2">${sec('Artists', r.artists, r.totals.artists)}${sec('Albums', r.albums, r.totals.albums)}</div>
    ${sec('Songs', r.tracks, r.totals.tracks)}
    ${r.web.length ? `<section><h2>Not in your library yet</h2><div class="cards">${r.web.map((a) => `
      <a class="card" href="#/artist/${enc(a.name)}">${a.picture ? imgCover(a.picture, a.name) : cover({ artist: a.name, kind: 'artist' })}
        <div class="meta"><div class="t">${esc(a.name)}</div>${a.fans ? `<div class="s">${compact(a.fans)} fans</div>` : ''}</div></a>`).join('')}</div></section>` : ''}`;
}

// ---------------------------------------------------------------- recap
function recapRange(key) {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(key || '');
  if (!m) return null;
  const y = Number(m[1]), mo = m[2] ? Number(m[2]) - 1 : null;
  const from = new Date(y, mo ?? 0, 1), to = mo === null ? new Date(y + 1, 0, 1) : new Date(y, mo + 1, 1);
  const label = mo === null ? String(y) : from.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return { from: from.getTime() / 1000, to: to.getTime() / 1000, label, month: mo !== null, year: y };
}
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

async function pageRecap(key) {
  const u = user();
  const today = new Date();
  if (!recapRange(key)) key = ym(today);
  const R = recapRange(key);
  const all = await api(`/u/${enc(u)}/summary?period=overall`);
  const firstYear = all.first_scrobble ? new Date(all.first_scrobble * 1000).getFullYear() : today.getFullYear();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const picks = [[ym(today), 'This month'], [ym(lastMonth), 'Last month']];
  for (let y = today.getFullYear(); y >= firstYear; y--) picks.push([String(y), y === today.getFullYear() ? `${y} so far` : String(y)]);
  view.innerHTML = `<h1>Recap</h1><p class="sub">${esc(u)}'s listening, wrapped up</p>
    <div class="periods">${picks.map(([k, l]) => `<a class="chip ${k === key ? 'on' : ''}" href="#/recap/${k}">${esc(l)}</a>`).join('')}</div>
    <div id="rc"><div class="loading">wrapping it up…</div></div>`;
  const r = await api(`/u/${enc(u)}/recap?from=${R.from}&to=${R.to}&tz=${TZ}`);
  const box = $('#rc');
  if (!box) return;
  if (!r.scrobbles) { box.innerHTML = `<div class="empty">No scrobbles in ${esc(R.label)} 🐾</div>`; return; }
  const hrs = r.listening_seconds / 3600;
  const change = r.previous_scrobbles ? Math.round((100 * (r.scrobbles - r.previous_scrobbles)) / r.previous_scrobbles) : null;
  const ta = r.top_artists[0], tt = r.top_tracks[0];
  const share = ta ? Math.round((100 * ta.plays) / r.scrobbles) : 0;
  const busyHour = r.hours.indexOf(Math.max(...r.hours));
  const wd = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][r.weekdays.indexOf(Math.max(...r.weekdays))];
  const ongoing = R.to * 1000 > Date.now();
  box.innerHTML = `
    <div class="recap-hero">
      <div class="rlabel">${esc(R.label)}${ongoing ? ' · so far' : ''}</div>
      <div class="rbig">${hrs >= 10 ? fmtN(Math.round(hrs)) : hrs.toFixed(1)}<small> hours</small></div>
      <div class="rline">${fmtN(r.scrobbles)} plays · ${fmtN(r.artists_count)} artists · ${fmtN(r.tracks_count)} songs${change !== null ? ` · <b>${change >= 0 ? '+' : ''}${change}%</b> vs the ${R.month ? 'month' : 'year'} before` : ''}</div>
      <div class="acts">${shareBtn(`/fm/s/recap/${key}`, 'Share link')}<button type="button" class="btn" id="rimg">⬇ Save as image</button></div>
    </div>
    ${ta ? `<a class="recap-top" href="#/artist/${enc(ta.artist)}">${cover({ artist: ta.artist, kind: 'artist' })}
      <div><div class="lbl">Top artist</div><div class="rname">${esc(ta.artist)}</div><div class="s">${fmtN(ta.plays)} plays · ${share}% of everything you played</div></div></a>` : ''}
    <div class="grid2">
      <section class="panel"><h2>Top artists</h2>${rowsList(r.top_artists.map((a, i) => ({ ...a, rank: i + 1 })))}</section>
      <section class="panel"><h2>Top songs</h2>${rowsList(r.top_tracks.map((a, i) => ({ ...a, rank: i + 1 })))}</section>
    </div>
    ${r.top_albums.length ? `<section><h2>Top albums</h2>${cards(r.top_albums.map((a, i) => ({ ...a, rank: i + 1 })), 'albums')}</section>` : ''}
    <div class="tiles">
      <div class="tile"><div class="n">${fmtN(r.new_artists_count)}</div><div class="l">new artists discovered</div></div>
      <div class="tile"><div class="n">${r.longest_streak}<small> day${r.longest_streak === 1 ? '' : 's'}</small></div><div class="l">longest streak</div></div>
      <div class="tile"><div class="n">${fmtN(r.active_days)}</div><div class="l">days with music</div></div>
      <div class="tile"><div class="n">${r.busiest_day ? fmtN(r.busiest_day.plays) : '—'}</div><div class="l">biggest day${r.busiest_day ? ` · ${fmtDay(r.busiest_day.day)}` : ''}</div></div>
      <div class="tile"><div class="n">${hourName(busyHour)}</div><div class="l">favourite hour</div></div>
      <div class="tile"><div class="n">${wd.slice(0, 3)}</div><div class="l">favourite day</div></div>
    </div>
    ${r.new_artists.length ? `<section><h2>New to you</h2><div class="cards">${r.new_artists.map((a) => `
      <a class="card" href="#/artist/${enc(a.artist)}">${cover({ artist: a.artist, kind: 'artist' })}<div class="meta"><div class="t">${esc(a.artist)}</div><div class="s">${fmtN(a.plays)} plays</div></div></a>`).join('')}</div></section>` : ''}
    <div class="grid2">
      ${!R.month && r.months.length > 1 ? `<section class="panel"><h2>Month by month</h2>${barChart(r.months.map((m) => ({ k: m.bucket, v: m.plays })), { fmtLabel: (k) => new Date(k + '-01T00:00:00').toLocaleDateString(undefined, { month: 'short' }) })}</section>` : ''}
      <section class="panel"><h2>When you listened</h2>${clockChart(r.hours)}</section>
    </div>
    ${r.first ? `<p class="sub" style="text-align:center">The first song of ${esc(R.label)}: ${trackLink(r.first.artist, r.first.track)} by ${artistLink(r.first.artist)}, ${new Date(r.first.ts * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>` : ''}`;
  $('#rimg').onclick = () => recapImage(u, R, r).catch((e) => say(e.message));
}

// A 1080x1350 picture of the recap, for stories and group chats.
async function recapImage(u, R, r) {
  const W = 1080, H = 1350;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff6fae';
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  const ta = r.top_artists[0];
  const pic = ta ? await loadImg(`/fm/api/art?kind=artist&artist=${enc(ta.artist)}`) : null;
  const draw = (withPic) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, accent); bg.addColorStop(1, '#b58cff');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(15,13,20,.78)'; g.fillRect(40, 40, W - 80, H - 80);
    const F = (w, s) => `${w} ${s}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    const clip = (t, max, font) => { g.font = font; let s = String(t); while (g.measureText(s).width > max && s.length > 1) s = s.slice(0, -2) + '…'; return s; };
    g.fillStyle = '#fff';
    g.font = F(600, 40); g.fillText(`${u}'s ${R.label}`, 90, 140);
    g.fillStyle = accent; g.font = F(800, 150);
    const hrs = r.listening_seconds / 3600;
    g.fillText(hrs >= 10 ? fmtN(Math.round(hrs)) : hrs.toFixed(1), 90, 310);
    g.fillStyle = '#ece8f4'; g.font = F(500, 40); g.fillText(`hours · ${fmtN(r.scrobbles)} plays · ${fmtN(r.artists_count)} artists`, 90, 375);
    let y = 470;
    if (ta) {
      if (withPic && pic) { g.save(); g.beginPath(); g.arc(170, y + 80, 80, 0, Math.PI * 2); g.clip(); g.drawImage(pic, 90, y, 160, 160); g.restore(); }
      const x = withPic && pic ? 290 : 90;
      g.fillStyle = '#9a93aa'; g.font = F(500, 30); g.fillText('TOP ARTIST', x, y + 55);
      g.fillStyle = '#fff'; g.fillText(clip(ta.artist, W - x - 90, F(700, 56)), x, y + 120);
      g.fillStyle = '#9a93aa'; g.font = F(500, 30); g.fillText(`${fmtN(ta.plays)} plays`, x, y + 162);
      y += 230;
    }
    const col = (title, items, x) => {
      g.fillStyle = '#9a93aa'; g.font = F(500, 30); g.fillText(title, x, y);
      items.slice(0, 5).forEach((it, i) => {
        g.fillStyle = accent; g.font = F(700, 34); g.fillText(String(i + 1), x, y + 62 + i * 64);
        g.fillStyle = '#fff'; g.fillText(clip(it, 400, F(600, 34)), x + 44, y + 62 + i * 64);
      });
    };
    col('TOP ARTISTS', r.top_artists.map((a) => a.artist), 90);
    col('TOP SONGS', r.top_tracks.map((t) => t.track), 570);
    g.fillStyle = '#9a93aa'; g.font = F(500, 30);
    g.fillText(`${r.new_artists_count} new artists · ${r.longest_streak}-day streak`, 90, H - 110);
    g.fillStyle = '#fff'; g.font = F(700, 34); g.textAlign = 'right'; g.fillText('🐾 NyaFM', W - 90, H - 110);
    return new Promise((res, rej) => { try { c.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the image'))), 'image/png'); } catch (e) { rej(e); } });
  };
  let blob;
  try { blob = await draw(true); } catch { blob = await draw(false); }   // a cross-site picture can block saving; then leave it out
  const file = new File([blob], `nyafm-recap-${R.label.replace(/\s+/g, '-').toLowerCase()}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ files: [file] }); return; } catch { return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---------------------------------------------------------------- discover
async function pageDiscover(params) {
  const u = user();
  view.innerHTML = `<div class="pagehead"><div><h1>Discover</h1><p class="sub">Artists like the ones you play most, that you've never played</p></div>
    <div class="acts"><a class="btn" href="#/discover?fresh=${Date.now()}">↻ Refresh</a></div></div>
    <div id="dsc"><div class="loading">digging through crates… (the first time takes a few seconds)</div></div>`;
  const r = await api(`/u/${enc(u)}/discover${params.get('fresh') ? '?fresh=1' : ''}`);
  const box = $('#dsc');
  if (!box) return;
  if (!r.artists.length) { box.innerHTML = '<div class="empty">Play a few more artists and suggestions will show up here 🎧</div>'; return; }
  box.innerHTML = `<p class="hint">Based on ${r.seeds.slice(0, 5).map(artistLink).join(', ')}${r.seeds.length > 5 ? ' and more' : ''}. ▶ plays a 30s preview.</p>
    <div class="dgrid">${r.artists.map((a) => `
      <div class="dcard">
        <a class="dpic" href="#/artist/${enc(a.name)}">${a.picture ? imgCover(a.picture, a.name) : cover({ artist: a.name, kind: 'artist' })}</a>
        <div class="dmeta">
          <a class="dname" href="#/artist/${enc(a.name)}">${esc(a.name)}</a>
          <div class="s">like ${a.because.map(esc).join(', ')}</div>
          ${a.song ? `<div class="dsong">${playBtn(a.song.preview)}<span>${esc(a.song.title)}</span></div>` : ''}
        </div>
      </div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- auth / settings
function loginForm(mode) {
  const setup = mode === 'setup';
  view.innerHTML = `
    <form class="form panel" id="f">
      <h1>${setup ? 'Welcome to NyaFM 🐾' : 'Log in'}</h1>
      <p class="sub">${setup ? 'Create your account. After this, signups close — it’s your server.' : 'Log in to manage your scrobbles.'}</p>
      <label>Username</label><input type="text" name="username" autocomplete="username" required />
      <label>Password</label><input type="password" name="password" autocomplete="${setup ? 'new-password' : 'current-password'}" required />
      ${setup && status.setup_key_required ? '<label>Setup key (NYAFM_SETUP_KEY)</label><input type="password" name="setup_key" required />' : ''}
      <div class="err" id="e"></div>
      <button class="btn pri" style="width:100%;margin-top:8px">${setup ? 'Create account' : 'Log in'}</button>
    </form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(setup ? '/setup' : '/login', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      await loadStatus();
      route();
    } catch (err) { $('#e').textContent = err.message; }
  };
}

const codeBox = (v) => `<div class="code"><code>${esc(v)}</code><button type="button" data-copy="${esc(v)}">Copy</button></div>`;

async function pageSettings() {
  if (!status.me) return loginForm('login');
  const [meInfo, S] = await Promise.all([api('/me'), api('/settings')]);
  const base = location.origin;
  const tog = (k, label, hint = '') => `<label class="setrow"><div><b>${label}</b>${hint ? `<div class="hint">${hint}</div>` : ''}</div><input type="checkbox" class="switch" data-k="${k}" ${S[k] ? 'checked' : ''}/></label>`;
  const SWATCHES = ['#ff6fae', '#b58cff', '#6fb8ff', '#5fd4d0', '#6fe0a8', '#ffd36f', '#ffa26f', '#ff6f6f'];
  view.innerHTML = `
    <h1>Settings</h1><p class="sub">Logged in as <b>${esc(meInfo.username)}</b> · changes save by themselves</p>
    <div class="jump">${[['s-look', 'Look'], ['s-priv', 'Privacy'], ['s-scrob', 'Scrobbling'], ['s-rules', 'Renames'], ['s-clean', 'Clean up'], ['s-conn', 'Connections'], ['s-data', 'Your data'], ['s-acct', 'Account']]
      .map(([id, l]) => `<a class="chip" href="#/settings" data-jump="${id}">${l}</a>`).join('')}</div>

    <section class="panel" id="s-look">
      <h2>Look & feel</h2>
      <div class="setrow"><div><b>Accent colour</b><div class="hint">Used all over your profile, for everyone who visits.</div></div>
        <div class="swatches">${SWATCHES.map((c) => `<button type="button" class="sw${c === S.accent ? ' on' : ''}" data-c="${c}" style="--c:${c}" aria-label="Accent ${c}"></button>`).join('')}
          <input type="color" id="accent" value="${esc(S.accent)}" aria-label="Custom accent colour" /></div></div>
      <div class="setrow"><div><b>Default time range</b><div class="hint">What Overview, Stats and Library open on.</div></div>
        <select id="defp">${PERIODS.map(([k, l]) => `<option value="${k}" ${k === S.default_period ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="setrow"><div><b>Clock</b></div>
        <select id="clock"><option value="24h" ${S.clock === '24h' ? 'selected' : ''}>24-hour (21:00)</option><option value="12h" ${S.clock === '12h' ? 'selected' : ''}>12-hour (9pm)</option></select></div>
      ${tog('show_lyrics', 'Synced lyrics', 'Under now playing on the Overview.')}
      ${tog('effects', 'Animations', 'Paw bursts, tilting cards, counting numbers.')}
      ${tog('show_milestones', 'Milestones', 'Your 1,000th, 10,000th… scrobble on the Stats page.')}
    </section>

    <section class="panel" id="s-priv">
      <h2>Privacy</h2>
      ${tog('private', 'Private profile', 'Only you can see your stats: logged in here, or with your token in apps. Link previews stop showing numbers too.')}
      ${tog('hide_now_playing', 'Hide what I’m playing right now', 'Your scrobbles still show up, just not the live “now playing”.')}
    </section>

    <section class="panel" id="s-scrob">
      <h2>What gets scrobbled</h2>
      ${tog('skip_cross_dupes', 'Count a song once when two apps send it', 'E.g. Spotify sync and a browser scrobbler both sending the same play.')}
      ${tog('block_lofi', 'Skip lofi', 'Anything with lofi / lo-fi in the artist, title or album.')}
      <div class="setrow col"><div><b>Never scrobble these</b><div class="hint">Words or names, one per line. Matches artist, title or album.</div></div>
        <textarea id="bwords" rows="3" placeholder="white noise&#10;rain sounds">${esc(S.block_words.join('\n'))}</textarea></div>
      ${tog('strip_feat', 'Drop “(feat. …)” from song titles', '“Song (feat. X)” becomes “Song”, so versions don’t split your stats.')}
      ${tog('strip_remaster', 'Drop “Remastered” tags', '“Song - Remastered 2011” becomes “Song”.')}
      ${tog('strip_edition', 'Drop album editions', '“Album (Deluxe Edition)” becomes “Album”.')}
      <p class="hint">These apply to new scrobbles. To fix old ones, use Renames below or ✎ Rename on any artist, song or album page.</p>
    </section>

    <section class="panel" id="s-rules">
      <h2>Renames</h2>
      <p class="hint">Fix names that arrive spelled different ways, e.g. <i>Beyonce</i> → <i>Beyoncé</i>. Every new scrobble is renamed on the way in.</p>
      <div id="rules"></div>
      <form id="addrule" class="ruleform">
        <select name="kind"><option value="artist">Artist</option><option value="track">Song</option><option value="album">Album</option></select>
        <input type="text" name="artist" placeholder="by artist" />
        <input type="text" name="from" placeholder="Rename this" required />
        <input type="text" name="to" placeholder="to this" required />
        <label class="chk"><input type="checkbox" name="apply" checked /> fix my existing scrobbles too</label>
        <button class="btn pri">Add</button>
      </form>
    </section>

    <section class="panel" id="s-clean">
      <h2>Clean up</h2>
      <div class="setrow"><div><b>Duplicate plays</b><div class="hint">The same song logged twice in a row, closer together than it could have played.</div></div>
        <div class="inl"><select id="dupdays"><option value="30">Last 30 days</option><option value="90" selected>Last 90 days</option><option value="365">Last year</option><option value="0">All time</option></select>
        <button type="button" class="btn" id="dupfind">Find</button></div></div>
      <div id="dupres"></div>
    </section>

    <div id="s-conn"></div>
    <section class="panel">
      <h2>Your scrobble token</h2>
      <p class="hint">Works as the ListenBrainz token and as the Last.fm session key. Keep it secret.</p>
      ${codeBox(meInfo.token)}
      <button class="btn" id="regen">Regenerate token</button>
    </section>
    <section class="panel" id="spotpanel">
      <h2>Spotify (automatic)</h2>
      <div id="spot" class="hint">checking…</div>
    </section>
    <section class="panel" id="applepanel">
      <h2>Apple Music (iPhone)</h2>
      <p class="hint">Apple doesn't share what you play live, but your iPhone's Music library keeps a play count and a last-played date for every song.
      The NyaFM iPhone app (or a Shortcut) sends those here, and every play since the last sync becomes a scrobble.
      Only songs in your library count (add the ones you stream). The latest play of each song gets its real time; earlier ones since the last sync are placed just before it.</p>
      <p class="hint"><b>iPhone app:</b> with it installed, open this page on the iPhone and tap:</p>
      <p><a class="btn" href="nyafm://setup?server=${encodeURIComponent(base)}&amp;token=${encodeURIComponent(meInfo.token)}">Connect the iPhone app</a></p>
      <details class="steps"><summary>No app? Build a Shortcut instead (about 2 minutes)</summary>
      <label>URL</label>${codeBox(base + '/v1/apple-music?text=1')}
      <label>Header: Authorization</label>${codeBox('Bearer ' + meInfo.token)}
      <ol>
        <li>Open <b>Shortcuts</b>, tap <b>+</b>, name it <i>Scrobble Apple Music</i>.</li>
        <li>Add <b>Find Music</b>. Tap <i>Add Filter</i> → <b>Last Played Date</b> → <b>is in the last</b> <b>3 days</b>. Turn on <i>Limit</i> and set it to <b>500</b>.</li>
        <li>Add <b>Repeat with Each</b> (it picks up the Music from step 2).</li>
        <li>Inside the repeat add <b>Text</b> and fill it with these, tapping each blue <i>Repeat Item</i> to pick the property, with <code>|||</code> between them:<br>
          <code>Artist|||Title|||Album|||Play Count|||Last Played Date|||Duration</code><br>
          Tap <i>Last Played Date</i> once more and set <b>Date Format → ISO 8601</b>.</li>
        <li>After <i>End Repeat</i>, add <b>Combine Text</b> → combine <i>Repeat Results</i> with <b>New Lines</b>.</li>
        <li>Add <b>Get Contents of URL</b> with the URL above. Show more: <b>Method POST</b>, add a header <code>Authorization</code> with the value above, <b>Request Body: File</b>, file = <i>Combined Text</i>.</li>
        <li>Add <b>Show Notification</b> with <i>Contents of URL</i>.</li>
        <li>Run it once. The first run only remembers your play counts. After that, each run scrobbles what you've played since.</li>
        <li>Automatic: <b>Automation</b> tab → <b>+</b> → <b>App</b> → Music, <b>Is Closed</b> → <b>Run Immediately</b> → pick the Shortcut. Add it to your Home Screen for a one-tap button too.</li>
      </ol></details>
    </section>
    <section class="panel">
      <h2>Connect scrobblers</h2>
      <p class="hint"><b>ListenBrainz-compatible</b> (Web Scrobbler, Pano Scrobbler, Navidrome, Jellyfin, multi-scrobbler, the NyaFM Spicetify extension):</p>
      <label>API URL</label>${codeBox(base)}
      <label>Submit endpoint (if the app wants the full URL)</label>${codeBox(base + '/1/submit-listens')}
      <p class="hint" style="margin-top:14px"><b>Last.fm / Libre.fm / GNU FM-compatible</b> apps with a custom server option:</p>
      <label>API root</label>${codeBox(base + '/2.0/')}
      <label>Auth page (desktop apps)</label>${codeBox(base + '/fm/api/auth/')}
      <p class="hint">Log in with your NyaFM username + password. Any API key / secret works.</p>
      <p class="hint" style="margin-top:14px"><b>Read your stats from other apps</b> (Discord status, widgets…) with Last.fm-style calls, e.g.</p>
      ${codeBox(`${base}/2.0/?method=user.getRecentTracks&user=${meInfo.username}&format=json&limit=1`)}
    </section>
    <section class="panel" id="s-data">
      <h2>Import history</h2>
      <p class="hint">Drop any of: a Last.fm CSV export (lastfm.ghan.nl / benjaminbenben style), Spotify <code>Streaming_History_Audio_*.json</code> or <code>StreamingHistory*.json</code>,
      a ListenBrainz export (.json / .jsonl), or a NyaFM export. Duplicates are skipped, so importing twice is safe.</p>
      <input type="file" id="imp" multiple accept=".csv,.json,.jsonl,.txt" />
      <div id="impst" class="hint" style="margin-top:10px"></div>
    </section>
    <section class="panel">
      <h2>Export</h2>
      <p class="hint">Your data, always. Download every scrobble.</p>
      <button class="btn" id="exj">Download JSON</button> <button class="btn" id="exc">Download CSV</button>
      <div id="exst" class="hint" style="margin-top:10px"></div>
    </section>
    <section class="panel danger">
      <h2>Delete scrobbles</h2>
      <p class="hint">Undo a bad import or a misbehaving app. This can't be undone, so maybe download an export first.</p>
      <div class="setrow"><div><b>By app</b><div class="hint">See where your scrobbles come from and remove everything from one.</div></div><button type="button" class="btn" id="srcload">Show apps</button></div>
      <div id="srclist"></div>
      <div class="setrow col"><div><b>By date</b><div class="hint">Everything between two days (inclusive), in your time zone.</div></div>
        <div class="inl"><input type="date" id="delfrom" /> to <input type="date" id="delto" /><button type="button" class="btn bad" id="deldates">Delete</button></div></div>
    </section>
    <section class="panel" id="s-acct">
      <h2>Account</h2>
      <form id="pw" style="max-width:380px">
        <label>Current password</label><input type="password" name="current" required />
        <label>New password</label><input type="password" name="new" required minlength="6" />
        <div class="err" id="pwe"></div><button class="btn">Change password</button>
      </form>
      <p style="margin-top:16px"><button class="btn" id="logout">Log out</button></p>
    </section>`;
  view.querySelectorAll('section').forEach((s) => (s.style.marginBottom = '18px'));
  $('#regen').onclick = async () => { if (confirm('Regenerate? Every scrobbler will need the new token.')) { await api('/token/regenerate', { method: 'POST' }); route(); } };
  $('#logout').onclick = async () => { await api('/logout', { method: 'POST' }); await loadStatus(); location.hash = '#/'; };
  bindSettings(S);
  $('#pw').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); $('#pwe').innerHTML = '<span class="okmsg">Password changed ✓</span>'; e.target.reset(); }
    catch (err) { $('#pwe').textContent = err.message; }
  };
  spotifyPanel();
  $('#imp').onchange = (e) => importFiles([...e.target.files]);
  $('#exj').onclick = () => exportAll('json');
  $('#exc').onclick = () => exportAll('csv');
}

function bindSettings(S) {
  const save = async (patch, msg = 'Saved ✓') => {
    try {
      Object.assign(S, await api('/settings', { method: 'PUT', body: patch }));
      applyPrefs(S);
      say(msg);
    } catch (err) { say(err.message); }
  };
  view.querySelectorAll('[data-jump]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); $(`#${a.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  view.querySelectorAll('input.switch[data-k]').forEach((el) => (el.onchange = () => save({ [el.dataset.k]: el.checked })));
  const pickAccent = (c) => { view.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.c === c)); $('#accent').value = c; save({ accent: c }); };
  view.querySelectorAll('.sw').forEach((b) => (b.onclick = () => pickAccent(b.dataset.c)));
  $('#accent').onchange = (e) => pickAccent(e.target.value);
  $('#defp').onchange = (e) => { period = e.target.value; localStorage.setItem('nyafm.period', period); save({ default_period: period }); };
  $('#clock').onchange = (e) => save({ clock: e.target.value });
  $('#bwords').onchange = (e) => save({ block_words: e.target.value.split('\n') });

  // renames
  const KIND = { artist: 'Artist', track: 'Song', album: 'Album' };
  const drawRules = () => {
    $('#rules').innerHTML = S.rules.length ? `<div class="rows">${S.rules.map((r, i) => `
      <div class="row rule"><span class="fact">${KIND[r.kind]}</span>
        <div class="main"><div class="t">${esc(r.from)} → <b>${esc(r.to)}</b></div>${r.artist ? `<div class="s">by ${esc(r.artist)}</div>` : ''}</div>
        <button type="button" class="x" data-i="${i}" title="Remove rule" aria-label="Remove rule">✕</button></div>`).join('')}</div>` : '<p class="hint">No renames yet.</p>';
    $('#rules').querySelectorAll('.x').forEach((b) => (b.onclick = () => { S.rules.splice(Number(b.dataset.i), 1); save({ rules: S.rules }, 'Rename removed').then(drawRules); }));
  };
  drawRules();
  const rf = $('#addrule');
  const syncKind = () => { rf.artist.style.display = rf.kind.value === 'artist' ? 'none' : ''; rf.artist.required = rf.kind.value !== 'artist'; };
  rf.kind.onchange = syncKind; syncKind();
  rf.onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(rf));
    const rule = { kind: v.kind, artist: v.kind === 'artist' ? '' : v.artist.trim(), from: v.from.trim(), to: v.to.trim() };
    const btn = rf.querySelector('button'); btn.disabled = true;
    try {
      if (v.apply) {
        const r = await api('/edit/rename', { method: 'POST', body: { ...rule, remember: true } });
        S.rules = (await api('/settings')).rules;
        say(`✎ Added, and renamed ${fmtN(r.changed)} existing scrobble${r.changed === 1 ? '' : 's'}`);
      } else await save({ rules: [...S.rules, rule] }, 'Rename added');
      rf.from.value = ''; rf.to.value = '';
      drawRules();
    } catch (err) { say(err.message); }
    btn.disabled = false;
  };

  // duplicates
  $('#dupfind').onclick = async () => {
    const box = $('#dupres');
    box.innerHTML = '<div class="hint">looking…</div>';
    try {
      const d = await api(`/duplicates?days=${$('#dupdays').value}`);
      if (!d.total_dupes) { box.innerHTML = '<p class="okmsg">No duplicates found ✓</p>'; return; }
      box.innerHTML = `<p><b>${fmtN(d.total_dupes)}</b> extra play${d.total_dupes === 1 ? '' : 's'} in ${fmtN(d.total_groups)} place${d.total_groups === 1 ? '' : 's'}. The first play of each is kept.
        <button type="button" class="btn pri" id="dupgo">Remove ${fmtN(d.total_dupes)}</button></p>
        <div class="rows">${d.groups.slice(0, 40).map((g) => `
          <div class="row"><div class="main"><div class="t">${esc(g.keep.track)} <span class="s">· ${esc(g.keep.artist)}</span></div>
          <div class="s">${new Date(g.keep.ts * 1000).toLocaleString()} · ${1 + g.dupes.length}× from ${[...new Set([g.keep, ...g.dupes].map((x) => sourceName(x.source || 'unknown')))].map(esc).join(' + ')}</div></div></div>`).join('')}</div>
        ${d.groups.length > 40 ? `<p class="hint">…and ${fmtN(d.groups.length - 40)} more</p>` : ''}`;
      $('#dupgo').onclick = async () => {
        const r = await api('/scrobbles/delete', { method: 'POST', body: { ids: d.ids } });
        box.innerHTML = `<p class="okmsg">Removed ${fmtN(r.deleted)} duplicate${r.deleted === 1 ? '' : 's'} ✓</p>`;
      };
    } catch (err) { box.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
  };

  // delete by app / by date
  $('#srcload').onclick = async () => {
    const box = $('#srclist');
    box.innerHTML = '<div class="hint">counting…</div>';
    const list = await api('/sources').catch((err) => { box.textContent = err.message; return null; });
    if (!list) return;
    box.innerHTML = `<div class="rows">${list.map((s) => `
      <div class="row"><div class="main"><div class="t">${esc(sourceName(s.source))}</div><div class="s">${esc(s.source)}</div></div>
      <div class="when">${fmtN(s.n)}</div><button type="button" class="btn bad" data-src="${esc(s.source)}" data-n="${s.n}">Delete</button></div>`).join('')}</div>`;
    box.querySelectorAll('[data-src]').forEach((b) => (b.onclick = async () => {
      if (!confirm(`Delete all ${fmtN(b.dataset.n)} scrobbles from “${sourceName(b.dataset.src)}”? This can't be undone.`)) return;
      b.disabled = true;
      const r = await api('/delete-where', { method: 'POST', body: { source: b.dataset.src } });
      say(`🗑 Deleted ${fmtN(r.deleted)} scrobbles`);
      $('#srcload').click();
    }));
  };
  $('#deldates').onclick = async () => {
    const f = $('#delfrom').value, t = $('#delto').value || f;
    if (!f) return say('Pick a start day first');
    const from = new Date(`${f}T00:00:00`).getTime() / 1000, to = new Date(`${t}T00:00:00`).getTime() / 1000 + 86400;
    if (to <= from) return say('The end day is before the start day');
    const n = (await api(`/u/${enc(status.me)}/recent?from=${from}&to=${to}&limit=1`)).total;
    if (!n) return say('No scrobbles on those days');
    if (!confirm(`Delete ${fmtN(n)} scrobbles from ${fmtDay(f)} to ${fmtDay(t)}? This can't be undone.`)) return;
    const r = await api('/delete-where', { method: 'POST', body: { from, to } });
    say(`🗑 Deleted ${fmtN(r.deleted)} scrobbles`);
  };
}

async function spotifyPanel() {
  const box = $('#spot');
  if (!box) return;
  try {
    const s = await api('/spotify/status');
    if (!s.configured) {
      box.innerHTML = `Not set up yet. Create an app at <a href="https://developer.spotify.com/dashboard" style="color:var(--accent)">developer.spotify.com/dashboard</a>,
        add this redirect URI, then set <code>SPOTIFY_CLIENT_ID</code> and <code>SPOTIFY_CLIENT_SECRET</code> in Vercel and redeploy.${codeBox(s.redirect_uri)}`;
    } else if (!s.connected) {
      box.innerHTML = `Pull your plays straight from Spotify, no Spicetify needed. <p><a class="btn" href="/fm/api/spotify/connect">Connect Spotify</a></p>`;
    } else {
      box.innerHTML = `Connected ✓ ${s.last_sync ? `· last sync ${ago(s.last_sync)} (${s.last_count} new)` : ''}
        <p><button class="btn" id="spsync">Sync now</button> <button class="btn" id="spoff">Disconnect</button></p>
        <p class="hint">Syncs automatically while this site is open${s.cron_secret_set ? ', and in the background when a pinger calls <code>/fm/api/spotify/sync</code>' : ''}.</p><div id="spmsg"></div>`;
      $('#spsync').onclick = async () => {
        $('#spmsg').textContent = 'syncing…';
        try { const r = await api('/spotify/sync', { method: 'POST' }); $('#spmsg').textContent = `${r.new_scrobbles} new scrobbles${r.now_playing ? ' · now playing: ' + r.now_playing : ''} ✓`; }
        catch (e) { $('#spmsg').textContent = e.message; }
      };
      $('#spoff').onclick = async () => { if (confirm('Disconnect Spotify?')) { await api('/spotify/disconnect', { method: 'POST' }); spotifyPanel(); } };
    }
  } catch (e) { box.textContent = e.message; }
}

// While you are logged in and the page is open, sync Spotify once a minute.
async function spotifyAuto() {
  if (!status?.me || document.hidden) return;
  try { const s = await api('/spotify/status'); if (s.connected) await api('/spotify/sync', { method: 'POST' }); } catch {}
}
setInterval(spotifyAuto, 60000);
setTimeout(spotifyAuto, 3000);

document.addEventListener('click', (e) => {
  const v = e.target.dataset?.copy;
  if (v === undefined) return;
  navigator.clipboard.writeText(v).then(() => { e.target.textContent = 'Copied!'; setTimeout(() => (e.target.textContent = 'Copy'), 1200); });
});

async function pageAuthorize(params) {
  if (!status.me) return loginForm('login');
  const token = params.get('token') || '';
  view.innerHTML = `<div class="form panel"><h1>Authorize app?</h1>
    <p class="sub">A Last.fm-style app wants to scrobble to <b>${esc(status.me)}</b>.</p>
    <button class="btn pri" id="ok">Allow</button> <a class="btn" href="#/">Cancel</a><div class="err" id="e"></div></div>`;
  $('#ok').onclick = async () => {
    try { await api('/authorize', { method: 'POST', body: { token } }); view.innerHTML = '<div class="form panel"><h1>Done ✓</h1><p class="sub">Go back to the app and finish connecting.</p></div>'; }
    catch (err) { $('#e').textContent = err.message; }
  };
}


// ---------------------------------------------------------------- API docs
const API_DOCS = [
  ['Reading (public)', [
    ['GET', '/v1/users/{user}', 'Profile + all-time totals.'],
    ['GET', '/v1/users/{user}/now-playing', 'Current track with cover art. If nothing is playing, returns last_played instead.'],
    ['GET', '/v1/users/{user}/recent?limit=20&page=1', 'Recent scrobbles. Also: from, to (unix), artist, q (search).'],
    ['GET', '/v1/users/{user}/top/artists?period=7day&limit=10', 'Top artists. period: 7day 1month 3month 6month 12month overall. Swap artists for albums or tracks.'],
    ['GET', '/v1/users/{user}/stats?period=1month', 'Totals, listening hours, plays by hour and weekday (add tz=480 for Perth time).'],
    ['GET', '/v1/users/{user}/timeline?days=30', 'Plays per day (days=0 gives per month, all time).'],
    ['GET', '/v1/users/{user}/artists/Kikuo', 'One artist: plays, rank, first/last played, top tracks and albums.'],
    ['GET', '/v1/users/{user}/track?artist=Kikuo&track=Aishite', 'One track: plays, loved, first/last played.'],
    ['GET', '/v1/users/{user}/loved', 'Loved tracks.'],
    ['GET', '/v1/users/{user}/now-playing.svg', 'Embeddable now-playing card image. Optional accent=ff6fae.'],
  ]],
  ['Writing (needs your token)', [
    ['POST', '/v1/scrobbles', 'Body: {"artist","track","timestamp"?,"album"?,"duration"?,"image"?} or an array (max 1000). timestamp = unix seconds or ISO; defaults to now.'],
    ['POST', '/v1/now-playing', 'Body: {"artist","track","album"?,"duration"?,"image"?}. Expires on its own after the track length.'],
    ['DELETE', '/v1/now-playing', 'Clear now playing.'],
    ['DELETE', '/v1/scrobbles/{id}', 'Delete a scrobble (ids come from /recent).'],
    ['POST', '/v1/love', 'Body: {"artist","track"}. DELETE the same to unlove.'],
    ['GET', '/v1/me', 'Check your token. Returns your username.'],
  ]],
];

function pageApi() {
  const base = location.origin;
  const u = user() || 'you';
  const fill = (p) => p.replace('{user}', enc(u));
  view.innerHTML = `
    <h1>API</h1>
    <p class="sub">Plain JSON, CORS enabled, so you can call it from anywhere: sites, bots, Discord status, widgets.</p>
    <section class="panel" style="margin-bottom:18px">
      <h2>Basics</h2>
      <label>Base URL</label>${codeBox(base + '/v1')}
      <p class="hint">Reads need no key${status.private ? ' (except this server is <b>private</b>, so send your token)' : ''}. Writes need your token from <a href="#/settings" style="color:var(--accent)">Settings</a>:</p>
      ${codeBox('Authorization: Bearer YOUR_TOKEN')}
      <p class="hint">Every response has <code>ok</code>. Errors look like <code>{"ok":false,"error":"…"}</code> with a matching HTTP status.
      Last.fm-style <code>/2.0/</code> and ListenBrainz-style <code>/1/</code> APIs are still there too.</p>
    </section>
    ${API_DOCS.map(([title, eps]) => `
      <section class="panel" style="margin-bottom:18px"><h2>${title}</h2>
      ${eps.map(([m, p, d], i) => `
        <div class="ep">
          <div class="ep-h"><span class="m m-${m}">${m}</span><code>${esc(fill(p))}</code>
            ${m === 'GET' && !p.includes('/me') ? `<button class="btn try" data-url="${esc(fill(p))}">Try it</button>` : ''}</div>
          <div class="hint">${esc(d)}</div>
          <pre class="out" hidden></pre>
        </div>`).join('')}
      </section>`).join('')}
    <section class="panel" style="margin-bottom:18px"><h2>Examples</h2>
      <label>Scrobble with curl</label>
      <pre class="out">curl -X POST ${base}/v1/scrobbles \\
  -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \\
  -d '{"artist":"Kikuo","track":"Aishite","album":"Kikuo Miku 3"}'</pre>
      <label>Now playing in JavaScript</label>
      <pre class="out">const r = await fetch('${base}/v1/users/${esc(u)}/now-playing').then(r => r.json());
if (r.playing) console.log(\`\${r.track.track} — \${r.track.artist}\`);</pre>
      <label>Python (e.g. Discord status)</label>
      <pre class="out">import requests
r = requests.get("${base}/v1/users/${esc(u)}/now-playing").json()
if r["playing"]:
    print(r["track"]["track"], "-", r["track"]["artist"], r["track"]["image"])</pre>
      <label>Now-playing card (README, website)</label>
      <pre class="out">&lt;img src="${base}/v1/users/${esc(u)}/now-playing.svg" alt="Now playing"&gt;</pre>
      <img src="/v1/users/${enc(u)}/now-playing.svg" alt="" style="margin-top:8px;max-width:100%"/>
    </section>`;
  view.querySelectorAll('pre.out:not([hidden])').forEach((p) => (p.style.display = 'block'));
  view.onclick = async (e) => {
    const b = e.target.closest('.try');
    if (!b) return;
    const out = b.closest('.ep').querySelector('.out');
    out.hidden = false;
    if (b.dataset.url.endsWith('.svg')) { out.innerHTML = `<img src="${b.dataset.url}" style="max-width:100%">`; return; }
    out.textContent = 'loading…';
    try { out.textContent = JSON.stringify(await (await fetch(b.dataset.url)).json(), null, 2).slice(0, 4000); }
    catch (err) { out.textContent = err.message; }
  };
}

// ---------------------------------------------------------------- import / export
function parseCSV(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
function toTs(v) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); return Math.floor(n > 1e12 ? n / 1000 : n); }
  let t;
  if (/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(:\d\d)?$/.test(s)) t = Date.parse(s.replace(' ', 'T') + 'Z'); // naive = UTC
  else if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) t = Date.parse(s);
  else { t = Date.parse(s + ' UTC'); if (isNaN(t)) t = Date.parse(s); } // "31 Jan 2020 12:34"
  return isNaN(t) ? null : Math.floor(t / 1000);
}
function fromCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const hasHead = head.includes('artist') && (head.includes('track') || head.includes('name') || head.includes('title'));
  if (!hasHead) return rows.map((r) => ({ artist: r[0], album: r[1], track: r[2], ts: toTs(r[3]) })); // artist,album,track,date
  const col = (...names) => names.map((n) => head.indexOf(n)).find((i) => i >= 0);
  const ci = { artist: col('artist', 'artist_name'), album: col('album', 'release_name'), track: col('track', 'name', 'title', 'track_name'),
    ts: col('uts', 'timestamp', 'ts', 'date', 'utc_time', 'listened_at'), album_artist: col('album_artist', 'albumartist'), duration: col('duration') };
  return rows.slice(1).map((r) => ({ artist: r[ci.artist], track: r[ci.track], album: ci.album !== undefined ? r[ci.album] : '',
    album_artist: ci.album_artist !== undefined ? r[ci.album_artist] : '', duration: ci.duration !== undefined ? r[ci.duration] : null, ts: toTs(r[ci.ts]) }));
}
function fromJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch { data = text.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); }
  if (!Array.isArray(data)) data = data.payload?.listens || data.listens || data.rows || data.scrobbles || [];
  return data.map((x) => {
    if ('master_metadata_track_name' in x) { // Spotify extended history
      if (!x.master_metadata_track_name || (x.ms_played ?? 0) < 30000) return null;
      return { artist: x.master_metadata_album_artist_name, track: x.master_metadata_track_name, album: x.master_metadata_album_album_name,
        ts: Math.floor((Date.parse(x.ts) - x.ms_played) / 1000), source: 'spotify-history' };
    }
    if ('trackName' in x && 'endTime' in x) { // Spotify account-data history
      if ((x.msPlayed ?? 0) < 30000) return null;
      return { artist: x.artistName, track: x.trackName, ts: Math.floor((Date.parse(x.endTime.replace(' ', 'T') + 'Z') - x.msPlayed) / 1000), source: 'spotify-history' };
    }
    if (x.track_metadata) { // ListenBrainz
      const m = x.track_metadata; const info = m.additional_info || {};
      return { artist: m.artist_name, track: m.track_name, album: m.release_name || '', ts: x.listened_at,
        duration: info.duration || (info.duration_ms ? info.duration_ms / 1000 : null), source: 'listenbrainz-import' };
    }
    if (x.artist && (x.track || x.name)) return { ...x, track: x.track || x.name, ts: toTs(x.ts ?? x.uts ?? x.timestamp ?? x.date?.uts ?? x.date) };
    return null;
  }).filter(Boolean);
}

async function importFiles(files) {
  const st = $('#impst');
  let items = [];
  for (const f of files) {
    const text = await f.text();
    try { items = items.concat(/\.csv$|\.txt$/i.test(f.name) ? fromCSV(text) : fromJSON(text)); }
    catch (e) { st.innerHTML = `<span class="err">Couldn't read ${esc(f.name)}: ${esc(e.message)}</span>`; return; }
  }
  items = items.filter((i) => i && i.artist && i.track && i.ts);
  if (!items.length) { st.innerHTML = '<span class="err">No scrobbles found in those files 😿</span>'; return; }
  let acc = 0, ign = 0;
  st.innerHTML = `Importing ${fmtN(items.length)} scrobbles… <progress id="pb" max="${items.length}" value="0"></progress>`;
  for (let i = 0; i < items.length; i += 1000) {
    const r = await api('/import', { method: 'POST', body: { items: items.slice(i, i + 1000), source: 'import' } });
    acc += r.accepted; ign += r.ignored;
    $('#pb').value = Math.min(i + 1000, items.length);
  }
  st.innerHTML = `<span class="okmsg">Imported ${fmtN(acc)} scrobbles ✓</span> (${fmtN(ign)} skipped as duplicates/invalid)`;
}

async function exportAll(kind) {
  const st = $('#exst');
  let rows = [], after = 0;
  do {
    const r = await api(`/export?after=${after}`);
    rows = rows.concat(r.rows); after = r.next;
    st.textContent = `Fetched ${fmtN(rows.length)}…`;
  } while (after);
  let blob;
  if (kind === 'json') blob = new Blob([JSON.stringify(rows.map(({ id, ...r }) => r), null, 1)], { type: 'application/json' });
  else {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    blob = new Blob(['uts,utc_time,artist,album,track,album_artist,duration,source\n' +
      rows.map((r) => [r.ts, new Date(r.ts * 1000).toISOString(), r.artist, r.album, r.track, r.album_artist, r.duration ?? '', r.source].map(q).join(',')).join('\n')], { type: 'text/csv' });
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nyafm-${status.me}-${new Date().toISOString().slice(0, 10)}.${kind}`;
  a.click();
  st.textContent = `Exported ${fmtN(rows.length)} scrobbles ✓`;
}

// ---------------------------------------------------------------- router
async function route() {
  stopPreview();
  const [path, qs] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(qs || '');
  const parts = (path || '/').split('/').filter(Boolean);
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === (parts[0] || 'home')));
  try {
    if (!status) await loadStatus();
    if (status.setup_needed) return loginForm('setup');
    if (parts[0] === 'settings') return await pageSettings();
    if (parts[0] === 'api') { if (status.private && !status.me) return loginForm('login'); return pageApi(); }
    if (parts[0] === 'authorize') return await pageAuthorize(params);
    if (status.private && !status.me) return loginForm('login');
    if (parts[0] === 'stats') return await pageStats();
    if (parts[0] === 'recent') return await pageRecent(params);
    if (parts[0] === 'library') return await pageLibrary(parts[1] || 'artists', params);
    if (parts[0] === 'artist') return await pageArtist(decodeURIComponent(parts.slice(1).join('/')));
    if (parts[0] === 'track') return await pageTrack(decodeURIComponent(parts[1] || ''), decodeURIComponent(parts.slice(2).join('/')));
    if (parts[0] === 'album') return await pageAlbum(decodeURIComponent(parts[1] || ''), decodeURIComponent(parts.slice(2).join('/')));
    if (parts[0] === 'search') return await pageSearch(params);
    if (parts[0] === 'recap') return await pageRecap(parts[1] || '');
    if (parts[0] === 'discover') return await pageDiscover(params);
    return await pageHome();
  } catch (e) {
    view.innerHTML = `<div class="empty">Something went wrong 😿<br><small>${esc(e.message)}</small></div>`;
  }
}

// Synced lyrics under the now-playing card (BiniLyrics / NetEase / LRCLIB, drawn by AMLL). Uses /v1 for the song's position.
let lyricsPlayer = null;
async function syncLyrics() {
  const host = $('#lyrics');
  if (!host || !user() || !prefs.show_lyrics) { lyricsPlayer?.destroy(); lyricsPlayer = null; return; }
  const np = await fetch(`/v1/users/${enc(user())}/now-playing`).then((r) => r.json()).catch(() => null);
  const track = np?.playing ? np.track : null;
  if (lyricsPlayer && lyricsPlayer.host !== host) { lyricsPlayer.destroy(); lyricsPlayer = null; }   // the page was redrawn
  if (!lyricsPlayer) {
    if (!track) return;
    const m = await import('/assets/lyrics.js').catch(() => null);
    if (!m || $('#lyrics') !== host) return;
    lyricsPlayer = m.mount(host);
  }
  lyricsPlayer.update(track);
}

$('#hsearch')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = new FormData(e.target).get('q').trim();
  if (q) location.hash = `#/search?q=${enc(q)}`;
  e.target.querySelector('input').blur();
});
window.addEventListener('hashchange', () => { route().then(syncLyrics); window.scrollTo({ top: 0, behavior: 'smooth' }); });
route().then(syncLyrics);
// refresh now-playing every 30s on the overview
setInterval(async () => {
  const np = $('#np');
  if (np && user()) { np.innerHTML = await nowPlaying(user()); window.FX?.npChanged(np.textContent); }
  syncLyrics();
}, 30000);
