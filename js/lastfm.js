// ============================================================================
// lastfm.js — talks to /api/lastfm (never to Last.fm directly, so the API key
// stays server-side). Renders the "now playing" card + recent tracks list,
// and retints the ambient background from the current album art.
// ============================================================================

(function () {
  const npEl = document.getElementById('nowplaying');
  const recentEl = document.getElementById('recent-list');
  if (!npEl && !recentEl) return; // this page doesn't have a last.fm section

  async function loadLastfm() {
    try {
      const res = await fetch('/api/lastfm');
      if (!res.ok) throw new Error('lastfm api error ' + res.status);
      const data = await res.json();
      renderNowPlaying(data.nowPlaying);
      renderRecent(data.recent);
      if (data.nowPlaying && data.nowPlaying.image) {
        tintFromImage(data.nowPlaying.image);
      }
    } catch (err) {
      console.warn('Last.fm fetch failed:', err);
      if (npEl) {
        npEl.innerHTML = '<div class="meta"><div class="track">Last.fm is offline</div>' +
          '<div class="artist">check /api/lastfm — is LASTFM_API_KEY set?</div></div>';
      }
    }
  }

  function renderNowPlaying(track) {
    if (!npEl) return;
    if (!track) {
      npEl.innerHTML = '<div class="meta"><div class="track">Not listening right now</div>' +
        '<div class="artist">check back later</div></div>';
      return;
    }
    npEl.innerHTML = `
      <img class="art" src="${escapeAttr(track.image)}" alt="" loading="lazy" />
      <div class="meta">
        <div class="track">${escapeHtml(track.name)}</div>
        <div class="artist">${escapeHtml(track.artist)}</div>
      </div>
      ${track.nowPlaying ? '<div class="eq"><span></span><span></span><span></span><span></span></div>' : ''}
    `;
  }

  function renderRecent(tracks) {
    if (!recentEl || !tracks) return;
    recentEl.innerHTML = tracks.map(t => `
      <div class="row">
        <img src="${escapeAttr(t.image)}" alt="" loading="lazy" />
        <div class="t">${escapeHtml(t.name)}</div>
        <div class="a">— ${escapeHtml(t.artist)}</div>
        <div class="when">${t.nowPlaying ? 'now' : escapeHtml(t.when || '')}</div>
      </div>
    `).join('');
  }

  function tintFromImage(url) {
    if (!url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 8, 8);
        const data = ctx.getImageData(0, 0, 8, 8).data;
        const colors = [];
        for (let i = 0; i < data.length; i += 4) {
          colors.push([data[i], data[i + 1], data[i + 2]]);
        }
        colors.sort((a, b) => (b[0] + b[1] + b[2]) - (a[0] + a[1] + a[2]));
        const bright = colors[Math.floor(colors.length * 0.15)];
        const mid = colors[Math.floor(colors.length * 0.5)];
        const root = document.documentElement.style;
        if (bright) root.setProperty('--blob-1', rgb(bright));
        if (mid) root.setProperty('--blob-2', rgb(mid));
      } catch (e) {
        // canvas tainted by CORS — silently skip, defaults still look good
      }
    };
    img.src = url;
  }

  function rgb([r, g, b]) { return `rgb(${r},${g},${b})`; }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function escapeAttr(s) { return escapeHtml(s); }

  loadLastfm();
  setInterval(loadLastfm, 30000); // refresh every 30s
})();
