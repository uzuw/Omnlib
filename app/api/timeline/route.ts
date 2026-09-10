import { NextResponse } from "next/server";
import { desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activityLog, media } from "@/lib/db/schema";
import { CURRENT_USER_ID } from "@/lib/constants";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const limit = Math.min(Number(u.searchParams.get("limit") ?? 50), 200);
  const rows = db
    .select({ log: activityLog, media: media })
    .from(activityLog)
    .leftJoin(media, eq(activityLog.mediaId, media.id))
    .where(eq(activityLog.userId, CURRENT_USER_ID))
    .orderBy(desc(activityLog.occurredAt))
    .limit(limit)
    .all();
  return NextResponse.json({
    events: rows.map((r) => ({
      id: r.log.id,
      action: r.log.action,
      value: r.log.value,
      occurredAt: r.log.occurredAt,
      media: r.media
        ? { id: r.media.id, title: r.media.title, mediaType: r.media.mediaType, coverUrl: r.media.coverUrl }
        : null,
    })),
  });
}