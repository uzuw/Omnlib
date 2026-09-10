"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { STATUS_LABEL, TYPE_META } from "@/lib/format";
import type { SearchHit } from "@/lib/search";

const TYPES = ["any", "anime", "manga", "light_novel", "webseries", "movie", "book"] as const;

type LibEntry = {
  entry: { id: number; mediaId: number; status: string; progress: number; total: number | null };
  media: { id: number; title: string; mediaType: keyof typeof TYPE_META; coverUrl: string | null; episodesTotal: number | null; chaptersTotal: number | null };
};

type Trending = { anime: SearchHit[]; manga: SearchHit[]; webseries: SearchHit[]; movie: SearchHit[] };

function HitCard({
  hit,
  added,
  busy,
  onAdd,
}: {
  hit: SearchHit;
  added: boolean;
  busy: boolean;
  onAdd: (hit: SearchHit) => void;
}) {
  return (
    <div className="card card-hover flex flex-col p-2.5">
      <Link href={hit.mediaId ? `/media/${hit.mediaId}` : "#"} className="cover-wrap mb-2 aspect-[2/3] block">
        {hit.coverUrl ? <img src={hit.coverUrl} alt={hit.title} loading="lazy" /> : <div className="cover-fallback text-2xl">{hit.title[0]}</div>}
        <div className="cover-veil">
          <span className="badge" style={{ borderColor: "var(--line-strong)", color: "var(--ink)" }}>
            {hit.mediaId ? "View in library" : "Preview"},
          </span>
        </div>
      </Link>
      <p className="line-clamp-2 min-h-[34px] text-[13px] font-semibold leading-snug">{hit.title}</p>
      <p className="mt-1 flex items-center justify-between gap-2">
        <span className={`font-mono2 text-[10px] ${TYPE_META[hit.mediaType].accent}`}>{TYPE_META[hit.mediaType].label}</span>
        <span className="font-mono2 truncate text-[10px] text-[var(--ink-faint)]">{hit.year ?? "—"}{hit.avgRating != null ? ` · ★${hit.avgRating}` : ""}</span>
      </p>
      <p className="font-mono2 mb-2 text-[10px] text-[var(--ink-faint)]">{unitOf(hit)}</p>
      <button
        className="btn w-full"
        data-on={added}
        disabled={busy || added}
        onClick={() => onAdd(hit)}
        aria-label={added ? "Already in library" : "Add to library"}
      >
        {busy ? "Saving…" : added ? "✓ In your library" : hit.mediaId ? "Add to library" : "Save + add"}
      </button>
    </div>
  );
}

function unitOf(h: SearchHit) {
  return h.mediaType === "movie" ? "100%" : h.episodesTotal ? h.episodesTotal + " eps" : h.chaptersTotal ? h.chaptersTotal + " ch" : h.volumesTotal ? h.volumesTotal + " vol" : "—";
}

function HitGrid({
  items,
  added,
  busy,
  onAdd,
}: {
  items: SearchHit[];
  added: Set<string>;
  busy: Set<string>;
  onAdd: (hit: SearchHit) => void;
}) {
  return (
    <div className="stagger grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((hit) => {
        const key = hit.providerSource + ":" + hit.providerId;
        return (
          <HitCard
            key={key}
            hit={hit}
            added={added.has(key)}
            busy={busy.has(key)}
            onAdd={onAdd}
          />
        );
      })}
    </div>
  );
}

