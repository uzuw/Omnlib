// Kitsu fallback for manga/manhwa — open JSON:API, no key needed.
// Exists so manga search/add keeps working when AniList is down.
// Deliberately thin: no genres (separate endpoint), no episodes.

import type {
  MediaRecord,
  MediaStatusNormalized,
  ProviderClient,
  SearchTypeFilter,
} from "./types";
import { buckets, fetchWithRetry } from "../etl/ratelimit";
import { normalizeRating100, pickCover } from "../etl/normalize";

const BASE = "https://kitsu.io/api/edge";

interface KitsuManga {
  id: string;
  attributes: {
    canonicalTitle?: string | null;
    titles?: { en?: string | null; en_jp?: string | null; ja_jp?: string | null } | null;
    synopsis?: string | null;
    posterImage?: { large?: string | null; original?: string | null } | null;
    startDate?: string | null;
    status?: string | null;
    subtype?: string | null;
    chapterCount?: number | null;
    volumeCount?: number | null;
    averageRating?: string | null;
  };
}

const STATUS_MAP: Record<string, MediaStatusNormalized> = {
  current: "releasing",
  finished: "finished",
  tba: "upcoming",
  unreleased: "upcoming",
  hiatus: "hiatus",
  cancelled: "cancelled",
};

export function mapKitsuManga(m: KitsuManga): MediaRecord {
  const a = m.attributes ?? {};
  const subtype = (a.subtype ?? "manga").toLowerCase();
  return {
    providerSource: "kitsu",
    providerId: m.id,
    mediaType: subtype === "novel" ? "light_novel" : "manga",
    title: a.titles?.en || a.canonicalTitle || "Untitled",
    nativeTitle: a.titles?.ja_jp ?? null,
    synopsis: a.synopsis ?? null,
    coverUrl: pickCover(a.posterImage?.large, a.posterImage?.original),
    bannerUrl: null,
    year: a.startDate ? Number(a.startDate.slice(0, 4)) || null : null,
    status: STATUS_MAP[a.status ?? ""] ?? null,
    genres: null,
    avgRating: normalizeRating100(a.averageRating != null ? Number(a.averageRating) : null),
    episodesTotal: null,
    chaptersTotal: a.chapterCount ?? null,
    volumesTotal: a.volumeCount ?? null,
    creator: null,
  };
}

async function get(path: string): Promise<{ data?: KitsuManga | KitsuManga[] }> {
  const res = await fetchWithRetry(BASE + path, buckets.kitsu, {
    headers: { accept: "application/vnd.api+json" },
  });
  return (await res.json()) as { data?: KitsuManga | KitsuManga[] };
}

export const kitsu: ProviderClient = {
  name: "kitsu",
  available: true,
  async search(query, typeFilter: SearchTypeFilter = "any") {
    if (!query.trim()) return [];
    // Kitsu /manga covers manga + novels only — nothing for other formats
    if (typeFilter !== "any" && typeFilter !== "manga" && typeFilter !== "light_novel") return [];
    const { data } = await get(`/manga?filter[text]=${encodeURIComponent(query.trim())}&page[limit]=8`);
    const list = Array.isArray(data) ? data : [];
    let records = list.map(mapKitsuManga);
    if (typeFilter === "manga") records = records.filter((r) => r.mediaType === "manga");
    if (typeFilter === "light_novel") records = records.filter((r) => r.mediaType === "light_novel");
    return records;
  },
  async byId(providerId) {
    const { data } = await get(`/manga/${encodeURIComponent(providerId)}`);
    return data && !Array.isArray(data) ? mapKitsuManga(data) : null;
  },
};
