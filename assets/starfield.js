/* ============================================================
   Ruytha — starry night background that reacts to the mouse
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('stars');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* star colours as [hue, saturation, lightness]: mostly white and ice blue,
     with some violet, cyan and the odd warm gold one */
  var COLOURS = [
    [0, 0, 100], [0, 0, 100], [0, 0, 100],
    [215, 100, 88], [228, 95, 84], [262, 85, 86],
    [195, 95, 82], [45, 90, 82]
  ];
  var REACH = 170;  // how far the cursor reaches into the stars, in px
  var TAU = Math.PI * 2;

  var W = 0, H = 0;
  var stars = [], sparks = [], meteors = [];
  var mouse = { x: 0, y: 0, sx: 0, sy: 0, on: false };
  var tilt = { x: 0, y: 0 };
  var nextMeteor = 2500;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(list) { return list[(Math.random() * list.length) | 0]; }
  function colour(c) { return 'hsla(' + c[0] + ',' + c[1] + '%,' + c[2] + '%,'; }

  function size() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seed() {
    var n = Math.min(750, Math.round(W * H / 1700));
    stars = [];
    for (var i = 0; i < n; i++) {
      var z = Math.pow(Math.random(), 1.8) * 0.9 + 0.1;  // depth: most stars are far away
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: z,
        r: 0.35 + z * 1.5,
        col: colour(pick(COLOURS)),
        tw: rand(0.6, 2.2),
        ph: Math.random() * TAU,
        dx: 0, dy: 0
      });
    }
  }

  function burst(x, y) {
    for (var i = 0; i < 26; i++) {
      var a = Math.random() * TAU, v = rand(1.2, 4.4);
      sparks.push({
        x: x, y: y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 1, r: rand(0.8, 2.2),
        col: colour(pick(COLOURS))
      });
    }
  }

  function launchMeteor() {
    var a = rand(2.6, 2.85);  // heading down and to the left
    var v = rand(9, 14);
    meteors.push({
      x: rand(W * 0.3, W * 1.1), y: rand(-40, H * 0.35),
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      life: 1, fade: rand(0.012, 0.02),
      hue: pick([200, 220, 250, 270])
    });
  }

  function draw(t) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);

    mouse.sx += (mouse.x - mouse.sx) * 0.14;
    mouse.sy += (mouse.y - mouse.sy) * 0.14;
    tilt.x += ((mouse.on ? mouse.x / W - 0.5 : 0) - tilt.x) * 0.04;
    tilt.y += ((mouse.on ? mouse.y / H - 0.5 : 0) - tilt.y) * 0.04;

    var mx = mouse.sx, my = mouse.sy;
    var scroll = window.scrollY || 0;

    // a soft glow under the cursor that slowly cycles colour
    if (mouse.on) {
      var hue = 235 + 35 * Math.sin(t / 2600);  // drifts between cyan-blue and violet
      var g = ctx.createRadialGradient(mx, my, 0, mx, my, 280);
      g.addColorStop(0, 'hsla(' + hue + ',95%,62%,0.16)');
      g.addColorStop(1, 'hsla(' + hue + ',95%,62%,0)');
      ctx.fillStyle = g;
      ctx.fillRect(mx - 280, my - 280, 560, 560);
    }

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 0.6;

    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];

      // parallax: near stars drift more with the mouse and the scroll
      var px = s.x - tilt.x * 70 * s.z;
      var py = s.y - tilt.y * 70 * s.z - scroll * 0.08 * s.z;
      px = ((px % W) + W) % W;
      py = ((py % H) + H) % H;

      // stars near the cursor get nudged away and light up
      var near = 0, pushX = 0, pushY = 0;
      if (mouse.on) {
        var ex = px - mx, ey = py - my, d2 = ex * ex + ey * ey;
        if (d2 < REACH * REACH) {
          var d = Math.sqrt(d2) || 1;
          near = 1 - d / REACH;
          var push = near * near * 26 * (0.4 + s.z);
          pushX = ex / d * push;
          pushY = ey / d * push;
        }
      }
      s.dx += (pushX - s.dx) * 0.1;
      s.dy += (pushY - s.dy) * 0.1;
      px += s.dx;
      py += s.dy;

      var a = (0.3 + 0.7 * s.z) * (0.55 + 0.45 * Math.sin(t * 0.001 * s.tw + s.ph));
      a = Math.min(1, a + near * 0.9);
      var r = s.r * (1 + near * 1.3);

      ctx.fillStyle = s.col + a + ')';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, TAU);
      ctx.fill();

      if (s.r > 1.25 || near > 0.25) {
        ctx.fillStyle = s.col + (a * 0.13) + ')';
        ctx.beginPath();
        ctx.arc(px, py, r * 4, 0, TAU);
        ctx.fill();
      }

      // constellation lines from the cursor to the stars it's touching
      if (near > 0.08) {
        ctx.strokeStyle = s.col + (near * 0.45) + ')';
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
    }

    // shooting stars
    if (t > nextMeteor) {
      launchMeteor();
      nextMeteor = t + rand(3500, 8000);
    }
    for (var m = meteors.length - 1; m >= 0; m--) {
      var mt = meteors[m];
      mt.x += mt.vx;
      mt.y += mt.vy;
      mt.life -= mt.fade;
      if (mt.life <= 0) { meteors.splice(m, 1); continue; }
      var tx = mt.x - mt.vx * 14, ty = mt.y - mt.vy * 14;
      var lg = ctx.createLinearGradient(mt.x, mt.y, tx, ty);
      lg.addColorStop(0, 'hsla(' + mt.hue + ',100%,92%,' + mt.life + ')');
      lg.addColorStop(1, 'hsla(' + mt.hue + ',100%,70%,0)');
      ctx.strokeStyle = lg;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(mt.x, mt.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    // click sparkles
    for (var k = sparks.length - 1; k >= 0; k--) {
      var p = sparks[k];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy = p.vy * 0.96 + 0.04;
      p.life -= 0.018;
      if (p.life <= 0) { sparks.splice(k, 1); continue; }
      ctx.fillStyle = p.col + p.life + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.5 + p.life), 0, TAU);
      ctx.fill();
    }
  }

  function loop(t) {
    draw(t);
    requestAnimationFrame(loop);
  }

  size();
  seed();

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var oldW = W, oldH = H;
      size();
      // phones resize a little as the address bar hides; only reshuffle on real changes
      if (W !== oldW || Math.abs(H - oldH) > 150) seed();
      if (reduced) draw(0);
    }, 150);
  });

  if (reduced) {
    draw(0);
    return;
  }

  window.addEventListener('pointermove', function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    if (!mouse.on) { mouse.sx = mouse.x; mouse.sy = mouse.y; }
    mouse.on = true;
  }, { passive: true });

  window.addEventListener('pointerdown', function (e) {
    burst(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('pointerup', function (e) {
    if (e.pointerType === 'touch') mouse.on = false;
  }, { passive: true });

  document.documentElement.addEventListener('mouseleave', function () {
    mouse.on = false;
  });

  requestAnimationFrame(loop);
})();
