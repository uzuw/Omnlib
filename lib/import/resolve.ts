// Resolve import items to catalog media rows (create them via live provider fetch when needed).
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { media, mediaExternalIds } from "../db/schema";
import { ingestRecord } from "../etl/ingest";
import type { MediaType } from "../db/schema";
import { anilist } from "../providers/anilist";
import { tmdb, findTmdbByImdb } from "../providers/tmdb";
import { googlebooks } from "../providers/googlebooks";
import { openlibrary } from "../providers/openlibrary";
import { searchLocal } from "../search";
import type { ImportItem } from "./types";

export interface ResolveOutcome {
  mediaId: number | null;
  reason?: string;
}

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'‘"“”()\[\]:;,.!?…-]+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findCatalogByProvider(providerSource: string, providerId: string) {
  return db.select().from(media).where(and(eq(media.providerSource, providerSource), eq(media.providerId, providerId))).get();
}

function findCatalogByExternal(provider: string, externalId: string) {
  const row = db.select({ mediaId: mediaExternalIds.mediaId }).from(mediaExternalIds).where(and(eq(mediaExternalIds.provider, provider), eq(mediaExternalIds.externalId, externalId))).get();
  return row ? db.select().from(media).where(eq(media.id, row.mediaId)).get() : null;
}

function findCatalogFuzzy(item: ImportItem) {
  const needle = normalizeTitle(item.title);
  if (needle.length < 3) return null;
  const hits = searchLocal(item.title, item.mediaType ?? "any");
  for (const h of hits) {
    if (normalizeTitle(h.title) !== needle) continue;
    if (item.year != null && h.year != null && h.year !== item.year) continue;
    return db.select().from(media).where(eq(media.id, h.mediaId)).get();
  }
  return null;
}

async function fetchAndIngest(providerName: string, providerId: string, hint?: MediaType): Promise<number | null> {
  try {
    const p = providerName === "anilist" ? anilist : providerName === "tmdb" ? tmdb : providerName === "googlebooks" ? googlebooks : openlibrary;
    const rec = p.byMediaType ? await p.byMediaType(providerId, hint) : await p.byId(providerId);
    if (!rec) return null;
    return ingestRecord(rec).mediaId;
  } catch {
    return null;
  }
}

export async function resolveItem(item: ImportItem): Promise<ResolveOutcome> {
  switch (item.source) {
    case "anilist": {
      const existing = findCatalogByProvider("anilist", item.sourceId) ?? findCatalogByExternal("anilist", item.sourceId);
      if (existing) return { mediaId: existing.id };
      const id = await fetchAndIngest("anilist", item.sourceId);
      if (id) return { mediaId: id };
      return { mediaId: null, reason: "AniList fetch failed" };
    }
    case "mal": {
      const existing = findCatalogByExternal("mal", item.sourceId) ?? findCatalogFuzzy(item);
      if (existing) return { mediaId: existing.id };
      // resolve via AniList search and match on the MAL id
      const typeFilter = item.mediaType === "manga" || item.mediaType === "light_novel" ? "manga" : "anime";
      try {
        const recs = await anilist.search(item.title, typeFilter);
        const hit = recs.find((r) => r.externalIds?.mal === item.sourceId) ?? recs[0];
        if (hit && hit.externalIds?.mal === item.sourceId) {
          const id = await fetchAndIngest("anilist", hit.providerId);
          if (id) return { mediaId: id };
        }
      } catch { /* fall through */ }
      return { mediaId: null, reason: "MAL id not found on AniList" };
    }
    case "imdb": {
      if (!tmdb.available) return { mediaId: null, reason: "TMDB_API_KEY required to resolve IMDb titles" };
      try {
        const found = await findTmdbByImdb(item.sourceId.replace("tt", "tt"));
        if (!found) return { mediaId: null, reason: "no TMDB match for this IMDb id" };
        const id = await fetchAndIngest("tmdb", found.id, found.mediaType);
        if (id) return { mediaId: id };
        return { mediaId: null, reason: "TMDB fetch failed" };
      } catch {
        return { mediaId: null, reason: "TMDB lookup error" };
      }
    }
    case "goodreads": {
      const isbn = item.extraIds?.isbn;
      if (isbn) {
        try {
          const found = await googlebooks.search(`isbn:${isbn}`);
          if (found[0]) {
            const id = await fetchAndIngest("googlebooks", found[0].providerId);
            if (id) return { mediaId: id };
          }
        } catch { /* throttle — fall through to Open Library */ }
        try {
          const found = await openlibrary.search(`isbn:${isbn}`);
          if (found[0]) {
            const id = await fetchAndIngest("openlibrary", found[0].providerId);
            if (id) return { mediaId: id };
          }
        } catch { /* fall through */ }
      }
      const existing = findCatalogFuzzy(item);
      if (existing) return { mediaId: existing.id };
      return { mediaId: null, reason: "could not resolve book (ISBN lookup failed)" };
    }
    default:
      return { mediaId: null, reason: "unsupported source" };
  }
}