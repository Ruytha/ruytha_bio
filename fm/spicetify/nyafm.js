// NAME: NyaFM Scrobbler
// AUTHOR: Ruytha
// DESCRIPTION: Scrobbles Spotify to your own NyaFM server (ListenBrainz API). Profile menu → "NyaFM settings".
/// <reference path="../globals.d.ts" />

(function NyaFM() {
  if (!(window.Spicetify?.Player?.data !== undefined && Spicetify.LocalStorage && Spicetify.PopupModal && Spicetify.Menu)) {
    setTimeout(NyaFM, 500);
    return;
  }

  const LS = Spicetify.LocalStorage;
  const cfg = {
    get url() { return (LS.get('nyafm:url') || '').replace(/\/+$/, ''); },
    get token() { return LS.get('nyafm:token') || ''; },
  };
  const QUEUE_KEY = 'nyafm:queue';

  // ---- state for the current track
  let cur = null;        // { meta, started, played, scrobbled }
  let lastTick = Date.now();

  function metaFromPlayer() {
    const item = Spicetify.Player.data?.item || Spicetify.Player.data?.track;
    if (!item) return null;
    const m = item.metadata || {};
    if (item.type === 'episode' || item.mediaType === 'video' || String(item.uri).startsWith('spotify:episode')) return null;
    const img = m.image_xlarge_url || m.image_large_url || m.image_url || '';
    const cover = img.startsWith('spotify:image:') ? `https://i.scdn.co/image/${img.split(':')[2]}` : img.startsWith('http') ? img : '';
    const duration = Number(m.duration || item.duration?.milliseconds || Spicetify.Player.getDuration() || 0);
    return {
      artist_name: m.artist_name || '',
      track_name: m.title || item.name || '',
      release_name: m.album_title || '',
      additional_info: {
        duration_ms: duration || undefined,
        release_artist_name: m.album_artist_name || undefined,
        spotify_id: item.uri?.startsWith('spotify:track:') ? `https://open.spotify.com/track/${item.uri.split(':')[2]}` : undefined,
        cover_url: cover || undefined,
        submission_client: 'NyaFM Spicetify',
        music_service: 'spotify.com',
      },
      uri: item.uri,
    };
  }

  async function submit(listen_type, payload) {
    if (!cfg.url || !cfg.token) return false;
    try {
      const r = await fetch(`${cfg.url}/1/submit-listens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Token ${cfg.token}` },
        body: JSON.stringify({ listen_type, payload }),
      });
      return r.ok;
    } catch { return false; }
  }

  function clean(meta) { const { uri, ...rest } = meta; return rest; }

  async function flushQueue() {
    const q = JSON.parse(LS.get(QUEUE_KEY) || '[]');
    if (!q.length) return;
    if (await submit('import', q)) LS.set(QUEUE_KEY, '[]');
  }

  async function scrobble(c) {
    const listen = { listened_at: Math.floor(c.started / 1000), track_metadata: clean(c.meta) };
    if (!(await submit('single', [listen]))) {
      const q = JSON.parse(LS.get(QUEUE_KEY) || '[]');
      q.push(listen);
      LS.set(QUEUE_KEY, JSON.stringify(q.slice(-5000)));
    } else flushQueue();
  }

  function onSongChange() {
    const meta = metaFromPlayer();
    cur = meta && meta.artist_name && meta.track_name ? { meta, started: Date.now(), played: 0, scrobbled: false } : null;
    lastTick = Date.now();
    if (cur && Spicetify.Player.isPlaying()) submit('playing_now', [{ track_metadata: clean(cur.meta) }]);
  }

  // Last.fm rules: track > 30s, scrobble after half its length or 4 minutes of actual listening.
  setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    if (!cur || cur.scrobbled || !Spicetify.Player.isPlaying()) return;
    cur.played += Math.min(dt, 5);
    const dur = (cur.meta.additional_info.duration_ms || 0) / 1000;
    if (dur && dur < 30) return;
    const need = dur ? Math.min(dur / 2, 240) : 240;
    if (cur.played >= need) { cur.scrobbled = true; scrobble(cur); }
  }, 1000);

  Spicetify.Player.addEventListener('songchange', onSongChange);
  Spicetify.Player.addEventListener('onplaypause', () => {
    lastTick = Date.now();
    if (cur && Spicetify.Player.isPlaying()) submit('playing_now', [{ track_metadata: clean(cur.meta) }]);
  });
  onSongChange();
  flushQueue();

  // ---- settings popup
  function openSettings() {
    const el = document.createElement('div');
    el.innerHTML = `
      <style>
        .nyafm label{display:block;margin:10px 0 4px;font-size:13px;opacity:.8}
        .nyafm input{width:100%;padding:8px 10px;border-radius:6px;border:1px solid #444;background:#121212;color:#fff}
        .nyafm button{margin-top:14px;margin-right:8px;padding:8px 16px;border-radius:999px;border:0;background:#ff6fae;color:#1a0d14;font-weight:700;cursor:pointer}
        .nyafm .st{margin-top:10px;font-size:13px}
      </style>
      <div class="nyafm">
        <label>NyaFM URL</label><input id="nf-url" placeholder="https://fm.ruytha.dev" value="${cfg.url}">
        <label>Token (NyaFM → Settings)</label><input id="nf-tok" type="password" value="${cfg.token}">
        <button id="nf-save">Save & test</button>
        <div class="st" id="nf-st"></div>
      </div>`;
    Spicetify.PopupModal.display({ title: '🐾 NyaFM Scrobbler', content: el });
    el.querySelector('#nf-save').onclick = async () => {
      LS.set('nyafm:url', el.querySelector('#nf-url').value.trim());
      LS.set('nyafm:token', el.querySelector('#nf-tok').value.trim());
      const st = el.querySelector('#nf-st');
      try {
        const r = await fetch(`${cfg.url}/1/validate-token`, { headers: { Authorization: `Token ${cfg.token}` } });
        const d = await r.json();
        st.textContent = d.valid ? `✓ Connected as ${d.user_name}` : '✗ Token not valid';
        if (d.valid) { onSongChange(); flushQueue(); }
      } catch (e) { st.textContent = `✗ Can't reach server: ${e.message}`; }
    };
  }
  new Spicetify.Menu.Item('NyaFM settings', false, openSettings).register();
  if (!cfg.url || !cfg.token) Spicetify.showNotification?.('NyaFM: open profile menu → "NyaFM settings" to connect 🐾');
})();
