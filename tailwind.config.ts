import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0B0A14",
        surface: "#14121F",
        ink: "#F5F3FF",
        "ink-dim": "rgba(245,243,255,0.62)",
        "ink-faint": "rgba(245,243,255,0.38)",
        violet: "#7C5CFF",
        magenta: "#FF5CAD",
        amber: "#FFB25C",
        teal: "#4CE0D2",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
export default config;
