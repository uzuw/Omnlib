import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activityLog, media, userMedia } from "@/lib/db/schema";
import { CURRENT_USER_ID } from "@/lib/constants";
import type { LibraryStatus, ProgressUnit } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const status = u.searchParams.get("status");
  const type = u.searchParams.get("type");

  const base = db
    .select({ entry: userMedia, media: media })
    .from(userMedia)
    .innerJoin(media, eq(userMedia.mediaId, media.id))
    .where(eq(userMedia.userId, CURRENT_USER_ID));

  // apply filters after (drizzle where chaining is awkward for runtime combos)
  let rows = base.all().filter((r) => {
    if (status && r.entry.status !== status) return false;
    if (type && r.media.mediaType !== type) return false;
    return true;
  });
  rows.sort((a, b) => b.entry.updatedAt.getTime() - a.entry.updatedAt.getTime());
  return NextResponse.json({ entries: rows });
}

export async function POST(req: Request) {
  let body: {
    mediaId?: number;
    status?: string;
    progress?: number;
    progressUnit?: string;
    rating?: number | null;
    notes?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Number.isInteger(body.mediaId)) return NextResponse.json({ error: "mediaId required" }, { status: 400 });

  const exists = db.select().from(userMedia).where(and(eq(userMedia.userId, CURRENT_USER_ID), eq(userMedia.mediaId, body.mediaId as number))).get();
  if (exists) return NextResponse.json({ error: "already in library" }, { status: 409 });

  const now = new Date();
  const status = (body.status ?? "planned") as LibraryStatus;
  const row = db
    .insert(userMedia)
    .values({
      userId: CURRENT_USER_ID,
      mediaId: body.mediaId as number,
      status,
      progress: body.progress ?? 0,
      progressUnit: (body.progressUnit ?? "episode") as ProgressUnit,
      rating: body.rating ?? null,
      notes: body.notes ?? null,
      startedAt: status === "in_progress" ? now : null,
      completedAt: status === "completed" ? now : null,
      updatedAt: now,
    })
    .returning()
    .get();

  db.insert(activityLog).values({ userId: CURRENT_USER_ID, mediaId: row.mediaId, action: "added", value: { status }, occurredAt: now }).run();
  return NextResponse.json({ entry: row }, { status: 201 });
}