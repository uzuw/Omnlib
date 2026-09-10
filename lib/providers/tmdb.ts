import type { MediaEpisode, MediaRecord, MediaStatusNormalized, ProviderClient, SearchTypeFilter } from "./types";
import type { MediaType } from "../db/schema";
import { buckets, fetchWithRetry } from "../etl/ratelimit";
import { extractYear, pickCover } from "../etl/normalize";

const KEY = process.env.TMDB_API_KEY || "";
const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

// TMDB has no free search for web-originals only; `search/tv` covers
// broadcast + streaming series, which is our webseries bucket.
const STATUS_MAP: Record<string, MediaStatusNormalized> = {
  "Returning Series": "releasing",
  Ended: "finished",
  Canceled: "cancelled",
  "In Production": "upcoming",
  Planned: "upcoming",
  "Post Production": "upcoming",
};

type TmdSearchItem = {
  id: number;
  name?: string;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string | null;
  vote_average?: number | null;
  genre_ids?: number[];
};

type TmdDetail = TmdSearchItem & {
  status?: string | null;
  genres?: { name?: string }[];
  networks?: { name?: string }[];
  number_of_episodes?: number;
  number_of_seasons?: number;
  seasons?: { season_number: number; episode_count?: number }[];
};

type TmdSeason = { episodes?: { episode_number?: number; name?: string | null; air_date?: string | null; overview?: string | null }[] };

type TmdMovie = {
  id: number;
  title?: string;
  original_title?: string;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string | null;
  vote_average?: number | null;
  runtime?: number | null;
  status?: string | null;
  genres?: { name?: string }[];
  production_companies?: { name?: string }[];
  belongs_to_collection?: { id?: number; name?: string; poster_path?: string | null } | null;
};

const MOVIE_STATUS_MAP: Record<string, MediaStatusNormalized> = {
  Released: "finished",
  "In Production": "upcoming",
  Planned: "upcoming",
  "Post Production": "upcoming",
  Rumored: "upcoming",
};

/** search/movie items (light: no genres/runtime/collection until byId) */
export function mapMovieSearchItem(m: TmdMovie): MediaRecord {
  return {
    providerSource: "tmdb",
    providerId: String(m.id),
    mediaType: "movie",
    title: m.title ?? m.original_title ?? "Untitled",
    synopsis: m.overview ?? null,
    coverUrl: pickCover(m.poster_path && IMG + "/w500" + m.poster_path),
    bannerUrl: m.backdrop_path && IMG + "/w1280" + m.backdrop_path,
    year: extractYear(m.release_date),
    avgRating: m.vote_average ?? null,
    status: null,
    externalIds: { tmdb: String(m.id) },
  };
}

/** full movie detail (from /movie/{id}) */
export function mapMovie(m: TmdMovie): MediaRecord {
  const base = mapMovieSearchItem(m);
  return {
    ...base,
    status: MOVIE_STATUS_MAP[m.status ?? ""] ?? null,
    genres: (m.genres ?? []).map((g) => g.name ?? "").filter(Boolean),
    runtimeMinutes: m.runtime ?? null,
    creator: m.production_companies?.[0]?.name ?? null,
    collection: m.belongs_to_collection?.id
      ? {
          providerId: String(m.belongs_to_collection.id),
          title: m.belongs_to_collection.name ?? "Collection",
          coverUrl: m.belongs_to_collection.poster_path ? IMG + "/w342" + m.belongs_to_collection.poster_path : null,
        }
      : null,
  };
}

const URL = (path: string, params: Record<string, string> = {}) => {
  const q = new URLSearchParams({ api_key: KEY, language: "en-US", ...params });
  return BASE + path + "?" + q.toString();
};

export function mapSearchItem(it: TmdSearchItem): MediaRecord {
  return {
    providerSource: "tmdb",
    providerId: String(it.id),
    mediaType: "webseries",
    title: it.name ?? "Untitled",
    synopsis: it.overview ?? null,
    coverUrl: pickCover(it.poster_path && IMG + "/w500" + it.poster_path),
    bannerUrl: it.backdrop_path && IMG + "/w1280" + it.backdrop_path,
    year: extractYear(it.first_air_date),
    avgRating: it.vote_average ?? null,
    status: null,
    externalIds: { tmdb: String(it.id) },
  };
}

/** IMDb const -> TMDB id via the /find endpoint (used by imports). */
export async function findTmdbByImdb(imdbId: string): Promise<{ id: string; mediaType: "movie" | "webseries" } | null> {
  if (!KEY) return null;
  const res = await fetchWithRetry(URL(`/find/${imdbId}`, { external_source: "imdb_id" }), buckets.tmdb);
  const j = (await res.json()) as { movie_results?: { id: number }[]; tv_results?: { id: number }[] };
  if (j.movie_results?.[0]) return { id: String(j.movie_results[0].id), mediaType: "movie" };
  if (j.tv_results?.[0]) return { id: String(j.tv_results[0].id), mediaType: "webseries" };
  return null;
}

