import { anilist } from "./anilist";
import { tmdb } from "./tmdb";
import { googlebooks } from "./googlebooks";
import { openlibrary } from "./openlibrary";
import type { ProviderClient } from "./types";

export const providers: Record<string, ProviderClient> = { anilist, tmdb, googlebooks, openlibrary };

/** All providers in a stable order (AniList first — richest relations). */
export function providerList(): ProviderClient[] {
  return [anilist, tmdb, googlebooks, openlibrary];
}