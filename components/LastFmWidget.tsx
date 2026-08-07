"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";

type Track = {
  name: string;
  artist: string;
  album: string;
  url: string;
  image: string | null;
  nowPlaying: boolean;
  playedAt: number | null;
};

function timeAgo(ms: number | null) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function LastFmWidget() {
  const [current, setCurrent] = useState<Track | null>(null);
  const [recent, setRecent] = useState<Track[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const res = await fetch("/api/lastfm", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.error) {
          setStatus("error");
          return;
        }
        setCurrent(data.track);
        setRecent(data.recent ?? []);
        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }
    pull();
    const id = setInterval(pull, 20_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="material rounded-3xl p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <p className="text-caption text-xs uppercase tracking-widest text-ink-faint">last.fm</p>
        {status === "ok" && (
          <span className="flex items-center gap-1.5 text-xs text-ink-faint">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inline-flex h-full w-full rounded-full ${current ? "animate-ping bg-teal" : "bg-ink-faint"} opacity-60`}
              />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${current ? "bg-teal" : "bg-ink-faint"}`} />
            </span>
            {current ? "listening now" : "offline"}
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {status === "loading" && (
          <motion.div key="loading" exit={{ opacity: 0 }} className="mt-4 h-16 animate-pulse rounded-xl bg-white/5" />
        )}

        {status === "error" && (
          <motion.p key="error" className="mt-4 text-sm text-ink-faint">
            couldn't reach Last.fm right now — probably rate limited, try again in a bit.
          </motion.p>
        )}

        {status === "ok" && (current || recent.length > 0) && (
          <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
            {current && <NowPlayingRow track={current} />}
            <ul className="mt-3 flex flex-col gap-1">
              {recent.map((t, i) => (
                <TrackRow key={`${t.url}-${i}`} track={t} />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NowPlayingRow({ track }: { track: Track }) {
  return (
    <a
      href={track.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-xl bg-white/5 p-2.5 transition-colors hover:bg-white/8"
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white/10">
        {track.image && <Image src={track.image} alt="" fill sizes="48px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{track.name}</p>
        <p className="truncate text-xs text-ink-dim">{track.artist}</p>
      </div>
      <Equalizer />
    </a>
  );
}

function TrackRow({ track }: { track: Track }) {
  return (
    <li>
      <a
        href={track.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-white/5"
      >
        <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-white/8">
          {track.image && <Image src={track.image} alt="" fill sizes="36px" className="object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink-dim">
            {track.name} <span className="text-ink-faint">· {track.artist}</span>
          </p>
        </div>
        <span className="shrink-0 text-caption text-[11px] text-ink-faint">{timeAgo(track.playedAt)}</span>
      </a>
    </li>
  );
}

function Equalizer() {
  const bars = [0, 1, 2];
  return (
    <div className="flex items-end gap-[3px]" aria-hidden="true">
      {bars.map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-teal"
          animate={{ height: [4, 14, 6, 12, 4] }}
          transition={{ duration: 1.1 + i * 0.15, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
