// Import engine: resolve items to catalog, upsert user_media (gaps-only), log activity.
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { activityLog, userMedia, type LibraryStatus } from "../db/schema";
import { CURRENT_USER_ID } from "../constants";
import { resolveItem } from "./resolve";
import { parseAniListJson, parseMalXml, parseImdbCsv, parseGoodreadsCsv } from "./parsers";
import type { ImportItem, ImportSource, ImportSummary } from "./types";

export const PARSERS: Record<ImportSource, (content: string) => ImportItem[]> = {
  anilist: parseAniListJson,
  mal: parseMalXml,
  imdb: parseImdbCsv,
  goodreads: parseGoodreadsCsv,
  trakt: () => [],
};

export async function runImport(items: ImportItem[]): Promise<ImportSummary> {
  const summary: ImportSummary = {
    source: items[0]?.source ?? "anilist",
    total: items.length,
    matched: 0,
    imported: 0,
    unresolved: [],
  };
  for (const item of items) {
    const outcome = await resolveItem(item);
    if (!outcome.mediaId) {
      summary.unresolved.push({ title: item.title, year: item.year ?? null, reason: outcome.reason ?? "unresolved" });
      continue;
    }
    summary.matched++;
    const impRef = item.source + ":" + item.sourceId;
    const existing = db
      .select()
      .from(userMedia)
      .where(and(eq(userMedia.userId, CURRENT_USER_ID), eq(userMedia.mediaId, outcome.mediaId)))
      .get();
    if (existing) {
      const set: Partial<typeof userMedia.$inferInsert> = { updatedAt: new Date() };
      if (existing.rating == null && item.score != null) set.rating = item.score;
      if (!existing.notes && item.notes) set.notes = item.notes;
      if (!existing.startedAt && item.startedAt) set.startedAt = new Date(item.startedAt);
      if (!existing.completedAt && item.completedAt) set.completedAt = new Date(item.completedAt);
      if (existing.status === "planned" && item.status && item.status !== "planned") {
        set.status = item.status as LibraryStatus;
        if (item.status === "in_progress" && !existing.startedAt && item.startedAt) set.startedAt = new Date(item.startedAt);
        if (item.status === "completed" && !existing.completedAt && item.completedAt) set.completedAt = new Date(item.completedAt);
      }
      if (!existing.importedFrom) set.importedFrom = item.source;
      if (!existing.importedRef) set.importedRef = impRef;
      if (Object.keys(set).length > 1) {
        db.update(userMedia).set(set).where(and(eq(userMedia.id, existing.id), eq(userMedia.userId, CURRENT_USER_ID))).run();
      }
      db.insert(activityLog).values({
        userId: CURRENT_USER_ID,
        mediaId: outcome.mediaId,
        action: "imported",
        value: { source: item.source, updated: true },
        occurredAt: new Date(),
      }).run();
    } else {
      const unit =
        item.progressUnit ??
        (item.mediaType === "movie" ? "percent" : item.mediaType === "manga" || item.mediaType === "light_novel" ? "chapter" : "episode");
      const progress = item.progress ?? (item.status === "completed" ? (unit === "percent" ? 100 : 0) : 0);
      const now = new Date();
      db.insert(userMedia).values({
        userId: CURRENT_USER_ID,
        mediaId: outcome.mediaId,
        status: (item.status ?? (progress > 0 ? "in_progress" : "planned")) as LibraryStatus,
        progress,
        progressUnit: unit,
        rating: item.score ?? null,
        startedAt: item.startedAt ? new Date(item.startedAt) : null,
        completedAt: item.completedAt || (item.status === "completed" && item.startedAt) ? new Date(item.completedAt ?? item.startedAt!) : null,
        notes: item.notes ?? null,
        rewatchCount: item.repeat ?? 0,
        importedFrom: item.source,
        importedRef: impRef,
        updatedAt: now,
      }).run();
      db.insert(activityLog).values({
        userId: CURRENT_USER_ID,
        mediaId: outcome.mediaId,
        action: "imported",
        value: { source: item.source, created: true },
        occurredAt: now,
      }).run();
    }
    summary.imported++;
  }
  return summary;
}