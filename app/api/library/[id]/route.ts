import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activityLog, userMedia } from "@/lib/db/schema";
import { CURRENT_USER_ID } from "@/lib/constants";
import type { LibraryStatus, ProgressUnit } from "@/lib/db/schema";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const eid = Number(id);
  const body = (await req.json()) as {
    status?: string;
    progress?: number;
    rating?: number | null;
    notes?: string | null;
    progressUnit?: string;
  };
  const existing = db.select().from(userMedia).where(and(eq(userMedia.id, eid), eq(userMedia.userId, CURRENT_USER_ID))).get();
  if (!existing) return NextResponse.json({ error: "entry not found" }, { status: 404 });

  const set: Partial<typeof userMedia.$inferInsert> = { updatedAt: new Date() };
  if (body.status !== undefined && body.status !== existing.status) {
    set.status = body.status as LibraryStatus;
    if (body.status === "in_progress" && !existing.startedAt) set.startedAt = new Date();
    if (body.status === "completed" && !existing.completedAt) set.completedAt = new Date();
  }
  if (body.progress !== undefined) set.progress = Math.max(0, body.progress);
  if (body.progressUnit !== undefined) set.progressUnit = body.progressUnit as ProgressUnit;
  if (body.rating !== undefined) set.rating = body.rating;
  if (body.notes !== undefined) set.notes = body.notes;

  const updated = db.update(userMedia).set(set).where(and(eq(userMedia.id, eid), eq(userMedia.userId, CURRENT_USER_ID))).returning().get();

  if (body.status !== undefined && body.status !== existing.status) {
    db.insert(activityLog).values({
      userId: CURRENT_USER_ID,
      mediaId: updated.mediaId,
      action: "status_change",
      value: { from: existing.status, to: body.status },
      occurredAt: new Date(),
    }).run();
  }
  if (body.rating !== undefined && body.rating !== existing.rating) {
    db.insert(activityLog).values({
      userId: CURRENT_USER_ID,
      mediaId: updated.mediaId,
      action: "rated",
      value: { rating: body.rating },
      occurredAt: new Date(),
    }).run();
  }
  return NextResponse.json({ entry: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const eid = Number(id);
  const existing = db.select().from(userMedia).where(and(eq(userMedia.id, eid), eq(userMedia.userId, CURRENT_USER_ID))).get();
  if (!existing) return NextResponse.json({ error: "entry not found" }, { status: 404 });
  db.delete(userMedia).where(and(eq(userMedia.id, eid), eq(userMedia.userId, CURRENT_USER_ID))).run();
  db.insert(activityLog).values({ userId: CURRENT_USER_ID, mediaId: existing.mediaId, action: "removed", occurredAt: new Date() }).run();
  return NextResponse.json({ ok: true });
}