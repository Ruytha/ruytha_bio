// NyaFM dashboard — tiny hash-routed SPA, no build step.
const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const TZ = -new Date().getTimezoneOffset();
const PERIODS = [['7day', '7 days'], ['1month', '30 days'], ['3month', '90 days'], ['12month', 'Year'], ['overall', 'All time']];
let status = null;
let period = localStorage.getItem('nyafm.period') || '1month';

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
    <div class="row">
      ${rank ? `<div class="rk">${it.rank}</div>` : ''}
      ${cover(it.track ? it : { ...it, kind: it.album ? 'album' : 'artist' })}
      <div class="main"><div class="t">${esc(it.track || it.album || it.artist)}</div>
        ${it.track || it.album ? `<div class="s">${artistLink(it.artist)}</div>` : ''}</div>
      <div class="bar"><i style="width:${(100 * (it.plays || 0)) / top}%"></i><span>${fmtN(it.plays)} plays</span></div>
    </div>`).join('')}</div>`;
}

function scrobbleList(items, { canDelete = false } = {}) {
  if (!items.length) return '<div class="empty">no scrobbles yet… 🐾</div>';
  return `<div class="rows">${items.map((s) => `
    <div class="row" data-id="${s.id}">
      ${cover(s)}
      <div class="main"><div class="t">${esc(s.track)}</div><div class="s">${artistLink(s.artist)}${s.album ? ` · ${esc(s.album)}` : ''}</div></div>
      <div class="when" title="${new Date(s.ts * 1000).toLocaleString()}">${ago(s.ts)}</div>
      ${canDelete ? '<button class="x" title="Delete scrobble">✕</button>' : ''}
    </div>`).join('')}</div>`;
}

function bindDelete(root, after) {
  root.addEventListener('click', async (e) => {
    if (!e.target.classList.contains('x')) return;
    const row = e.target.closest('.row');
    try { await api(`/scrobble/${row.dataset.id}`, { method: 'DELETE' }); row.remove(); after?.(); } catch (err) { console.error(err); }
  });
}

