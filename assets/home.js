/* ============================================================
   Home page extras: synced lyric roles, cursor spotlight, project tilt
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- 1. synced lyric roles (Spicy Lyrics style) ---------- */
  var lyric = document.getElementById('lyric');
  var LINES = [
    'i direct short films and music videos',
    'i edit in resolve, premiere and after effects',
    'i light things up, virtual and irl',
    'i animate and rig in blender',
    'i sync lyrics for spicy lyrics',
    'i build websites (with a lot of help)',
    'and yes, i am a femboy'
  ];

  function sing(n) {
    var words = LINES[n].split(' ');
    if (document.documentElement.classList.contains('femboy')) words.push('\u2661');
    var line = document.createElement('span');
    line.className = 'lyric-line is-in';
    var t = 0;
    line.innerHTML = words.map(function (w) {
      var d = 0.16 + w.length * 0.045;          // longer words hold a little longer
      var html = '<span class="lw" style="--t:' + t.toFixed(2) + 's;--d:' + d.toFixed(2) + 's">' + w + '</span>';
      t += d + 0.06;
      return html;
    }).join(' ');

    var old = lyric.querySelector('.lyric-line');
    if (old) {
      old.classList.remove('is-in');
      old.classList.add('is-out');
      setTimeout(function () { if (old.parentNode) old.remove(); }, 500);
    }
    lyric.appendChild(line);
    setTimeout(function () { sing((n + 1) % LINES.length); }, (t + 1.9) * 1000);
  }

  if (lyric && !reduced) {
    lyric.setAttribute('aria-label', 'Director, editor, lighting, Blender animator, lyric syncer, developer');
    setTimeout(function () { sing(0); }, 900);
  }

  /* ---------- 1b. tab title while away ---------- */
  var title = document.title;
  document.addEventListener('visibilitychange', function () {
    document.title = document.hidden ? 'come back \ud83e\udd7a' : title;
  });

  /* ---------- 2. avatar boop ---------- */
  var avatar = document.getElementById('avatar');
  var boops = 0;
  if (avatar) {
    avatar.addEventListener('click', function () {
      avatar.classList.remove('is-boop');
      void avatar.offsetWidth;
      avatar.classList.add('is-boop');
      boops++;
      var toast = document.getElementById('toast');
      if (toast && boops % 5 === 0) {
        toast.textContent = 'boop ×' + boops + '. ok that’s enough';
        toast.classList.add('is-on');
        setTimeout(function () { toast.classList.remove('is-on'); }, 2400);
      }
    });
  }

  if (!fine) return;

  /* ---------- 3. cursor spotlight ---------- */
  var lit = '.section > .wrap, .card, .proj, .track, .links a';
  document.addEventListener('pointermove', function (e) {
    var t = e.target.closest ? e.target.closest(lit) : null;
    while (t) {
      var r = t.getBoundingClientRect();
      t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      t.style.setProperty('--my', (e.clientY - r.top) + 'px');
      t = t.parentElement && t.parentElement.closest(lit);
    }
  }, { passive: true });

  /* ---------- 4. project card tilt ---------- */
  if (reduced) return;
  document.querySelectorAll('.proj').forEach(function (card) {
    card.addEventListener('pointermove', function (e) {
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = 'perspective(800px) rotateX(' + (-y * 7) + 'deg) rotateY(' + (x * 9) + 'deg) translateY(-4px)';
    });
    card.addEventListener('pointerleave', function () { card.style.transform = ''; });
  });
})();

/* ---------- 5. side cards drift with the cursor ---------- */
(function () {
  'use strict';
  var floats = document.querySelectorAll('.rail-bob');
  if (!floats.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var raf = 0, mx = 0, my = 0;
  window.addEventListener('pointermove', function (e) {
    mx = e.clientX / window.innerWidth - 0.5;
    my = e.clientY / window.innerHeight - 0.5;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      floats.forEach(function (f) {
        var d = Number(f.style.getPropertyValue('--depth')) || 16;
        f.style.setProperty('--px', (-mx * d).toFixed(1) + 'px');
        f.style.setProperty('--py', (-my * d).toFixed(1) + 'px');
      });
    });
  }, { passive: true });
})();

