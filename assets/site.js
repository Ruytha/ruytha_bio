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

  /* ---------- music: now playing, the lyric sheet, this week (from my own NyaFM, /v1) ---------- */
  var CFG = window.RUYTHA_CONFIG || {};
  var FMUSER = String(CFG.nyafmUser || CFG.lastfmUser || 'Ruytha').trim();
  function v1(path) {
    return fetch('/v1/users/' + encodeURIComponent(FMUSER) + path, { headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { if (d && d.ok === false) throw new Error(d.error || 'error'); return d; });
  }
  function artistHref(name) { return '/fm#/artist/' + encodeURIComponent(name); }

  // Synced lyrics of whatever's playing right now (BiniLyrics / NetEase / LRCLIB, drawn by AMLL). Loaded on demand, and only while music is on.
  var lyricsHost = $('lyricPreview'), lyricsMount = null, lyricsLoading = false;
  function lyricsFor(track) {
    if (!lyricsHost) return;
    if (lyricsMount) { lyricsMount.update(track); return; }
    if (!track || lyricsLoading) return;
    lyricsLoading = true;
    import('/assets/lyrics.js').then(function (m) { lyricsMount = m.mount(lyricsHost); lyricsMount.update(track); })
      .catch(function () { lyricsLoading = false; });
  }

  var sheet = $('tracks');
  sheet.innerHTML = new Array(7).join('<li class="sk"></li>');
  function loadNow() {
  return Promise.all([v1('/now-playing').catch(function () { return { playing: false }; }), v1('/recent?limit=8')])
    .then(function (r) {
      var np = r[0], recent = r[1].scrobbles || [];
      var playing = !!(np && np.playing && np.track);
      var first = playing ? np.track : recent[0];
      if (!first) throw new Error('none');
      $('np').dataset.state = playing ? 'playing' : 'recent';
      lyricsFor(playing ? np.track : null);
      $('npLabel').textContent = playing ? 'Now playing ♪' : 'Not listening right now · ' + ago(first.timestamp * 1000);
      $('npTrack').textContent = (playing ? '' : 'last: ') + first.track + ' · ' + first.artist;
      if (first.image) { $('npArt').style.backgroundImage = 'url("' + first.image + '")'; albumColours(first.image); }
      var rows = recent.map(function (t) { return { name: t.track, artist: t.artist, when: ago(t.timestamp * 1000) }; });
      // The track that's playing may also have been logged already; show it once.
      if (playing) {
        rows = rows.filter(function (t) { return !(t.name === np.track.track && t.artist === np.track.artist && /just now/.test(t.when)); });
        rows.unshift({ name: np.track.track, artist: np.track.artist, when: 'playing now' });
      }
      var html = rows.slice(0, 8).map(function (t) {
        return '<li><a href="' + esc(artistHref(t.artist)) + '"><span class="line">' + esc(t.name) + '</span>' +
          '<span class="by">' + esc(t.artist) + ' · ' + esc(t.when) + '</span></a></li>';
      }).join('');
      if (sheet.dataset.h !== html) { sheet.dataset.h = html; sheet.innerHTML = html; }   // only redraw when something changed
    })
    .catch(function () {
      $('np').dataset.state = 'idle';
      $('npLabel').textContent = 'Probably listening to';
      $('npTrack').textContent = 'Tame Impala';
      sheet.innerHTML = '<li class="by" style="opacity:1;max-height:none">Couldn’t reach my scrobbler just now.</li>';
    });
  }
  loadNow();
  // Keep it honest: when the music stops, the page notices within a minute.
  setInterval(function () { if (!document.hidden) loadNow(); }, 30000);

  Promise.all([v1('/top/artists?period=7day&limit=5'), v1('/top/tracks?period=7day&limit=5'), v1('/stats?period=7day')])
    .then(function (r) {
      var artists = r[0].artists || [], tracks = r[1].tracks || [];
      $('weekPlays').textContent = (r[2].scrobbles || 0).toLocaleString();
      var max = Math.max.apply(null, artists.map(function (a) { return a.plays; }).concat([1]));
      $('weekArtists').innerHTML = artists.map(function (a) {
        return '<li><a href="' + esc(artistHref(a.artist)) + '">' + esc(a.artist) + '</a><i style="width:' + Math.max(6, a.plays / max * 100) + '%"></i><b>' + a.plays + '</b></li>';
      }).join('');
      $('weekTracks').innerHTML = tracks.map(function (t) {
        return '<li><a href="' + esc(artistHref(t.artist)) + '"><span class="t"><b>' + esc(t.track) + '</b><span>' + esc(t.artist) + '</span></span><span class="n">' + t.plays + ' plays</span></a></li>';
      }).join('');
    })
    .catch(function () { $('week').hidden = true; $('weekTracks').closest('.charts').querySelector('.h3').hidden = true; });

  // Albums on repeat this week; covers that are missing become a pastel tile with the album's name.
  v1('/top/albums?period=7day&limit=6').then(function (d) {
    var list = d.albums || [];
    if (!list.length) throw new Error('none');
    var TILES = ['var(--pink)', 'var(--blue)', 'var(--lemon)', 'var(--mint)', 'var(--lilac)', 'var(--peach)'];
    $('weekAlbums').innerHTML = list.slice(0, 6).map(function (a, i) {
      var img = a.image || '';
      return '<li class="album"><a href="' + esc(artistHref(a.artist)) + '">' +
        '<span class="cover" style="--tc:' + TILES[i % TILES.length] + (img ? ';background-image:url(&quot;' + esc(img) + '&quot;)' : '') + '">' + (img ? '' : esc(a.album)) + '</span>' +
        '<b>' + esc(a.album) + '</b><span>' + esc(a.artist) + ' · ' + a.plays + ' plays</span></a></li>';
    }).join('');
  }).catch(function () { $('albumsBox').hidden = true; });

  // All-time numbers.
  v1('').then(function (d) {
    var t = d.totals, since = new Date(d.user.first_scrobble || d.user.joined);
    var n = function (x) { return Number(x).toLocaleString(); };
    $('lfmStats').innerHTML = [
      [n(t.scrobbles), 'scrobbles, all time'],
      [n(t.artists), 'artists'],
      [n(t.tracks), 'different songs'],
      [since.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), 'scrobbling since']
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
      fetch('assets/favs.json').then(function (r) { return r.json(); }).then(function (d) { data = d; open(b.dataset.fav); }).catch(function () {});
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

  /* ---------- header: slides back in when you scroll up, tucks away when you scroll down ---------- */
  (function () {
    var bar = document.querySelector('.bar');
    if (!bar) return;
    var lastY = window.scrollY;
    function update() {
      var y = window.scrollY, dy = y - lastY;
      if (y < 160) {                                    // back at the top: it sits in its normal place
        if (!bar.classList.contains('shown') || y < 4) bar.classList.remove('float', 'shown');
        lastY = y; return;
      }
      bar.classList.add('float');
      if (Math.abs(dy) < 6) return;                      // ignore tiny jitters
      bar.classList.toggle('shown', dy < 0);
      lastY = y;
    }
    window.addEventListener('scroll', update, { passive: true });
    // clicking a section link scrolls down; let the header get out of the way
    bar.addEventListener('click', function (e) { if (e.target.closest('a[href^="#"]')) setTimeout(function () { bar.classList.remove('shown'); }, 0); });
  })();

  /* ---------- first screen: the lights and my photo lean towards the mouse ---------- */
  (function () {
    var hero = document.querySelector('.hero');
    if (!hero || reduce || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      hero.style.setProperty('--px', ((e.clientX - r.left) / r.width * 2 - 1).toFixed(3));
      hero.style.setProperty('--py', ((e.clientY - r.top) / r.height * 2 - 1).toFixed(3));
    });
    hero.addEventListener('pointerleave', function () { hero.style.setProperty('--px', 0); hero.style.setProperty('--py', 0); });
  })();

  /* ---------- what I do: the cards ride past on a belt; a second copy follows so the loop never shows a gap ---------- */
  (function () {
    var grid = document.querySelector('.skill-grid');
    if (!grid || reduce) return;
    var belt = document.createElement('div');
    belt.className = 'skill-belt';
    grid.parentNode.insertBefore(belt, grid);
    belt.appendChild(grid);
    Array.prototype.slice.call(grid.children).forEach(function (li) {
      // colour and tilt come from each card's place in the list, so pin them before copying
      var cs = getComputedStyle(li), copy;
      li.style.background = cs.backgroundColor; li.style.setProperty('--t', cs.getPropertyValue('--t'));
      copy = li.cloneNode(true); copy.setAttribute('aria-hidden', 'true');
      grid.appendChild(copy);
    });
    grid.classList.add('marquee');
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
