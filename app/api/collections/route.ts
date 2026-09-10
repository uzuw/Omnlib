import { NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { collections, media, mediaCollections } from "@/lib/db/schema";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id") ? Number(u.searchParams.get("id")) : null;
  if (id) {
    const col = db.select().from(collections).where(eq(collections.id, id)).get();
    if (!col) return NextResponse.json({ error: "collection not found" }, { status: 404 });
    const members = db
      .select({ member: media })
      .from(mediaCollections)
      .innerJoin(media, eq(media.id, mediaCollections.mediaId))
      .where(eq(mediaCollections.collectionId, id))
      .orderBy(media.year)
      .all()
      .map((r) => ({ id: r.member.id, title: r.member.title, mediaType: r.member.mediaType, coverUrl: r.member.coverUrl, year: r.member.year }));
    return NextResponse.json({ collection: { id: col.id, title: col.title, coverUrl: col.coverUrl }, members });
  }
  const rows = db
    .select({ collection: collections, memberCount: count(mediaCollections.id) })
    .from(collections)
    .leftJoin(mediaCollections, eq(mediaCollections.collectionId, collections.id))
    .groupBy(collections.id)
    .all();

  const out = rows.map((r) => {
    const cover = db
      .select({ coverUrl: media.coverUrl, title: media.title })
      .from(mediaCollections)
      .innerJoin(media, eq(media.id, mediaCollections.mediaId))
      .where(eq(mediaCollections.collectionId, r.collection.id))
      .limit(1)
      .get();
    return {
      id: r.collection.id,
      title: r.collection.title,
      coverUrl: r.collection.coverUrl ?? cover?.coverUrl ?? null,
      sampleTitle: cover?.title ?? null,
      memberCount: r.memberCount,
    };
  });
  return NextResponse.json({ collections: out.sort((a, b) => b.memberCount - a.memberCount) });
}