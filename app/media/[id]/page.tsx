"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { STATUS_LABEL, TYPE_META } from "@/lib/format";
import SyncButton from "@/components/SyncButton";

type Entry = {
  id: number;
  mediaId: number;
  status: string;
  progress: number;
  progressUnit: string;
  total: number | null;
  rating: number | null;
};

type Detail = {
  media: {
    id: number;
    title: string;
    nativeTitle: string | null;
    mediaType: keyof typeof TYPE_META;
    synopsis: string | null;
    coverUrl: string | null;
    bannerUrl: string | null;
    year: number | null;
    status: string | null;
    genres: string[] | null;
    avgRating: number | null;
    episodesTotal: number | null;
    chaptersTotal: number | null;
    volumesTotal: number | null;
    runtimeMinutes: number | null;
    creator: string | null;
  };
  episodes: { number: number; title: string | null; airedAt: string | null; synopsis: string | null }[];
  externalIds: { provider: string; externalId: string }[];
  userEntry: Entry | null;
  relations: {
    outgoing: { relationType: string; target: { id: number; title: string; mediaType: keyof typeof TYPE_META } }[];
    incoming: { relationType: string; source: { id: number; title: string; mediaType: keyof typeof TYPE_META } }[];
  };
  collection: {
    collection: { id: number; title: string; coverUrl: string | null };
    members: { id: number; title: string; mediaType: keyof typeof TYPE_META; coverUrl: string | null; year: number | null }[];
  } | null;
};

const REL_LABEL: Record<string, string> = {
  adaptation: "adaptation",
  sequel: "sequel",
  prequel: "prequel",
  side_story: "side story",
  spinoff: "spinoff",
  alternate: "alternate version",
  contains: "contains",
  parent: "parent",
};

const STATUSES = Object.keys(STATUS_LABEL);

