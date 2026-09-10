import { NextRequest, NextResponse } from "next/server";
import { searchLocal, type SearchHit } from "@/lib/search";
import { providerList } from "@/lib/providers";
import type { SearchTypeFilter } from "@/lib/providers/types";
import { sqlite } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const type = (req.nextUrl.searchParams.get("type") ?? "").trim() || null;
  const typeFilter = (type && type !== "any" ? type : undefined) as SearchTypeFilter | undefined;

  const localHits = searchLocal(q, type);
  const results: SearchHit[] = [...localHits];

  // mark every catalog item so live results can be deduped
  const known = new Set(
    (sqlite.prepare("SELECT provider_source AS s, provider_id AS i FROM media").all() as { s: string; i: string }[]).map((r) => r.s + ":" + r.i),
  );

  const needLive = q.length >= 2 && localHits.length < 6;
  if (needLive) {
    const settled = await Promise.allSettled(
      providerList()
        .filter((p) => p.available)
        .map(async (p) => ({
          source: p.name,
          items: await p.search(q, typeFilter),
        })),
    );
    for (const s of settled) {
      if (s.status !== "fulfilled") continue;
      for (const item of s.value.items) {
        if (known.has(item.providerSource + ":" + item.providerId)) continue;
        known.add(item.providerSource + ":" + item.providerId);
        results.push({
          mediaId: 0,
          providerSource: item.providerSource,
          providerId: item.providerId,
          mediaType: item.mediaType,
          title: item.title,
          nativeTitle: item.nativeTitle ?? null,
          synopsis: item.synopsis ?? null,
          coverUrl: item.coverUrl ?? null,
          year: item.year ?? null,
          status: item.status ?? null,
          genres: item.genres ?? null,
          avgRating: item.avgRating ?? null,
          episodesTotal: item.episodesTotal ?? null,
          chaptersTotal: item.chaptersTotal ?? null,
          volumesTotal: item.volumesTotal ?? null,
          creator: item.creator ?? null,
          inDb: false,
        });
      }
    }
  }

  return NextResponse.json({ query: q, type: type ?? "any", count: results.length, results });
}