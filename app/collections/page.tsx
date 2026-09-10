"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Collection = { id: number; title: string; coverUrl: string | null; sampleTitle: string | null; memberCount: number };

export default function CollectionsPage() {
  const [cols, setCols] = useState<Collection[]>([]);
  useEffect(() => {
    fetch("/api/collections")
      .then((r) => r.json())
      .then((j) => setCols(j.collections ?? []));
  }, []);
  return (
    <div className="space-y-8">
      <header>
        <h1 className="h1-display text-4xl">Collections</h1>
        <p className="eyebrow mt-2">FRANCHISES · TRILOGIES · SERIES</p>
      </header>
      {cols.length === 0 && <p className="pt-10 text-center text-[var(--ink-dim)]">No collections yet — movie pages link to their franchise once saved.</p>}
      <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {cols.map((c) => (
          <Link key={c.id} href={`/collections/${c.id}`} className="card overflow-hidden p-3 transition-transform hover:-translate-y-1">
            <div className="cover-wrap mb-2.5 aspect-[21/12]">
              {c.coverUrl ? <img src={c.coverUrl} alt={c.title} loading="lazy" /> : <div className="cover-fallback text-xl">{c.title[0]}</div>}
            </div>
            <p className="truncate text-[14px] font-semibold">{c.title}</p>
            <p className="font-mono2 mt-0.5 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
              {c.memberCount} item{c.memberCount === 1 ? "" : "s"}{c.sampleTitle ? " · " + c.sampleTitle : ""}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}