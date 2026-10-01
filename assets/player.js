/* ============================================================
   Mini song player (bottom-right corner)

   TO ADD A SONG:
   1. Put the audio file in  assets/music/   (mp3, m4a, ogg or wav)
   2. Add a line below. "title" is "Song - Artist", the player splits it.
      "cover" is optional: a square image, e.g. assets/music/borderline.jpg

   The player stays hidden while this list is empty.
   ============================================================ */
var RUYTHA_PLAYLIST = [
  // { file: 'assets/music/borderline.mp3', title: 'Borderline - Tame Impala', cover: 'assets/music/borderline.jpg' },
];

(function () {
  'use strict';
  var LIST = RUYTHA_PLAYLIST.filter(function (s) { return s && s.file; });
  if (!LIST.length) return;

  var KEY = 'ruytha-player';
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* private mode */ }

  function split(title) {
    var t = String(title || '').trim(), i = t.indexOf(' - ');
    return i > -1 ? { song: t.slice(0, i).trim(), artist: t.slice(i + 3).trim() } : { song: t || 'Untitled', artist: '' };
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function clock(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  var ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.6v14H7ZM13.4 5H17v14h-3.6Z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2.4v14H6Zm3.4 7L19 5.5v13Z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.6 5H18v14h-2.4ZM5 5.5l9.6 6.5L5 18.5Z"/></svg>',
    vol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path class="vol-wave" d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h11M4 11.5h11M4 16.5h7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M17.5 13.5v6.5l4-3.2Z"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /* ---------- markup ---------- */
  var el = document.createElement('section');
  el.className = 'mp';
  el.setAttribute('aria-label', 'Music player');
  el.innerHTML =
    '<div class="mp-card" id="mpCard" hidden>' +
      '<div class="mp-top">' +
        '<span class="mp-cover mp-cover-lg"><span class="mp-disc"></span></span>' +
        '<div class="mp-meta"><p class="mp-song" id="mpSongLg"></p><p class="mp-artist" id="mpArtistLg"></p></div>' +
      '</div>' +
      '<div class="mp-seek">' +
        '<input class="mp-range" id="mpSeek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek">' +
        '<div class="mp-times"><span id="mpCur">0:00</span><span id="mpDur">0:00</span></div>' +
      '</div>' +
      '<div class="mp-ctrl">' +
        '<button class="mp-btn" id="mpPrev" type="button" aria-label="Previous song">' + ICON.prev + '</button>' +
        '<button class="mp-btn mp-play-lg" id="mpPlayLg" type="button" aria-label="Play">' + ICON.play + '</button>' +
        '<button class="mp-btn" id="mpNext" type="button" aria-label="Next song">' + ICON.next + '</button>' +
      '</div>' +
      '<div class="mp-bottom">' +
        '<label class="mp-vol">' + ICON.vol + '<input class="mp-range" id="mpVol" type="range" min="0" max="100" value="80" aria-label="Volume"></label>' +
        '<button class="mp-btn mp-sm" id="mpListBtn" type="button" aria-expanded="false" aria-controls="mpList" aria-label="Playlist">' + ICON.list + '</button>' +
      '</div>' +
      '<ol class="mp-list" id="mpList" hidden></ol>' +
    '</div>' +
    '<div class="mp-dock">' +
      '<button class="mp-dock-main" id="mpOpen" type="button" aria-expanded="false" aria-controls="mpCard">' +
        '<span class="mp-cover"><span class="mp-disc"></span></span>' +
        '<span class="mp-dock-text"><span class="mp-song" id="mpSong"></span><span class="mp-artist" id="mpArtist"></span></span>' +
        '<span class="mp-chev">' + ICON.up + '</span>' +
      '</button>' +
      '<button class="mp-btn mp-play" id="mpPlay" type="button" aria-label="Play">' + ICON.play + '</button>' +
      '<span class="mp-progress" aria-hidden="true"><i id="mpBar"></i></span>' +
    '</div>';
  document.body.appendChild(el);

  var $ = function (id) { return document.getElementById(id); };
  var audio = new Audio();
  audio.preload = 'metadata';
  var idx = Math.min(Math.max(+saved.i || 0, 0), LIST.length - 1);
  var seeking = false;

  var vol = $('mpVol');
  vol.value = saved.v != null ? saved.v : 80;
  audio.volume = vol.value / 100;

  $('mpList').innerHTML = LIST.map(function (s, i) {
    var m = split(s.title);
    return '<li><button type="button" data-i="' + i + '"><span class="mp-n">' + (i + 1) + '</span>' +
      '<span class="mp-li-text"><span>' + esc(m.song) + '</span><span>' + esc(m.artist) + '</span></span></button></li>';
  }).join('');

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ i: idx, t: Math.floor(audio.currentTime || 0), v: +vol.value })); } catch (e) { /* noop */ }
  }

  function load(i, autoplay, startAt) {
    idx = (i + LIST.length) % LIST.length;
    var s = LIST[idx], m = split(s.title);
    audio.src = s.file;
    if (startAt) audio.addEventListener('loadedmetadata', function once() {
      audio.removeEventListener('loadedmetadata', once);
      if (startAt < audio.duration - 2) audio.currentTime = startAt;
    });
    $('mpSong').textContent = $('mpSongLg').textContent = m.song;
    $('mpArtist').textContent = $('mpArtistLg').textContent = m.artist;
    el.style.setProperty('--mp-h', hue(s.title));
    el.querySelectorAll('.mp-cover').forEach(function (c) {
      c.style.backgroundImage = s.cover ? 'url("' + s.cover + '")' : '';
      c.classList.toggle('has-art', !!s.cover);
    });
    el.querySelectorAll('.mp-list button').forEach(function (b) {
      b.classList.toggle('is-on', +b.getAttribute('data-i') === idx);
    });
    $('mpBar').style.transform = 'scaleX(0)';
    $('mpSeek').value = 0;
    $('mpCur').textContent = '0:00';
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: m.song, artist: m.artist,
        artwork: s.cover ? [{ src: new URL(s.cover, location.href).href }] : []
      });
    }
    if (autoplay) play();
    save();
  }

  function play() {
    var p = audio.play();
    if (p && p.catch) p.catch(function () { /* blocked until the visitor interacts */ });
  }
  function toggle() { if (audio.paused) play(); else audio.pause(); }

  function paint() {
    var on = !audio.paused;
    el.classList.toggle('is-playing', on);
    [$('mpPlay'), $('mpPlayLg')].forEach(function (b) {
      b.innerHTML = on ? ICON.pause : ICON.play;
      b.setAttribute('aria-label', on ? 'Pause' : 'Play');
    });
  }

  /* ---------- events ---------- */
  audio.addEventListener('play', function () {
    paint();
    var m = split(LIST[idx].title);
    if (window.mitaSay) window.mitaSay('♪ ' + m.song + (m.artist ? ' by ' + m.artist : '') + ' ♪');
  });
  audio.addEventListener('pause', function () { paint(); save(); });
  audio.addEventListener('ended', function () { load(idx + 1, true); });
  audio.addEventListener('loadedmetadata', function () { $('mpDur').textContent = clock(audio.duration); });
  audio.addEventListener('timeupdate', function () {
    var f = audio.duration ? audio.currentTime / audio.duration : 0;
    $('mpBar').style.transform = 'scaleX(' + f + ')';
    if (!seeking) $('mpSeek').value = Math.round(f * 1000);
    $('mpCur').textContent = clock(audio.currentTime);
  });
  audio.addEventListener('error', function () {
    el.classList.add('is-error');
    $('mpArtist').textContent = $('mpArtistLg').textContent = 'couldn’t load ' + LIST[idx].file;
  });
  audio.addEventListener('loadstart', function () { el.classList.remove('is-error'); });

  $('mpPlay').addEventListener('click', toggle);
  $('mpPlayLg').addEventListener('click', toggle);
  $('mpPrev').addEventListener('click', function () {
    if (audio.currentTime > 3) audio.currentTime = 0; else load(idx - 1, !audio.paused);
  });
  $('mpNext').addEventListener('click', function () { load(idx + 1, !audio.paused); });

  $('mpOpen').addEventListener('click', function () {
    var open = $('mpCard').hidden;
    $('mpCard').hidden = !open;
    el.classList.toggle('is-open', open);
    this.setAttribute('aria-expanded', String(open));
  });
  $('mpListBtn').addEventListener('click', function () {
    var open = $('mpList').hidden;
    $('mpList').hidden = !open;
    this.setAttribute('aria-expanded', String(open));
  });
  $('mpList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-i]'); if (b) load(+b.getAttribute('data-i'), true);
  });

  var seek = $('mpSeek');
  seek.addEventListener('input', function () {
    seeking = true;
    if (audio.duration) $('mpCur').textContent = clock(seek.value / 1000 * audio.duration);
  });
  seek.addEventListener('change', function () {
    if (audio.duration) audio.currentTime = seek.value / 1000 * audio.duration;
    seeking = false;
  });
  vol.addEventListener('input', function () {
    audio.volume = vol.value / 100;
    el.classList.toggle('is-muted', +vol.value === 0);
    save();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('mpCard').hidden) $('mpOpen').click();
  });
  window.addEventListener('pagehide', save);

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', play);
    navigator.mediaSession.setActionHandler('pause', function () { audio.pause(); });
    navigator.mediaSession.setActionHandler('previoustrack', function () { $('mpPrev').click(); });
    navigator.mediaSession.setActionHandler('nexttrack', function () { $('mpNext').click(); });
  }

  load(idx, false, +saved.t || 0);   // picks up where you left off, paused
  paint();
})();