/* ---------- 7. femboy mode ---------- */
(function () {
  'use strict';
  var root = document.documentElement;
  var btn = document.getElementById('fbSwitch');
  var layer = document.getElementById('fbHearts');
  var toast = document.getElementById('toast');
  if (!btn || !layer) return;

  var KEY = 'ruytha-femboy';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var HEARTS = ['♡', '♥', '✧', '🎀', '💖', '🌸'];
  var meta = document.querySelector('meta[name="theme-color"]');
  var drift = 0;

  function heart(x, y, burst) {
    var h = document.createElement('span');
    h.className = 'fb-heart' + (burst ? ' is-burst' : '');
    h.textContent = HEARTS[Math.floor(Math.random() * HEARTS.length)];
    h.style.left = x + 'px';
    h.style.top = y + 'px';
    h.style.fontSize = (14 + Math.random() * 18) + 'px';
    if (burst) {
      var ang = Math.random() * Math.PI * 2;
      var dist = 70 + Math.random() * 140;
      h.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      h.style.setProperty('--dy', (Math.sin(ang) * dist - 60) + 'px');
    } else {
      h.style.setProperty('--sway', (Math.random() * 60 - 30) + 'px');
      h.style.animationDuration = (7 + Math.random() * 6) + 's';
    }
    layer.appendChild(h);
    h.addEventListener('animationend', function () { h.remove(); });
  }

  function startDrift() {
    if (drift || reduced) return;
    drift = setInterval(function () {
      if (document.hidden || layer.childElementCount > 26) return;
      heart(Math.random() * window.innerWidth, window.innerHeight + 20, false);
    }, 650);
  }
  function stopDrift() { clearInterval(drift); drift = 0; }

  function say(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('is-on');
    clearTimeout(say.t);
    say.t = setTimeout(function () { toast.classList.remove('is-on'); }, 2600);
  }

  function set(on, fromClick) {
    root.classList.toggle('femboy', on);
    btn.setAttribute('aria-checked', String(on));
    if (meta) meta.setAttribute('content', on ? '#2a0d2e' : '#030718');
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* private mode */ }
    if (on) startDrift(); else stopDrift();
    if (!fromClick) return;
    say(on ? 'femboy mode: on ♡' : 'femboy mode: off (boring)');
    if (on && !reduced) {
      var r = btn.getBoundingClientRect();
      for (var i = 0; i < 26; i++) heart(r.left + 24, r.top + 10, true);
    }
  }

  var saved = false;
  try { saved = localStorage.getItem(KEY) === '1'; } catch (e) { /* private mode */ }
  set(saved, false);

  btn.addEventListener('click', function () {
    set(!root.classList.contains('femboy'), true);
  });
})();

/* ---------- 8. now playing drives the pfp ---------- */
(function () {
  'use strict';
  var root = document.documentElement;
  var pill = document.getElementById('pill');
  var art = document.getElementById('pillArt');
  var label = document.getElementById('npLabel');
  var viz = document.getElementById('viz');
  if (!pill || !art) return;

  /* equalizer bars around the avatar */
  if (viz) {
    var N = 44, html = '';
    for (var i = 0; i < N; i++) {
      html += '<i style="--a:' + (i * 360 / N).toFixed(1) + 'deg;--dur:' + (0.35 + Math.random() * 0.5).toFixed(2) +
        's;--delay:-' + (Math.random()).toFixed(2) + 's"></i>';
    }
    viz.innerHTML = html;
  }

  /* pull two colours out of the cover art */
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
  function css(c) {
    return 'hsl(' + Math.round(c[0]) + ' ' + Math.round(Math.max(c[1], 0.6) * 100) + '% ' +
      Math.round(Math.min(Math.max(c[2], 0.6), 0.74) * 100) + '%)';
  }
  function hueGap(a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }

  function palette(url) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = c.height = 24;
        var x = c.getContext('2d');
        x.drawImage(img, 0, 0, 24, 24);
        var d = x.getImageData(0, 0, 24, 24).data, px = [];
        for (var i = 0; i < d.length; i += 4) {
          var p = hsl(d[i], d[i + 1], d[i + 2]);
          p.push(p[1] * (1 - Math.abs(p[2] - 0.55) * 1.6));   // favour colourful, mid-bright pixels
          px.push(p);
        }
        px.sort(function (a, b) { return b[3] - a[3]; });
        var one = px[0], two = null;
        for (var j = 1; j < px.length; j++) {
          if (hueGap(px[j][0], one[0]) > 40 && px[j][3] > 0.12) { two = px[j]; break; }
        }
        if (!two) two = [(one[0] + 50) % 360, one[1], one[2]];
        if (one[1] < 0.15) return;                            // greyscale cover: keep the site colours
        root.style.setProperty('--np1', css(one));
        root.style.setProperty('--np2', css(two));
        root.classList.add('has-np');
      } catch (e) { /* tainted canvas: keep the site colours */ }
    };
    img.src = url;
  }

  var lastUrl = '';
  function sync() {
    root.setAttribute('data-np', pill.getAttribute('data-state') || '');
    var m = /url\(["']?(.*?)["']?\)/.exec(art.style.backgroundImage || '');
    var url = m ? m[1] : '';
    if (url === lastUrl) return;
    lastUrl = url;
    if (label) label.style.backgroundImage = url ? 'url("' + url + '")' : '';
    pill.style.setProperty('--np-img', url ? 'url("' + url + '")' : 'none');
    pill.classList.toggle('has-art', !!url);
    if (url) palette(url);
    else root.classList.remove('has-np');
  }
  sync();
  var mo = new MutationObserver(sync);
  mo.observe(pill, { attributes: true, attributeFilter: ['data-state'] });
  mo.observe(art, { attributes: true, attributeFilter: ['style'] });
})();