export default function MediaPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/media/${params.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("" + r.status))))
      .then(setData)
      .catch((e) => setError(e.message === "404" ? "Not in your catalog yet." : String(e.message || e)));
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // gentle live refresh: still-airing titles pull fresh air-dates/metadata once per session
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const id = data?.media?.id;
    if (!id) return;
    if (data.media.status !== "releasing") return;
    const key = `oms-live-${id}`;
    if (typeof sessionStorage === "undefined" || sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    setRefreshing(true);
    fetch(`/api/sync?mediaId=${id}`, { method: "POST" })
      .then(() => load())
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [data?.media?.id, data?.media?.status]);

  async function api(url: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "request failed");
      return j;
    } finally {
      setBusy(false);
    }
  }

  async function addEntry() {
    if (!data) return;
    const unit = data.media.mediaType === "book" || data.media.mediaType === "movie" ? "percent" : data.media.mediaType === "anime" || data.media.mediaType === "webseries" ? "episode" : "chapter";
    await api("/api/library", { mediaId: data.media.id, status: "in_progress", progress: 0, progressUnit: unit });
    load();
  }

  async function setStatus(status: string) {
    if (!data?.userEntry) return;
    await fetch(`/api/library/${data.userEntry.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function setRating(rating: number | null) {
    if (!data?.userEntry) return;
    await fetch(`/api/library/${data.userEntry.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    load();
  }

  async function bump(delta: number) {
    if (!data?.userEntry) return;
    const unit = data.userEntry.progressUnit;
    const step = unit === "percent" ? (data.media.mediaType === "movie" ? 100 : 10) : 1;
    await api(`/api/library/${data.userEntry.id}/progress`, { delta: delta * step });
    load();
  }

  if (error) {
    return (
      <div className="card mx-auto mt-16 max-w-md p-8 text-center">
        <p className="font-display text-2xl italic" style={{ color: "var(--ember)" }}>{error}</p>
        <p className="mt-2 text-sm text-[var(--ink-dim)]">
          Use the search on the home page to find it and add it to your catalog.
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-8 pt-4">
        <div className="skeleton h-48 w-full rounded-2xl sm:h-72" />
        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <div className="skeleton mx-auto aspect-[2/3] w-56 lg:w-full" />
          <div className="space-y-4">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-12 w-3/4" />
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-32 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  const { media: m, relations, episodes, userEntry } = data;
  const meta = TYPE_META[m.mediaType];
  const total = userEntry?.total ?? (m.mediaType === "movie" ? 100 : m.episodesTotal ?? m.chaptersTotal ?? m.volumesTotal ?? 0);
  const unitLabel = userEntry?.progressUnit === "percent" ? "%" : userEntry?.progressUnit === "chapter" ? "chapters" : userEntry?.progressUnit === "episode" ? "episodes" : userEntry?.progressUnit;

  return (
    <div className="space-y-12">
      {/* banner hero */}
      {m.bannerUrl ? (
        <div className="relative -mx-5 h-52 overflow-hidden sm:-mx-0 sm:h-72 sm:rounded-3xl" style={{ border: "1px solid var(--line)" }}>
          <img src={m.bannerUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,12,17,0.2) 0%, rgba(10,12,17,0.55) 70%, var(--bg) 100%)" }} />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
            <p className={`eyebrow mb-2 ${meta.accent}`}>{meta.label.toUpperCase()} · {m.status ?? "—"}</p>
            <h1 className="h1-display text-[clamp(30px,5vw,52px)]">{m.title}</h1>
          </div>
        </div>
      ) : (
        <div className="pt-6">
          <p className={`eyebrow mb-2 ${meta.accent}`}>{meta.label.toUpperCase()} · {m.status ?? "—"}</p>
          <h1 className="h1-display text-[clamp(32px,5.5vw,56px)]">{m.title}</h1>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* cover */}
        <div className="mx-auto w-56 lg:sticky lg:top-24 lg:w-full lg:self-start">
          <div className="cover-wrap aspect-[2/3]">
            {m.coverUrl ? <img src={m.coverUrl} alt={m.title} /> : <div className="cover-fallback">{m.title[0]}</div>}
          </div>
          {m.nativeTitle && (
            <p className="mt-3 text-center font-mono2 text-[11px] text-[var(--ink-faint)] lg:hidden">{m.nativeTitle}</p>
          )}
        </div>

        {/* info + controls */}
        <div className="space-y-8">
          {m.bannerUrl && m.nativeTitle && (
            <p className="hidden font-mono2 text-[11px] text-[var(--ink-faint)] lg:block">{m.nativeTitle}</p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {m.year != null && <span className="badge">{m.year}</span>}
            {m.creator && <span className="badge max-w-[220px] truncate">{m.creator}</span>}
            {m.avgRating != null && <span className="badge" style={{ color: "var(--ember)", borderColor: "rgba(255,107,74,0.35)" }}>★ {m.avgRating}/10</span>}
            {m.episodesTotal != null && <span className="badge">{m.episodesTotal} eps</span>}
            {m.chaptersTotal != null && <span className="badge">{m.chaptersTotal} chapters</span>}
            {m.volumesTotal != null && <span className="badge">{m.volumesTotal} volumes</span>}
            {m.runtimeMinutes != null && <span className="badge">{Math.floor(m.runtimeMinutes / 60)}h {m.runtimeMinutes % 60}m</span>}
          </div>

          <p className="max-w-prose text-[14px] leading-relaxed text-[var(--ink-dim)]">{m.synopsis ?? "No synopsis available."}</p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {(m.genres ?? []).map((g) => (
              <span key={g} className="chip" style={{ cursor: "default" }}>{g}</span>
            ))}
          </div>

          {/* tracking controls */}
          <div className="card p-5">
            {!userEntry ? (
              <div className="flex flex-col items-start gap-3">
                <button className="btn btn-primary px-6 py-2.5 text-sm" disabled={busy} onClick={addEntry}>
                  Add to my library
                </button>
                <p className="font-mono2 text-[10px] text-[var(--ink-faint)]">Starts as Active at 0 — bump progress once you begin.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="eyebrow mb-2">Status</p>
                  <div className="seg flex-wrap">
                    {STATUSES.map((s) => (
                      <button key={s} data-on={userEntry.status === s} disabled={busy} onClick={() => setStatus(s)}>
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="eyebrow mb-2">Progress</p>
                  <div className="flex items-center gap-4">
                    <button className="icon-btn" disabled={busy || userEntry.progress <= 0} onClick={() => bump(-1)} aria-label="Step back">−</button>
                    <div className="flex-1">
                      <p className="h1-display text-3xl">
                        {userEntry.progress}
                        <span className="ml-2 font-mono2 text-xs font-normal text-[var(--ink-faint)]">/ {total || "—"} {unitLabel}</span>
                      </p>
                      <div className="progress-track mt-2">
                        <div className="progress-fill" style={{ width: (total > 0 ? Math.min(100, (userEntry.progress / total) * 100) : 0) + "%" }} />
                      </div>
                    </div>
                    <button className="icon-btn" disabled={busy} onClick={() => bump(1)} aria-label="Step forward">+</button>
                  </div>
                </div>

                <div>
                  <p className="eyebrow mb-2">Your rating · {userEntry.rating != null ? userEntry.rating.toFixed(1) : "unrated"}</p>
                  <div className="seg flex-wrap">
                    {[2, 4, 6, 7, 8, 9, 10].map((r) => (
                      <button key={r} data-on={userEntry.rating === r} disabled={busy} onClick={() => setRating(userEntry.rating === r ? null : r)}>
                        {r / 2}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t pt-4" style={{ borderColor: "var(--line)" }}>
                  <SyncButton mediaId={data.media.id} compact onDone={() => load()} />
                  {refreshing && <span className="font-mono2 text-[10px] text-[var(--ink-faint)]">refreshing air dates…</span>}
                </div>
              </div>
            )}
          </div>

          {/* external ids */}
          {data.externalIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.externalIds.map((e) => (
                <span key={e.provider} className="badge">{e.provider} {e.externalId}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* franchise collection */}
      {data.collection && (
        <section className="card card-hover p-6">
          <h2 className="h2-display text-2xl">
            Part of
            <Link href={`/collections/${data.collection.collection.id}`} className="em-ember ml-2 link-ember">
              {data.collection.collection.title}
            </Link>
          </h2>
          <div className="stagger mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {data.collection.members.map((mm) => (
              <Link key={mm.id} href={`/media/${mm.id}`} className="group">
                <div className="cover-wrap mb-1.5 aspect-[2/3]">
                  {mm.coverUrl ? <img src={mm.coverUrl} alt={mm.title} loading="lazy" /> : <div className="cover-fallback text-sm">{mm.title[0]}</div>}
                </div>
                <p className="truncate text-[11px] font-medium text-[var(--ink-dim)] transition-colors group-hover:text-[var(--ink)]">{mm.title}</p>
                <p className="font-mono2 text-[9px] text-[var(--ink-faint)]">{mm.year ?? "—"} · {TYPE_META[mm.mediaType].label}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* the story universe — cross-format graph */}
      {(relations.outgoing.length > 0 || relations.incoming.length > 0) && (
        <section className="card p-6">
          <h2 className="h2-display text-2xl">
            The story universe
            <span className="font-mono2 ml-2 align-middle text-xs font-normal text-[var(--ink-faint)]">
              {relations.outgoing.length + relations.incoming.length} links
            </span>
          </h2>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {relations.outgoing.map((r) => (
              <Link key={"o" + r.target.id} href={`/media/${r.target.id}`} className="group flex items-center gap-3 rounded-xl border border-[var(--line)] px-4 py-3 transition-all hover:border-[var(--ember)] hover:bg-[var(--ember-soft)]">
                <span className="badge shrink-0">{REL_LABEL[r.relationType] ?? r.relationType}</span>
                <span style={{ color: "var(--ember)" }} aria-hidden>→</span>
                <span className={`truncate text-sm font-semibold ${TYPE_META[r.target.mediaType].accent}`}>{r.target.title}</span>
              </Link>
            ))}
            {relations.incoming.map((r) => (
              <Link key={"i" + r.source.id} href={`/media/${r.source.id}`} className="group flex items-center gap-3 rounded-xl border border-[var(--line)] px-4 py-3 transition-all hover:border-[var(--ember)] hover:bg-[var(--ember-soft)]">
                <span className={`truncate text-sm font-semibold ${TYPE_META[r.source.mediaType].accent}`}>{r.source.title}</span>
                <span style={{ color: "var(--ember)" }} aria-hidden>←</span>
                <span className="badge shrink-0">{REL_LABEL[r.relationType] ?? r.relationType} of</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* episodes */}
      {episodes.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="h2-display text-xl">Episodes</h2>
            <span className="badge">{episodes.length}</span>
          </div>
          <div className="grid gap-2">
            {episodes.map((e) => (
              <div key={e.number} className="card flex items-center gap-4 px-4 py-3">
                <span className="font-display w-10 shrink-0 text-lg italic" style={{ color: "var(--ember)" }}>{e.number}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.title ?? "Episode " + e.number}</p>
                  {e.synopsis && <p className="truncate text-xs text-[var(--ink-faint)]">{e.synopsis}</p>}
                </div>
                {e.airedAt && <span className="font-mono2 shrink-0 text-[10px] text-[var(--ink-faint)]">{new Date(e.airedAt).toLocaleDateString()}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}