export default function Home() {
  const [q, setQ] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("any");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [shelf, setShelf] = useState<LibEntry[]>([]);
  const [trending, setTrending] = useState<Trending | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/library")
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((j) => setShelf((j.entries ?? []).filter((e: LibEntry) => e.entry.status === "in_progress" || e.entry.status === "completed")));
    fetch("/api/trending")
      .then((r) => (r.ok ? r.json() : null))
      .then(setTrending)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const term = q.trim();
      if (term.length < 2) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      fetch(`/api/search?q=${encodeURIComponent(term)}&type=${type}`)
        .then((r) => r.json())
        .then((j) => setResults(j.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, type]);

  const addToShelf = useCallback(async (hit: SearchHit) => {
    const key = hit.providerSource + ":" + hit.providerId;
    setBusy((s) => new Set(s).add(key));
    try {
      let mediaId = hit.mediaId;
      if (!mediaId) {
        const res = await fetch("/api/media", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerSource: hit.providerSource, providerId: hit.providerId, mediaType: hit.mediaType }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "save failed");
        mediaId = j.mediaId;
      }
      await fetch("/api/library", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaId, status: "planned" }),
      });
      setAdded((s) => new Set(s).add(key));
    } catch {
      /* 409 already-in-library or provider error — state unchanged */
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }, []);

  const searchingMode = q.trim().length >= 2;
  const groups = (["anime", "manga", "light_novel", "webseries", "movie", "book"] as const)
    .map((t) => ({ type: t, items: results.filter((r) => r.mediaType === t) }))
    .filter((g) => g.items.length > 0);

  const trendRows: { type: keyof typeof TYPE_META; items: SearchHit[] }[] = [
    ...(trending?.anime?.length ? [{ type: "anime" as const, items: trending.anime }] : []),
    ...(trending?.manga?.length ? [{ type: "manga" as const, items: trending.manga }] : []),
    ...(trending?.webseries?.length ? [{ type: "webseries" as const, items: trending.webseries }] : []),
    ...(trending?.movie?.length ? [{ type: "movie" as const, items: trending.movie }] : []),
  ];

  return (
    <div className="space-y-12">
      {/* hero */}
      <section className="pt-8 sm:pt-12">
        <p className="eyebrow mb-5">A CATALOG OF EVERY STORY YOU LOVE</p>
        <h1 className="h1-display text-[clamp(44px,9vw,88px)]">
          One shelf for
          <br />
          <em className="em-ember">every&nbsp;story.</em>
        </h1>
        <div className="mt-10 max-w-3xl">
          <div className="search-wrap">
            <input
              className="search-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search anime, manga, movies, books…"
              autoFocus
              aria-label="Search the catalog and providers"
            />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {TYPES.map((t) => (
              <button key={t} className="chip" data-on={type === t} onClick={() => setType(t)}>
                {t === "any" ? "✦ All formats" : TYPE_META[t as keyof typeof TYPE_META].label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* continue shelf */}
      {shelf.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="h2-display text-xl">Continue the story</h2>
            <span className="font-mono2 text-[10px] tracking-widest text-[var(--ink-faint)]">{shelf.length} ITEMS</span>
          </div>
          <div className="scroll-x">
            {shelf.map((e) => {
              const meta = TYPE_META[e.media.mediaType];
              const total = e.entry.total ?? (e.media.mediaType === "movie" ? 100 : e.media.episodesTotal ?? e.media.chaptersTotal ?? 0);
              const pct = total > 0 ? Math.min(100, Math.round((e.entry.progress / total) * 100)) : 0;
              return (
                <Link key={e.entry.id} href={`/media/${e.media.id}`} className="card card-hover w-40 shrink-0 overflow-hidden p-3">
                  <div className="cover-wrap mb-2.5 aspect-[2/3]">
                    {e.media.coverUrl ? <img src={e.media.coverUrl} alt={e.media.title} loading="lazy" /> : <div className="cover-fallback">{e.media.title[0]}</div>}
                  </div>
                  <p className="truncate text-[13px] font-semibold">{e.media.title}</p>
                  <p className={`font-mono2 mb-2 mt-0.5 text-[10px] uppercase tracking-wider ${meta.accent}`}>
                    {meta.label} · {STATUS_LABEL[e.entry.status]}
                  </p>
                  <div className="progress-track"><div className="progress-fill" style={{ width: pct + "%" }} /></div>
                  <p className="font-mono2 mt-1 text-[10px] text-[var(--ink-faint)]">{e.entry.progress}/{total || "—"}</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* trending — shown only before the user searches */}
      {!searchingMode && trendRows.length > 0 && (
        <section className="space-y-10">
          <div className="flex items-baseline justify-between">
            <h2 className="h2-display text-2xl">Trending right now</h2>
                <span className="eyebrow">LIVE FROM ANILIST + TMDB · BEFORE YOU TYPE</span>
          </div>
          {trendRows.map((row) => (
            <div key={row.type} className="space-y-4">
              <h3 className={`flex items-baseline gap-2 h2-display text-lg ${TYPE_META[row.type].accent}`}>
                <span className="dot" style={{ background: TYPE_META[row.type].dot }} />
                {TYPE_META[row.type].label}
                <span className="badge">{row.items.length}</span>
              </h3>
              <HitGrid items={row.items} added={added} busy={busy} onAdd={addToShelf} />
            </div>
          ))}
        </section>
      )}

      {/* search results — only while searching */}
      {searchingMode && (
        <section className="space-y-10">
          <p className="font-mono2 text-[11px] tracking-widest text-[var(--ink-faint)]">
            {searching ? "…searching providers" : `${results.length} result${results.length === 1 ? "" : "s"} found`}
          </p>
          {!searching && groups.length === 0 && (
            <div className="card mx-auto max-w-md p-8 text-center">
              <p className="font-display text-xl italic text-[var(--ink-faint)]">Nothing matched.</p>
              <p className="mt-2 text-sm text-[var(--ink-dim)]">Try another title, or relax — some providers need a key for full coverage (see README).</p>
            </div>
          )}
          {groups.map((g) => (
            <div key={g.type} className="space-y-4">
              <h3 className={`flex items-baseline gap-2 h2-display text-lg ${TYPE_META[g.type].accent}`}>
                <span className="dot" style={{ background: TYPE_META[g.type].dot }} />
                {TYPE_META[g.type].label}
                <span className="badge">{g.items.length}</span>
              </h3>
              <HitGrid items={g.items} added={added} busy={busy} onAdd={addToShelf} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}