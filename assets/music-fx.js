/* A little motion for the music section of the home page: numbers count up, bars grow,
   lists slide in as you scroll to them, stickers and album covers react to clicks.
   Skipped entirely for visitors who ask for reduced motion. */
(function () {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var $ = function (id) { return document.getElementById(id); };

  var css = document.createElement('style');
  css.textContent =
    '.mfx-wait{opacity:0}' +
    '.mfx-in{animation:mfx-up .6s cubic-bezier(.2,.8,.2,1) calc(var(--i,0)*70ms) backwards}' +
    '@keyframes mfx-up{from{opacity:0;transform:translateY(16px) scale(.96)}}' +
    '#weekArtists li i{transform-origin:left}' +
    '#weekArtists li.mfx-in i{animation:mfx-bar .9s cubic-bezier(.2,.8,.2,1) calc(var(--i,0)*70ms + .2s) backwards}' +
    '@keyframes mfx-bar{from{transform:scaleX(0)}}' +
    '#lfmStats li{cursor:pointer}' +
    '#lfmStats li.mfx-pop{animation:mfx-pop .55s cubic-bezier(.2,1.6,.4,1)}' +
    '@keyframes mfx-pop{40%{transform:scale(1.12) rotate(-3deg)}}' +
    '#weekAlbums .album .cover{transition:rotate .4s cubic-bezier(.2,1.6,.4,1),scale .4s cubic-bezier(.2,1.6,.4,1),box-shadow .3s}' +
    '#weekAlbums .album a:hover .cover{box-shadow:0 14px 30px rgba(0,0,0,.35)}' +
    '#weekAlbums .album.mfx-spin .cover{animation:mfx-spin .7s cubic-bezier(.3,1.3,.4,1)}' +
    '@keyframes mfx-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
    '#tracks li a{transition:transform .25s cubic-bezier(.2,1.4,.4,1)}' +
    '#tracks li a:hover{transform:translateX(6px)}' +
    '.mfx-note{position:fixed;z-index:80;pointer-events:none;font-size:20px;translate:-50% -50%;animation:mfx-fly 1s cubic-bezier(.15,.7,.3,1) forwards}' +
    '@keyframes mfx-fly{0%{opacity:1;transform:translate(0,0) scale(.4)}100%{opacity:0;transform:translate(var(--dx),calc(var(--dy) + 60px)) rotate(var(--r)) scale(1)}}';
  document.head.appendChild(css);

  function burst(x, y, glyph, n) {
    for (var i = 0; i < n; i++) {
      var p = document.createElement('span');
      p.className = 'mfx-note';
      p.textContent = glyph[i % glyph.length];
      var a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 80;
      p.style.cssText = 'left:' + x + 'px;top:' + y + 'px;--dx:' + Math.cos(a) * d + 'px;--dy:' + (Math.sin(a) * d - 36) + 'px;--r:' + (Math.random() - 0.5) * 120 + 'deg';
      document.body.appendChild(p);
      setTimeout(function (el) { el.remove(); }.bind(null, p), 1000);
    }
  }

  function countUp(el) {
    var node = null;
    for (var i = 0; i < el.childNodes.length; i++) if (el.childNodes[i].nodeType === 3 && /^\s*[\d,]+(\.\d+)?\s*$/.test(el.childNodes[i].nodeValue)) { node = el.childNodes[i]; break; }
    if (!node) return;
    var raw = node.nodeValue, target = parseFloat(raw.replace(/,/g, ''));
    if (!isFinite(target) || target < 2) return;
    var t0 = performance.now(), dur = 900 + Math.min(900, target / 20);
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node.nodeValue = Math.round(target * e).toLocaleString();
      if (k < 1) requestAnimationFrame(step); else node.nodeValue = raw;
    })(t0);
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      io.unobserve(el);
      el.classList.remove('mfx-wait');
      el.classList.add('mfx-in');
      if (el.matches('#lfmStats li')) { var b = el.querySelector('b'); if (b) countUp(b); }
      if (el.id === 'weekPlays') countUp(el);
    });
  }, { threshold: 0.15 });

  function watch(parent, itemSel) {
    var seen = 0;
    function run() {
      Array.prototype.forEach.call(parent.querySelectorAll(itemSel), function (el, i) {
        if (el.dataset.mfx) return;
        el.dataset.mfx = '1';
        el.style.setProperty('--i', Math.min(i, 8));
        el.classList.add('mfx-wait');
        io.observe(el);
      });
    }
    run();
    new MutationObserver(run).observe(parent, { childList: true });
  }

  ['lfmStats', 'weekArtists', 'weekTracks', 'weekAlbums', 'tracks'].forEach(function (id) {
    var el = $(id);
    if (el) watch(el, 'li');
  });
  var wp = $('weekPlays');
  if (wp) {
    var seen = false;
    new MutationObserver(function () { if (!seen && /\d/.test(wp.textContent)) { seen = true; io.observe(wp); } }).observe(wp, { childList: true, characterData: true, subtree: true });
  }

  // clicks: stickers pop and throw sparkles, album covers do a flip, now playing throws notes
  document.addEventListener('click', function (e) {
    var st = e.target.closest && e.target.closest('#lfmStats li');
    if (st) { st.classList.remove('mfx-pop'); void st.offsetWidth; st.classList.add('mfx-pop'); burst(e.clientX, e.clientY, ['✨', '💖', '⭐'], 6); }
    var al = e.target.closest && e.target.closest('#weekAlbums .album');
    if (al) { al.classList.remove('mfx-spin'); void al.offsetWidth; al.classList.add('mfx-spin'); }
    var np = e.target.closest && e.target.closest('#np');
    if (np) burst(e.clientX, e.clientY, ['♪', '♫', '🎵'], 7);
  });
})();
