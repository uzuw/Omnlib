import { and, eq, notInArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  collections,
  media,
  mediaCollections,
  mediaEpisodes,
  mediaExternalIds,
  mediaRelationStaging,
  mediaRelations,
  syncState,
} from "../db/schema";
import type { MediaRecord } from "../providers/types";

export interface IngestResult {
  mediaId: number;
  created: boolean;
  relationsLinked: number;
  episodesUpserted: number;
  relationsStaged: number;
}

/**
 * Idempotent upsert of one unified MediaRecord into the local catalog:
 * media row + external ids + episodes (+prune) + relations (link-or-stage) + sync bookkeeping.
 */
export function ingestRecord(rec: MediaRecord): IngestResult {
  const now = new Date();
  const existing = db
    .select()
    .from(media)
    .where(and(eq(media.providerSource, rec.providerSource), eq(media.providerId, rec.providerId)))
    .get();

  const row = db
    .insert(media)
    .values({
      mediaType: rec.mediaType,
      title: rec.title,
      nativeTitle: rec.nativeTitle ?? null,
      synopsis: rec.synopsis ?? null,
      coverUrl: rec.coverUrl ?? null,
      bannerUrl: rec.bannerUrl ?? null,
      year: rec.year ?? null,
      status: rec.status ?? "upcoming",
      genres: rec.genres ?? null,
      avgRating: rec.avgRating ?? null,
      episodesTotal: rec.episodesTotal ?? null,
      chaptersTotal: rec.chaptersTotal ?? null,
      volumesTotal: rec.volumesTotal ?? null,
      runtimeMinutes: rec.runtimeMinutes ?? null,
      creator: rec.creator ?? null,
      providerSource: rec.providerSource,
      providerId: rec.providerId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [media.providerSource, media.providerId],
      set: {
        mediaType: rec.mediaType,
        title: rec.title,
        nativeTitle: rec.nativeTitle ?? null,
        synopsis: rec.synopsis ?? null,
        coverUrl: rec.coverUrl ?? null,
        bannerUrl: rec.bannerUrl ?? null,
        year: rec.year ?? null,
        status: rec.status ?? "upcoming",
        genres: rec.genres ?? null,
        avgRating: rec.avgRating ?? null,
        episodesTotal: rec.episodesTotal ?? null,
        chaptersTotal: rec.chaptersTotal ?? null,
        volumesTotal: rec.volumesTotal ?? null,
        runtimeMinutes: rec.runtimeMinutes ?? null,
        creator: rec.creator ?? null,
        updatedAt: now,
      },
    })
    .returning()
    .get();

  for (const [provider, extId] of Object.entries(rec.externalIds ?? {})) {
    if (provider === rec.providerSource) continue;
    if (!extId) continue;
    db.insert(mediaExternalIds).values({ mediaId: row.id, provider, externalId: extId }).onConflictDoNothing().run();
  }

  let episodesUpserted = 0;
  if (rec.episodes?.length) {
    for (const ep of rec.episodes) {
      db.insert(mediaEpisodes)
        .values({
          mediaId: row.id,
          number: ep.number,
          title: ep.title ?? null,
          airedAt: ep.airedAt ? new Date(ep.airedAt) : null,
          synopsis: ep.synopsis ?? null,
        })
        .onConflictDoUpdate({
          target: [mediaEpisodes.mediaId, mediaEpisodes.number],
          set: {
            title: ep.title ?? null,
            airedAt: ep.airedAt ? new Date(ep.airedAt) : null,
            synopsis: ep.synopsis ?? null,
          },
        })
        .run();
      episodesUpserted++;
    }
    const nums = rec.episodes.map((e) => e.number);
    db.delete(mediaEpisodes)
      .where(and(eq(mediaEpisodes.mediaId, row.id), notInArray(mediaEpisodes.number, nums)))
      .run();
  }

  let relationsLinked = 0;
  let relationsStaged = 0;
  for (const rel of rec.relations ?? []) {
    const target = db
      .select()
      .from(media)
      .where(and(eq(media.providerSource, rec.providerSource), eq(media.providerId, rel.providerId)))
      .get();
    if (target) {
      db.insert(mediaRelations)
        .values({ sourceId: row.id, targetId: target.id, relationType: rel.relationType })
        .onConflictDoNothing()
        .run();
      relationsLinked++;
    } else {
      db.insert(mediaRelationStaging)
        .values({
          providerSource: rec.providerSource,
          sourceProviderId: rec.providerId,
          targetProviderId: rel.providerId,
          relationType: rel.relationType,
          targetTitle: rel.title ?? null,
          targetType: rel.mediaType ?? null,
        })
        .onConflictDoNothing()
        .run();
      relationsStaged++;
    }
  }
  resolveRelations(rec.providerSource);

  // franchise/series collection (TMDB belongs_to_collection & future sources)
  if (rec.collection) {
    const col = db
      .insert(collections)
      .values({
        providerSource: rec.providerSource,
        providerId: rec.collection.providerId,
        title: rec.collection.title,
        coverUrl: rec.collection.coverUrl ?? null,
      })
      .onConflictDoUpdate({
        target: [collections.providerSource, collections.providerId],
        set: { title: rec.collection.title, coverUrl: rec.collection.coverUrl ?? null },
      })
      .returning()
      .get();
    db.insert(mediaCollections).values({ collectionId: col.id, mediaId: row.id }).onConflictDoNothing().run();
  }

  db.insert(syncState)
    .values({ provider: rec.providerSource, lastRunAt: now, lastSuccessAt: now })
    .onConflictDoUpdate({ target: syncState.provider, set: { lastRunAt: now, lastSuccessAt: now } })
    .run();

  return { mediaId: row.id, created: !existing, relationsLinked, episodesUpserted, relationsStaged };
}

/** Link staged relations whose target item now exists in the catalog. */
export function resolveRelations(providerSource?: string): number {
  const rows = providerSource
    ? db.select().from(mediaRelationStaging).where(eq(mediaRelationStaging.providerSource, providerSource)).all()
    : db.select().from(mediaRelationStaging).all();
  let linked = 0;
  for (const s of rows) {
    const src = db
      .select()
      .from(media)
      .where(and(eq(media.providerSource, s.providerSource), eq(media.providerId, s.sourceProviderId)))
      .get();
    const tgt = db
      .select()
      .from(media)
      .where(and(eq(media.providerSource, s.providerSource), eq(media.providerId, s.targetProviderId)))
      .get();
    if (src && tgt) {
      db.insert(mediaRelations)
        .values({ sourceId: src.id, targetId: tgt.id, relationType: s.relationType })
        .onConflictDoNothing()
        .run();
      db.delete(mediaRelationStaging).where(eq(mediaRelationStaging.id, s.id)).run();
      linked++;
    }
  }
  return linked;
}