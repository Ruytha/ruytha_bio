// NyaFM dashboard: motion + little interactions. Pure progressive enhancement:
// the dashboard works without this file, and everything is skipped for "reduce motion".
(() => {
  const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // also off when the owner turns effects off in Settings (app.js adds the class)
  const noFx = () => reduceMQ || document.documentElement.classList.contains('nofx');
  const view = document.getElementById('view');
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ------------------------------------------------------------ tooltip (charts, heatmap)
  const tip = document.createElement('div');
  tip.className = 'fx-tip';
  document.body.appendChild(tip);
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) return tip.classList.remove('on');
    tip.textContent = t.dataset.tip;
    tip.classList.add('on');
    const w = tip.offsetWidth;
    tip.style.transform = `translate(${Math.min(Math.max(8, e.clientX - w / 2), innerWidth - w - 8)}px, ${e.clientY - 44}px)`;
  });
  document.addEventListener('pointerleave', () => tip.classList.remove('on'));

  // ------------------------------------------------------------ paw burst
  function burst(x, y, n = 10, glyph = '🐾') {
    if (noFx()) return;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('span');
      p.className = 'fx-paw';
      p.textContent = glyph;
      const a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90;
      p.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 40}px;--r:${(Math.random() - 0.5) * 120}deg;--s:${0.7 + Math.random() * 0.9}`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1100);
    }
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('.brand')) burst(e.clientX, e.clientY, 12);
    const tile = e.target.closest('.tile');
    if (tile) {
      tile.classList.remove('pop'); void tile.offsetWidth; tile.classList.add('pop');
      burst(e.clientX, e.clientY, 5, '✨');
    }
    const cov = e.target.closest('.row .cover, .card .cover');
    if (cov && !e.target.closest('a')) { cov.classList.remove('wiggle'); void cov.offsetWidth; cov.classList.add('wiggle'); }
  });

  // ------------------------------------------------------------ toast + "new song" celebration
  const toast = document.createElement('div');
  toast.className = 'fx-toast';
  document.body.appendChild(toast);
  let toastT;
  const say = (msg) => {
    toast.textContent = msg;
    toast.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toast.classList.remove('on'), 3500);
  };
  let lastNp = null;
  window.FX = {
    burst, say,
    npChanged(text) {
      const t = (text || '').trim().replace(/\s+/g, ' ');
      if (lastNp !== null && t && t !== lastNp) {
        if (/^Not listening/i.test(t)) say('⏸ not listening anymore');
        else { say('♪ now playing: ' + t.replace(/^Now playing\s*/i, '')); burst(innerWidth / 2, 60, 8, '🎵'); }
      }
      lastNp = t;
    },
  };

  // ------------------------------------------------------------ card tilt
  let tilted = null;
  document.addEventListener('pointermove', (e) => {
    if (noFx() || e.pointerType === 'touch') return;
    const c = e.target.closest?.('.card');
    if (tilted && tilted !== c) { tilted.style.transform = ''; tilted = null; }
    if (!c) return;
    const r = c.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    c.style.transform = `perspective(700px) rotateX(${(-py * 10).toFixed(2)}deg) rotateY(${(px * 12).toFixed(2)}deg) translateY(-4px) scale(1.03)`;
    c.style.setProperty('--gx', `${(px + 0.5) * 100}%`);
    c.style.setProperty('--gy', `${(py + 0.5) * 100}%`);
    tilted = c;
  });
  document.addEventListener('pointerleave', () => { if (tilted) { tilted.style.transform = ''; tilted = null; } });

  // ------------------------------------------------------------ count-up numbers
  function countUp(el) {
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && /\d/.test(n.nodeValue));
    if (!node) return;
    const raw = node.nodeValue.trim();
    const m = raw.match(/^([\d,]*\.?\d+)(.*)$/);
    if (!m) return;
    const target = parseFloat(m[1].replace(/,/g, ''));
    const dec = (m[1].split('.')[1] || '').length;
    const tail = m[2];
    const t0 = performance.now(), dur = 900 + Math.min(900, target / 20);
    const fmt = (v) => v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) + tail;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node.nodeValue = fmt(target * e);
      if (k < 1) requestAnimationFrame(step); else node.nodeValue = raw;
    };
    node.nodeValue = fmt(0);
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------ reveal on scroll
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target;
      io.unobserve(el);
      el.classList.remove('fx-wait');
      el.classList.add('fx-in');
      if (el.matches('.tile')) $$('.n', el).forEach(countUp);
    }
  }, { threshold: 0.12 });

  function enhance() {
    if (noFx()) return;
    // touch screens skip the heatmap's pop-in so it can never be left waiting to appear
    const touch = matchMedia('(hover: none)').matches;
    const targets = $$('.tile, .panel, .card, .row, .np, .chart, ' + (touch ? '' : '.heat, .heatkey, ') + '#view > section, #view > h1, #view > .sub, .periods', view);
    const seen = new Map();
    for (const el of targets) {
      if (el.dataset.fx) continue;
      el.dataset.fx = '1';
      const p = el.parentElement;
      const i = seen.get(p) || 0;
      seen.set(p, i + 1);
      el.style.setProperty('--i', Math.min(i, 14));
      el.classList.add('fx-wait');
      io.observe(el);
    }
    // heat cells pop in column by column
    $$('.heat rect', view).forEach((r, i) => r.style.setProperty('--c', Math.floor(i / 7)));
  }

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; enhance(); });
  }).observe(view, { childList: true, subtree: true });
  enhance();
})();
