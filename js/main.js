// ============================================================================
// main.js — runs on every page. Injects the ambient blob background, wires up
// the mobile nav toggle, and hosts a couple of easter eggs.
// ============================================================================

(function injectAmbient() {
  const ambient = document.createElement('div');
  ambient.id = 'ambient';
  ambient.innerHTML = '<div class="blob"></div><div class="blob"></div><div class="blob"></div><div class="blob"></div>';
  document.body.prepend(ambient);
})();

// ---- mobile nav toggle ----
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('nav.links');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.style.display === 'flex';
      links.style.display = open ? 'none' : 'flex';
      links.style.flexDirection = 'column';
      links.style.position = 'absolute';
      links.style.top = '64px';
      links.style.right = '24px';
      links.style.background = 'var(--bg-raised)';
      links.style.border = '1px solid var(--line)';
      links.style.borderRadius = '12px';
      links.style.padding = '8px';
      toggle.setAttribute('aria-expanded', String(!open));
    });
  }
});

// ---- toast helper for easter eggs ----
function eggToast(message, ms = 2400) {
  let el = document.getElementById('egg-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'egg-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}
window.eggToast = eggToast;

// ---- easter egg #1: konami code ----
(function konami() {
  const seq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let i = 0;
  window.addEventListener('keydown', (e) => {
    i = e.key === seq[i] ? i + 1 : (e.key === seq[0] ? 1 : 0);
    if (i === seq.length) {
      i = 0;
      document.body.style.transition = 'filter 1s ease';
      document.body.style.filter = 'invert(1) hue-rotate(180deg)';
      eggToast('🎮 konami mode — press it again to undo', 4000);
      let undone = false;
      const undo = () => {
        if (undone) return;
        undone = true;
        document.body.style.filter = '';
        window.removeEventListener('keydown', undo);
      };
      window.addEventListener('keydown', undo);
    }
  });
})();

// ---- easter egg #2: click the brand logo dot 5 times ----
(function logoClicks() {
  document.addEventListener('DOMContentLoaded', () => {
    const dot = document.querySelector('.brand .dot');
    if (!dot) return;
    let clicks = 0;
    dot.addEventListener('click', (e) => {
      e.preventDefault();
      clicks++;
      const ambient = document.getElementById('ambient');
      if (ambient) {
        ambient.classList.add('beat');
        setTimeout(() => ambient.classList.remove('beat'), 3000);
      }
      if (clicks === 5) {
        eggToast('an idot was here. CEO at markdown.');
        clicks = 0;
      }
    });
  });
})();

// ---- console flavor for the devs reading this ----
console.log('%c hi. ', 'background:#b565d8;color:#0a0a10;font-family:monospace;padding:2px 6px;border-radius:4px;');
console.log('%cCSS, JS, HTML and Python dev. also an idot. — @ruytha', 'color:#a8a6b8;font-family:monospace;');
