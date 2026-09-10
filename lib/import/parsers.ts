// Source parsers: raw export text -> ImportItem[].
import { XMLParser } from "fast-xml-parser";
import { csvToObjects } from "./csv";
import type { ImportItem, ImportSource } from "./types";
import type { MediaType } from "../db/schema";

const ANI_STATUS: Record<string, string> = {
  CURRENT: "in_progress",
  COMPLETED: "completed",
  PLANNING: "planned",
  PAUSED: "on_hold",
  DROPPED: "dropped",
  REPEATING: "in_progress",
};

type AniDate = { year?: number | number[]; month?: number; day?: number } | null | undefined;

function aniDateToIso(d: AniDate): string | null {
  if (!d) return null;
  const y = Array.isArray(d.year) ? d.year[0] : d.year;
  if (!y) return null;
  const pad = (v?: number) => (v ? String(v).padStart(2, "0") : "01");
  return `${y}-${pad(d.month)}-${pad(d.day)}`;
}

function aniType(t?: string, format?: string): MediaType | null {
  if (t === "ANIME") return format === "MOVIE" ? "movie" : "anime";
  if (t === "MANGA") return format === "NOVEL" ? "light_novel" : "manga";
  return null;
}

/** AniList account export JSON ("MediaListCollection"). */
export function parseAniListJson(text: string): ImportItem[] {
  const json = JSON.parse(text);
  const lists: unknown[] = json?.data?.MediaListCollection?.lists ?? json?.MediaListCollection?.lists ?? [];
  const entries: { id?: number; mediaId?: number; status?: string; score?: number; progress?: number; repeat?: number; notes?: string; startedAt?: AniDate; completedAt?: AniDate; media?: Record<string, unknown> }[] = [];
  const collect = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (Array.isArray(n.entries)) entries.push(...(n.entries as typeof entries));
    if (Array.isArray(n.lists)) n.lists.forEach(collect);
    if (Array.isArray(n.list)) n.list.forEach(collect);
  };
  lists.forEach(collect);
  if (entries.length === 0) {
    // flat export: { data: { MediaListCollection: { entries: [...] } } } or direct entries
    const direct = (json?.data?.MediaListCollection?.entries ?? json?.entries ?? []) as typeof entries;
    entries.push(...direct);
  }

  return entries
    .filter((e) => e?.mediaId != null)
    .map((e) => {
      const media = (e.media ?? {}) as { id?: number; type?: string; format?: string; title?: { romaji?: string; english?: string; native?: string }; startDate?: { year?: number } };
      const title =
        media?.title?.romaji || media?.title?.english || media?.title?.native || "Untitled";
      const mt = aniType(media?.type, media?.format);
      return {
        source: "anilist" as ImportSource,
        sourceId: String(e.mediaId),
        title,
        year: media?.startDate?.year ?? null,
        mediaType: mt,
        status: ANI_STATUS[e.status ?? ""] ?? null,
        score: e.score != null ? Math.round((e.score / 10) * 10) / 10 : null,
        progress: e.progress ?? null,
        progressUnit: mt === "manga" || mt === "light_novel" ? "chapter" : mt === "movie" ? "percent" : "episode",
        startedAt: aniDateToIso(e.startedAt),
        completedAt: aniDateToIso(e.completedAt),
        repeat: e.repeat ?? null,
        notes: e.notes || null,
        raw: { format: media?.format, type: media?.type },
      };
    });
}

const MAL_STATUS: Record<string, string> = {
  "1": "in_progress",
  "2": "completed",
  "3": "on_hold",
  "4": "dropped",
  "6": "planned",
};

