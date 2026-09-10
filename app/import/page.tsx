"use client";
import { useState } from "react";
import Link from "next/link";
import { SOURCE_LABEL, type ImportSource } from "@/lib/import/types";

const SOURCES: ImportSource[] = ["anilist", "mal", "imdb", "goodreads"];

const HINTS: Record<ImportSource, string> = {
  anilist: "AniList → Settings → Data → Export (lists JSON) · paste the contents",
  mal: "MyAnimeList → My Settings → Export (animelist.xml / mangalist.xml) · paste the contents",
  imdb: "IMDb → Your Ratings → ⋮ → Export ratings · paste the CSV",
  goodreads: "Goodreads → My Books → Import/Export → Export your library · paste the CSV",
  trakt: "Trakt OAuth is on the roadmap — watch history via a future connect flow.",
};

type Summary = {
  source: ImportSource;
  total: number;
  matched: number;
  imported: number;
  unresolved: { title: string; year: number | null; reason: string }[];
};

export default function ImportPage() {
  const [source, setSource] = useState<ImportSource>("anilist");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function runImport() {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, content }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "import failed");
      setSummary(j.summary);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setContent(await f.text());
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h1 className="h1-display text-4xl">Import</h1>
        <p className="eyebrow mt-2">
          MOVE YOUR HISTORY FROM OTHER TRACKERS
        </p>
      </header>

      <p className="text-sm leading-relaxed text-[var(--ink-dim)]">
        Every service below can export your data as a file — no API keys needed. Pick a source, drop the file
        (or paste its contents), and Omnlib will fetch the items from its providers, add them to your catalog
        and library, and mark them <span className="italic text-[var(--ember)]">imported</span>. Re-importing is safe:
        existing entries are only filled where they have gaps.
      </p>

      <div className="card space-y-5 p-6">
        <div className="flex flex-wrap gap-2">
          {SOURCES.map((s) => (
            <button key={s} className="chip" data-on={source === s} onClick={() => { setSource(s); setSummary(null); }}>
              {SOURCE_LABEL[s].split(" (")[0]}
            </button>
          ))}
        </div>

        <label className="block cursor-pointer rounded-xl border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--ink-dim)] transition-colors hover:border-[var(--ember)]">
          📂 Drop or choose the export file
          <input type="file" className="hidden" accept=".json,.xml,.csv,text/*" onChange={(e) => onFile(e.target.files?.[0])} />
          {content && (
            <span className="mt-2 block truncate font-mono2 text-[10px] text-[var(--ink-faint)]">
              {content.length.toLocaleString()} characters loaded
            </span>
          )}
        </label>

        <textarea
          className="h-32 w-full resize-y rounded-xl border border-[var(--line)] bg-black/20 p-3 font-mono2 text-[12px] text-[var(--ink-dim)] outline-none focus:border-[var(--ember)]"
          placeholder="…or paste the export contents here"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        <p className="font-mono2 text-[10px] leading-relaxed text-[var(--ink-faint)]">{HINTS[source]}</p>

        <div className="flex items-center justify-between">
          <button className="btn btn-primary" disabled={busy || content.trim().length < 10} onClick={runImport}>
            {busy ? "Importing…" : "Import data →"}
          </button>
          {error && <span className="text-xs" style={{ color: "var(--anime)" }}>{error}</span>}
        </div>
      </div>

      {summary && (
        <div className="card space-y-4 p-6">
          <h2 className="font-display text-xl font-semibold">
            {summary.source} · {summary.total} items
          </h2>
          <div className="flex flex-wrap gap-2">
            <span className="chip" data-on="true">✓ {summary.matched} matched in catalog</span>
            <span className="chip" data-on="true" style={{ borderColor: "transparent", background: "rgba(95,214,164,0.12)" }}>
              +{summary.imported} added/updated in library
            </span>
            {summary.unresolved.length > 0 && (
              <span className="chip" data-on="true" style={{ borderColor: "transparent", background: "rgba(255,107,74,0.12)" }}>
                ? {summary.unresolved.length} unresolved
              </span>
            )}
          </div>
          {summary.unresolved.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-mono2 text-[10px] uppercase tracking-widest text-[var(--ink-faint)]">Could not resolve (typo in the export, or provider mismatch):</p>
              {summary.unresolved.slice(0, 30).map((u, i) => (
                <p key={i} className="flex justify-between gap-3 text-xs text-[var(--ink-dim)]">
                  <span className="truncate">{u.title} <span className="text-[var(--ink-faint)]">({u.year ?? "—"})</span></span>
                  <span className="shrink-0 font-mono2 text-[10px] text-[var(--ink-faint)]">{u.reason}</span>
                </p>
              ))}
            </div>
          )}
          <Link href="/library" className="btn">See your library →</Link>
        </div>
      )}
    </div>
  );
}