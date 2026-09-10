// Shared import vocabulary — every source parser normalizes into ImportItem.
import type { MediaType } from "../db/schema";

export type ImportSource = "anilist" | "mal" | "imdb" | "goodreads" | "trakt";

export interface ImportItem {
  source: ImportSource;
  /** Provider identity from the source file (anilist id / mal id / imdb const / isbn...) */
  sourceId: string;
  title: string;
  year?: number | null;
  mediaType?: MediaType | null;
  /** Source's tracking status, normalized to our vocabulary (planned/in_progress/completed/on_hold/dropped) */
  status?: string | null;
  /** Source's score, normalized to 0-10 */
  score?: number | null;
  /** Progress in source units (episodes/chapters/percent) */
  progress?: number | null;
  progressUnit?: "episode" | "chapter" | "percent" | null;
  startedAt?: string | null;
  completedAt?: string | null;
  repeat?: number | null;
  notes?: string | null;
  /** Extra ids for resolution (mal id on anilist items, isbn for books, imdb const...) */
  extraIds?: Record<string, string>;
  /** Source-specific helpful fields */
  raw?: Record<string, unknown>;
}

export interface ImportSummary {
  source: ImportSource;
  total: number;
  matched: number;      // resolved to a catalog media item
  imported: number;     // created/updated a user_media entry
  unresolved: { title: string; year?: number | null; reason: string }[];
}

export const SOURCE_LABEL: Record<ImportSource, string> = {
  anilist: "AniList (JSON export)",
  mal: "MyAnimeList (XML export)",
  imdb: "IMDb (ratings CSV)",
  goodreads: "Goodreads (shelves CSV)",
  trakt: "Trakt (future OAuth)",
};
