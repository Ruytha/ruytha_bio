/* ============================================================
   Ruytha — site behaviour
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.RUYTHA_CONFIG || {};
  var $  = function (id) { return document.getElementById(id); };

  /* ---------- 1. appearance ---------- */
  var root = document.documentElement;
  var btn  = $('themeBtn');

  function readStored() {
    try { return localStorage.getItem('ruytha-theme'); } catch (e) { return null; }
  }
  function store(v) {
    try { localStorage.setItem('ruytha-theme', v); } catch (e) { /* private mode */ }
  }

  var stored = readStored();
  var startTheme = stored ||
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  setTheme(startTheme);

  function setTheme(v) {
    root.setAttribute('data-theme', v);
    if (btn) {
      btn.setAttribute('aria-label',
        v === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance');
    }
  }

  if (btn) {
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      setTheme(next);
      store(next);
    });
  }

  /* ---------- 2. nav ---------- */
  var nav = $('nav');
  var onScroll = function () {
    if (nav) nav.classList.toggle('is-stuck', window.scrollY > 8);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var navLinks = document.querySelectorAll('.nav-links a');
  if ('IntersectionObserver' in window && navLinks.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['music', 'work', 'projects', 'about', 'links'].forEach(function (id) {
      var el = $(id); if (el) spy.observe(el);
    });
  }

  /* ---------- 3. scroll reveals ---------- */
  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reduced && 'IntersectionObserver' in window) {
    var targets = document.querySelectorAll('.section .h2, .section .lede, .tracks, .faves, .grid, .projects, .about-main, .facts, .links');
    targets.forEach(function (el) { el.classList.add('reveal'); });

    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e, i) {
        if (!e.isIntersecting) return;
        e.target.style.transitionDelay = (i * 60) + 'ms';
        e.target.classList.add('is-in');
        obs.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 4. Perth clock ---------- */
  var clock = $('clockChip');
  function tickClock() {
    if (!clock) return;
    try {
      var t = new Date().toLocaleTimeString('en-AU', {
        timeZone: 'Australia/Perth', hour: 'numeric', minute: '2-digit'
      });
      clock.textContent = t + ' my time';
    } catch (e) {
      clock.remove();
    }
  }
  tickClock();
  setInterval(tickClock, 20000);

  var yearEl = $('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------- 5. Last.fm ---------- */
  var LIMIT = 9;

  function pickArt(images) {
    if (!images || !images.length) return '';
    for (var i = images.length - 1; i >= 0; i--) {
      var u = images[i] && images[i]['#text'];
      if (u && u.indexOf('2a96cbd8b46e442fc41c2b86b821562f') === -1) return u;
    }
    return '';
  }

  function ago(uts) {
    if (!uts) return '';
    var s = Math.floor(Date.now() / 1000) - Number(uts);
    if (s < 90) return 'just now';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h === 1 ? 'an hour ago' : h + ' hours ago';
    var d = Math.round(h / 24);
    if (d < 7) return d === 1 ? 'yesterday' : d + ' days ago';
    return new Date(Number(uts) * 1000).toLocaleDateString('en-AU',
      { day: 'numeric', month: 'short' });
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Try the Vercel serverless route first (keeps the API key private).
     Fall back to a direct browser call if a key is set in config.js. */
  function getRecent() {
    return fetch('/api/lastfm?limit=' + LIMIT, { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('api route responded ' + r.status);
        return r.json();
      })
      .catch(function () {
        if (!CFG.lastfmUser || !CFG.lastfmApiKey) throw new Error('not configured');
        var url = 'https://ws.audioscrobbler.com/2.0/' +
          '?method=user.getrecenttracks' +
          '&user='    + encodeURIComponent(CFG.lastfmUser) +
          '&api_key=' + encodeURIComponent(CFG.lastfmApiKey) +
          '&format=json&limit=' + LIMIT;
        return fetch(url).then(function (r) {
          if (!r.ok) throw new Error('last.fm responded ' + r.status);
          return r.json();
        });
      });
  }

  var listEl = $('tracks');
  var noteEl = $('tracksNote');
  var pill   = $('pill');

  function setPill(state, label, track, art) {
    if (!pill) return;
    pill.setAttribute('data-state', state);
    $('pillLabel').textContent = label;
    $('pillTrack').textContent = track;
    $('pillArt').style.backgroundImage = art ? 'url("' + art + '")' : '';
  }

  function renderTracks(tracks, profileUrl) {
    if (!listEl) return;
    listEl.setAttribute('aria-busy', 'false');
    listEl.innerHTML = tracks.map(function (t) {
      var now  = t['@attr'] && t['@attr'].nowplaying === 'true';
      var art  = pickArt(t.image);
      var when = now ? 'playing now' : ago(t.date && t.date.uts);
      return '' +
        '<li><a class="track" href="' + esc(t.url) + '" target="_blank" rel="noopener">' +
          '<span class="track-art" style="' + (art ? 'background-image:url(&quot;' + esc(art) + '&quot;)' : '') + '"></span>' +
          '<span class="track-body">' +
            '<span class="track-name">' + esc(t.name) + '</span>' +
            '<span class="track-artist">' + esc(t.artist && t.artist['#text']) + '</span>' +
            '<span class="track-when' + (now ? ' track-now' : '') + '">' + esc(when) + '</span>' +
          '</span>' +
        '</a></li>';
    }).join('');

    if (noteEl && profileUrl) {
      noteEl.innerHTML = 'Full history on <a href="' + esc(profileUrl) +
        '" target="_blank" rel="noopener">Last.fm</a>.';
    }
  }

  function showEmpty(message) {
    if (listEl) {
      listEl.setAttribute('aria-busy', 'false');
      listEl.innerHTML = '';
    }
    if (noteEl) noteEl.textContent = message;
    setPill('idle', 'Music', 'Scrobbling is off right now', '');
  }

  getRecent()
    .then(function (data) {
      var rt = data && data.recenttracks;
      var tracks = rt && rt.track;
      if (!tracks) throw new Error('unexpected shape');
      if (!Array.isArray(tracks)) tracks = [tracks];
      if (!tracks.length) {
        showEmpty('No scrobbles yet.');
        return;
      }

      renderTracks(tracks.slice(0, LIMIT),
        (rt['@attr'] && rt['@attr'].user)
          ? 'https://www.last.fm/user/' + rt['@attr'].user
          : (CFG.lastfmUser ? 'https://www.last.fm/user/' + CFG.lastfmUser : ''));

      var top = tracks[0];
      var live = top['@attr'] && top['@attr'].nowplaying === 'true';
      setPill(
        live ? 'playing' : 'recent',
        live ? 'Listening right now' : 'Last played ' + ago(top.date && top.date.uts),
        top.name + ' — ' + (top.artist && top.artist['#text']),
        pickArt(top.image)
      );
    })
    .catch(function (err) {
      console.warn('[last.fm]', err.message);
      if (location.protocol === 'file:') {
        showEmpty('Opened as a local file, so there\u2019s no server to ask. This fills in once it\u2019s deployed \u2014 or add your username and key to assets/config.js to preview it here.');
      } else {
        showEmpty('Last.fm isn\u2019t connected yet \u2014 add LASTFM_API_KEY and LASTFM_USER in your Vercel project settings, then redeploy.');
      }
    });

  /* ---------- 6. easter egg ---------- */
  var toast = $('toast');
  var tid;
  function say(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-on');
    clearTimeout(tid);
    tid = setTimeout(function () { toast.classList.remove('is-on'); }, 3200);
  }

  var buf = '';
  var eggs = {
    miku: function () { say('\u266a Hatsune Miku detected. Teal levels critical.'); },
    teto: function () { say('\u266a Kasane Teto approves of this website.'); },
    forza: function () { say('Agent Forza is classified. Nice try.'); }
  };

  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!/^[a-z]$/i.test(e.key)) return;
    buf = (buf + e.key.toLowerCase()).slice(-8);
    Object.keys(eggs).forEach(function (word) {
      if (buf.indexOf(word) !== -1) { eggs[word](); buf = ''; }
    });
  });
})();
