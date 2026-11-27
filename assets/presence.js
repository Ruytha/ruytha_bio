/* live status from Discord (via Lanyard): the game I'm playing and the Adobe app I'm in.
   Fills every [data-presence] list and hides it when there's nothing to show. */
(function () {
  'use strict';
  var ID = '690508522395402260';
  var spots = document.querySelectorAll('[data-presence]');
  if (!spots.length || !window.fetch) return;

  // matches the app names and Windows process names (AfterFX, Photoshop, Adobe Premiere Pro...)
  var ADOBE = /adobe|photoshop|premiere|after ?effects|afterfx|illustrator|lightroom|audition|indesign|media encoder|substance|character animator|\bacrobat/i;
  var IGNORE = /desktop service|creative cloud|\bcoresync|\bccx|node\.?js/i; // Adobe's background helpers, not apps
  var pad = function (n) { return n < 10 ? '0' + n : n; };
  var acts = [];

  function since(start) {
    if (!start) return '';
    var m = Math.max(0, Math.floor((Date.now() - start) / 60000));
    return m < 1 ? 'just now' : m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm';
  }

  function art(a) {
    var img = a.assets && (a.assets.large_image || a.assets.small_image);
    if (!img) return '';
    if (img.indexOf('mp:external/') === 0) return 'https://media.discordapp.net/external/' + img.slice(12);
    if (img.indexOf(':') === -1 && a.application_id) return 'https://cdn.discordapp.com/app-assets/' + a.application_id + '/' + img + '.png?size=96';
    return '';
  }

  // Adobe's own two-letter app badges, for when Discord has no icon
  var BADGES = [[/photoshop/i, 'Ps'], [/premiere/i, 'Pr'], [/after ?effects|afterfx/i, 'Ae'], [/illustrator/i, 'Ai'], [/lightroom/i, 'Lr'],
    [/audition/i, 'Au'], [/indesign/i, 'Id'], [/media encoder/i, 'Me'], [/acrobat/i, 'Ac'], [/substance/i, 'Pt'], [/character/i, 'Ch']];
  function short(n) { for (var i = 0; i < BADGES.length; i++) if (BADGES[i][0].test(n)) return BADGES[i][1]; return 'Ad'; }

  function chip(kind, a) {
    var li = document.createElement('li');
    li.className = 'ps glass ps-' + kind;
    var pic = art(a);
    var icon = document.createElement('span');
    icon.className = 'ps-art';
    icon.setAttribute('aria-hidden', 'true');
    if (pic) icon.style.backgroundImage = 'url("' + pic + '")';
    else icon.textContent = kind === 'adobe' ? short(a.name) : '🎮';
    var txt = document.createElement('span');
    txt.className = 'ps-txt';
    var label = document.createElement('span');
    label.className = 'ps-label';
    label.textContent = kind === 'adobe' ? 'Working in' : 'Playing';
    var t = a.timestamps && a.timestamps.start;
    if (t) { var time = document.createElement('span'); time.className = 'ps-time'; time.dataset.start = t; time.textContent = ' · ' + since(t); label.appendChild(time); }
    var name = document.createElement('span');
    name.className = 'ps-name';
    name.textContent = a.name.replace(/^Adobe\s+/i, '') + (kind === 'game' && a.details ? ', ' + a.details : '');
    txt.appendChild(label); txt.appendChild(name);
    li.appendChild(icon); li.appendChild(txt);
    return li;
  }

  function render() {
    // type 0 is "Playing"; Spotify (2) and the custom status (4) are skipped
    var game = null, adobe = null;
    acts.forEach(function (a) {
      if (a.type !== 0 || !a.name || IGNORE.test(a.name)) return;
      if (ADOBE.test(a.name)) { if (!adobe) adobe = a; }
      else if (!game) game = a;
    });
    Array.prototype.forEach.call(spots, function (ul) {
      ul.textContent = '';
      if (game) ul.appendChild(chip('game', game));
      if (adobe) ul.appendChild(chip('adobe', adobe));
      ul.hidden = !(game || adobe);
    });
  }

  function load() {
    if (document.hidden) return;
    fetch('https://api.lanyard.rest/v1/users/' + ID)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { acts = (j && j.success && j.data.activities) || []; render(); })
      .catch(function () {});
  }

  load();
  setInterval(load, 30000);
  document.addEventListener('visibilitychange', load);
  // keep the "for 1h 12m" counters ticking between fetches
  setInterval(function () {
    Array.prototype.forEach.call(document.querySelectorAll('.ps-time'), function (el) { el.textContent = ' · ' + since(+el.dataset.start); });
  }, 30000);
})();