/** TMDB trending this week. */
export async function tmdbTrending(kind: "movie" | "tv", perPage = 8): Promise<MediaRecord[]> {
  if (!KEY) return [];
  const res = await fetchWithRetry(URL(`/trending/${kind}/week`), buckets.tmdb, { retries: 2 });
  const j = (await res.json()) as { results?: (TmdSearchItem | TmdMovie)[] };
  return (j.results ?? [])
    .slice(0, perPage)
    .map((it) => (kind === "tv" ? mapSearchItem(it as TmdSearchItem) : mapMovieSearchItem(it as TmdMovie)));
}

export const tmdb: ProviderClient = {
  name: "tmdb",
  available: Boolean(KEY),
  async search(query, typeFilter) {
    if (!KEY) return [];
    if (typeFilter && !["any", "webseries", "movie"].includes(typeFilter)) return [];
    if (!query.trim()) return [];
    const q = query.trim();
    if (typeFilter === "movie") {
      const res = await fetchWithRetry(URL("/search/movie", { query: q }), buckets.tmdb);
      const json = (await res.json()) as { results?: TmdMovie[] };
      return (json.results ?? []).slice(0, 8).map(mapMovieSearchItem);
    }
    // "any" or "webseries": tv results; when "any", also merge top movies
    const tvRes = await fetchWithRetry(URL("/search/tv", { query: q }), buckets.tmdb);
    const tv = (await tvRes.json()) as { results?: TmdSearchItem[] };
    const out = (tv.results ?? []).slice(0, 8).map(mapSearchItem);
    if (typeFilter === "any") {
      const mvRes = await fetchWithRetry(URL("/search/movie", { query: q }), buckets.tmdb);
      const mv = (await mvRes.json()) as { results?: TmdMovie[] };
      out.push(...(mv.results ?? []).slice(0, 4).map(mapMovieSearchItem));
    }
    return out;
  },
  async byId(providerId) {
    // caller didn't specify the format — fall back to the probe (tv first, then movie)
    return (await this.byMediaType?.(providerId)) ?? null;
  },
  byMediaType: async function (this: { byId(pid: string): Promise<MediaRecord | null> }, providerId: string, hint?: MediaType): Promise<MediaRecord | null> {
    if (!KEY) return null;
    if (hint === "movie") {
      const mvRes = await fetchWithRetry(URL(`/movie/${providerId}`), buckets.tmdb);
      const mv = (await mvRes.json()) as TmdMovie;
      return mv?.id ? mapMovie(mv) : null;
    }
    if (hint === "webseries") {
      const tvRes = await fetchWithRetry(URL(`/tv/${providerId}`), buckets.tmdb);
      const tv = (await tvRes.json()) as TmdDetail;
      if (!tv?.id || !Array.isArray(tv.seasons)) return null;
      return {
        ...mapSearchItem(tv),
        status: STATUS_MAP[tv.status ?? ""] ?? null,
        genres: (tv.genres ?? []).map((g) => g.name ?? "").filter(Boolean),
        creator: tv.networks?.[0]?.name ?? null,
        episodesTotal: tv.number_of_episodes ?? null,
        chaptersTotal: null,
        volumesTotal: null,
      };
    }
    // no hint: probe tv-first then movie (ids share a namespace)
    const tvRes = await fetchWithRetry(URL(`/tv/${providerId}`), buckets.tmdb);
    const tv = (await tvRes.json()) as TmdDetail & { seasons?: unknown[] };
    if (tv?.id && Array.isArray(tv.seasons)) {
      return {
        ...mapSearchItem(tv),
        status: STATUS_MAP[tv.status ?? ""] ?? null,
        genres: (tv.genres ?? []).map((g) => g.name ?? "").filter(Boolean),
        creator: tv.networks?.[0]?.name ?? null,
        episodesTotal: tv.number_of_episodes ?? null,
        chaptersTotal: null,
        volumesTotal: null,
      };
    }
    const mvRes = await fetchWithRetry(URL(`/movie/${providerId}`), buckets.tmdb);
    const mv = (await mvRes.json()) as TmdMovie;
    return mv?.id ? mapMovie(mv) : null;
  },
  async episodes(providerId) {
    if (!KEY) return [];
    const detailRes = await fetchWithRetry(URL(`/tv/${providerId}`), buckets.tmdb);
    const detail = (await detailRes.json()) as TmdDetail;
    const seasons = (detail.seasons ?? []).filter((s) => s.season_number >= 1);
    const out: MediaEpisode[] = [];
    for (const s of seasons.slice(0, 20)) {
      const res = await fetchWithRetry(URL(`/tv/${providerId}/season/${s.season_number}`), buckets.tmdb);
      const season = (await res.json()) as TmdSeason;
      for (const ep of season.episodes ?? []) {
        out.push({
          number: ep.episode_number ?? 0,
          title: ep.name ?? null,
          airedAt: ep.air_date ?? null,
          synopsis: ep.overview ?? null,
        });
      }
    }
    return out.sort((a, b) => a.number - b.number);
  },
};