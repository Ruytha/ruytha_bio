/* ============================================================
   Ruytha: extra home page features
   sync game, weekly stats, photo gallery, guestbook,
   project panels, Mita reactions, seasonal mode
   ============================================================ */

/* ------------------------------------------------------------
   PHOTOS: add your own here.
   Save the files in assets/img/photos/ and list them like:
     { src: 'assets/img/photos/sunset.jpg', caption: 'Sunset from the bridge' },
   The gallery stays hidden until this list has at least one photo.
   ------------------------------------------------------------ */
var RUYTHA_PHOTOS = [
];

/* ------------------------------------------------------------
   PROJECTS: the details that open when you click a project card.
   `notes` and `next` are lists, leave them empty to hide them.
   ------------------------------------------------------------ */
var RUYTHA_PROJECTS = {
  ttmls: {
    title: 'TTMLS', badge: 'On going', tone: 'build', img: 'assets/img/project-ddfc.png',
    sub: 'Synced lyrics for Spicy Lyrics',
    body: [
      'I have been syncing songs for Spicy Lyrics for a while and ig this is a project.',
      'TTML is the timed-lyrics format Spicy Lyrics uses. Syncing a song means placing every line, and often every single word, at the exact moment it’s sung, so the lyrics light up in time with the music. I also review other people’s syncs.'
    ],
    notes: [], next: [],
    links: [{ label: 'My Spicy Lyrics profile', href: 'https://spicylyrics.org/ruytha' }, { label: 'Try syncing a line yourself', href: '#sync' }]
  },
  vcap: {
    title: 'VCap Motion', badge: 'Coming soon', tone: 'soon', img: 'assets/img/project-vcap.png',
    sub: 'VR motion capture',
    body: [
      'Working on a VR motion capture project.',
      'The idea is to record performances in VR and use them to animate characters. It’s also the thing Borderline Obsession is waiting on.'
    ],
    notes: [], next: [],
    links: [{ label: 'See Borderline Obsession', project: 'bo' }]
  },
  site: {
    title: 'This website', badge: 'In progress', tone: 'build', img: 'assets/img/project-website.png',
    sub: 'ruytha.dev',
    body: [
      'ig this is a project, but Claude is doing most of the work lol.',
      'It’s plain HTML, CSS and JavaScript hosted on Vercel, with a few small serverless functions for Last.fm, the guestbook and view counts.'
    ],
    notes: [], next: [],
    links: [{ label: 'The links page', href: '/links' }, { label: 'Sign the guestbook', href: '#guestbook' }]
  },
  bo: {
    title: 'Borderline Obsession', badge: 'In the queue', tone: 'queue', img: 'assets/img/project-bo.png',
    sub: 'A short YouTube series',
    body: [
      'A short YouTube series, written and edited by me. This one becomes in production once a stable version of VCap Motion is completed.'
    ],
    notes: [], next: [],
    links: [{ label: 'See VCap Motion', project: 'vcap' }]
  }
};
var RUYTHA_PROJECTS_UPDATED = '1 October 2026';


