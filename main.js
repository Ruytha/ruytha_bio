
/* ===========================================================
   Last.fm — fill these two in and the hero's "on repeat" card
   goes live. Get a free API key at:
   https://www.last.fm/api/account/create (only "Contact email"
   and "Application name" are required, callback URL can stay
   blank). This is a read-only key so it's fine to ship in
   client-side JS — that's how last.fm's own widgets do it.
   =========================================================== */
const LASTFM_API_KEY = "4ef09d994a1080380a4ddbe96e678414";   // e.g. "a1b2c3d4e5f6..."
const LASTFM_USERNAME = "Ruytha";  // your last.fm username
const LASTFM_POLL_MS = 300; // how often to refresh, in ms

/* ===========================================================
   Tiny spring engine — critically damped by default (damping 1.0),
   only bounces (damping ~0.8) on interactions that carried
   momentum (the facet drag release). See design rules §4.
   =========================================================== */
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function spring(from, to, { damping = 1, response = 0.35, velocity = 0, onUpdate, onDone }) {
  if (reduceMotion) {
    onUpdate(to);
    onDone && onDone();
    return { cancel() {} };
  }

  const stiffness = (2 * Math.PI / response) ** 2;
  const dampingCoef = 2 * damping * Math.sqrt(stiffness);

  let value = from;
  let v = velocity;
  let raf;
  let cancelled = false;

  function step() {
    if (cancelled) return;
    const dt = 1 / 60;
    const force = -stiffness * (value - to) - dampingCoef * v;
    v += force * dt;
    value += v * dt;
    onUpdate(value);

    if (Math.abs(value - to) < 0.01 && Math.abs(v) < 0.01) {
      onUpdate(to);
      onDone && onDone();
      return;
    }
    raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);

  return { cancel() { cancelled = true; cancelAnimationFrame(raf); } };
}

/* Rubber-band resistance — the further past a boundary, the less
   the element follows. See design rules §9. */
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/* ===========================================================
   Nav indicator — springs to whatever link is hovered/focused,
   returns to the active page link on pointer-leave.
   =========================================================== */
function initNavIndicator() {
  const nav = document.querySelector("nav.links");
  const indicator = document.querySelector(".nav-indicator");
  if (!nav || !indicator) return;

  const links = [...nav.querySelectorAll("a")];
  let activeSprings = { x: null, w: null };

  function rectFor(el) {
    return { x: el.offsetLeft, w: el.offsetWidth };
  }

  function moveTo(el, instant = false) {
    const { x, w } = rectFor(el);
    if (instant || reduceMotion) {
      indicator.style.transform = `translateX(${x}px)`;
      indicator.style.width = `${w}px`;
      indicator.style.opacity = 1;
      return;
    }
    activeSprings.x && activeSprings.x.cancel();
    activeSprings.w && activeSprings.w.cancel();
    indicator.style.opacity = 1;
    const currentX = indicator.getBoundingClientRect().left - nav.getBoundingClientRect().left;
    const currentW = indicator.getBoundingClientRect().width;
    activeSprings.x = spring(currentX, x, {
      damping: 1, response: 0.32,
      onUpdate: (v) => (indicator.style.transform = `translateX(${v}px)`),
    });
    activeSprings.w = spring(currentW, w, {
      damping: 1, response: 0.32,
      onUpdate: (v) => (indicator.style.width = `${v}px`),
    });
  }

  const current = nav.querySelector('a[aria-current="page"]') || links[0];
  requestAnimationFrame(() => current && moveTo(current, true));

  links.forEach((link) => {
    link.addEventListener("pointerenter", () => moveTo(link));
    link.addEventListener("focus", () => moveTo(link));
  });
  nav.addEventListener("pointerleave", () => {
    const cur = nav.querySelector('a[aria-current="page"]');
    if (cur) moveTo(cur);
  });
}

/* ===========================================================
   Facet stack — grab, drag 1:1 with the pointer (respecting the
   grab offset), rubber-band once you pull past the stack's own
   bounds, release with velocity, spring back. §2, §3, §5, §9
   =========================================================== */
