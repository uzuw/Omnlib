import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { activityLog, collections, media, mediaCollections, mediaEpisodes, mediaExternalIds, mediaRelations, userMedia } from "@/lib/db/schema";
import { CURRENT_USER_ID } from "@/lib/constants";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const mid = Number(id);
  if (!Number.isInteger(mid)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const m = db.select().from(media).where(eq(media.id, mid)).get();
  if (!m) return NextResponse.json({ error: "not in catalog" }, { status: 404 });

  const episodes = db.select().from(mediaEpisodes).where(eq(mediaEpisodes.mediaId, mid)).orderBy(mediaEpisodes.number).all();
  const extIds = db.select().from(mediaExternalIds).where(eq(mediaExternalIds.mediaId, mid)).all();
  const entry = db.select().from(userMedia).where(and(eq(userMedia.mediaId, mid), eq(userMedia.userId, CURRENT_USER_ID))).get();

  const outgoing = db
    .select({ relation: mediaRelations, target: media })
    .from(mediaRelations)
    .innerJoin(media, eq(media.id, mediaRelations.targetId))
    .where(eq(mediaRelations.sourceId, mid))
    .all();
  const incoming = db
    .select({ relation: mediaRelations, target: media })
    .from(mediaRelations)
    .innerJoin(media, eq(media.id, mediaRelations.sourceId))
    .where(eq(mediaRelations.targetId, mid))
    .all();

  const membership = db
    .select({ member: mediaCollections, collection: collections })
    .from(mediaCollections)
    .innerJoin(collections, eq(collections.id, mediaCollections.collectionId))
    .where(eq(mediaCollections.mediaId, mid))
    .all();
  const collectionInfo = membership[0]
    ? {
        collection: {
          id: membership[0].collection.id,
          title: membership[0].collection.title,
          coverUrl: membership[0].collection.coverUrl,
        },
        members: db
          .select({ member: media })
          .from(mediaCollections)
          .innerJoin(media, eq(media.id, mediaCollections.mediaId))
          .where(eq(mediaCollections.collectionId, membership[0].collection.id))
          .orderBy(media.year)
          .all()
          .map((r) => ({ id: r.member.id, title: r.member.title, mediaType: r.member.mediaType, coverUrl: r.member.coverUrl, year: r.member.year })),
      }
    : null;

  const recentLog = db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.mediaId, mid), eq(activityLog.userId, CURRENT_USER_ID)))
    .orderBy(activityLog.occurredAt)
    .limit(5)
    .all();

  return NextResponse.json({
    media: m,
    episodes,
    externalIds: extIds.map((e) => ({ provider: e.provider, externalId: e.externalId })),
    userEntry: entry ?? null,
    relations: {
      outgoing: outgoing.map((r) => ({ relationType: r.relation.relationType, target: r.target })),
      incoming: incoming.map((r) => ({ relationType: r.relation.relationType, source: r.target })),
    },
    recentActivity: recentLog,
    collection: collectionInfo,
  });
}