function cards(items, kind) {
  if (!items.length) return '<div class="empty">nothing yet</div>';
  return `<div class="cards">${items.map((it) => `
    <a class="card" href="#/artist/${enc(it.artist)}">
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
      <div style="font-size:18px;font-weight:600">${esc(last.track)}</div><div class="s">${artistLink(last.artist)} · last played ${ago(last.ts)}</div></div></div>`;
  }
  return `<div class="np">${cover(np)}<div><div class="lbl"><span class="eq"><i></i><i></i><i></i></span> Now playing</div>
    <div style="font-size:18px;font-weight:600">${esc(np.track)}</div><div class="s">${artistLink(np.artist)}${np.album ? ` · ${esc(np.album)}` : ''}</div></div></div>`;
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
    <h1>${esc(u)}</h1>
    <p class="sub">${sum.first_scrobble ? `scrobbling since ${new Date(sum.first_scrobble * 1000).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : 'no scrobbles yet — set up a scrobbler in Settings'}</p>
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
      <section class="panel"><h2>Listening clock</h2>${barChart(sum.hours.map((v, i) => ({ k: `${String(i).padStart(2, '0')}:00`, v })), { labelEvery: 3, fmtLabel: (k) => k.slice(0, 2) })}</section>
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
function heatmap(series) {
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
  return `<div class="heat"><svg viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W, 640)}px">${months}${rects}</svg></div>
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
  const monthSeries = monthly.map((r) => ({ k: r.bucket, v: r.plays }));
  const hh = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

  view.innerHTML = `
    <h1>Stats</h1>
    <p class="sub">${esc(u)} · every number, sliced a few ways</p>
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

    <section class="panel"><h2>The last year <span class="more">${fmtN(yearTotal)} plays on ${st.active} days</span></h2>${heatmap(year)}</section>

    <div class="tiles">
      <div class="tile"><div class="n">${st.current}<small> day${st.current === 1 ? '' : 's'}</small></div><div class="l">current streak</div></div>
      <div class="tile"><div class="n">${st.best}<small> day${st.best === 1 ? '' : 's'}</small></div><div class="l">longest streak${st.bestEnd ? ` · ended ${fmtDay(st.bestEnd)}` : ''}</div></div>
      <div class="tile"><div class="n">${fmtN(st.busiest.v)}</div><div class="l">busiest day · ${fmtDay(st.busiest.k)}</div></div>
      <div class="tile"><div class="n">${sum.scrobbles ? hh(busyHour) : '—'}</div><div class="l">favourite hour</div></div>
      <div class="tile"><div class="n">${sum.scrobbles ? wdNames[busyWd].slice(0, 3) : '—'}</div><div class="l">favourite day of the week</div></div>
    </div>

    <section class="panel"><h2>Month by month <span class="more">all time</span></h2>${barChart(monthSeries, { labelEvery: Math.ceil(monthSeries.length / 12), fmtLabel: (k) => k.slice(2) })}</section>

    <div class="grid2">
      <section class="panel"><h2>Listening clock</h2>${barChart(sum.hours.map((v, i) => ({ k: `${String(i).padStart(2, '0')}:00`, v })), { labelEvery: 3, fmtLabel: (k) => k.slice(0, 2) })}</section>
      <section class="panel"><h2>By weekday</h2>${barChart(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((k, i) => ({ k, v: sum.weekdays[i] })))}</section>
    </div>

    <div class="grid2">
      <section class="panel"><h2>Top artists <a class="more" href="#/library/artists">see all →</a></h2>${rowsList(ta.rows.map((r) => ({ ...r, kind: 'artist' })))}</section>
      <section class="panel"><h2>Top tracks <a class="more" href="#/library/tracks">see all →</a></h2>${rowsList(tt.rows)}</section>
    </div>
    <section><h2>Top albums <a class="more" href="#/library/albums">see all →</a></h2>${cards(tal.rows, 'albums')}</section>`;
  $('#periods').replaceWith(periodChips(route));
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
      <div><h1>${esc(info.artist)}</h1>
      <p class="sub">${fmtN(info.plays)} plays${info.rank ? ` · #${info.rank} all-time` : ''}${info.first_ts ? ` · first heard ${new Date(info.first_ts * 1000).toLocaleDateString()}` : ''}</p></div></div>
    <section class="panel"><h2>Plays per month</h2>${barChart(tl.map((r) => ({ k: r.bucket, v: r.plays })), { labelEvery: Math.ceil(tl.length / 10) })}</section>
    <section><h2>Albums</h2>${cards(albums.rows, 'albums')}</section>
    <div class="grid2">
      <section class="panel"><h2>Top tracks</h2>${rowsList(tracks.rows)}</section>
      <section class="panel"><h2>Recent</h2>${scrobbleList(rec.rows)}</section>
    </div>`;
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
      status = await api('/status');
      route();
    } catch (err) { $('#e').textContent = err.message; }
  };
}

const codeBox = (v) => `<div class="code"><code>${esc(v)}</code><button type="button" data-copy="${esc(v)}">Copy</button></div>`;

async function pageSettings() {
  if (!status.me) return loginForm('login');
  const meInfo = await api('/me');
  const base = location.origin;
  view.innerHTML = `
    <h1>Settings</h1><p class="sub">Logged in as <b>${esc(meInfo.username)}</b></p>
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
    <section class="panel">
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
    <section class="panel">
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
  $('#logout').onclick = async () => { await api('/logout', { method: 'POST' }); status = await api('/status'); location.hash = '#/'; };
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
  const [path, qs] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(qs || '');
  const parts = (path || '/').split('/').filter(Boolean);
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.r === (parts[0] || 'home')));
  try {
    if (!status) status = await api('/status');
    if (status.setup_needed) return loginForm('setup');
    if (parts[0] === 'settings') return await pageSettings();
    if (parts[0] === 'api') { if (status.private && !status.me) return loginForm('login'); return pageApi(); }
    if (parts[0] === 'authorize') return await pageAuthorize(params);
    if (status.private && !status.me) return loginForm('login');
    if (parts[0] === 'stats') return await pageStats();
    if (parts[0] === 'recent') return await pageRecent(params);
    if (parts[0] === 'library') return await pageLibrary(parts[1] || 'artists', params);
    if (parts[0] === 'artist') return await pageArtist(decodeURIComponent(parts.slice(1).join('/')));
    return await pageHome();
  } catch (e) {
    view.innerHTML = `<div class="empty">Something went wrong 😿<br><small>${esc(e.message)}</small></div>`;
  }
}

// Synced lyrics under the now-playing card (BiniLyrics / NetEase / LRCLIB, drawn by AMLL). Uses /v1 for the song's position.
let lyricsPlayer = null;
async function syncLyrics() {
  const host = $('#lyrics');
  if (!host || !user()) { lyricsPlayer?.destroy(); lyricsPlayer = null; return; }
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

window.addEventListener('hashchange', () => { route().then(syncLyrics); window.scrollTo({ top: 0, behavior: 'smooth' }); });
route().then(syncLyrics);
// refresh now-playing every 30s on the overview
setInterval(async () => {
  const np = $('#np');
  if (np && user()) { np.innerHTML = await nowPlaying(user()); window.FX?.npChanged(np.textContent); }
  syncLyrics();
}, 30000);
