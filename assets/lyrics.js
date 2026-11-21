/* Lyric preview for whatever's playing, shared by the home page and NyaFM.
   Lyrics come from /api/lyrics (BiniLyrics, NetEase, LRCLIB) and are drawn by AMLL, the Apple Music-like Lyrics renderer.

     import('/assets/lyrics.js').then(m => { const lp = m.mount(hostElement); lp.update(nowPlayingTrack); });

   update() takes the track object from /v1/users/:user/now-playing ({ artist, track, album, duration, elapsed }),
   or null when nothing is playing. Call it as often as you like (every poll): it only refetches when the song changes,
   and only re-syncs the clock when it has drifted. The host stays hidden until lyrics are found. */

const AMLL = 'https://esm.sh/@applemusic-like-lyrics/core@0.7.0?target=es2022';
const AMLL_CSS = 'https://cdn.jsdelivr.net/npm/@applemusic-like-lyrics/core@0.7.0/dist/style.css';
const DRIFT_MS = 1500;     // re-sync the lyrics if the page clock and the scrobbler disagree by more than this

let amllPromise;
function loadAmll() {
  if (!amllPromise) {
    if (!document.querySelector('link[data-amll]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = AMLL_CSS; css.dataset.amll = '';
      document.head.appendChild(css);
    }
    amllPromise = import(AMLL).catch((e) => { amllPromise = null; throw e; });
  }
  return amllPromise;
}

export function mount(host) {
  host.classList.add('lp');
  host.hidden = true;
  host.innerHTML =
    '<div class="lp-stage" aria-label="Synced lyrics of the song playing now"></div>' +
    '<p class="lp-credit"><span class="lp-title"></span><span class="lp-src"></span></p>';
  const stage = host.querySelector('.lp-stage');
  const title = host.querySelector('.lp-title');
  const src = host.querySelector('.lp-src');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let player = null, key = '', token = 0, raf = 0, last = 0;
  let anchor = 0;                       // performance.now() when the song was at 0:00
  let visible = true, playing = false;

  const songTime = () => performance.now() - anchor;

  function frame(now) {
    raf = 0;
    if (!player || !playing || !visible || document.hidden) { last = 0; return; }
    const delta = last ? now - last : 0;
    last = now;
    player.setCurrentTime(Math.max(0, Math.round(songTime())));
    player.update(delta);
    raf = requestAnimationFrame(frame);
  }
  function run() { if (!raf && player && playing && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(frame); } }

  const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; run(); }, { rootMargin: '120px' });
  io.observe(host);
  document.addEventListener('visibilitychange', run);

  function clear() {
    token++;
    key = '';
    host.hidden = true;
    if (player) { player.pause(); }
  }

  async function load(t, myToken) {
    let data;
    try {
      const q = new URLSearchParams({ artist: t.artist, track: t.track });
      if (t.album) q.set('album', t.album);
      if (t.duration) q.set('duration', String(t.duration));
      const r = await fetch('/api/lyrics?' + q, { headers: { accept: 'application/json' } });
      if (!r.ok) return;
      data = await r.json();
    } catch (e) { return; }
    if (myToken !== token || !data || !data.found || !data.lines || !data.lines.length) return;

    let amll;
    try { amll = await loadAmll(); } catch (e) { return; }
    if (myToken !== token) return;

    if (!player) {
      player = new amll.LyricPlayer();
      player.setAlignAnchor && player.setAlignAnchor('center');
      player.setEnableBlur && player.setEnableBlur(!reduced);
      player.setEnableSpring && player.setEnableSpring(!reduced);
      player.setEnableScale && player.setEnableScale(!reduced);
      player.setHidePassedLines && player.setHidePassedLines(false);
      const el = player.getElement();
      el.classList.add('lp-amll');
      stage.appendChild(el);
    }
    host.hidden = false;                                   // show before measuring so AMLL can lay the lines out
    player.setLyricLines(data.lines, Math.max(0, Math.round(songTime())));
    player.setCurrentTime(Math.max(0, Math.round(songTime())), true);
    title.textContent = t.track + ' · ' + t.artist;
    src.textContent = data.provider + (data.sync === 'word' ? ' · word synced' : ' · line synced');
    host.dataset.sync = data.sync;
    player.resume();
    run();
  }

  return {
    host,
    update(t) {
      if (!t || !t.artist || !t.track) { playing = false; clear(); return; }
      const k = t.artist + '\u0000' + t.track;
      // The scrobbler's elapsed is whole seconds, so add half a second on average.
      const pos = ((t.elapsed || 0) + 0.5) * 1000;
      const mine = anchor ? songTime() : -Infinity;
      if (k !== key) {
        key = k; token++;
        anchor = performance.now() - pos;
        playing = true;
        if (player) player.pause();
        host.hidden = true;
        load(t, token);
      } else if (Math.abs(mine - pos) > DRIFT_MS) {         // seeked, paused and resumed, or the clocks wandered
        anchor = performance.now() - pos;
        if (player) player.setCurrentTime(Math.round(pos), true);
      }
      playing = true;
      run();
    },
    destroy() {
      clear(); cancelAnimationFrame(raf); raf = 0;
      io.disconnect(); document.removeEventListener('visibilitychange', run);
      if (player) player.dispose();
      player = null;
    }
  };
}
