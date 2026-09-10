import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activityLog, media, userMedia } from "@/lib/db/schema";
import { CURRENT_USER_ID } from "@/lib/constants";

// POST /api/library/:id/progress { delta: number } — bump progress, auto-complete on completion.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const eid = Number(id);
  const body = (await req.json()) as { delta?: number };
  const delta = Number(body.delta ?? 1);
  if (!Number.isFinite(delta)) return NextResponse.json({ error: "delta required" }, { status: 400 });

  const entry = db.select().from(userMedia).where(and(eq(userMedia.id, eid), eq(userMedia.userId, CURRENT_USER_ID))).get();
  if (!entry) return NextResponse.json({ error: "entry not found" }, { status: 404 });

  const m = db.select().from(media).where(eq(media.id, entry.mediaId)).get();
  // movies are one-shot: treat a film as 100% (AniList reports episodes: 1 for films)
  const total =
    entry.total ?? (m?.mediaType === "movie" ? 100 : m?.episodesTotal ?? m?.chaptersTotal ?? 0);

  let progress = Math.max(0, entry.progress + delta);
  if (total > 0) progress = Math.min(progress, total);

  const now = new Date();
  const set: Partial<typeof userMedia.$inferInsert> = { progress, updatedAt: now };
  let statusChanged = false;
  if (entry.status === "planned" && progress > 0) {
    set.status = "in_progress";
    set.startedAt = entry.startedAt ?? now;
    statusChanged = true;
  }
  if (total > 0 && progress >= total && entry.status !== "completed") {
    set.status = "completed";
    set.completedAt = now;
    statusChanged = true;
  }
  const updated = db.update(userMedia).set(set).where(and(eq(userMedia.id, eid), eq(userMedia.userId, CURRENT_USER_ID))).returning().get();

  db.insert(activityLog).values({
    userId: CURRENT_USER_ID,
    mediaId: entry.mediaId,
    action: "progress_update",
    value: { delta, progress: updated.progress, completed: updated.status === "completed" },
    occurredAt: now,
  }).run();
  if (statusChanged) {
    db.insert(activityLog).values({
      userId: CURRENT_USER_ID,
      mediaId: entry.mediaId,
      action: "status_change",
      value: { from: entry.status, to: updated.status },
      occurredAt: now,
    }).run();
  }
  return NextResponse.json({ entry: updated, completed: updated.status === "completed" });
}