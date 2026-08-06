/* =====================================================================
   ruytha — bio site v2
   ===================================================================== */

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------------------------------------------------------------
   Last.fm — fill these in and the "on repeat" card + background go
   live for every visitor (this runs client-side, so there's nothing
   to log into — anyone who opens the site sees your real data).

   Get a free key: https://www.last.fm/api/account/create
   (just needs an app name + email, callback URL can stay blank)
   --------------------------------------------------------------------- */
const LASTFM_API_KEY = "66b1d0ccfc8b9b0e51e14636dcd88fc7";
const LASTFM_USERNAME = "Ruytha";
const LASTFM_POLL_MS = 30000;

/* ---------------------------------------------------------------------
   Scroll reveal — cards and connect rows fade/slide in once they enter
   the viewport. One observer, reused for every ".reveal" element.
   --------------------------------------------------------------------- */
function initReveal() {
  const targets = document.querySelectorAll(".reveal");
  if (!targets.length) return;

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  targets.forEach((el) => io.observe(el));
}

/* ---------------------------------------------------------------------
   Draggable skill chips — grab, follow the pointer 1:1, ease back to
   rest on release. Simple critically-damped spring, no bounce.
   --------------------------------------------------------------------- */
function ease(from, to, { onUpdate, onDone, stiffness = 210, damping = 26 }) {
  if (prefersReducedMotion) {
    onUpdate(to);
    onDone && onDone();
    return { cancel() {} };
  }

  let value = from;
  let v = 0;
  let raf;
  let cancelled = false;

  function step() {
    if (cancelled) return;
    const dt = 1 / 60;
    const force = -stiffness * (value - to) - damping * v;
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

function initChips() {
  const row = document.getElementById("chipRow");
  if (!row) return;
  const chips = [...row.querySelectorAll(".chip")];

  chips.forEach((chip) => {
    let grabX = 0, grabY = 0;
    let activeX = null, activeY = null;

    chip.addEventListener("pointerdown", (e) => {
      chip.setPointerCapture(e.pointerId);
      chip.classList.add("is-dragging");
      activeX && activeX.cancel();
      activeY && activeY.cancel();
      const r = chip.getBoundingClientRect();
      grabX = e.clientX - r.left;
      grabY = e.clientY - r.top;
    });

    chip.addEventListener("pointermove", (e) => {
      if (!chip.classList.contains("is-dragging")) return;
      const parent = chip.parentElement.getBoundingClientRect();
      const localX = e.clientX - parent.left - grabX - chip.offsetLeft;
      const localY = e.clientY - parent.top - grabY - chip.offsetTop;
      chip.style.transform = `translate(${localX}px, ${localY}px)`;
    });

    function release() {
      if (!chip.classList.contains("is-dragging")) return;
      chip.classList.remove("is-dragging");
      const match = chip.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
      const curX = match ? parseFloat(match[1]) : 0;
      const curY = match ? parseFloat(match[2]) : 0;

      activeX = ease(curX, 0, {
        onUpdate: (v) => {
          const m = chip.style.transform.match(/translate\([-\d.]+px, ([-\d.]+)px\)/);
          chip.style.transform = `translate(${v}px, ${m ? m[1] : "0"}px)`;
        },
      });
      activeY = ease(curY, 0, {
        onUpdate: (v) => {
          const m = chip.style.transform.match(/translate\(([-\d.]+)px,/);
          chip.style.transform = `translate(${m ? m[1] : "0"}px, ${v}px)`;
        },
        onDone: () => { chip.style.transform = ""; },
      });
    }

    chip.addEventListener("pointerup", release);
    chip.addEventListener("pointercancel", release);
  });
}

/* ---------------------------------------------------------------------
   Cursor glow — soft light following the pointer, fine-pointer only.
   --------------------------------------------------------------------- */
function initCursorGlow() {
  const glow = document.getElementById("cursorGlow");
  if (!glow || prefersReducedMotion) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;

  let hideTimer;
  window.addEventListener("pointermove", (e) => {
    glow.style.setProperty("--mx", `${e.clientX}px`);
    glow.style.setProperty("--my", `${e.clientY}px`);
    glow.classList.add("is-active");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => glow.classList.remove("is-active"), 1400);
  });
}

/* ---------------------------------------------------------------------
   Last.fm now-playing — powers both the "on repeat" card and, while a
   track is actively scrobbling, brightens/quickens the background glow
   by toggling body.is-live (see CSS).
   --------------------------------------------------------------------- */
function initLastfm() {
  const card = document.getElementById("npCard");
  if (!card) return;

  const els = {
    art: document.getElementById("npArt"),
    status: document.getElementById("npStatus"),
    track: document.getElementById("npTrack"),
    artist: document.getElementById("npArtist"),
  };

  if (!LASTFM_API_KEY || !LASTFM_USERNAME) {
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

      card.classList.toggle("is-playing", isNowPlaying);
      document.body.classList.toggle("is-live", isNowPlaying);
      card.href = `https://www.last.fm/user/${encodeURIComponent(LASTFM_USERNAME)}`;
      card.target = "_blank";
      card.rel = "noopener";

      els.status.textContent = isNowPlaying
        ? "playing now"
        : track.date?.uts ? `played ${timeAgo(track.date.uts)}` : "last played";
      els.track.textContent = track.name || "—";
      els.artist.textContent = track.artist?.["#text"] || "";
      if (art) {
        els.art.style.backgroundImage = `url("${art}")`;
      }
    } catch (err) {
      card.classList.remove("is-playing");
      document.body.classList.remove("is-live");
      els.status.textContent = "last.fm unavailable";
      if (els.track.textContent === "—") els.track.textContent = "couldn't load right now";
    }
  }

  refresh();
  setInterval(refresh, LASTFM_POLL_MS);
}

/* ---------------------------------------------------------------------
   Easter egg — click the nav dot for a rotating status line.
   --------------------------------------------------------------------- */
function initEasterEgg() {
  const dot = document.getElementById("eggDot");
  const toast = document.getElementById("toast");
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

  let hideTimer, lastIndex = -1;
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

/* ---------------------------------------------------------------------
   Command palette — ⌘K / Ctrl+K quick nav, same items on every page.
   --------------------------------------------------------------------- */
const NAV_ITEMS = [
  { group: "Pages", label: "Home", href: "index.html" },
  { group: "Pages", label: "Connect", href: "connect.html" },
  { group: "Elsewhere", label: "Blog", href: "https://ruytha.blogspot.com" },
  { group: "Elsewhere", label: "Discord — profile", href: "https://discord.com/users/690508522395402260" },
  { group: "Elsewhere", label: "Discord — server", href: "https://discord.gg/m9veFRXxDF" },
  { group: "Elsewhere", label: "Spotify", href: "https://open.spotify.com/user/31wqsddt5oxby3p4ta7rx52mt6nu" },
  { group: "Elsewhere", label: "Spicy Lyrics", href: "https://spicylyrics.org/ruytha" },
];

function initCommandPalette() {
  const trigger = document.getElementById("cmdkBtn");
  const overlay = document.getElementById("cmdkOverlay");
  const input = document.getElementById("cmdkInput");
  const list = document.getElementById("cmdkList");
  if (!overlay || !input || !list) return;

  let filtered = NAV_ITEMS.slice();
  let activeIndex = 0;

  function render() {
    const q = input.value.trim().toLowerCase();
    filtered = NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(q));
    activeIndex = 0;

    if (!filtered.length) {
      list.innerHTML = `<div class="cmdk-empty">nothing here — try something else</div>`;
      return;
    }

    let html = "", lastGroup = null;
    filtered.forEach((item, i) => {
      if (item.group !== lastGroup) {
        html += `<div class="cmdk-group">${item.group}</div>`;
        lastGroup = item.group;
      }
      html += `<div class="cmdk-item${i === 0 ? " is-active" : ""}" data-index="${i}"><span>${item.label}</span><span class="arrow">↵</span></div>`;
    });
    list.innerHTML = html;
  }

  function setActive(i) {
    const items = list.querySelectorAll(".cmdk-item");
    if (!items.length) return;
    activeIndex = (i + items.length) % items.length;
    items.forEach((el) => el.classList.remove("is-active"));
    items[activeIndex].classList.add("is-active");
    items[activeIndex].scrollIntoView({ block: "nearest" });
  }

  function go(item) {
    if (!item) return;
    if (/^https?:\/\//.test(item.href)) window.open(item.href, "_blank", "noopener");
    else window.location.href = item.href;
    close();
  }

  function open() {
    overlay.classList.add("is-open");
    input.value = "";
    render();
    setTimeout(() => input.focus(), 10);
  }
  function close() { overlay.classList.remove("is-open"); }

  trigger && trigger.addEventListener("click", open);

  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      overlay.classList.contains("is-open") ? close() : open();
      return;
    }
    if (!overlay.classList.contains("is-open")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(activeIndex + 1); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive(activeIndex - 1); }
    if (e.key === "Enter") { e.preventDefault(); go(filtered[activeIndex]); }
  });

  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  list.addEventListener("click", (e) => {
    const row = e.target.closest(".cmdk-item");
    if (row) go(filtered[Number(row.dataset.index)]);
  });
  input.addEventListener("input", render);
}

document.addEventListener("DOMContentLoaded", () => {
  initReveal();
  initChips();
  initCursorGlow();
  initLastfm();
  initEasterEgg();
  initCommandPalette();
});
