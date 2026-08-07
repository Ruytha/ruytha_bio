"use client";

import { motion, useReducedMotion } from "motion/react";

export default function RevealSection({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ type: "spring", bounce: 0, duration: 0.5 }}
    >
      {children}
    </motion.div>
  );
}