function initFacetStack() {
  const stack = document.querySelector(".facet-stack");
  if (!stack) return;
  const facets = [...stack.querySelectorAll(".facet")];
  const REACH = 90; // px a chip can rubber-band beyond the stack edge

  facets.forEach((el) => {
    let grabX = 0, grabY = 0;
    let history = [];
    let activeX = null, activeY = null;
    let bounds;

    el.addEventListener("pointerdown", (e) => {
      el.setPointerCapture(e.pointerId);
      el.classList.add("dragging");
      activeX && activeX.cancel();
      activeY && activeY.cancel();

      const r = el.getBoundingClientRect();
      bounds = stack.getBoundingClientRect();
      grabX = e.clientX - r.left;
      grabY = e.clientY - r.top;
      history = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    });

    el.addEventListener("pointermove", (e) => {
      if (!el.classList.contains("dragging")) return;
      const parentRect = el.parentElement.getBoundingClientRect();
      let localX = e.clientX - parentRect.left - grabX - el.offsetLeft;
      let localY = e.clientY - parentRect.top - grabY - el.offsetTop;

      // rubber-band once the chip is dragged past the stack's own box
      const overX = Math.max(0, (el.offsetLeft + localX) - bounds.width) ||
                    Math.min(0, el.offsetLeft + localX);
      const overY = Math.max(0, (el.offsetTop + localY) - bounds.height) ||
                    Math.min(0, el.offsetTop + localY);
      if (Math.abs(overX) > 4) localX = localX - overX + rubberband(overX, REACH);
      if (Math.abs(overY) > 4) localY = localY - overY + rubberband(overY, REACH);

      el.style.transform = `translate(${localX}px, ${localY}px)`;

      history.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (history.length > 5) history.shift();
    });

    function release() {
      if (!el.classList.contains("dragging")) return;
      el.classList.remove("dragging");

      let vx = 0, vy = 0;
      if (history.length >= 2) {
        const a = history[0], b = history[history.length - 1];
        const dt = Math.max(b.t - a.t, 1);
        vx = ((b.x - a.x) / dt) * 1000;
        vy = ((b.y - a.y) / dt) * 1000;
      }

      const match = el.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
      const curX = match ? parseFloat(match[1]) : 0;
      const curY = match ? parseFloat(match[2]) : 0;

      // momentum carried the gesture -> allowed a little bounce (damping ~0.8)
      activeX = spring(curX, 0, {
        damping: 0.8, response: 0.4, velocity: vx,
        onUpdate: (v) => {
          const m2 = el.style.transform.match(/translate\([-\d.]+px, ([-\d.]+)px\)/);
          el.style.transform = `translate(${v}px, ${m2 ? m2[1] : "0"}px)`;
        },
      });
      activeY = spring(curY, 0, {
        damping: 0.8, response: 0.4, velocity: vy,
        onUpdate: (v) => {
          const m2 = el.style.transform.match(/translate\(([-\d.]+)px,/);
          el.style.transform = `translate(${m2 ? m2[1] : "0"}px, ${v}px)`;
        },
        onDone: () => { el.style.transform = ""; },
      });
    }

    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
  });
}

/* ===========================================================
   Glass card materialize-in — animate blur + scale together on
   enter, so it reads as a real surface arriving. §12
   =========================================================== */
function initMaterialize() {
  const glass = document.querySelector(".glass");
  if (!glass || reduceMotion) return;
  glass.style.opacity = "0";
  glass.style.transform = "scale(0.96)";
  glass.style.filter = "blur(6px)";
  requestAnimationFrame(() => {
    spring(0.96, 1, {
      damping: 1, response: 0.5,
      onUpdate: (v) => { glass.style.transform = `scale(${v})`; },
    });
    spring(6, 0, {
      damping: 1, response: 0.5,
      onUpdate: (v) => { glass.style.filter = `blur(${v}px)`; },
    });
    spring(0, 1, {
      damping: 1, response: 0.45,
      onUpdate: (v) => { glass.style.opacity = v; },
    });
  });
}

/* ===========================================================
   Last.fm now-playing widget — polls user.getrecenttracks and
   shows the live track if one's actively scrobbling, otherwise
   the most recent one. Fails quietly (never throws in the UI).
   =========================================================== */
function initLastfm() {
  const card = document.getElementById("lastfm-widget");
  if (!card) return;

  const els = {
    art: document.getElementById("lastfm-art"),
    status: document.getElementById("lastfm-status"),
    track: document.getElementById("lastfm-track"),
    artist: document.getElementById("lastfm-artist"),
  };

  if (!LASTFM_API_KEY || !LASTFM_USERNAME) {
    card.classList.remove("is-loading");
    els.status.textContent = "last.fm not connected";
    els.track.textContent = "add an API key + username in main.js";
    els.artist.textContent = "";
    card.href = "https://www.last.fm/api/account/create";
    card.target = "_blank";
    card.rel = "noopener";
    return;
  }

  function timeAgo(unixSeconds) {
    const diff = Math.max(0, Date.now() / 1000 - unixSeconds);
    const mins = Math.round(diff / 60);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }

  async function refresh() {
    try {
      const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(LASTFM_USERNAME)}&api_key=${encodeURIComponent(LASTFM_API_KEY)}&format=json&limit=1`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`lastfm ${res.status}`);
      const data = await res.json();
      const track = data?.recenttracks?.track?.[0];
      if (!track) throw new Error("no recent tracks");

      const isNowPlaying = track["@attr"]?.nowplaying === "true";
      const art = track.image?.slice(-1)?.[0]?.["#text"];

      card.classList.remove("is-loading");
      card.classList.toggle("is-playing", isNowPlaying);
      card.href = `https://www.last.fm/user/${encodeURIComponent(LASTFM_USERNAME)}`;
      card.target = "_blank";
      card.rel = "noopener";

      els.status.textContent = isNowPlaying
        ? "playing now"
        : track.date?.uts
          ? `played ${timeAgo(track.date.uts)}`
          : "last played";
      els.track.textContent = track.name || "—";
      els.artist.textContent = track.artist?.["#text"] || "";
      if (art) els.art.style.backgroundImage = `url("${art}")`;
      els.art.style.backgroundSize = "cover";
      els.art.style.backgroundPosition = "center";
    } catch (err) {
      card.classList.remove("is-loading", "is-playing");
      els.status.textContent = "last.fm unavailable";
      if (els.track.textContent === "—") els.track.textContent = "couldn't load right now";
    }
  }

  refresh();
  setInterval(refresh, LASTFM_POLL_MS);
}

