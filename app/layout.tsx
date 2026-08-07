import type { Metadata } from "next";
import { Space_Grotesk, Manrope, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import NavBar from "@/components/NavBar";
import BottomButtons from "@/components/BottomButtons";
import EasterEggs from "@/components/EasterEggs";
import LyricsBackground from "@/components/LyricsBackground";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
  display: "swap",
});
const body = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ruytha",
  description: "Blender, film, music, and questionable life choices — from Australia.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
    >
      <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <body className="text-body min-h-screen">
          <LyricsBackground />
          <div className="relative z-10 flex min-h-screen flex-col">
            <NavBar />
            <main className="flex-1">{children}</main>
          </div>
          <BottomButtons />
          <EasterEggs />
        </body>
      </html>
    </ClerkProvider>
  );
}
