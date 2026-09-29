/* ============================================================
   Ruytha — favourites (anime + games)
   A poster grid. Click one and it opens full screen.

   TO EDIT: change the two lists below.
   COVER ART: save a 600x800 (3:4) .jpg named after the entry's id
   in assets/img/media/  (e.g. assets/img/media/rdr2.jpg).
   Until the file exists, a coloured cover with the short name shows.
   ============================================================ */
(function () {
  'use strict';

  var ART_DIR = 'assets/img/media/';
  var ART_EXT = 'jpg';

  /* id     file name for the art, and the #fav-<id> link
     title  full name
     sub    optional line under the name on the grid
     meta   studio / developer and year
     mono   short name shown on the cover until real art exists
     hue    0-360, colour of the cover
     star   true = top pick
     summary  array of paragraphs                                  */

  var ANIME = [
    {
      id: 'ttq', title: 'The Quintessential Quintuplets', mono: 'TQQ', hue: 215, 
      meta: ' Tezuka Productions,  Bibury Animation Studios · 2019',
      summary: ['Fuutarou Uesugi is a top student from a poor family who takes a high-paying tutoring job to help clear his fathers debts. His students turn out to be five classmates who are quintuplets: Ichika, Nino, Miku, Yotsuba and Itsuki, all of them failing and none of them interested in studying. He has to get all five through graduation, but first he has to get any of them to actually listen to him.']
    },
    {
      id: 'rascal', title: 'Rascal Does Not Dream of Bunny Girl Senpai', mono: 'Rascal', hue: 335,
      meta: 'CloverWorks · 2018',
      summary: [
        'Sakuta Azusagawa is a high schooler whose quiet routine changes when he runs into Mai Sakurajima, a famous actress wandering the library in a bunny girl outfit that nobody else seems able to see. Helping her leads him into a run of strange \u201cAdolescence Syndrome\u201d cases around school, each one growing out of something painfully real. It\u2019s part supernatural mystery, part sharp banter, and a lot of heart.'
      ]
    },
    {
      id: 'bocchi', title: 'Bocchi the Rock!', mono: 'Bocchi', hue: 8,
      meta: 'CloverWorks · 2022',
      summary: [
        'Hitori \u201cBocchi\u201d Gotoh is a guitarist who has practised alone for years and can barely talk to other people. When drummer Nijika pulls her into the band Kessoku Band, she has to work out how to stand on a real stage without dissolving into a puddle of anxiety. The music is great, the comedy is sharp, and Bocchi\u2019s spiralling inner monologue is half the fun.'
      ]
    },
    {
      id: 'alya', title: 'Alya Sometimes Hides Her Feelings in Russian', mono: 'Alya', hue: 192,
      meta: 'Doga Kobo · 2024',
      summary: [
        'Alya is a half-Russian top student who everyone finds cool and unapproachable, and who spends her days scolding Masachika Kuze, the sleepy classmate sitting next to her. She also mutters affectionate things in Russian, sure that nobody around her understands. Masachika understands every word and pretends he doesn\u2019t. The whole show grows out of that one secret.'
      ]
    },
    {
      id: 'spyxfamily', title: 'Spy x Family', mono: 'SxF', hue: 145,
      meta: 'Wit Studio and CloverWorks · 2022',
      summary: [
        'Twilight, a top-tier spy, needs a family to finish his latest mission. He becomes Loid Forger, adopts a little girl called Anya, and marries Yor, who needs a cover of her own. What none of them know is that Anya can read minds and Yor is an assassin. Each is hiding something from the other two, and somehow they end up feeling like a real family anyway.'
      ]
    },
    {
      id: 'married-couple', title: 'More Than a Married Couple, But Not Lovers', mono: 'MTAMC', hue: 292,
      meta: 'Studio Mother · 2022',
      summary: [
        'At Jiro Yakuin\u2019s school, third-years are paired up for a \u201cmarriage practical\u201d and have to live together as a married couple. He gets Akari Watanabe, a lively gyaru who is nothing like him, and both of them would rather have been matched with their crushes. To swap partners they need to score well as a couple, so they play house properly, and it slowly stops feeling like acting.'
      ]
    }
  ];

  var GAMES = [
    {
      id: 'ieytd', title: 'I Expect You to Die', sub: 'Parts 1, 2 & 3', mono: 'IEYTD', hue: 230,
      meta: 'Schell Games · 2016 to 2023',
      summary: [
        'A VR spy puzzle series. You play an agent who gets dropped into deadly, escape-room-style setups and has to work out how to finish the mission before something goes badly wrong. Everything is solved with what\u2019s within arm\u2019s reach, and the dry, dark humour is a big part of the charm.',
        'Three games, each one bigger and stranger than the last.'
      ]
    },
    {
      id: 'rdr2', title: 'Red Dead Redemption 2', mono: 'RDR2', hue: 26, star: true,
      meta: 'Rockstar Games · 2018',
      summary: [
        'An open-world Western set in 1899, when the outlaw era is fading and the law is closing in. You play Arthur Morgan, an enforcer in the Van der Linde gang, as the crew runs from one job to the next and starts to come apart from the inside. It\u2019s known for its slow, detailed world and a story that takes its time before it hits you.'
      ]
    },
    {
      id: 'fh6', title: 'Forza Horizon 6', mono: 'FH6', hue: 348, star: true,
      meta: 'Playground Games, Turn 10 Gmaes, Xbox Game Studios · 2026',
      summary: [
        'The open-world racing series heads to Japan, with Tokyo as its biggest and most detailed drivable space yet. There are around 550 cars at launch, plenty of them kei cars and vans, and the roads run from city streets to mountain passes made for drifting. This time you start out as a tourist and earn your way up through the Horizon Festival.'
      ]
    },
    {
      id: 'ddlc', title: 'Doki Doki Literature Club!', mono: 'DDLC', hue: 322,
      meta: 'Team Salvato · 2017',
      summary: [
        'A free visual novel that starts out as a sweet story about joining your school\u2019s literature club and getting to know its four members. It doesn\u2019t stay that way. It\u2019s best to go in knowing as little as possible, and it opens with a content warning, so read that first.'
      ]
    },
    {
      id: 'zzz', title: 'Zenless Zone Zero', mono: 'ZZZ', hue: 52,
      meta: 'HoYoverse · 2024',
      summary: [
        'A stylish urban-fantasy action RPG set in New Eridu, a city that survived the disasters known as Hollows. You play a Proxy, someone who guides squads of agents through those Hollows, and the fights are fast and flashy with a soundtrack to match.'
      ]
    },
    {
      id: 'rr', title: 'Rec Room', mono: 'RR', hue: 176,
      meta: 'Rec Room Inc. · 2016 to 2026',
      summary: [
        'A free social platform where you could hang out, play games and build your own rooms, on VR, consoles, PC and mobile. Over a decade it grew to more than 150 million players and creators. It shut down on June 1, 2026.'
      ]
    },
    {
      id: 'firewatch', title: 'Firewatch', mono: 'Firewatch', hue: 14,
      meta: 'Campo Santo · 2016',
      summary: [
        'You play Henry, who takes a summer job as a fire lookout in Wyoming\u2019s Shoshone National Forest in 1989, with only a radio and his supervisor Delilah for company. It\u2019s a first-person story about isolation and trust that slowly turns into a mystery about who else is out there.'
      ]
    },
    {
      id: 'dead-as-disco', title: 'Dead as Disco', mono: 'DaD', hue: 285,
      meta: 'Brain Jar Games · 2026 (early access)',
      summary: [
        'A rhythm brawler where every punch, kick and dodge lands on the beat. You play Charlie Disco, a dead drummer who rises for one night to take on his old bandmates and the corporation running them. You can also load in your own songs and fight to them.'
      ]
    },
    {
      id: 'fears-to-fathom', title: 'Fears to Fathom', sub: 'Episodes 1 & 2', mono: 'FTF', hue: 160,
      meta: 'Rayll · 2021 to 2022',
      summary: [
        'An episodic horror series where each episode is a short, self-contained story about an ordinary situation turning frightening, inspired by scares that real people described.',
        'Episode 1 is Home Alone and episode 2 is Norwood Hitchhike.'
      ]
    },
    {
      id: 'minecraft', title: 'Minecraft', mono: 'Minecraft', hue: 125,
      meta: 'Mojang · 2011',
      summary: [
        'A sandbox game where you explore a world made of blocks, gather resources and build whatever you can imagine, from a tiny dirt hut to a full-scale castle. Survive the night in survival mode or build freely in creative mode. Either way, you set your own goals.'
      ]
    }
  ];

  /* ---------- setup ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement;

  var animeGrid = $('animeGrid');
  var gamesGrid = $('gamesGrid');
  var sheet     = $('sheet');
  if (!animeGrid || !gamesGrid || !sheet) return;

  var sheetDim   = $('sheetDim');
  var sheetBg    = $('sheetBg');
  var sheetCover = $('sheetCover');
  var sheetScrim = $('sheetScrim');
  var closeBtn   = $('sheetClose');
  var scroller   = $('sheetScroll');
  var poster     = $('sheetPoster');
  var posterCov  = $('posterCover');
  var textEl     = $('sheetText');
  var badgeEl    = $('sheetBadge');
  var titleEl    = $('sheetTitle');
  var subEl      = $('sheetSub');
  var metaEl     = $('sheetMeta');
  var bodyEl     = $('sheetBody');

  var STAR = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z"/></svg>' +
    '<span class="sr-only"> (top pick)</span>';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var byId = {};
  ANIME.forEach(function (it) { it.kind = 'anime'; byId[it.id] = it; });
  GAMES.forEach(function (it) { it.kind = 'game';  byId[it.id] = it; });

  /* Rough width of the short name in em, so it can be sized to fit the cover. */
  function monoWidth(text) {
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if ('ijlt.'.indexOf(c) !== -1) w += 0.32;
      else if ('mw'.indexOf(c) !== -1) w += 0.9;
      else if ('MW'.indexOf(c) !== -1) w += 0.96;
      else if (c === 'I') w += 0.32;
      else if (c >= 'A' && c <= 'Z') w += 0.74;
      else if (c >= '0' && c <= '9') w += 0.6;
      else w += 0.58;
      w -= 0.035;
    }
    return Math.max(w, 1);
  }

  /* Paint a cover: coloured fallback (with the short name) or real art. */
  function paint(el, item, withMono) {
    el.style.setProperty('--h', item.hue);
    el.style.setProperty('--w', monoWidth(item.mono).toFixed(2));
    var has = !!item._img;
    el.classList.toggle('has-img', has);
    if (has) el.style.setProperty('--img', 'url("' + item._img + '")');
    else el.style.removeProperty('--img');
    if (withMono) el.innerHTML = '<span class="cover-mono">' + esc(item.mono) + '</span>';
  }

  function cardHTML(item) {
    return '' +
      '<li class="media-item"><button class="media-card" type="button" data-id="' + esc(item.id) + '" aria-haspopup="dialog">' +
        '<span class="art media-art"><span class="cover"></span></span>' +
        '<span class="media-name">' + esc(item.title) + (item.star ? STAR : '') + '</span>' +
        (item.sub ? '<span class="media-sub">' + esc(item.sub) + '</span>' : '') +
      '</button></li>';
  }

  function render(grid, list) {
    grid.innerHTML = list.map(cardHTML).join('');
    var cards = grid.querySelectorAll('.media-card');
    list.forEach(function (item, i) {
      item._card  = cards[i];
      item._cover = cards[i].querySelector('.cover');
      paint(item._cover, item, true);
    });
  }
  render(animeGrid, ANIME);
  render(gamesGrid, GAMES);

  /* Look for real art once the section is near the screen. */
  var active = null;

  function repaint(item) {
    paint(item._cover, item, true);
    if (active && active.item === item) {
      paint(posterCov, item, true);
      paint(sheetCover, item, false);
    }
  }

  function probeArt() {
    ANIME.concat(GAMES).forEach(function (item) {
      var url = ART_DIR + item.id + '.' + ART_EXT;
      var im = new Image();
      im.onload = function () { item._img = im.src; repaint(item); };   // im.src is absolute; a relative url() inside a CSS variable would resolve against styles.css
      im.src = url;
    });
  }

  var section = $('favourites');
  if (section && 'IntersectionObserver' in window) {
    var probeIO = new IntersectionObserver(function (entries, obs) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        obs.disconnect();
        probeArt();
      }
    }, { rootMargin: '600px 0px' });
    probeIO.observe(section);
  } else {
    probeArt();
  }

  /* ---------- the popup window ---------- */
  var EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
  var EASE_CLOSE = 'cubic-bezier(1, 0, 0.68, 0.28)';   // EASE mirrored, for playing back in reverse
  var DUR  = 560;
  var CLOSE_RATE = 1.25;

  var state  = 'closed';          // closed | opening | open | closing
  var anims  = [];
  var extras = [];
  var pushed = false;
  var openW = 0, openH = 0;
  var safety = 0;

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Fade the parts rather than the whole dialog: while an ancestor's opacity is
     animating, the browser stops blurring what's behind the glass. */
  function fade(from, to, ms) {
    return [sheetDim, sheetBg, scroller, closeBtn].map(function (el) {
      return el.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: 'ease-out', fill: 'both' });
    });
  }

  function lockScroll() {
    var sbw = window.innerWidth - root.clientWidth;
    root.style.setProperty('--sbw', sbw + 'px');
    root.classList.add('sheet-lock');
  }
  function unlockScroll() {
    root.classList.remove('sheet-lock');
    root.style.removeProperty('--sbw');
  }

  function fillSheet(item) {
    badgeEl.textContent = item.kind === 'anime' ? 'Anime' : 'Game';
    badgeEl.className = 'badge ' + (item.kind === 'anime' ? 'badge-anime' : 'badge-game');
    titleEl.innerHTML = esc(item.title) + (item.star ? STAR : '');
    subEl.textContent = item.sub || '';
    subEl.hidden = !item.sub;
    metaEl.textContent = item.meta || '';
    metaEl.hidden = !item.meta;
    bodyEl.innerHTML = item.summary.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    paint(posterCov, item, true);
    paint(sheetCover, item, false);
  }

  function openSheet(item, card) {
    if (state !== 'closed') return;
    active = { item: item, card: card || null };
    fillSheet(item);
    lockScroll();

    var art = card ? card.querySelector('.media-art') : null;
    var canMorph = !!(art && sheet.animate && !reduced());
    var from = null, cardR = 18;

    if (canMorph) {
      card.classList.add('is-open');          // freezes hover + hides the card's art
      from = art.getBoundingClientRect();
      cardR = parseFloat(getComputedStyle(art).borderTopLeftRadius) || 18;
    }

    sheet.showModal();
    scroller.scrollTop = 0;
    state = 'opening';
    openW = sheet.clientWidth;
    openH = sheet.clientHeight;

    if (!canMorph) {
      if (sheet.animate && !reduced()) {
        anims = fade(0, 1, 200);
        anims[0].onfinish = function () { if (state === 'opening') state = 'open'; };
      } else {
        state = 'open';
      }
      return;
    }

    var to = poster.getBoundingClientRect();
    var win = scroller.getBoundingClientRect();   // the window's resting box
    var winR = parseFloat(getComputedStyle(sheetBg).borderTopLeftRadius) || 28;
    var s  = from.width / to.width;
    var posterR = parseFloat(getComputedStyle(poster).borderTopLeftRadius) || 28;
    var o = { duration: DUR, easing: EASE, fill: 'both' };

    anims = [
      sheetBg.animate([
        { top: from.top + 'px', left: from.left + 'px', width: from.width + 'px', height: from.height + 'px', borderRadius: cardR + 'px' },
        { top: win.top + 'px', left: win.left + 'px', width: win.width + 'px', height: win.height + 'px', borderRadius: winR + 'px' }
      ], o),
      sheetCover.animate([
        { inset: '0px',   filter: 'blur(0px) saturate(1)' },
        { inset: '-90px', filter: 'blur(28px) saturate(1.25)' }
      ], o),
      sheetScrim.animate([{ opacity: 0 }, { opacity: 1 }], o),
      poster.animate([
        { transform: 'translate(' + (from.left - to.left) + 'px,' + (from.top - to.top) + 'px) scale(' + s + ')', borderRadius: (cardR / s) + 'px' },
        { transform: 'translate(0px,0px) scale(1)', borderRadius: posterR + 'px' }
      ], o),
      textEl.animate([
        { opacity: 0, transform: 'translateY(18px)' },
        { opacity: 1, transform: 'translateY(0px)' }
      ], { duration: 420, delay: 140, easing: EASE, fill: 'both' }),
      closeBtn.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: 200, easing: 'ease-out', fill: 'both' }),
      sheetDim.animate([{ opacity: 0 }, { opacity: 1 }], o)
    ];
    anims[0].onfinish = function () { if (state === 'opening') state = 'open'; };
  }

  function finishClose() {
    if (state === 'closed') return;
    clearTimeout(safety);
    var card = active && active.card;
    anims.concat(extras).forEach(function (a) { try { a.cancel(); } catch (e) { /* already gone */ } });
    anims = [];
    extras = [];
    state = 'closed';
    if (sheet.open) sheet.close();
    unlockScroll();
    if (card) {
      card.classList.remove('is-open');
      try { card.focus({ preventScroll: true }); } catch (e) { /* older browsers */ }
    }
    active = null;
  }

  function closeSheet() {
    if (state === 'closed' || state === 'closing') return;
    var prev = state;
    state = 'closing';

    if (!anims.length) { finishClose(); return; }
    if (scroller.scrollTop > 0) scroller.scrollTop = 0;

    // If the window changed size while open, the card has moved. Just fade.
    var moved = sheet.clientWidth !== openW || sheet.clientHeight !== openH;
    if (moved && anims.length > 1) {
      anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* noop */ } });
      anims = fade(1, 0, 180);
      anims[0].onfinish = finishClose;
      safety = setTimeout(finishClose, 500);
      return;
    }

    // The text and close button fade out fast on their own, so they never
    // hang around outside the shrinking card.
    if (anims.length > 5) {
      var quick = { duration: 130, easing: 'ease-out', fill: 'both' };
      var fades = [textEl, closeBtn].map(function (el) {
        var op = parseFloat(getComputedStyle(el).opacity);
        return el.animate([{ opacity: isNaN(op) ? 1 : op }, { opacity: 0 }], quick);
      });
      anims[4].cancel(); anims[5].cancel();
      anims = anims.slice(0, 4).concat(anims.slice(6));
      extras = fades;
    }

    // Fully open: swap in the mirrored curve so the close starts fast instead of
    // crawling (a plain reverse of an ease-out starts slowly). Mid-open we keep
    // the same curve so nothing jumps.
    if (prev === 'open' && anims.length > 3) {
      for (var i = 0; i < anims.length; i++) anims[i].effect.updateTiming({ easing: EASE_CLOSE });
    }

    // Play the open animation backwards from wherever it currently is.
    anims.forEach(function (a) { a.updatePlaybackRate(-CLOSE_RATE); a.play(); });
    anims[0].onfinish = finishClose;
    safety = setTimeout(finishClose, DUR / CLOSE_RATE + 400);
  }

  /* Close = go back one history step if we added one, so the phone's
     back button closes the sheet instead of leaving the site. */
  function requestClose() {
    if (state === 'closed' || state === 'closing') return;
    if (pushed) history.back();
    else closeSheet();
  }

  function pushHash(id) {
    try { history.pushState({ fav: id }, '', '#fav-' + id); pushed = true; }
    catch (e) { pushed = false; }
  }

  function clearHash() {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* noop */ }
  }

  /* ---------- events ---------- */
  function onGridClick(e) {
    var btn = e.target.closest ? e.target.closest('.media-card') : null;
    if (!btn) return;
    var item = byId[btn.getAttribute('data-id')];
    if (!item || state !== 'closed') return;
    pushHash(item.id);
    openSheet(item, btn);
  }
  animeGrid.addEventListener('click', onGridClick);
  gamesGrid.addEventListener('click', onGridClick);

  closeBtn.addEventListener('click', requestClose);
  sheetDim.addEventListener('click', requestClose);   // click outside the window

  sheet.addEventListener('cancel', function (e) {   // Escape key
    e.preventDefault();
    requestClose();
  });

  sheet.addEventListener('close', function () {     // closed some other way
    if (state !== 'closed') finishClose();
  });

  window.addEventListener('popstate', function () {
    var m = /^#fav-(.+)$/.exec(location.hash);
    if (state === 'opening' || state === 'open') {
      pushed = false;
      closeSheet();
    } else if (state === 'closed' && m && byId[m[1]]) {
      pushed = true;
      openSheet(byId[m[1]], byId[m[1]]._card);
    }
  });

  /* Opened from a shared link like /#fav-rdr2 */
  var hashMatch = /^#fav-(.+)$/.exec(location.hash);
  if (hashMatch && byId[hashMatch[1]]) {
    var start = byId[hashMatch[1]];
    var go = function () { openSheet(start, null); };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go);
  }

  // Once a deep-linked sheet is closed without history to go back to, tidy the URL.
  sheet.addEventListener('close', function () {
    if (!pushed && /^#fav-/.test(location.hash)) clearHash();
    pushed = false;
  });
})();