/** MyAnimeList XML export (animelist.xml / mangalist.xml). */
export function parseMalXml(text: string, kind: "anime" | "manga" = "anime"): ImportItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const doc = parser.parse(text) as { myanimelist?: Record<string, unknown> };
  const container = doc?.myanimelist?.[kind];
  // fast-xml-parser: a single <anime> entry is an object, multiple are an array;
  // and the wrapper element itself is keyed by the same name.
  let entriesRaw: unknown = container;
  if (container && typeof container === "object") {
    const keyed = (container as Record<string, unknown>)[kind];
    if (keyed !== undefined) entriesRaw = keyed;
  }
  const nodes = Array.isArray(entriesRaw) ? entriesRaw : entriesRaw ? [entriesRaw] : [];
  const mt: MediaType = kind === "manga" ? "manga" : "anime";
  return nodes
    .map((n): ImportItem | null => {
      const node = (n ?? {}) as Record<string, string | number | undefined>;
      const id = String(node.series_animedb_id ?? node.series_mangadb_id ?? "");
      if (!id || id === "undefined") return null;
      return {
        source: "mal" as ImportSource,
        sourceId: id,
        title: String(node.series_title ?? "Untitled"),
        year: parseYear(String(node.series_start ?? "")),
        mediaType: mt,
        status: MAL_STATUS[String(node.my_status ?? "")] ?? null,
        score: Number(node.my_score) || null,
        progress: Number(node.my_watched_episodes ?? node.my_read_chapters ?? 0) || 0,
        progressUnit: kind === "manga" ? "chapter" : "episode",
        startedAt: cleanDate(String(node.my_start_date ?? "")),
        completedAt: cleanDate(String(node.my_finish_date ?? "")),
        repeat: Number(node.my_times_watched ?? node.my_times_read ?? 0) || null,
        notes: String(node.my_comments ?? node.my_notes ?? "") || null,
        extraIds: { mal: id },
        raw: { kind },
      };
    })
    .filter((x): x is ImportItem => x !== null);
}

function parseYear(s: string): number | null {
  const m = s.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}
function cleanDate(s: string): string | null {
  if (!s || /^0+$/g.test(s.replace(/[- ]/g, ""))) return null;
  return s || null;
}

/** Case-insensitive cell lookup (IMDb export header is lowercase for some columns). */
function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

/** IMDb ratings CSV export (the one from your ratings page). */
export function parseImdbCsv(text: string): ImportItem[] {
  const rows = csvToObjects(text);
  const out: ImportItem[] = [];
  for (const r of rows) {
    const rating = parseFloat(pick(r, "Your Rating"));
    if (!Number.isFinite(rating)) continue; // only rated titles
    const ttype = pick(r, "Title Type", "titleType");
    let mediaType: MediaType | null = null;
    if (ttype === "movie") mediaType = "movie";
    else if (ttype.startsWith("tv")) mediaType = "webseries";
    const imdbId = pick(r, "const", "Const");
    out.push({
      source: "imdb",
      sourceId: imdbId,
      title: pick(r, "Title", "title") || "Untitled",
      year: pick(r, "Year", "year") ? Number(pick(r, "Year", "year")) : null,
      mediaType,
      status: "completed",
      score: rating,
      progress: mediaType === "movie" ? 100 : null,
      progressUnit: mediaType === "movie" ? "percent" : null,
      startedAt: cleanDate(pick(r, "Date Rated")),
      extraIds: { imdb: imdbId },
      raw: { titleType: ttype },
    });
  }
  return out;
}

/** Goodreads shelves CSV export. */
export function parseGoodreadsCsv(text: string): ImportItem[] {
  const rows = csvToObjects(text);
  const out: ImportItem[] = [];
  for (const r of rows) {
    const title = r["Title"] ?? "";
    if (!title) continue;
    const shelf = (r["Exclusive Shelf"] ?? "to-read").trim();
    let status = "planned";
    if (shelf === "read") status = "completed";
    else if (shelf === "currently-reading") status = "in_progress";
    const rating = Number(r["My Rating"]) || 0;
    const isbn = r["ISBN13"] ?? r["ISBN"] ?? "";
    const year = r["Original Publication Year"] ? Number(r["Original Publication Year"]) : null;
    const pages = Number(r["Number of Pages"]) || null;
    out.push({
      source: "goodreads",
      sourceId: isbn || r["Book Id"] || title,
      title,
      year: year || null,
      mediaType: "book",
      status,
      score: rating ? rating * 2 : null,
      progress: status === "completed" ? 100 : null,
      progressUnit: "percent",
      completedAt: status === "completed" ? cleanDate(r["Date Read"] ?? "") : null,
      repeat: Number(r["Read Count"]) > 1 ? Number(r["Read Count"]) : null,
      notes: r["My Review"]?.replace(/<[^>]+>/g, "").trim() || null,
      extraIds: { isbn, ...(r["Book Id"] ? { goodreads: r["Book Id"] } : {}) },
      raw: { author: r["Author"] ?? "", pages, shelf },
    });
  }
  return out;
}