/* ---------- 9. bio: professional / femboy, synced with femboy mode ---------- */
(function () {
  'use strict';
  var root = document.documentElement;
  var bio = document.querySelector('.bio');
  var sw = document.getElementById('bioSwitch');
  var fb = document.getElementById('fbSwitch');
  if (!bio || !sw) return;

  function show(v) {
    bio.setAttribute('data-v', v);
    sw.querySelectorAll('[data-bio]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-bio') === v));
    });
    bio.querySelectorAll('[data-v]').forEach(function (el) {
      if (el === bio) return;
      var on = el.getAttribute('data-v') === v;
      if (on && el.hidden) {
        el.hidden = false;
        if (el.animate) el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
      } else if (!on) {
        el.hidden = true;
      }
    });
  }

  show(root.classList.contains('femboy') ? 'fem' : 'pro');

  sw.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-bio]') : null;
    if (!b) return;
    var want = b.getAttribute('data-bio');
    var isFem = root.classList.contains('femboy');
    if ((want === 'fem') !== isFem && fb) fb.click();   // the page follows the bio
    else show(want);
  });

  /* and the bio follows the page */
  new MutationObserver(function () {
    show(root.classList.contains('femboy') ? 'fem' : 'pro');
  }).observe(root, { attributes: true, attributeFilter: ['class'] });
})();

