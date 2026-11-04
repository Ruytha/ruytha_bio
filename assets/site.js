/* ruytha.dev home page: lyric sync, album colours, live music, favourites, guestbook, femboy mode and entrances. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
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

  /* ---------- the first screen starts bare; bring the extras in on the first scroll ---------- */
  (function () {
    if (!root.classList.contains('calm')) return;
    function wake() {
      if (window.scrollY < 8) return;
      root.classList.remove('calm');
      window.removeEventListener('scroll', wake);
    }
    window.addEventListener('scroll', wake, { passive: true });
  })();

  /* ---------- my time (Perth time, but the page only ever says "my time") ---------- */
  (function () {
    var el = $('clock');
    function tick() {
      try { el.textContent = new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Perth' }).toLowerCase() + ' my time'; } catch (e) {}
    }
    tick(); setInterval(tick, 30000);
  })();

  /* ---------- the synced lyric line ----------
     Like a Spicy Lyrics sync: each word fills in on its beat, the line holds, then the next one comes in. */
  (function () {
    var el = $('sing');
    var LINES = [
      'i direct short films and music videos',
      'i light sets, virtual and real',
      'i cut in resolve and after effects',
      'i sync lyrics for spicy lyrics',
      'and i\'m learning japanese, がんばります'
    ];
    function set(line) {
      el.innerHTML = line.split(' ').map(function (w) { return '<span class="w">' + esc(w) + '</span>'; }).join(' ');
      return el.querySelectorAll('.w');
    }
    if (reduce) { set(LINES[0]).forEach(function (w) { w.classList.add('on'); }); return; }
    var i = 0;
    function sing() {
      el.classList.remove('out');
      var words = set(LINES[i % LINES.length]), t = 300;
      words.forEach(function (w) {
        var dur = 160 + w.textContent.length * 45;     // longer words take longer, like a real sync
        w.style.setProperty('--dur', dur + 'ms');
        setTimeout(function () { w.classList.add('on'); }, t);
        t += dur + 60;
      });
      setTimeout(function () { el.classList.add('out'); }, t + 1800);
      setTimeout(function () { i++; sing(); }, t + 2300);
    }
    sing();
  })();

  /* ---------- album colours: the glow behind me takes the colours of what I'm playing ---------- */
  function hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function css(c) { return 'hsl(' + Math.round(c[0]) + ' ' + Math.round(Math.max(c[1], 0.6) * 100) + '% ' + Math.round(Math.min(Math.max(c[2], 0.62), 0.76) * 100) + '%)'; }
  function albumColours(url) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = c.height = 24;
        var x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
        var d = x.getImageData(0, 0, 24, 24).data, px = [];
        for (var i = 0; i < d.length; i += 4) { var p = hsl(d[i], d[i + 1], d[i + 2]); p.push(p[1] * (1 - Math.abs(p[2] - 0.55) * 1.6)); px.push(p); }
        px.sort(function (a, b) { return b[3] - a[3]; });
        var one = px[0], two = null;
        if (one[1] < 0.15) return;                                   // a grey cover keeps the site colours
        for (var j = 1; j < px.length; j++) { var gap = Math.abs(px[j][0] - one[0]) % 360; if (Math.min(gap, 360 - gap) > 40 && px[j][3] > 0.12) { two = px[j]; break; } }
        if (!two) two = [(one[0] + 50) % 360, one[1], one[2]];
        root.style.setProperty('--np1', css(one));
        root.style.setProperty('--np2', css(two));
      } catch (e) { /* the image host didn't allow reading it: keep the site colours */ }
    };
    img.src = url;
  }

  /* ---------- music: now playing, the lyric sheet, this week ---------- */
  var CFG = window.RUYTHA_CONFIG || {};
  function lastfm(q) {
    var user = String(CFG.lastfmUser || '').trim(), key = CFG.lastfmApiKey;
    if (!user || !key) return Promise.reject(new Error('not configured'));
    return fetch('https://ws.audioscrobbler.com/2.0/?format=json&user=' + encodeURIComponent(user) + '&api_key=' + encodeURIComponent(key) + q)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function api(path) { return fetch(path).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  // The /api/lastfm route keeps the key private when it's configured on Vercel; otherwise ask Last.fm from the browser.
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
  function art(t) {
    var img = t.image && (t.image[3] || t.image[2]) && (t.image[3] || t.image[2])['#text'];
    return img && img.indexOf('2a96cbd8b46e442fc41c2b86b821562f') < 0 ? img : '';   // Last.fm's blank star means no art
  }
  function artist(t) { return t.artist && (t.artist['#text'] || t.artist.name); }

  var sheet = $('tracks');
  sheet.innerHTML = new Array(7).join('<li class="sk"></li>');
  api('/api/lastfm?limit=8')
    .catch(function () { return lastfm('&method=user.getrecenttracks&limit=8'); })
    .then(function (d) {
      var tracks = (d.recenttracks && d.recenttracks.track) || [];
      if (!Array.isArray(tracks)) tracks = [tracks];
      if (!tracks.length) throw new Error('none');
      var first = tracks[0], playing = first['@attr'] && first['@attr'].nowplaying === 'true';
      $('np').dataset.state = playing ? 'playing' : 'recent';
      $('npLabel').textContent = playing ? 'Now playing ♪' : 'Last played ' + (first.date ? ago(first.date.uts * 1000) : '');
      $('npTrack').textContent = first.name + ' · ' + artist(first);
      if (art(first)) { $('npArt').style.backgroundImage = 'url("' + art(first) + '")'; albumColours(art(first)); }
      // While a song is playing Last.fm also returns its earlier scrobble right after it; show it once.
      tracks = tracks.filter(function (t, i) {
        var prev = tracks[i - 1];
        return !(prev && prev['@attr'] && prev['@attr'].nowplaying === 'true' && prev.name === t.name && artist(prev) === artist(t));
      });
      sheet.innerHTML = tracks.slice(0, 8).map(function (t) {
        var now = t['@attr'] && t['@attr'].nowplaying === 'true';
        return '<li><a href="' + esc(t.url) + '" target="_blank" rel="noopener"><span class="line">' + esc(t.name) + '</span>' +
          '<span class="by">' + esc(artist(t)) + ' · ' + (now ? 'playing now' : t.date ? ago(t.date.uts * 1000) : '') + '</span></a></li>';
      }).join('');
    })
    .catch(function () {
      $('np').dataset.state = 'idle';
      $('npLabel').textContent = 'Probably listening to';
      $('npTrack').textContent = 'Tame Impala';
      sheet.innerHTML = '<li class="by" style="opacity:1;max-height:none">Couldn’t reach Last.fm just now.</li>';
    });

  api('/api/lastfm?view=week')
    .catch(weekDirect)
    .then(function (w) {
      $('weekPlays').textContent = w.plays.toLocaleString();
      var max = Math.max.apply(null, w.artists.map(function (a) { return a.plays; }).concat([1]));
      $('weekArtists').innerHTML = w.artists.map(function (a) {
        return '<li><a href="' + esc(a.url) + '" target="_blank" rel="noopener">' + esc(a.name) + '</a><i style="width:' + Math.max(6, a.plays / max * 100) + '%"></i><b>' + a.plays + '</b></li>';
      }).join('');
      $('weekTracks').innerHTML = w.tracks.map(function (t) {
        return '<li><a href="' + esc(t.url) + '" target="_blank" rel="noopener"><span class="t"><b>' + esc(t.name) + '</b><span>' + esc(t.artist) + '</span></span><span class="n">' + t.plays + ' plays</span></a></li>';
      }).join('');
    })
    .catch(function () { $('week').hidden = true; $('weekTracks').closest('.charts').querySelector('.h3').hidden = true; });

  // Albums on repeat this week; covers Last.fm doesn't have become a pastel tile with the album's name.
  lastfm('&method=user.gettopalbums&period=7day&limit=6').then(function (d) {
    var list = (d.topalbums && d.topalbums.album) || [];
    if (!Array.isArray(list)) list = [list];
    if (!list.length) throw new Error('none');
    var TILES = ['var(--pink)', 'var(--blue)', 'var(--lemon)', 'var(--mint)', 'var(--lilac)', 'var(--peach)'];
    $('weekAlbums').innerHTML = list.slice(0, 6).map(function (a, i) {
      var img = art(a);
      return '<li class="album"><a href="' + esc(a.url) + '" target="_blank" rel="noopener">' +
        '<span class="cover" style="--tc:' + TILES[i % TILES.length] + (img ? ';background-image:url(&quot;' + esc(img) + '&quot;)' : '') + '">' + (img ? '' : esc(a.name)) + '</span>' +
        '<b>' + esc(a.name) + '</b><span>' + esc(a.artist && a.artist.name) + ' · ' + a.playcount + ' plays</span></a></li>';
    }).join('');
  }).catch(function () { $('albumsBox').hidden = true; });

  // All-time numbers from the Last.fm profile.
  lastfm('&method=user.getinfo').then(function (d) {
    var u = d.user, since = new Date(u.registered.unixtime * 1000);
    var n = function (x) { return Number(x).toLocaleString(); };
    $('lfmStats').innerHTML = [
      [n(u.playcount), 'scrobbles, all time'],
      [n(u.artist_count), 'artists'],
      [n(u.track_count), 'different songs'],
      [since.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), 'on Last.fm since']
    ].map(function (s) { return '<li><b>' + s[0] + '</b><span>' + s[1] + '</span></li>'; }).join('');
  }).catch(function () { $('lfmStats').hidden = true; });

  /* ---------- favourites ---------- */
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
  function showFavs(filter) {
    $('posters').innerHTML = FAVS.filter(function (f) {
      return filter === 'all' || (filter === 'top' ? f[5] : f[2] === filter);
    }).map(function (f) {
      return '<li class="poster"><button class="poster-btn" type="button" data-fav="' + f[0] + '" aria-haspopup="dialog">' +
        '<img src="assets/img/media/' + f[0] + '.jpg" alt="' + esc(f[1]) + ' cover art" loading="lazy" decoding="async">' +
        (f[5] ? '<span class="top">★ top pick</span>' : '') +
        '<b>' + esc(f[1]) + '</b><span>' + (f[2] === 'anime' ? 'Anime' : 'Game') + ' · ' + esc(f[3]) + ' · ' + f[4] + '</span></button></li>';
    }).join('');
  }
  showFavs('all');
  $('favFilters').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    showFavs(b.dataset.filter);
  });

  /* ---------- guestbook: pastel notes on the wall ---------- */
  (function () {
    var form = $('gbForm'), wall = $('gbWall'), status = $('gbStatus'), count = $('gbCount');
    var submit = form.querySelector('button[type="submit"]'), msg = form.elements.msg;
    var entries = [], shown = 12, online = false;
    var INKS = ['var(--pink)', 'var(--blue)', 'var(--lemon)', 'var(--mint)', 'var(--lilac)', 'var(--peach)'];
    function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }
    function note(e) {
      var h = hash(String(e.id || e.name + e.t));
      return '<li class="note" style="--nc:' + INKS[h % INKS.length] + ';--tilt:' + ((h % 5) - 2) * 1.1 + 'deg">' +
        '<p>' + esc(e.msg) + '</p><span class="who"><b>' + esc(e.name) + '</b><span>' + ago(e.t) + '</span></span></li>';
    }
    function draw() {
      if (!entries.length) { wall.innerHTML = '<li class="gb-empty">No notes yet. Be the first to sign!</li>'; return; }
      wall.innerHTML = entries.slice(0, shown).map(note).join('') +
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
      submit.disabled = true; say('Sticking your note on the wall…');
      fetch('/api/guestbook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.message || 'Something went wrong. Try again in a bit.');
          if (res.j.entry) { entries.unshift(res.j.entry); draw(); }
          form.reset(); count.textContent = '0/160';
          say('Signed! Thank you ♡', 'ok');
        })
        .catch(function (err) { say(err.message, 'err'); })
        .then(function () { submit.disabled = false; });
    });
  })();


  /* ---------- favourites popup: the summary for each one, from favs.json ---------- */
  (function () {
    var dlg = $('favPop'), data = null;
    function open(id) {
      var f = (data || []).filter(function (x) { return x.id === id; })[0];
      if (!f) return;
      $('favImg').src = 'assets/img/media/' + f.id + '.jpg';
      $('favKind').textContent = (f.kind === 'anime' ? 'Anime' : 'Game') + (f.star ? ' · ★ top pick' : '');
      $('favTitle').textContent = f.title;
      $('favSub').textContent = f.sub || '';
      $('favTags').innerHTML = (f.genres || []).map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('');
      $('favBody').innerHTML = (f.summary || []).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
        (f.take ? '<p><b>My take:</b> ' + esc(f.take) + '</p>' : '');
      var facts = [[f.kind === 'anime' ? 'Studio' : 'Made by', f.by], ['Year', f.year], ['Length', f.length], ['Based on', f.source], ['Plays on', f.platforms]];
      $('favFacts').innerHTML = facts.filter(function (x) { return x[1]; }).map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('');
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    }
    $('posters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-fav]'); if (!b) return;
      if (data) return open(b.dataset.fav);
      fetch('assets/favs.json').then(function (r) { return r.json(); }).then(function (d) { data = d; open(b.dataset.fav); });
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });   // click outside the card
  })();

  /* ---------- showreel: clips play while they're on screen; YouTube loads only when clicked ---------- */
  (function () {
    var vids = Array.prototype.slice.call(document.querySelectorAll('.clip video'));
    vids.forEach(function (v) {
      v.addEventListener('click', function () { v.paused ? v.play() : v.pause(); });
    });
    if (!reduce && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { e.target.preload = 'auto'; var p = e.target.play(); if (p && p.catch) p.catch(function () {}); }
          else e.target.pause();
        });
      }, { threshold: 0.35 });
      vids.forEach(function (v) { io.observe(v); });
    }
    document.querySelectorAll('.yt-card').forEach(function (b) {
      b.addEventListener('click', function () {
        var f = document.createElement('iframe');
        f.className = 'yt-frame';
        f.src = 'https://www.youtube-nocookie.com/embed/' + b.dataset.yt + '?autoplay=1&rel=0';
        f.title = b.querySelector('b').textContent;
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        f.allowFullscreen = true;
        b.replaceWith(f);
      });
    });
  })();

  /* ---------- from the blog: the three newest posts, once there are any ---------- */
  fetch('/blog/posts.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }).then(function (posts) {
    if (!posts || !posts.length) return;
    $('postList').innerHTML = posts.slice(0, 3).map(function (p) {
      var d = new Date(p.date + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
      return '<li><a class="glass" href="/blog/' + esc(p.slug) + '">' + (p.cover ? '<img src="' + esc(p.cover) + '" alt="" loading="lazy" decoding="async">' : '') +
        '<span class="when">' + d + '</span><b>' + esc(p.title) + '</b>' + (p.description ? '<p>' + esc(p.description) + '</p>' : '') + '</a></li>';
    }).join('');
    $('blog').hidden = false;
  });

  /* ---------- femboy mode (remembered under the same key the old site used) ---------- */
  (function () {
    var btn = $('femBtn'), layer = $('hearts'), meta = document.querySelector('meta[name="theme-color"]');
    var KEY = 'ruytha-femboy', HEARTS = ['♡', '♥', '✧', '❀'];
    function burst() {
      if (reduce) return;
      var r = btn.getBoundingClientRect();
      for (var i = 0; i < 22; i++) {
        var h = document.createElement('span'), ang = Math.random() * Math.PI * 2, dist = 60 + Math.random() * 160;
        h.className = 'heart'; h.textContent = HEARTS[i % HEARTS.length];
        h.style.left = (r.left + r.width / 2) + 'px'; h.style.top = (r.top + r.height / 2) + 'px';
        h.style.fontSize = (14 + Math.random() * 16) + 'px';
        h.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
        h.style.setProperty('--dy', (Math.sin(ang) * dist + 40) + 'px');
        h.style.setProperty('--rot', (Math.random() * 80 - 40) + 'deg');
        layer.appendChild(h);
        h.addEventListener('animationend', function () { this.remove(); });
      }
    }
    function set(on, fromClick) {
      root.classList.toggle('femboy', on);
      btn.setAttribute('aria-checked', String(on));
      if (meta) meta.setAttribute('content', on ? '#170a1f' : '#070b1f');
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
      if (on && fromClick) burst();
    }
    set(root.classList.contains('femboy'), false);
    btn.addEventListener('click', function () { set(!root.classList.contains('femboy'), true); });
  })();

  /* ---------- またね！ at the bottom: tap it to say bye another way, with sakura ---------- */
  (function () {
    var btn = $('bye'), word = $('byeWord'), en = $('byeEn'), layer = $('hearts');
    if (!btn) return;
    var BYES = [['またね！', 'see you next time'], ['じゃあね！', 'later!'], ['バイバイ！', 'bye bye!'], ['おやすみ！', 'good night!'], ['また明日！', 'see you tomorrow'], ['元気でね！', 'take care!']];
    var at = 0;
    function petals() {
      if (reduce) return;
      for (var i = 0; i < 26; i++) {
        var p = document.createElement('span');
        p.className = 'petal'; p.textContent = i % 3 ? '❀' : '✿';
        p.style.left = Math.random() * 100 + 'vw';
        p.style.fontSize = (12 + Math.random() * 18) + 'px';
        p.style.animationDelay = Math.random() * 1.2 + 's';
        p.style.setProperty('--t', (3 + Math.random() * 2.5) + 's');
        p.style.setProperty('--sway', (20 + Math.random() * 50) * (Math.random() < 0.5 ? -1 : 1) + 'px');
        layer.appendChild(p);
        p.addEventListener('animationend', function () { this.remove(); });
      }
    }
    btn.addEventListener('click', function () {
      at = (at + 1) % BYES.length;
      word.innerHTML = '';
      Array.prototype.forEach.call(BYES[at][0], function (ch, n) {
        var i = document.createElement('i'); i.textContent = ch; i.style.setProperty('--n', n); word.appendChild(i);
      });
      en.textContent = BYES[at][1];
      btn.setAttribute('aria-label', BYES[at][0] + ' ' + BYES[at][1] + '. Tap to say bye another way');
      btn.classList.remove('wave'); void btn.offsetWidth; btn.classList.add('wave');
      petals();
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
    root.classList.add('rise-on');
    addEventListener('scroll', check, { passive: true });
    addEventListener('resize', check);
    check();
  })();
})();
