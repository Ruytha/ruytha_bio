"use client";

import Link from "next/link";
import { motion } from "motion/react";

export default function BottomButtons() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:bottom-6">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.6, delay: 0.4 }}
        className="material pointer-events-auto flex items-center gap-1.5 rounded-full p-1.5 shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
      >
        <Link href="/cloud" className="group">
          <motion.span
            whileTap={{ scale: 0.94 }}
            whileHover={{ scale: 1.03 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-violet to-magenta px-4 py-2 text-sm font-medium text-white"
          >
            <CloudIcon />
            RuythaCloud
          </motion.span>
        </Link>

        <motion.a
          href="/minecraft.html"
          target="_blank"
          rel="noopener noreferrer"
          whileTap={{ scale: 0.94 }}
          whileHover={{ scale: 1.03 }}
          transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          className="flex items-center gap-2 rounded-full bg-white/8 px-4 py-2 text-sm font-medium text-ink hover:bg-white/12"
        >
          <BlockIcon />
          Minecraft
        </motion.a>
      </motion.div>
    </div>
  );
}

function CloudIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 18a4.5 4.5 0 0 1-.4-8.98A5.5 5.5 0 0 1 17.2 8.1 4 4 0 0 1 17 16H7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M4 7.5 12 12m0 0 8-4.5M12 12v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}
