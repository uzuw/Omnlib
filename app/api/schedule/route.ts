import { NextResponse } from "next/server";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { media, mediaEpisodes, userMedia } from "@/lib/db/schema";
import { CURRENT_USER_ID } from "@/lib/constants";

// Upcoming episodes for tracked items across anime + webseries (from our own DB).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const days = Math.min(Number(u.searchParams.get("days") ?? 14), 60);
  const now = Date.now();
  const windowEnd = now + days * 86400_000;

  const trackedIds = db
    .select({ mediaId: userMedia.mediaId })
    .from(userMedia)
    .where(eq(userMedia.userId, CURRENT_USER_ID))
    .all()
    .map((r) => r.mediaId);

  if (trackedIds.length === 0) return NextResponse.json({ events: [] });

  const rows = db
    .select({ ep: mediaEpisodes, media: media })
    .from(mediaEpisodes)
    .innerJoin(media, eq(media.id, mediaEpisodes.mediaId))
    .where(
      and(
        inArray(mediaEpisodes.mediaId, trackedIds),
        gte(mediaEpisodes.airedAt, new Date(now)),
        lte(mediaEpisodes.airedAt, new Date(windowEnd)),
      ),
    )
    .orderBy(mediaEpisodes.airedAt)
    .all();

  return NextResponse.json({
    window: { from: new Date(now).toISOString(), to: new Date(windowEnd).toISOString() },
    events: rows.map((r) => ({
      mediaId: r.media.id,
      title: r.media.title,
      mediaType: r.media.mediaType,
      coverUrl: r.media.coverUrl,
      episode: r.ep.number,
      episodeTitle: r.ep.title,
      airedAt: r.ep.airedAt!.toISOString(),
    })),
  });
}