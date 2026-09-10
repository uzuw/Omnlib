// Shared types for the provider layer.
// Every provider normalizes its raw API payload into MediaRecord (the unified shape),
// so ETL/search only ever deal with one vocabulary.

import type { MediaType } from "../db/schema";

export type ProviderName = "anilist" | "tmdb" | "googlebooks" | "openlibrary";

export type MediaStatusNormalized = "releasing" | "finished" | "upcoming" | "hiatus" | "cancelled";

export type RelationTypeNormalized =
  | "prequel"
  | "sequel"
  | "adaptation"
  | "side_story"
  | "spinoff"
  | "alternate"
  | "contains"
  | "parent";

/** Unified record produced by every provider's mapper. */
export interface MediaRecord {
  providerSource: ProviderName;
  providerId: string;
  mediaType: MediaType;
  title: string;
  nativeTitle?: string | null;
  synopsis?: string | null;
  coverUrl?: string | null;
  bannerUrl?: string | null;
  year?: number | null;
  status?: MediaStatusNormalized | null;
  genres?: string[] | null;
  /** Normalized to 0-10 (AniList 100-scale /10). */
  avgRating?: number | null;
  episodesTotal?: number | null;
  chaptersTotal?: number | null;
  volumesTotal?: number | null;
  /** Runtime in minutes (movies). */
  runtimeMinutes?: number | null;
  /** Studio / author / publisher display string. */
  creator?: string | null;
  /** Cross-provider identities discovered on this record (unified table keyed by provider). */
  externalIds?: Record<string, string>;
  /** Relations to OTHER items of the SAME provider (target = providerId). */
  relations?: MediaRelation[];
  /** Franchise/series collection this item belongs to (e.g. TMDB belongs_to_collection). */
  collection?: CollectionRef | null;
  /** Episode/chapter-level data (anime + webseries). */
  episodes?: MediaEpisode[];
}

export interface CollectionRef {
  providerId: string;
  title: string;
  coverUrl?: string | null;
}

export interface MediaRelation {
  providerId: string;
  mediaType?: MediaType | null;
  relationType: RelationTypeNormalized;
  title?: string | null;
}

export interface MediaEpisode {
  number: number;
  title?: string | null;
  airedAt?: string | null; // ISO date or null
  synopsis?: string | null;
}

/** Type filters a provider can apply during search (undefined = all). */
export type SearchTypeFilter = MediaType | "any";

export interface ProviderClient {
  name: ProviderName;
  /** True when this provider can be called right now (e.g. TMDB needs an API key). */
  available: boolean;
  search(query: string, typeFilter?: SearchTypeFilter): Promise<MediaRecord[]>;
  byId(providerId: string): Promise<MediaRecord | null>;
  /** Fetch with an explicit media-type hint (resolves TMDB's shared movie/TV id namespace). */
  byMediaType?(providerId: string, mediaType?: MediaType): Promise<MediaRecord | null>;
  /** Optional: crawl episodes for webseries (TMDB). */
  episodes?(providerId: string): Promise<MediaEpisode[]>;
}