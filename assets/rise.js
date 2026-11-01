/* Home page: each section's parts rise in, one after another, the first time it scrolls into view.
   Content stays visible if this never runs (no script or reduced motion). A plain scroll check rather
   than an IntersectionObserver: if the observer is throttled, sections must never stay hidden. */
(function () {
  'use strict';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var waiting = Array.prototype.slice.call(document.querySelectorAll('.section > .wrap'));
  waiting.forEach(function (g) {
    Array.prototype.forEach.call(g.children, function (kid, i) { kid.style.setProperty('--d', Math.min(i, 6) * 80 + 'ms'); });
  });
  function check() {
    var line = window.innerHeight * 0.9;
    waiting = waiting.filter(function (g) {
      if (g.getBoundingClientRect().top > line) return true;
      g.classList.add('risen');
      return false;
    });
    if (!waiting.length) {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    }
  }
  document.documentElement.classList.add('rise-on');
  window.addEventListener('scroll', check, { passive: true });
  window.addEventListener('resize', check);
  check();
})();
