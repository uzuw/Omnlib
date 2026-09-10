import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import RegisterSW from "@/components/RegisterSW";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", style: ["normal", "italic"] });
const mono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-mono" });
const body = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: { default: "Omnlib", template: "%s · Omnlib" },
  description: "Omnlib — one library for every story: anime, manga, light novels, webseries, movies and books.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${body.variable}`}>
      <body className="grain glow-ember min-h-screen flex flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-20 pt-6 sm:pt-8">{children}</main>
        <footer className="border-t" style={{ borderColor: "var(--line)" }}>
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5">
            <span className="font-display text-sm italic">Omn<span style={{ color: "var(--ember)" }}>lib</span></span>
            <span className="font-mono2 text-[10px] tracking-widest text-[var(--ink-faint)]">ANIME · MANGA · LIGHT NOVELS · SERIES · MOVIES · BOOKS</span>
          </div>
        </footer>
        <RegisterSW />
      </body>
    </html>
  );
}