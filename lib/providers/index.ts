import { anilist } from "./anilist";
import { kitsu } from "./kitsu";
import { tmdb } from "./tmdb";
import { googlebooks } from "./googlebooks";
import { openlibrary } from "./openlibrary";
import type { ProviderClient } from "./types";

export const providers: Record<string, ProviderClient> = { anilist, kitsu, tmdb, googlebooks, openlibrary };

/** All providers in a stable order (AniList first — richest relations; Kitsu right behind as its manga fallback). */
export function providerList(): ProviderClient[] {
  return [anilist, kitsu, tmdb, googlebooks, openlibrary];
}