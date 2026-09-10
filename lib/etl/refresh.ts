// Shared "refresh" engine used by BOTH the web app (/api/sync) and scripts/sync.ts.
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { media, syncState, userMedia } from "../db/schema";
import { ingestRecord } from "./ingest";
import { anilist } from "../providers/anilist";
import { tmdb } from "../providers/tmdb";
import { googlebooks } from "../providers/googlebooks";
import { openlibrary } from "../providers/openlibrary";
import type { MediaRecord } from "../providers/types";
import { CURRENT_USER_ID } from "../constants";

const PROVIDERS: Record<
  string,
  { available: boolean; byId: (id: string) => Promise<MediaRecord | null>; episodes?: (id: string) => Promise<MediaRecord["episodes"]> }
> = { anilist, tmdb, googlebooks, openlibrary };

export interface RefreshResult {
  ok: string[];      // titles refreshed successfully
  failed: string[];  // titles that errored
  skipped: number;   // items we didn't attempt (unavailable provider / not selected)
}

/**
 * Refresh tracked items from their live providers and write results into the local DB.
 * - no mediaId: library items that are still airing (media.status = releasing) or in progress
 * - mediaId: just that one catalog item
 */
export async function refreshLibrary(opts: { mediaId?: number; limit?: number } = {}): Promise<RefreshResult> {
  const limit = opts.limit ?? 20;

  let rows: { media: typeof media.$inferSelect; entryStatus: string | null }[];
  if (opts.mediaId) {
    const m = db.select().from(media).where(eq(media.id, opts.mediaId)).get();
    rows = m ? [{ media: m, entryStatus: null }] : [];
  } else {
    rows = db
      .select({ m: media, e: userMedia })
      .from(userMedia)
      .innerJoin(media, eq(media.id, userMedia.mediaId))
      .where(eq(userMedia.userId, CURRENT_USER_ID))
      .all()
      .filter((r) => r.m.status === "releasing" || (r.e.status === "in_progress" && r.m.status !== "finished"))
      .slice(0, limit)
      .map((r) => ({ media: r.m, entryStatus: r.e.status }));
  }

  const ok: string[] = [];
  const failed: string[] = [];
  let attempted = 0;
  for (const r of rows) {
    const p = PROVIDERS[r.media.providerSource];
    if (!p || !p.available) continue;
    attempted++;
    try {
      const rec = await p.byId(r.media.providerId);
      if (!rec) continue;
      if (p.episodes) {
        try {
          const eps = await p.episodes(r.media.providerId);
          if (eps?.length) rec.episodes = eps;
        } catch { /* episode crawl optional */ }
      }
      ingestRecord(rec);
      ok.push(r.media.title);
    } catch {
      failed.push(r.media.title);
    }
  }
  return { ok, failed, skipped: rows.length - attempted };
}

/** When the most recent provider sync happened (for "last synced" UI). */
export function lastSyncAt(): Date | null {
  const row = db.select().from(syncState).orderBy(desc(syncState.lastSuccessAt)).limit(1).get();
  return row?.lastSuccessAt ?? null;
}