(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function mita(text, ms) { if (window.mitaSay) window.mitaSay(text, ms); }
  var toastT;
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('is-on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
  }

  /* ============================================================
     1. Sync a line: a tiny Spicy Lyrics style timing game
     ============================================================ */
  (function () {
    var lineEl = $('syncLine'), playBtn = $('syncPlay'), tapBtn = $('syncTap');
    var track = $('syncTrack'), result = $('syncResult'), again = $('syncAgain'), back = $('syncBack');
    if (!lineEl || !playBtn) return;

    var BEAT = 60 / 96;                     // 96 bpm
    var LINE = [['every', 0], ['word', 1], ['you', 1.5], ['hear', 2], ['lands', 3], ['right', 4], ['on', 4.5], ['the', 5], ['beat', 6]];
    var NOTES = [0, 2, 4, 7, 5, 4, 2, 4, 0];     // semitones above the root
    var COUNT = 4;                           // count-in beats
    var LENGTH = 7;                          // beats from first word to the end

    lineEl.innerHTML = LINE.map(function (w, i) { return '<span class="sw" data-i="' + i + '">' + w[0] + '</span>'; }).join(' ');
    var words = lineEl.querySelectorAll('.sw');
    track.innerHTML = '<span class="st-head"></span>' + LINE.map(function (w) {
      return '<i class="st-tick" style="left:' + (w[1] / LENGTH * 100).toFixed(2) + '%"></i>';
    }).join('');
    var head = track.querySelector('.st-head');

    var ctx = null, state = 'idle', t0 = 0, taps = [], timers = [], raf = 0;
    var a0 = 0, p0 = 0;
    // Tap timing uses the page clock anchored to the audio clock: it keeps working
    // even if the browser holds the audio back, and both clocks agree otherwise.
    function anchor() { a0 = ctx.currentTime; p0 = performance.now(); }
    function now() { return a0 + (performance.now() - p0) / 1000; }

    function audio() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function blip(at, freq, len, type, vol) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + len);
      o.connect(g); g.connect(ctx.destination);
      o.start(at); o.stop(at + len + 0.05);
    }
    function schedule(start) {
      for (var b = 0; b < COUNT; b++) blip(start + b * BEAT, b === 0 ? 1320 : 990, 0.06, 'square', 0.05);
      LINE.forEach(function (w, i) {
        var at = start + (COUNT + w[1]) * BEAT;
        blip(at, 330 * Math.pow(2, NOTES[i] / 12), BEAT * 0.9, 'triangle', 0.22);
        blip(at, 82.5, 0.12, 'sine', 0.25);                 // a soft kick under each word
      });
    }
    function clearRun() {
      timers.forEach(clearTimeout); timers = [];
      cancelAnimationFrame(raf);
      track.querySelectorAll('.st-tap').forEach(function (n) { n.remove(); });
      words.forEach(function (w) { w.className = 'sw'; w.removeAttribute('data-off'); w.style.removeProperty('--dur'); });
    }
    function moveHead() {
      var beat = (now() - t0) / BEAT - COUNT;
      head.style.left = Math.max(0, Math.min(100, beat / LENGTH * 100)) + '%';
      head.classList.toggle('is-on', beat >= 0 && beat <= LENGTH);
      if (state === 'playing' || state === 'replay') raf = requestAnimationFrame(moveHead);
    }

    function start() {
      audio();
      clearRun();
      taps = [];
      state = 'playing';
      result.innerHTML = '';
      again.hidden = true; back.hidden = true;
      playBtn.hidden = true; tapBtn.hidden = false;
      tapBtn.focus({ preventScroll: true });
      anchor();
      t0 = a0 + 0.2;
      schedule(t0);
      for (var b = 0; b < COUNT; b++) {
        (function (n) {
          timers.push(setTimeout(function () { tapBtn.setAttribute('data-count', String(COUNT - n)); }, (0.2 + n * BEAT) * 1000));
        })(b);
      }
      timers.push(setTimeout(function () { tapBtn.removeAttribute('data-count'); }, (0.2 + COUNT * BEAT) * 1000));
      timers.push(setTimeout(finish, (0.2 + (COUNT + LENGTH) * BEAT + 0.6) * 1000));
      raf = requestAnimationFrame(moveHead);
    }

    function tap() {
      if (state !== 'playing' || taps.length >= LINE.length) return;
      var i = taps.length;
      var heard = now() - (ctx.outputLatency || ctx.baseLatency || 0);
      var target = t0 + (COUNT + LINE[i][1]) * BEAT;
      var off = Math.round((heard - target) * 1000);
      taps.push(off);
      var w = words[i];
      var grade = Math.abs(off) < 60 ? 'good' : Math.abs(off) < 140 ? 'ok' : 'off';
      w.className = 'sw is-sung is-' + grade;
      w.style.setProperty('--dur', (BEAT * 0.8).toFixed(2) + 's');
      var m = document.createElement('i');
      m.className = 'st-tap is-' + grade;
      m.style.left = Math.max(0, Math.min(100, ((heard - t0) / BEAT - COUNT) / LENGTH * 100)) + '%';
      track.appendChild(m);
      tapBtn.classList.remove('is-hit'); void tapBtn.offsetWidth; tapBtn.classList.add('is-hit');
    }

    function finish() {
      state = 'done';
      tapBtn.hidden = true; playBtn.hidden = true;
      again.hidden = false; back.hidden = taps.length === 0;
      cancelAnimationFrame(raf); head.classList.remove('is-on');
      var missed = LINE.length - taps.length;
      words.forEach(function (w, i) {
        var off = taps[i];
        w.setAttribute('data-off', off == null ? 'missed' : (off > 0 ? '+' : '') + off + 'ms');
        if (off == null) w.className = 'sw is-missed';
      });
      var avg = taps.length ? Math.round(taps.reduce(function (s, o) { return s + Math.abs(o); }, 0) / taps.length) : 0;
      var verdict =
        !taps.length ? 'you didn’t tap at all lol' :
        missed > 2 ? 'you missed a few words, try again!' :
        avg < 45 ? 'Spicy Lyrics ready ✦ hired.' :
        avg < 90 ? 'pretty good, honestly' :
        avg < 160 ? 'getting there!' : 'were you even listening lol';
      result.innerHTML = taps.length
        ? '<strong>' + avg + 'ms</strong> off on average' + (missed ? ', ' + missed + ' missed' : '') + '. <span class="sync-verdict">' + verdict + '</span>'
        : '<span class="sync-verdict">' + verdict + '</span>';
      mita(taps.length ? (avg < 90 ? 'ooh, nice timing! ♡' : 'practice makes perfect~') : 'you have to tap along, silly');
    }

    function replay() {
      if (!taps.length) return;
      audio(); clearRun(); state = 'replay';
      result.classList.add('is-dim');
      anchor();
      t0 = a0 + 0.2;
      schedule(t0);
      taps.forEach(function (off, i) {
        var when = (0.2 + (COUNT + LINE[i][1]) * BEAT) * 1000 + off;
        timers.push(setTimeout(function () {
          words[i].className = 'sw is-sung';
          words[i].style.setProperty('--dur', (BEAT * 0.8).toFixed(2) + 's');
        }, Math.max(0, when)));
      });
      timers.push(setTimeout(function () { state = 'done'; result.classList.remove('is-dim'); finish(); }, (0.2 + (COUNT + LENGTH) * BEAT + 0.6) * 1000));
      raf = requestAnimationFrame(moveHead);
    }

    playBtn.addEventListener('click', start);
    again.addEventListener('click', start);
    back.addEventListener('click', replay);
    tapBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); tap(); });
    window.addEventListener('keydown', function (e) {
      if (state !== 'playing' || e.repeat) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(); }
    });
  })();

  /* ============================================================
     2. This week on Last.fm
     ============================================================ */
  (function () {
    var box = $('weekStats');
    if (!box) return;
    var CFG = window.RUYTHA_CONFIG || {};

    function direct() {
      var user = String(CFG.lastfmUser || '').trim(), key = CFG.lastfmApiKey;
      if (!user || !key) return Promise.reject(new Error('not configured'));
      var base = 'https://ws.audioscrobbler.com/2.0/?format=json&user=' + encodeURIComponent(user) + '&api_key=' + encodeURIComponent(key);
      var since = Math.floor(Date.now() / 1000) - 7 * 86400;
      var get = function (q) { return fetch(base + q).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); };
      var list = function (x) { return x ? (Array.isArray(x) ? x : [x]) : []; };
      return Promise.all([
        get('&method=user.gettopartists&period=7day&limit=5'),
        get('&method=user.gettoptracks&period=7day&limit=5'),
        get('&method=user.getrecenttracks&limit=1&from=' + since)
      ]).then(function (r) {
        return {
          plays: parseInt(r[2].recenttracks && r[2].recenttracks['@attr'] && r[2].recenttracks['@attr'].total, 10) || 0,
          artists: list(r[0].topartists && r[0].topartists.artist).map(function (a) { return { name: a.name, plays: +a.playcount, url: a.url }; }),
          tracks: list(r[1].toptracks && r[1].toptracks.track).map(function (t) { return { name: t.name, artist: t.artist && t.artist.name, plays: +t.playcount, url: t.url }; })
        };
      });
    }

    fetch('/api/lastfm?view=week')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(direct)
      .then(function (d) {
        if (!d || !d.artists) throw new Error('empty');
        var max = d.artists.reduce(function (m, a) { return Math.max(m, a.plays); }, 1);
        var top = d.tracks[0];
        box.innerHTML =
          '<div class="wk-hero"><span class="wk-num">' + d.plays.toLocaleString('en-AU') + '</span>' +
          '<span class="wk-lbl">songs played in the last 7 days</span></div>' +
          '<h3 class="wk-h">Top artists</h3>' +
          '<ol class="wk-bars">' + d.artists.map(function (a) {
            var tip = a.name + ': ' + a.plays + ' play' + (a.plays === 1 ? '' : 's');
            return '<li><a href="' + esc(a.url) + '" target="_blank" rel="noopener" data-tip="' + esc(tip) + '">' +
              '<span class="wk-name">' + esc(a.name) + '</span>' +
              '<span class="wk-bar"><i style="width:' + Math.max(4, a.plays / max * 100).toFixed(1) + '%"></i></span>' +
              '<span class="wk-val">' + a.plays + '</span></a></li>';
          }).join('') + '</ol>' +
          (top ? '<p class="wk-track">Most played song: <a href="' + esc(top.url) + '" target="_blank" rel="noopener">' + esc(top.name) + '</a> by ' + esc(top.artist) + ' <span>(' + top.plays + ')</span></p>' : '');
        box.setAttribute('aria-busy', 'false');
      })
      .catch(function () {
        box.innerHTML = '<p class="wk-empty">Weekly stats show up here once Last.fm is connected.</p>';
        box.setAttribute('aria-busy', 'false');
      });
  })();

  /* ============================================================
     3. Photo gallery + lightbox
     ============================================================ */
  (function () {
    var sec = $('gallery'), grid = $('galleryGrid'), box = $('lightbox');
    if (!sec || !grid) return;
    var mapLink = document.querySelector('[data-map="gallery"]');
    if (!RUYTHA_PHOTOS.length) { sec.hidden = true; if (mapLink) mapLink.hidden = true; return; }

    grid.innerHTML = RUYTHA_PHOTOS.map(function (p, i) {
      return '<li><button class="ph" type="button" data-i="' + i + '" aria-label="Open photo ' + (i + 1) + (p.caption ? ': ' + esc(p.caption) : '') + '">' +
        '<img src="' + esc(p.src) + '" alt="' + esc(p.caption || '') + '" loading="lazy" decoding="async"></button></li>';
    }).join('');

    var img = $('lbImg'), cap = $('lbCap'), cur = 0;
    function show(i) {
      cur = (i + RUYTHA_PHOTOS.length) % RUYTHA_PHOTOS.length;
      img.src = RUYTHA_PHOTOS[cur].src;
      img.alt = RUYTHA_PHOTOS[cur].caption || '';
      cap.textContent = RUYTHA_PHOTOS[cur].caption || '';
    }
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('.ph'); if (!b) return;
      show(+b.getAttribute('data-i'));
      root.classList.add('sheet-lock');
      box.showModal();
    });
    function close() { box.close(); }
    box.addEventListener('close', function () { root.classList.remove('sheet-lock'); });
    $('lbClose').addEventListener('click', close);
    $('lbPrev').addEventListener('click', function () { show(cur - 1); });
    $('lbNext').addEventListener('click', function () { show(cur + 1); });
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') show(cur - 1);
      if (e.key === 'ArrowRight') show(cur + 1);
    });
  })();

  /* ============================================================
     4. Guestbook
     ============================================================ */
  (function () {
    var form = $('gbForm'), wall = $('gbWall'), status = $('gbStatus');
    if (!form || !wall) return;
    var msg = form.elements.msg, count = $('gbCount'), submit = form.querySelector('[type="submit"]');
    var PAPER = ['#fff4b8', '#ffd9e8', '#d6ecff', '#dff5d8', '#efe0ff', '#ffe4c7'];

    function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
    function when(t) {
      var s = (Date.now() - t) / 1000;
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s / 60) + ' min ago';
      if (s < 86400) return Math.floor(s / 3600) + 'h ago';
      if (s < 86400 * 7) return Math.floor(s / 86400) + 'd ago';
      return new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function note(e, fresh) {
      var h = hash(e.id || e.name);
      return '<li class="gb-note' + (fresh ? ' is-new' : '') + '" style="--paper:' + PAPER[h % PAPER.length] + ';--tilt:' + ((h % 7) - 3) + 'deg">' +
        '<span class="gb-sticker" aria-hidden="true">' + esc(e.sticker) + '</span>' +
        '<p class="gb-msg">' + esc(e.msg) + '</p>' +
        '<p class="gb-meta"><span class="gb-name">' + esc(e.name) + '</span><span>' + esc(when(e.t)) + '</span></p></li>';
    }
    function setStatus(text, tone) { status.textContent = text; status.className = 'gb-status' + (tone ? ' is-' + tone : ''); }
    function empty(text) { wall.innerHTML = '<li class="gb-empty">' + text + '</li>'; }

    var online = false;
    fetch('/api/guestbook', { headers: { accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        online = true;
        if (!d.entries.length) empty('No notes yet. Be the first to sign!');
        else wall.innerHTML = d.entries.map(function (e) { return note(e); }).join('');
      })
      .catch(function () {
        empty('The guestbook opens once the site is deployed with its database connected.');
        submit.disabled = true;
      });

    msg.addEventListener('input', function () { count.textContent = msg.value.length + '/160'; });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!online) return;
      var data = {
        name: form.elements.name.value.trim(),
        msg: msg.value.trim(),
        sticker: (form.querySelector('input[name="sticker"]:checked') || {}).value,
        website: form.elements.website.value
      };
      if (!data.name || !data.msg) { setStatus('Add your name and a message first.', 'err'); return; }
      submit.disabled = true;
      setStatus('Sticking your note on the wall…');
      fetch('/api/guestbook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error(res.j.message || 'Something went wrong. Try again in a bit.');
          if (res.j.entry) {
            var first = wall.querySelector('.gb-empty'); if (first) wall.innerHTML = '';
            wall.insertAdjacentHTML('afterbegin', note(res.j.entry, true));
          }
          form.reset(); count.textContent = '0/160';
          setStatus('Signed! Thank you ♡', 'ok');
          mita('you signed the guestbook! thank you ♡');
        })
        .catch(function (err) { setStatus(err.message, 'err'); })
        .then(function () { submit.disabled = false; });
    });
  })();

  /* ============================================================
     5. Project panels (reuse the Tame Impala panel styling)
     ============================================================ */
  (function () {
    var dlg = $('project'), panel = $('projectPanel'), body = $('projectBody');
    if (!dlg || !panel || !dlg.showModal) return;
    var from = null, busy = false;

    function fill(p) {
      var list = function (title, items) {
        return items && items.length ? '<h3 class="artist-h">' + title + '</h3><ul class="pj-list">' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '';
      };
      body.innerHTML =
        '<div class="artist-hero pj-hero"><img src="' + esc(p.img) + '" alt="" decoding="async">' +
        '<div class="artist-hero-text"><span class="badge badge-' + p.tone + '">' + esc(p.badge) + '</span>' +
        '<h2 class="artist-title" id="projectTitle">' + esc(p.title) + '</h2><p class="artist-sub">' + esc(p.sub) + '</p></div></div>' +
        '<div class="artist-body">' + p.body.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('') +
        list('Done so far', p.notes) + list('Up next', p.next) +
        (p.links && p.links.length ? '<div class="pj-links">' + p.links.map(function (l) {
          return l.project
            ? '<button class="btn btn-ghost" type="button" data-goto="' + esc(l.project) + '">' + esc(l.label) + ' <span class="chev">›</span></button>'
            : '<a class="btn btn-ghost" href="' + esc(l.href) + '"' + (/^https?:/.test(l.href) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l.label) + ' <span class="chev">›</span></a>';
        }).join('') + '</div>' : '') +
        '<p class="pj-updated">Info updated ' + esc(RUYTHA_PROJECTS_UPDATED) + '</p></div>';
      panel.querySelector('.artist-scroll').scrollTop = 0;
    }
    function flip(r) {
      var to = panel.getBoundingClientRect();
      return 'translate(' + (r.left - to.left) + 'px,' + (r.top - to.top) + 'px) scale(' + (r.width / to.width) + ',' + (r.height / to.height) + ')';
    }
    function open(id, trigger) {
      var p = RUYTHA_PROJECTS[id]; if (!p || busy) return;
      fill(p);
      if (dlg.open) return;                              // switching from one project to another
      from = trigger;
      root.classList.add('sheet-lock');
      dlg.showModal();
      mita(id === 'site' ? 'this is where we are right now!' : 'ooh, ' + p.title + '!');
      if (reduced || !panel.animate || !trigger) return;
      busy = true;
      var a = panel.animate([{ transform: flip(trigger.getBoundingClientRect()), borderRadius: '22px', opacity: 0.6 }, { transform: 'none', borderRadius: '28px', opacity: 1 }], { duration: 540, easing: EASE });
      dlg.animate([{ backgroundColor: 'rgba(2,5,20,0)' }, { backgroundColor: 'rgba(2,5,20,0.55)' }], { duration: 400, fill: 'both' });
      a.onfinish = function () { busy = false; };
    }
    function finish() { busy = false; if (dlg.open) dlg.close(); root.classList.remove('sheet-lock'); }
    function close() {
      if (!dlg.open || busy) return;
      if (reduced || !panel.animate || !from) { finish(); return; }
      busy = true;
      dlg.animate([{ backgroundColor: 'rgba(2,5,20,0.55)' }, { backgroundColor: 'rgba(2,5,20,0)' }], { duration: 360, fill: 'both' });
      var a = panel.animate([{ transform: 'none', opacity: 1 }, { transform: flip(from.getBoundingClientRect()), opacity: 0 }], { duration: 400, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' });
      a.onfinish = function () { finish(); a.cancel(); };
    }

    document.querySelectorAll('.proj[data-project]').forEach(function (card) {
      card.addEventListener('click', function () { open(card.getAttribute('data-project'), card); });
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(card.getAttribute('data-project'), card); } });
    });
    body.addEventListener('click', function (e) {
      var g = e.target.closest('[data-goto]');
      if (g) { open(g.getAttribute('data-goto'), from); return; }
      var a = e.target.closest('a[href^="#"]');
      if (a) finish();                                   // let in-page links scroll once the panel is gone
    });
    $('projectClose').addEventListener('click', close);
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
  })();

  /* ============================================================
     6. Mita reacts to what you do
     ============================================================ */
  (function () {
    if (!window.MutationObserver) return;
    var sheet = $('sheet'), artist = $('artist');
    var seen = {};
    function once(key, text) { if (seen[key]) return; seen[key] = 1; mita(text); }
    if (sheet) new MutationObserver(function () {
      if (sheet.open) once('fav', 'ooh, good taste ♡');
    }).observe(sheet, { attributes: true, attributeFilter: ['open'] });
    if (artist) new MutationObserver(function () {
      if (artist.open) mita('tame impala again? classic.');
    }).observe(artist, { attributes: true, attributeFilter: ['open'] });

    var wasFem = root.classList.contains('femboy');
    new MutationObserver(function () {
      var fem = root.classList.contains('femboy');
      if (fem !== wasFem) mita(fem ? 'so pink!! i love it ♡' : 'aww, back to blue');
      wasFem = fem;
    }).observe(root, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('scroll', function onScroll() {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 40) {
        once('bottom', 'you made it to the bottom! sign the guestbook? ↑');
        window.removeEventListener('scroll', onScroll);
      }
    }, { passive: true });
  })();

  /* ============================================================
     7. Seasonal mode
     ?season=sakura|wattle|jacaranda|xmas previews one
     ============================================================ */
  (function () {
    var forced = (location.search.match(/[?&]season=(\w+)/) || [])[1];
    var d = new Date(), m = d.getMonth() + 1, day = d.getDate(), md = m * 100 + day;
    var season =
      forced ||
      (md >= 320 && md <= 430 ? 'sakura' :
       md >= 801 && md <= 915 ? 'wattle' :
       md >= 1001 && md <= 1130 ? 'jacaranda' :
       md >= 1201 && md <= 1226 ? 'xmas' : '');
    if (!season) return;
    root.setAttribute('data-season', season);
    var LINES = {
      sakura: 'it’s sakura season in japan! 🌸',
      wattle: day === 1 && m === 9 ? 'happy wattle day! 🌼' : 'the wattle is out! 🌼',
      jacaranda: 'jacaranda season! everything’s purple 💜',
      xmas: 'merry christmas! it’s like 35° here ☀️'
    };
    setTimeout(function () { mita(LINES[season] || 'hi!', 4200); }, 6500);
    if (reduced) return;

    var layer = document.createElement('div');
    layer.className = 'season-layer';
    layer.setAttribute('aria-hidden', 'true');
    var n = window.innerWidth < 700 ? 8 : 16;
    for (var i = 0; i < n; i++) {
      var p = document.createElement('i');
      p.style.left = (Math.random() * 100).toFixed(1) + '%';
      p.style.animationDuration = (9 + Math.random() * 9).toFixed(1) + 's';
      p.style.animationDelay = (-Math.random() * 18).toFixed(1) + 's';
      p.style.setProperty('--size', (6 + Math.random() * 8).toFixed(1) + 'px');
      p.style.setProperty('--sway', (Math.random() * 80 - 40).toFixed(0) + 'px');
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
  })();
})();
