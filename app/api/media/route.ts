import { NextResponse } from "next/server";
import { providers } from "@/lib/providers";
import type { MediaEpisode } from "@/lib/providers/types";
import { ingestRecord } from "@/lib/etl/ingest";
import { db } from "@/lib/db/client";
import { media, type MediaType } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// POST /api/media — persist a searched item into our own DB ("add to catalog").
export async function POST(req: Request) {
  let body: { providerSource?: string; providerId?: string; mediaType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { providerSource, providerId, mediaType } = body;
  if (!providerSource || !providerId) {
    return NextResponse.json({ error: "providerSource and providerId required" }, { status: 400 });
  }
  const provider = providers[providerSource];
  if (!provider || !provider.available) {
    return NextResponse.json({ error: `provider ${providerSource} unavailable (check API key)` }, { status: 400 });
  }
  let rec;
  try {
    rec = provider.byMediaType
      ? await provider.byMediaType(providerId, mediaType as MediaType | undefined)
      : await provider.byId(providerId);
    if (!rec) return NextResponse.json({ error: "not found at provider" }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ error: "provider error: " + (e as Error).message }, { status: 502 });
  }
  let episodes: MediaEpisode[] = [];
  if (provider.episodes) {
    try { episodes = await provider.episodes(providerId); } catch { episodes = []; }
  }
  if (episodes.length) rec.episodes = episodes;
  const out = ingestRecord(rec);
  const row = db.select().from(media).where(eq(media.id, out.mediaId)).get();
  return NextResponse.json({ mediaId: out.mediaId, created: out.created, title: rec.title, media: row });
}