/* ---------- 10. 日本語 of the day ---------- */
(function () {
  'use strict';
  var btn = document.getElementById('wotd');
  if (!btn) return;
  var WORDS = [
    ['夢', 'ゆめ', 'yume', 'dream'],
    ['映画', 'えいが', 'eiga', 'movie, film'],
    ['照明', 'しょうめい', 'shoumei', 'lighting'],
    ['編集', 'へんしゅう', 'henshuu', 'editing'],
    ['監督', 'かんとく', 'kantoku', 'director'],
    ['音楽', 'おんがく', 'ongaku', 'music'],
    ['歌詞', 'かし', 'kashi', 'lyrics'],
    ['写真', 'しゃしん', 'shashin', 'photo'],
    ['星空', 'ほしぞら', 'hoshizora', 'starry sky'],
    ['物語', 'ものがたり', 'monogatari', 'story'],
    ['友達', 'ともだち', 'tomodachi', 'friend'],
    ['可愛い', 'かわいい', 'kawaii', 'cute'],
    ['頑張る', 'がんばる', 'ganbaru', 'to do your best'],
    ['夜', 'よる', 'yoru', 'night'],
    ['空', 'そら', 'sora', 'sky'],
    ['勉強', 'べんきょう', 'benkyou', 'studying']
  ];
  var day = Math.floor(Date.now() / 864e5);
  var i = day % WORDS.length;
  var word = document.getElementById('wotdWord');
  var read = document.getElementById('wotdRead');
  var mean = document.getElementById('wotdMean');
  function paint() {
    var w = WORDS[i];
    word.textContent = w[0];
    read.textContent = w[1] + ' · ' + w[2];
    mean.textContent = w[3];
  }
  paint();
  btn.addEventListener('click', function () {
    i = (i + 1) % WORDS.length;
    paint();
    if (word.animate) word.animate([{ transform: 'translateY(10px) scale(0.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
  });
})();

/* ---------- 11. side rails (very wide screens) ---------- */
(function () {
  'use strict';
  var railL = document.querySelector('.rail-l');
  if (!railL) return;
  var wide = window.matchMedia('(min-width: 1760px) and (min-height: 760px)');

  /* clock */
  var ticks = railL.querySelector('.clock-ticks');
  var t = '';
  for (var i = 0; i < 12; i++) {
    t += '<line x1="50" y1="' + (i % 3 ? 9 : 7) + '" x2="50" y2="12" transform="rotate(' + i * 30 + ' 50 50)"/>';
  }
  ticks.innerHTML = t;
  var hH = document.getElementById('clockH');
  var hM = document.getElementById('clockM');
  var hS = document.getElementById('clockS');
  var timeEl = document.getElementById('railTime');
  var doingEl = document.getElementById('railDoing');

  function perthNow() {
    // Perth is UTC+8 all year (no daylight saving)
    var d = new Date(Date.now() + 8 * 3600e3);
    return { h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds() };
  }
  function doing(h) {
    if (h < 6)  return 'probably asleep (hopefully)';
    if (h < 9)  return 'probably waking up slowly';
    if (h < 12) return 'probably editing something';
    if (h < 15) return 'probably in blender';
    if (h < 18) return 'probably syncing lyrics';
    if (h < 22) return 'probably gaming';
    return 'probably up way too late';
  }
  function tick() {
    var n = perthNow();
    hH.setAttribute('transform', 'rotate(' + ((n.h % 12) * 30 + n.m * 0.5) + ' 50 50)');
    hM.setAttribute('transform', 'rotate(' + (n.m * 6 + n.s * 0.1) + ' 50 50)');
    hS.setAttribute('transform', 'rotate(' + n.s * 6 + ' 50 50)');
    var h12 = n.h % 12 || 12;
    timeEl.textContent = h12 + ':' + (n.m < 10 ? '0' : '') + n.m + (n.h < 12 ? ' am' : ' pm');
    doingEl.textContent = doing(n.h);
  }
  tick();
  setInterval(function () { if (wide.matches && !document.hidden) tick(); }, 1000);

  /* page map: active section + progress line */
  var links = railL.querySelectorAll('[data-map]');
  var fill = document.getElementById('mapFill');
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute('data-map')] = a; });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove('is-on'); });
        var a = byId[e.target.id];
        if (a) a.classList.add('is-on');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }
  var raf = 0;
  window.addEventListener('scroll', function () {
    if (raf || !wide.matches) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      fill.style.transform = 'scaleY(' + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ')';
    });
  }, { passive: true });

  /* turntable mirrors the now-playing card */
  var pill = document.getElementById('pill');
  var tt = document.getElementById('tt');
  if (!pill || !tt) return;
  var label = tt.querySelector('.tt-label');
  var stEl = document.getElementById('ttState');
  var trEl = document.getElementById('ttTrack');
  var arEl = document.getElementById('ttArtist');
  function mirror() {
    tt.setAttribute('data-state', pill.getAttribute('data-state') || '');
    var parts = (document.getElementById('pillTrack').textContent || '').split(' · ');
    stEl.textContent = document.getElementById('pillLabel').textContent;
    trEl.textContent = parts[0] || '';
    arEl.textContent = parts.slice(1).join(' · ');
    var img = document.getElementById('npLabel').style.backgroundImage;
    label.style.backgroundImage = img || '';
  }
  mirror();
  new MutationObserver(mirror).observe(pill, { attributes: true, childList: true, subtree: true, characterData: true });
})();

/* ---------- 12. Mita sitting in the corner ---------- */
(function () {
  'use strict';
  var el = document.getElementById('chibi');
  var btn = document.getElementById('chibiBtn');
  var bubble = document.getElementById('chibiSay');
  if (!el || !btn) return;
  var root = document.documentElement;

  var LINES = [
    'hi! i’m mita ♡', 'welcome to ruytha’s site!', 'you’re staying a while, right?',
    'i’ll keep this corner warm for you', 'have you seen the projects?', 'scroll down, there’s more!',
    'don’t leave yet~', 'i like it here', 'the turntable is my favourite part'
  ];
  var FEM = ['psst, the femboy switch is over there →', 'pink suits this place ♡', 'so cute in here ♡'];
  var SLEEPY = ['mm… five more minutes…', 'zzz… oh! hi…', 'it’s so late…'];

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function sleepy() { return new Date(Date.now() + 8 * 3600e3).getUTCHours() < 6; }   // Ruytha's night

  var hideT;
  function talk(text, ms) {
    bubble.textContent = text;
    bubble.classList.add('is-on');
    clearTimeout(hideT);
    hideT = setTimeout(function () { bubble.classList.remove('is-on'); }, ms || 3400);
  }
  function chatter() {
    var pill = document.getElementById('pill');
    var track = document.getElementById('pillTrack');
    if (pill && pill.getAttribute('data-state') === 'playing' && track && Math.random() < 0.5) {
      return '♪ ' + track.textContent.split(' · ')[0] + ' ♪';
    }
    if (root.classList.contains('femboy') && Math.random() < 0.5) return pick(FEM);
    return pick(LINES);
  }

  window.mitaSay = function (text, ms) { if (!el.classList.contains('is-sleep')) talk(text, ms); };

  function checkSleep() { el.classList.toggle('is-sleep', sleepy()); }
  checkSleep();
  setInterval(checkSleep, 60000);

  btn.addEventListener('click', function () {
    if (el.classList.contains('is-sleep')) {
      talk(pick(SLEEPY), 2400);
      el.classList.add('is-stir');
      setTimeout(function () { el.classList.remove('is-stir'); }, 2400);
      return;
    }
    el.classList.remove('is-hop'); void el.offsetWidth; el.classList.add('is-hop');
    talk(chatter());
  });

  (function idleChat() {
    setTimeout(function () {
      if (!document.hidden && !el.classList.contains('is-sleep')) talk(chatter());
      idleChat();
    }, 18000 + Math.random() * 18000);
  })();
  setTimeout(function () { if (!el.classList.contains('is-sleep')) talk('hi! i’m mita ♡'); }, 2500);
})();

