/* ruytha.dev home page: the key light, live music, favourites, guestbook and entrances. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ago(ms) {
    var m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    var d = Math.round(h / 24);
    return d + (d === 1 ? ' day ago' : ' days ago');
  }
  $('year').textContent = new Date().getFullYear();

  /* ---------- the key light ----------
     The name sits in the dark; a light follows the pointer (or a finger) and lights the letters it falls on.
     With nobody steering it drifts slowly across the name. */
  (function () {
    var stage = document.querySelector('.stage'), name = $('stageName'), hint = $('stageHint');
    if (!stage || !name) return;
    if (matchMedia('(hover: none)').matches) hint.textContent = 'Drag across the name to light the set';
    var steered = 0, raf = 0, x = 0.3, y = 0.5;
    function aim(px, py) {
      var s = stage.getBoundingClientRect(), n = name.getBoundingClientRect();
      stage.style.setProperty('--sx', (px - s.left) + 'px');
      stage.style.setProperty('--sy', (py - s.top) + 'px');
      stage.style.setProperty('--lx', (px - n.left) + 'px');
      stage.style.setProperty('--ly', (py - n.top) + 'px');
    }
    function fromEvent(e) {
      steered = performance.now();
      stage.classList.add('is-lit');
      aim(e.clientX, e.clientY);
    }
    stage.addEventListener('pointermove', fromEvent);
    stage.addEventListener('pointerdown', fromEvent);
    function drift(t) {
      raf = requestAnimationFrame(drift);
      if (performance.now() - steered < 2500) return;
      var n = name.getBoundingClientRect();
      x = 0.5 + Math.sin(t / 2600) * 0.42;
      y = 0.5 + Math.sin(t / 1900) * 0.18;
      aim(n.left + n.width * x, n.top + n.height * y);
    }
    // Rest position, re-measured once the font has loaded and the opening animation has settled.
    function rest() {
      if (performance.now() - steered < 2500) return;
      var n = name.getBoundingClientRect();
      aim(n.left + n.width * 0.32, n.top + n.height * 0.5);
    }
    rest();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(rest);
    addEventListener('load', function () { setTimeout(rest, 1200); });
    addEventListener('resize', rest);
    if (reduce) return;
    // only animate while the stage is on screen
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && !raf) raf = requestAnimationFrame(drift);
          else if (!e.isIntersecting && raf) { cancelAnimationFrame(raf); raf = 0; }
        });
      }).observe(stage);
    } else raf = requestAnimationFrame(drift);
  })();

  /* ---------- music: now playing, recent tracks, this week ---------- */
  function art(t) {
    var img = t.image && (t.image[3] || t.image[2]) && (t.image[3] || t.image[2])['#text'];
    return img && img.indexOf('2a96cbd8b46e442fc41c2b86b821562f') < 0 ? img : '';   // Last.fm's blank star means no art
  }
  // The /api/lastfm route keeps the key private when it's configured on Vercel;
  // otherwise ask Last.fm straight from the browser with the key in config.js.
  var CFG = window.RUYTHA_CONFIG || {};
  function lastfm(q) {
    var user = String(CFG.lastfmUser || '').trim(), key = CFG.lastfmApiKey;
    if (!user || !key) return Promise.reject(new Error('not configured'));
    return fetch('https://ws.audioscrobbler.com/2.0/?format=json&user=' + encodeURIComponent(user) + '&api_key=' + encodeURIComponent(key) + q)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function api(path) { return fetch(path).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function weekDirect() {
    var since = Math.floor(Date.now() / 1000) - 7 * 86400;
    var many = function (x) { return x ? (Array.isArray(x) ? x : [x]) : []; };
    return Promise.all([
      lastfm('&method=user.gettopartists&period=7day&limit=5'),
      lastfm('&method=user.gettoptracks&period=7day&limit=5'),
      lastfm('&method=user.getrecenttracks&limit=1&from=' + since)
    ]).then(function (r) {
      return {
        plays: parseInt(r[2].recenttracks && r[2].recenttracks['@attr'] && r[2].recenttracks['@attr'].total, 10) || 0,
        artists: many(r[0].topartists && r[0].topartists.artist).map(function (a) { return { name: a.name, plays: +a.playcount, url: a.url }; }),
        tracks: many(r[1].toptracks && r[1].toptracks.track).map(function (t) { return { name: t.name, artist: t.artist && t.artist.name, plays: +t.playcount, url: t.url }; })
      };
    });
  }

  var list = $('tracks');
  list.innerHTML = new Array(8).join('<li class="sk"></li>') + '<li class="sk"></li>';
  api('/api/lastfm?limit=8')
    .catch(function () { return lastfm('&method=user.getrecenttracks&limit=8'); })
    .then(function (d) {
      var tracks = (d.recenttracks && d.recenttracks.track) || [];
      if (!Array.isArray(tracks)) tracks = [tracks];
      if (!tracks.length) throw new Error('none');
      var first = tracks[0], playing = first['@attr'] && first['@attr'].nowplaying === 'true';
      var np = $('np');
      np.dataset.state = playing ? 'playing' : 'recent';
      $('npLabel').textContent = playing ? 'Now playing' : 'Last played ' + (first.date ? ago(first.date.uts * 1000) : '');
      $('npTrack').textContent = first.name + ' · ' + (first.artist && (first.artist['#text'] || first.artist.name));
      if (art(first)) $('npArt').style.backgroundImage = 'url("' + art(first) + '")';
      list.innerHTML = tracks.slice(0, 8).map(function (t) {
        var now = t['@attr'] && t['@attr'].nowplaying === 'true';
        var a = art(t);
        return '<li class="' + (now ? 'now' : '') + '"><a href="' + esc(t.url) + '" target="_blank" rel="noopener">' +
          '<span class="art"' + (a ? ' style="background-image:url(&quot;' + esc(a) + '&quot;)"' : '') + '></span>' +
          '<span class="t"><b>' + esc(t.name) + '</b><span>' + esc(t.artist && (t.artist['#text'] || t.artist.name)) + ' · ' +
          (now ? 'playing now' : t.date ? ago(t.date.uts * 1000) : '') + '</span></span></a></li>';
      }).join('');
    })
    .catch(function () {
      $('np').dataset.state = 'idle';
      $('npLabel').textContent = 'Listening';
      $('npTrack').textContent = 'Tame Impala, probably';
      list.innerHTML = '<li class="small">Couldn’t reach Last.fm just now.</li>';
    })
    .then(function () { list.removeAttribute('aria-busy'); });

  api('/api/lastfm?view=week')
    .catch(weekDirect)
    .then(function (w) {
      $('weekPlays').textContent = w.plays.toLocaleString();
      var max = Math.max.apply(null, w.artists.map(function (a) { return a.plays; }).concat([1]));
      $('weekArtists').innerHTML = w.artists.map(function (a) {
        return '<li><a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.name) + '</a><i style="width:' + Math.max(4, a.plays / max * 100) + '%"></i><b>' + a.plays + '</b></li>';
      }).join('');
      var t = w.tracks[0];
      if (t) $('weekTop').innerHTML = 'Most played: <b>' + esc(t.name) + '</b> by ' + esc(t.artist) + ', ' + t.plays + ' times';
    })
    .catch(function () { $('week').hidden = true; });

  /* ---------- watching and playing ---------- */
  var FAVS = [
    ['ttq', 'The Quintessential Quintuplets', 'anime', 'Romance', 2019],
    ['rascal', 'Rascal Does Not Dream of Bunny Girl Senpai', 'anime', 'Romance', 2018],
    ['bocchi', 'Bocchi the Rock!', 'anime', 'Music', 2022],
    ['alya', 'Alya Sometimes Hides Her Feelings in Russian', 'anime', 'Romance', 2024],
    ['spyxfamily', 'Spy x Family', 'anime', 'Action', 2022],
    ['married-couple', 'More Than a Married Couple, But Not Lovers', 'anime', 'Romance', 2022],
    ['rdr2', 'Red Dead Redemption 2', 'game', 'Open world', 2018, true],
    ['fh6', 'Forza Horizon 6', 'game', 'Racing', 2026, true],
    ['ieytd', 'I Expect You to Die', 'game', 'VR', 2016],
    ['ddlc', 'Doki Doki Literature Club!', 'game', 'Visual novel', 2017],
    ['zzz', 'Zenless Zone Zero', 'game', 'Action RPG', 2024],
    ['rr', 'Rec Room', 'game', 'Social', 2016],
    ['firewatch', 'Firewatch', 'game', 'Adventure', 2016],
    ['dead-as-disco', 'Dead as Disco', 'game', 'Rhythm', 2026],
    ['fears-to-fathom', 'Fears to Fathom', 'game', 'Horror', 2021],
    ['minecraft', 'Minecraft', 'game', 'Sandbox', 2011]
  ];
  var posters = $('posters');
  function showFavs(filter) {
    posters.innerHTML = FAVS.filter(function (f) {
      return filter === 'all' || (filter === 'top' ? f[5] : f[2] === filter);
    }).map(function (f) {
      return '<li class="poster"><img src="assets/img/media/' + f[0] + '.jpg" alt="' + esc(f[1]) + ' cover art" loading="lazy" decoding="async">' +
        '<b>' + esc(f[1]) + '</b><span>' + (f[2] === 'anime' ? 'Anime' : 'Game') + ' · ' + esc(f[3]) + ' · ' + f[4] +
        (f[5] ? ' · <span class="top">Top pick</span>' : '') + '</span></li>';
    }).join('');
  }
  showFavs('all');
  $('favFilters').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    showFavs(b.dataset.filter);
  });

  /* ---------- guestbook ---------- */
  (function () {
    var form = $('gbForm'), wall = $('gbWall'), status = $('gbStatus'), count = $('gbCount');
    var submit = form.querySelector('button[type="submit"]'), msg = form.elements.msg;
    var entries = [], shown = 12, online = false;
    function note(e, fresh) {
      return '<li' + (fresh ? ' class="gb-new"' : '') + '><q>' + esc(e.msg) + '</q><span class="who"><b>' + esc(e.name) + '</b><span>' + ago(e.t) + '</span></span></li>';
    }
    function draw() {
      if (!entries.length) { wall.innerHTML = '<li class="gb-empty">No notes yet. Be the first to sign.</li>'; return; }
      wall.innerHTML = entries.slice(0, shown).map(function (e) { return note(e); }).join('') +
        (entries.length > shown ? '<li class="gb-empty"><button class="btn gb-more" type="button">Show more notes</button></li>' : '');
    }
    wall.addEventListener('click', function (e) { if (e.target.closest('.gb-more')) { shown += 12; draw(); } });
    function say(text, tone) { status.textContent = text; status.className = 'gb-status' + (tone ? ' is-' + tone : ''); }
    fetch('/api/guestbook', { headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { online = true; entries = d.entries || []; draw(); })
      .catch(function () { wall.innerHTML = '<li class="gb-empty">The guestbook couldn’t load just now. Try again in a bit.</li>'; submit.disabled = true; });
    msg.addEventListener('input', function () { count.textContent = msg.value.length + '/160'; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!online) return;
      var data = { name: form.elements.name.value.trim(), msg: msg.value.trim(), website: form.elements.website.value };
      if (!data.name || !data.msg) { say('Add your name and a message first.', 'err'); return; }
      submit.disabled = true; say('Adding your note…');
      fetch('/api/guestbook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.message || 'Something went wrong. Try again in a bit.');
          if (res.j.entry) { entries.unshift(res.j.entry); draw(); wall.firstChild.className = 'gb-new'; }
          form.reset(); count.textContent = '0/160';
          say('Signed. Thank you!', 'ok');
        })
        .catch(function (err) { say(err.message, 'err'); })
        .then(function () { submit.disabled = false; });
    });
  })();

  /* ---------- entrances: each part rises in once, staggered with its siblings ----------
     A plain scroll check, so nothing can stay hidden if an observer is throttled. */
  (function () {
    if (reduce) return;
    var waiting = Array.prototype.slice.call(document.querySelectorAll('[data-rise]'));
    waiting.forEach(function (el) {
      var i = Array.prototype.filter.call(el.parentNode.children, function (c) { return c.hasAttribute('data-rise'); }).indexOf(el);
      el.style.setProperty('--d', Math.min(i, 4) * 90 + 'ms');
    });
    function check() {
      var line = window.innerHeight * 0.92;
      waiting = waiting.filter(function (el) {
        if (el.getBoundingClientRect().top > line) return true;
        el.classList.add('risen');
        return false;
      });
      if (!waiting.length) { removeEventListener('scroll', check); removeEventListener('resize', check); }
    }
    document.documentElement.classList.add('rise-on');
    addEventListener('scroll', check, { passive: true });
    addEventListener('resize', check);
    check();
  })();
})();
