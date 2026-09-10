"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SyncButton from "./SyncButton";

const LINKS = [
  { href: "/", label: "Discover" },
  { href: "/library", label: "Library" },
  { href: "/timeline", label: "Timeline" },
  { href: "/schedule", label: "Schedule" },
  { href: "/collections", label: "Collections" },
  { href: "/import", label: "Import" },
  { href: "/stats", label: "Stats" },
];

export default function Nav() {
  const path = usePathname();
  // active state is applied only after mount so server HTML is deterministic
  // (avoids usePathname hydration mismatches on statically-rendered shared layouts)
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    setActive(path);
  }, [path]);
  const isActive = (href: string) =>
    active != null && (href === "/" ? active === "/" : active.startsWith(href));
  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{ borderColor: "var(--line)", background: "rgba(10,12,17,0.78)", backdropFilter: "blur(18px)" }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
        <Link href="/" className="group flex shrink-0 items-baseline gap-1.5" aria-label="Omnlib home">
          <span className="font-display text-[22px] italic leading-none transition-colors" style={{ color: "var(--ember)" }}>Omn</span>
          <span className="font-display text-[22px] font-semibold leading-none">lib</span>
          <span className="font-mono2 ml-1 hidden text-[9px] tracking-[0.28em] text-[var(--ink-faint)] transition-colors group-hover:text-[var(--ink-dim)] lg:inline">
            A LIBRARY OF EVERY STORY
          </span>
        </Link>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-0.5">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="navlink"
              data-on={isActive(l.href)}
              aria-current={isActive(l.href) ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}
          <span className="mx-1.5 hidden h-5 w-px bg-[var(--line)] sm:block" />
          <SyncButton compact />
        </nav>
      </div>
    </header>
  );
}