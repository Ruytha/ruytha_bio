"use client";

import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion } from "motion/react";

const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];

type Egg = { title: string; body: string } | null;

export default function EasterEggs() {
  const [egg, setEgg] = useState<Egg>(null);
  const [buffer, setBuffer] = useState<string[]>([]);
  const [typed, setTyped] = useState("");

  const fire = useCallback((title: string, body: string) => {
    setEgg({ title, body });
    window.clearTimeout((fire as any)._t);
    (fire as any)._t = window.setTimeout(() => setEgg(null), 5200);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Konami code
      setBuffer((prev) => {
        const next = [...prev, e.key].slice(-KONAMI.length);
        if (next.join(",") === KONAMI.join(",")) {
          fire("developer mode: on", "CEO at markdown, unlocked. the blobs missed you.");
        }
        return next;
      });

      // Typed word watcher (letters only, no modifier keys)
      if (e.key.length === 1 && /[a-z]/i.test(e.key)) {
        setTyped((prev) => {
          const next = (prev + e.key.toLowerCase()).slice(-12);
          if (next.includes("femboy")) {
            fire("for the record", "NOT a femboy. it's in the about page. read it properly next time.");
            return "";
          }
          if (next.includes("idot")) {
            fire("confirmed", "yes, an idot. it's self-reported and it's canon.");
            return "";
          }
          return next;
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fire]);

  return (
    <AnimatePresence>
      {egg && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.9, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 16, scale: 0.94, filter: "blur(4px)" }}
          transition={{ type: "spring", bounce: 0.3, duration: 0.5 }}
          className="material fixed left-1/2 top-6 z-[60] w-[min(90vw,360px)] -translate-x-1/2 rounded-2xl px-5 py-4 text-center shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
          role="status"
        >
          <p className="text-caption text-[10px] uppercase tracking-widest text-teal">easter egg</p>
          <p className="text-heading mt-1 text-base font-semibold text-ink">{egg.title}</p>
          <p className="text-body mt-1 text-sm text-ink-dim">{egg.body}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
