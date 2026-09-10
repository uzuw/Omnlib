"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { STATUS_LABEL, TYPE_META } from "@/lib/format";
import SyncButton from "@/components/SyncButton";

const TYPES = ["all", "anime", "manga", "light_novel", "webseries", "movie", "book"] as const;
const STATUSES = ["all", "planned", "in_progress", "completed", "on_hold", "dropped"] as const;

type LibEntry = {
  entry: { id: number; mediaId: number; status: string; progress: number; progressUnit: string; total: number | null; rating: number | null; updatedAt: string };
  media: { id: number; title: string; mediaType: keyof typeof TYPE_META; coverUrl: string | null; year: number | null; episodesTotal: number | null; chaptersTotal: number | null; volumesTotal: number | null };
};

export default function LibraryPage() {
  const [entries, setEntries] = useState<LibEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");

  useEffect(() => {
    fetch("/api/library")
      .then((r) => r.json())
      .then((j) => {
        setEntries(j.entries ?? []);
        setLoaded(true);
      });
  }, []);

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) => (type === "all" || e.media.mediaType === type) && (status === "all" || e.entry.status === status),
      ),
    [entries, type, status],
  );

  const groups = (["anime", "manga", "light_novel", "webseries", "movie", "book"] as const)
    .map((t) => ({ type: t, items: filtered.filter((e) => e.media.mediaType === t) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">YOUR PERSONAL CATALOG</p>
          <h1 className="h1-display text-4xl">Library</h1>
          <p className="mt-2 font-mono2 text-[11px] tracking-widest text-[var(--ink-faint)]">
            {entries.length} ITEM{entries.length === 1 ? "" : "S"} ACROSS {groups.length} FORMAT{groups.length === 1 ? "" : "S"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <SyncButton />
          <div className="flex flex-wrap items-center gap-1.5">
            {TYPES.map((t) => (
              <button key={t} className="chip" data-on={type === t} onClick={() => setType(t)}>
                {t === "all" ? "✦ All" : TYPE_META[t as keyof typeof TYPE_META].label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button key={s} className="chip" data-on={status === s} onClick={() => setStatus(s)}>
            {s === "all" ? "All statuses" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* loading skeletons */}
      {!loaded && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-3">
              <div className="skeleton mb-2 aspect-[2/3] w-full" />
              <div className="skeleton mb-2 h-3 w-3/4" />
              <div className="skeleton h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {loaded && filtered.length === 0 && (
        <div className="card mx-auto mt-10 max-w-md p-10 text-center">
          <p className="font-display text-xl italic text-[var(--ink-faint)]">An empty shelf.</p>
          <p className="mt-2 text-sm text-[var(--ink-dim)]">Nothing here yet.</p>
          <Link href="/" className="link-ember mt-4 inline-block text-sm">Discover something →</Link>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.type} className="space-y-4">
          <h2 className={`flex items-baseline gap-2 h2-display text-xl ${TYPE_META[g.type].accent}`}>
            <span className="dot" style={{ background: TYPE_META[g.type].dot }} />
            {TYPE_META[g.type].label}
            <span className="badge">{g.items.length}</span>
          </h2>
          <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {g.items.map((e) => {
              const total = e.entry.total ?? (e.media.mediaType === "movie" ? 100 : e.media.episodesTotal ?? e.media.chaptersTotal ?? e.media.volumesTotal ?? 0);
              const pct = total > 0 ? Math.min(100, Math.round((e.entry.progress / total) * 100)) : 0;
              return (
                <Link key={e.entry.id} href={`/media/${e.media.id}`} className="card card-hover no-underline overflow-hidden p-3">
                  <div className="cover-wrap mb-2.5 aspect-[2/3]">
                    {e.media.coverUrl ? <img src={e.media.coverUrl} alt={e.media.title} loading="lazy" /> : <div className="cover-fallback">{e.media.title[0]}</div>}
                    <div className="cover-veil"><span className="badge" style={{ color: "var(--ink)" }}>Open</span></div>
                  </div>
                  <p className="truncate text-[13px] font-semibold no-underline">{e.media.title}</p>
                  <p className="font-mono2 mb-2 mt-0.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--ink-faint)] no-underline">
                    <span>{e.media.year ?? "—"} · {STATUS_LABEL[e.entry.status]}</span>
                    {e.entry.rating != null && <span style={{ color: "var(--ember)" }}>★ {e.entry.rating}</span>}
                  </p>
                  <div className="progress-track"><div className="progress-fill" style={{ width: pct + "%" }} /></div>
                  <p className="font-mono2 mt-1 text-[10px] text-[var(--ink-faint)]">
                    {e.entry.progress}/{total || "—"} {e.entry.progressUnit}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}