/* ===========================================================
   Cursor spotlight — a soft glow that follows the pointer, only
   on devices that actually have one (see the touch-media guard
   in CSS). Fades out after the pointer's been idle a moment.
   =========================================================== */
function initSpotlight() {
  const spot = document.getElementById("spotlight");
  if (!spot || reduceMotion) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;

  let hideTimer;
  window.addEventListener("pointermove", (e) => {
    spot.style.setProperty("--mx", `${e.clientX}px`);
    spot.style.setProperty("--my", `${e.clientY}px`);
    spot.classList.add("is-active");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => spot.classList.remove("is-active"), 1400);
  });
}

/* ===========================================================
   Wordmark dot easter egg — tap it, get a rotating fun status
   line in a little toast. Purely decorative. §"fun stuff"
   =========================================================== */
function initEasterEgg() {
  const dot = document.getElementById("egg-dot");
  const toast = document.getElementById("egg-toast");
  if (!dot || !toast) return;

  const lines = [
    "status: probably in Blender",
    "status: mocap suit charging",
    "status: three tabs of anime, zero tabs of code",
    "status: definitely not a femboy",
    "status: learning kanji, forgetting hiragana",
    "status: VCap Motion is coming. eventually.",
    "status: idiot mode: engaged",
    "you found the dot. congrats.",
  ];

  let hideTimer;
  let lastIndex = -1;

  dot.addEventListener("click", () => {
    let i = Math.floor(Math.random() * lines.length);
    if (i === lastIndex) i = (i + 1) % lines.length;
    lastIndex = i;

    toast.textContent = lines[i];
    toast.classList.add("is-visible");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initNavIndicator();
  initFacetStack();
  initMaterialize();
  initLastfm();
  initSpotlight();
  initEasterEgg();
});
