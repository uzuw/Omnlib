import { NextResponse } from "next/server";
import { anilistTrending } from "@/lib/providers/anilist";
import { tmdbTrending } from "@/lib/providers/tmdb";
import { sqlite } from "@/lib/db/client";
import type { MediaRecord } from "@/lib/providers/types";
import type { SearchHit } from "@/lib/search";

export const runtime = "nodejs";

// Trending for each format (shown on the home page before you search).
export async function GET() {
  const rows = sqlite.prepare("SELECT id, provider_source AS s, provider_id AS i FROM media").all() as { id: number; s: string; i: string }[];
  const byKey = new Map(rows.map((r) => [r.s + ":" + r.i, r.id]));

  const toHit = (item: MediaRecord): SearchHit => {
    const id = byKey.get(item.providerSource + ":" + item.providerId) ?? 0;
    return {
      mediaId: id,
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
      inDb: id > 0,
    };
  };

  const [animeR, mangaR, tvR, movieR] = await Promise.allSettled([
    anilistTrending("ANIME", 10),
    anilistTrending("MANGA", 10),
    tmdbTrending("tv", 8),
    tmdbTrending("movie", 8),
  ]);
  const sec = (r: PromiseSettledResult<MediaRecord[]>) => (r.status === "fulfilled" ? r.value : []);

  return NextResponse.json({
    anime: sec(animeR).filter((i) => i.mediaType === "anime").map(toHit),
    manga: sec(mangaR).filter((i) => i.mediaType === "manga").map(toHit),
    webseries: sec(tvR).map(toHit),
    movie: sec(movieR).map(toHit),
  });
}