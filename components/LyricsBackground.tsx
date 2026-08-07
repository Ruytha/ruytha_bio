"use client";

import { useEffect, useState } from "react";

/**
 * Three huge, slowly-drifting blurred color fields — the same trick the
 * Apple Music lyrics view uses (blurred, oversaturated color derived from
 * album art, in continuous slow motion behind the text). We don't have
 * album art to sample, so instead we gently rotate the hue based on
 * whatever's currently playing on Last.fm, so the page's mood shifts with
 * the music without anything jarring. Falls back to a fixed palette.
 */

const PALETTE = [
  { h: 255, s: 90, l: 62 }, // violet
  { h: 328, s: 95, l: 66 }, // magenta
  { h: 32, s: 95, l: 66 }, // amber
  { h: 174, s: 70, l: 55 }, // teal
];

function hashString(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export default function LyricsBackground() {
  const [shift, setShift] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function pull() {
      try {
        const res = await fetch("/api/lastfm", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const key = data?.track ? `${data.track.artist}-${data.track.name}` : null;
        if (!cancelled && key) setShift(hashString(key) % 360);
      } catch {
        // silently keep the current palette — this is ambient decoration, not critical data
      }
    }

    pull();
    const id = setInterval(pull, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const colors = PALETTE.map((c) => ({
    ...c,
    h: (c.h + shift * 0.35) % 360,
  }));

  return (
    <div className="lyrics-bg" aria-hidden="true">
      <div
        className="blob blob-a"
        style={{
          width: "70vmax",
          height: "70vmax",
          left: "-15%",
          top: "-10%",
          background: `hsl(${colors[0].h} ${colors[0].s}% ${colors[0].l}%)`,
          transition: "background 3s ease",
        }}
      />
      <div
        className="blob blob-b"
        style={{
          width: "60vmax",
          height: "60vmax",
          right: "-15%",
          top: "10%",
          background: `hsl(${colors[1].h} ${colors[1].s}% ${colors[1].l}%)`,
          transition: "background 3s ease",
        }}
      />
      <div
        className="blob blob-c"
        style={{
          width: "55vmax",
          height: "55vmax",
          left: "20%",
          bottom: "-20%",
          background: `hsl(${colors[2].h} ${colors[2].s}% ${colors[2].l}%)`,
          transition: "background 3s ease",
        }}
      />
      <div
        className="blob"
        style={{
          width: "40vmax",
          height: "40vmax",
          right: "10%",
          bottom: "-10%",
          opacity: 0.35,
          background: `hsl(${colors[3].h} ${colors[3].s}% ${colors[3].l}%)`,
          transition: "background 3s ease",
        }}
      />
      {/* Darken toward the edges so text stays legible everywhere */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, transparent 0%, rgba(11,10,20,0.55) 75%, rgba(11,10,20,0.85) 100%)",
        }}
      />
    </div>
  );
}
