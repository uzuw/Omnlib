import { sqlite } from "./db/client";
import type { MediaType } from "./db/schema";

export interface SearchHit {
  mediaId: number;
  providerSource: string;
  providerId: string;
  mediaType: MediaType;
  title: string;
  nativeTitle: string | null;
  synopsis: string | null;
  coverUrl: string | null;
  year: number | null;
  status: string | null;
  genres: string[] | null;
  avgRating: number | null;
  episodesTotal: number | null;
  chaptersTotal: number | null;
  volumesTotal: number | null;
  creator: string | null;
  inDb: boolean;
}

/** Escape FTS5 input into a safe phrase+prefix query. */
function ftsQuery(raw: string): string {
  const cleaned = raw.replace(/["'()*\-+:^~]/g, " ").trim().replace(/\s+/g, " ");
  return '"' + cleaned + '"*';
}

/** DB-first search over our own catalog (FTS5 with LIKE fallback). */
export function searchLocal(query: string, type?: string | null): SearchHit[] {
  const clean = query.trim();
  if (clean.length < 2) return [];
  let rows: Record<string, unknown>[] = [];
  try {
    rows = sqlite
      .prepare("SELECT m.* FROM media_fts f JOIN media m ON m.id = f.rowid WHERE media_fts MATCH ? ORDER BY rank LIMIT 12")
      .all(ftsQuery(clean)) as Record<string, unknown>[];
  } catch {
    rows = [];
  }
  if (!rows.length) {
    rows = (sqlite
      .prepare("SELECT * FROM media WHERE title LIKE ? OR native_title LIKE ? ORDER BY year DESC LIMIT 12")
      .all("%" + clean + "%", "%" + clean + "%") as Record<string, unknown>[]);
  }
  return rows
    .filter((r) => (type && type !== "any" ? r.media_type === type : true))
    .map((r) => ({
      mediaId: r.id as number,
      providerSource: r.provider_source as string,
      providerId: r.provider_id as string,
      mediaType: r.media_type as MediaType,
      title: r.title as string,
      nativeTitle: (r.native_title as string) ?? null,
      synopsis: (r.synopsis as string) ?? null,
      coverUrl: (r.cover_url as string) ?? null,
      year: (r.year as number) ?? null,
      status: (r.status as string) ?? null,
      genres: (r.genres as string[] | null) ?? null,
      avgRating: (r.avg_rating as number) ?? null,
      episodesTotal: (r.episodes_total as number) ?? null,
      chaptersTotal: (r.chapters_total as number) ?? null,
      volumesTotal: (r.volumes_total as number) ?? null,
      creator: (r.creator as string) ?? null,
      inDb: true,
    }));
}