/* ---------- 13. full-screen hero shrinks as you scroll ---------- */
(function () {
  'use strict';
  var hero = document.querySelector('.hero-big');
  if (!hero) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var raf = 0;
  function update() {
    raf = 0;
    var p = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.75)));
    hero.style.setProperty('--p', p.toFixed(3));
  }
  update();
  window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  window.addEventListener('resize', update);
})();

/* ---------- 14. Tame Impala card expands into a full panel ---------- */
(function () {
  'use strict';
  var dlg = document.getElementById('artist');
  var panel = document.getElementById('artistPanel');
  var closeBtn = document.getElementById('artistClose');
  if (!dlg || !panel || !dlg.showModal) return;
  var root = document.documentElement;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
  var from = null, busy = false;

  function flip(rect) {
    var to = panel.getBoundingClientRect();
    return 'translate(' + (rect.left - to.left) + 'px,' + (rect.top - to.top) + 'px) scale(' +
      (rect.width / to.width) + ',' + (rect.height / to.height) + ')';
  }

  function open(trigger) {
    if (dlg.open || busy) return;
    from = trigger;
    root.classList.add('sheet-lock');
    dlg.showModal();
    panel.querySelector('.artist-scroll').scrollTop = 0;
    if (reduced || !panel.animate) return;
    busy = true;
    var r = trigger.getBoundingClientRect();
    var a = panel.animate([
      { transform: flip(r), borderRadius: '22px', opacity: 0.6 },
      { transform: 'none', borderRadius: '28px', opacity: 1 }
    ], { duration: 560, easing: EASE });
    panel.querySelectorAll('.artist-hero-text, .artist-body, .artist-close').forEach(function (el, i) {
      el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
        { duration: 420, delay: 180 + i * 50, easing: EASE, fill: 'backwards' });
    });
    dlg.animate([{ backgroundColor: 'rgba(2,5,20,0)' }, { backgroundColor: 'rgba(2,5,20,0.55)' }], { duration: 400, fill: 'both' });
    a.onfinish = function () { busy = false; };
  }

  function finish() {
    busy = false;
    if (dlg.open) dlg.close();
    root.classList.remove('sheet-lock');
    if (from) try { from.focus({ preventScroll: true }); } catch (e) { /* noop */ }
  }

  function close() {
    if (!dlg.open || busy) return;
    if (reduced || !panel.animate || !from) { finish(); return; }
    busy = true;
    var r = from.getBoundingClientRect();
    panel.querySelector('.artist-scroll').scrollTop = 0;
    dlg.animate([{ backgroundColor: 'rgba(2,5,20,0.55)' }, { backgroundColor: 'rgba(2,5,20,0)' }], { duration: 380, fill: 'both' });
    var a = panel.animate([
      { transform: 'none', borderRadius: '28px', opacity: 1 },
      { transform: flip(r), borderRadius: '22px', opacity: 0 }
    ], { duration: 420, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' });
    a.onfinish = function () { finish(); a.cancel(); };
  }

  document.querySelectorAll('[data-artist]').forEach(function (t) {
    t.addEventListener('click', function (e) { e.preventDefault(); open(t); });
  });
  closeBtn.addEventListener('click', close);
  dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });   // click the dimmed area
})();

/* ---------- 15. performance: pause decorations that are off screen ---------- */
(function () {
  'use strict';
  if (!('IntersectionObserver' in window)) return;
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { e.target.classList.toggle('is-off', !e.isIntersecting); });
  }, { rootMargin: '150px 0px' });
  document.querySelectorAll('.hero-big, .rail, .cult, .section > .wrap').forEach(function (el) { io.observe(el); });
})();
