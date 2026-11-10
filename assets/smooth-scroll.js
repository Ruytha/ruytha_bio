/* ruytha.dev smooth scrolling: a mouse wheel glides to where it's going instead of jumping.
   Shared by the home page and the Ruytha Studios pages.
   Only for real mouse wheels. Trackpads and touch screens already scroll smoothly, so they're left alone,
   and so is anything with its own scrollbar (popups, message boxes, code blocks). Off with reduced motion. */
(function () {
  'use strict';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var target = window.scrollY, mid = target, at = target, raf = 0, last = 0;
  function stop() { cancelAnimationFrame(raf); raf = 0; last = 0; }
  function step(now) {
    var dt = last ? Math.min(now - last, 100) : 16; last = now;
    // time based, so the same glide on a 60Hz or a 144Hz screen; two followers in a row so it eases in
    // as well as out, the first one quick so a wheel click still answers straight away
    mid += (target - mid) * (1 - Math.exp(-dt / 80));
    at += (mid - at) * (1 - Math.exp(-dt / 150));
    if (Math.abs(target - at) < 0.4 && Math.abs(target - mid) < 0.4) at = mid = target;
    window.scrollTo({ top: at, behavior: 'instant' });
    if (at === target) { raf = 0; last = 0; } else raf = requestAnimationFrame(step);
  }
  function ownScroller(el) {
    for (; el && el !== document.body && el.nodeType === 1; el = el.parentNode) {
      if (el.tagName === 'DIALOG') return true;
      var o = getComputedStyle(el).overflowY;
      if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1) return true;
    }
    return false;
  }
  window.addEventListener('wheel', function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.deltaX) return;
    var lines = e.deltaMode === 1, dy = lines ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
    // A mouse wheel moves the page in big jumps (about 100px a click, scaled by the page zoom, so
    // 40px at 250% up to 200px at 50%); a trackpad sends lots of small ones. Firefox mice scroll by lines.
    var mouse = lines || Math.abs(dy) >= 40;
    if (!mouse || !dy) { stop(); return; }
    if (ownScroller(e.target)) return;
    e.preventDefault();
    if (!raf) at = mid = target = window.scrollY;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    target = Math.max(0, Math.min(max, target + dy));
    if (!raf) raf = requestAnimationFrame(step);
  }, { passive: false });
  // anything else that moves the page (a link, the keyboard, dragging the scrollbar) takes over at once
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { window.addEventListener(ev, stop, { passive: true }); });
})();
