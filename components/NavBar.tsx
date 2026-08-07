"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/contact", label: "Contact" },
];

export default function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40">
      <div className="material scroll-edge mx-auto flex max-w-5xl items-center justify-between px-5 py-3 sm:px-8">
        <Link
          href="/"
          className="text-heading text-lg font-bold tracking-tight text-ink transition-colors hover:text-violet"
          onClick={() => setOpen(false)}
        >
          ruytha<span className="text-violet">.</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 sm:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link key={link.href} href={link.href} className="relative px-4 py-2 text-sm text-ink-dim transition-colors hover:text-ink">
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-full bg-white/8"
                    transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                  />
                )}
                <span className={`relative ${active ? "text-ink" : ""}`}>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Mobile toggle */}
        <button
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink sm:hidden"
        >
          <motion.span
            animate={{ rotate: open ? 45 : 0, y: open ? 6 : 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="absolute h-[1.5px] w-5 bg-current"
          />
          <motion.span
            animate={{ opacity: open ? 0 : 1 }}
            transition={{ duration: 0.15 }}
            className="absolute h-[1.5px] w-5 bg-current"
          />
          <motion.span
            animate={{ rotate: open ? -45 : 0, y: open ? -6 : 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="absolute h-[1.5px] w-5 bg-current"
          />
        </button>
      </div>

      {/* Mobile menu — spring in from the top, same path it leaves by (rule 7) */}
      <motion.nav
        initial={false}
        animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
        transition={{ type: "spring", bounce: 0, duration: 0.35 }}
        className="material overflow-hidden sm:hidden"
        style={{ transformOrigin: "top" }}
      >
        <div className="flex flex-col gap-1 px-5 py-3">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-2 text-sm ${pathname === link.href ? "bg-white/8 text-ink" : "text-ink-dim"}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </motion.nav>
    </header>
  );
}
