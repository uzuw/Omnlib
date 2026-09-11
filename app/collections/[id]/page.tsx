"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TYPE_META } from "@/lib/format";

type Member = { id: number; title: string; mediaType: keyof typeof TYPE_META; coverUrl: string | null; year: number | null };

export default function CollectionPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<{ collection: { id: number; title: string; coverUrl: string | null }; members: Member[] } | null>(null);
  useEffect(() => {
    fetch(`/api/collections?id=${params.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("" + r.status))))
      .then(setData)
      .catch(() => setData(null));
  }, [params.id]);
  if (!data) return <p className="pt-24 text-center text-[var(--ink-dim)]">Loading…</p>;
  return (
    <div className="space-y-8">
      <header>
        <p className="font-mono2 mb-2 text-[11px] uppercase tracking-[0.3em] text-[var(--movie)]">Collection</p>
        <h1 className="h1-display text-4xl italic">{data.collection.title}</h1>
        <p className="font-mono2 mt-1 text-[11px] tracking-widest text-[var(--ink-faint)]">{data.members.length} ITEM{data.members.length === 1 ? "" : "S"}</p>
      </header>
      <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {data.members.map((mm) => (
          <Link key={mm.id} href={`/media/${mm.id}`} className="card overflow-hidden transition-transform hover:-translate-y-1">
            <div className="cover-wrap card-cover-top aspect-[3/4]">
              {mm.coverUrl ? <img src={mm.coverUrl} alt={mm.title} loading="lazy" /> : <div className="cover-fallback">{mm.title[0]}</div>}
            </div>
            <div className="p-3 pt-2.5">
            <p className="truncate text-[13px] font-semibold">{mm.title}</p>
            <p className="font-mono2 mt-0.5 text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
              {mm.year ?? "—"} · <span className={`${TYPE_META[mm.mediaType].accent}`}>{TYPE_META[mm.mediaType].label}</span>
            </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}