import type {
  MediaEpisode,
  MediaRecord,
  MediaRelation,
  MediaStatusNormalized,
  ProviderClient,
  RelationTypeNormalized,
  SearchTypeFilter,
} from "./types";
import type { MediaType } from "../db/schema";
import { buckets, fetchWithRetry } from "../etl/ratelimit";
import { normalizeRating100, pickCover, stripHtml } from "../etl/normalize";

const ENDPOINT = "https://graphql.anilist.co";

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const res = await fetchWithRetry(ENDPOINT, buckets.anilist, {
    method: "POST",
    // ponytail: AniList Cloudflare 403s the default undici UA — a browser UA passes
    headers: { "content-type": "application/json", accept: "application/json", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36" },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { status?: number; message?: string }[] };
  if (json.errors?.length) {
    if (json.errors[0]?.status === 404) return null;
    throw new Error(`AniList: ${json.errors[0]?.message}`);
  }
  return json.data ?? null;
}

const SEARCH_QUERY = `
query ($search: String, $type: MediaType, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(search: $search, type: $type, isAdult: false, sort: SEARCH_MATCH) {
      id idMal type format status
      title { romaji english native }
      description(asHtml: false)
      coverImage { extraLarge large }
      bannerImage
      startDate { year }
      averageScore popularity genres
      studios { nodes { name } }
      episodes chapters volumes
    }
  }
}`;

const BY_ID_QUERY = `
query ($id: Int) {
  Media(id: $id) {
    id idMal type format status isAdult
    title { romaji english native }
    description(asHtml: false)
    coverImage { extraLarge large }
    bannerImage
    startDate { year }
    averageScore popularity genres
    studios { nodes { name } }
    episodes chapters volumes
    relations { edges { relationType node { id type format status title { romaji english } } } }
    nextAiringEpisode { episode airingAt }
  }
}`;

type AniMedia = {
  id: number;
  idMal?: number | null;
  type?: "ANIME" | "MANGA" | null;
  format?: string | null;
  status?: string | null;
  isAdult?: boolean | null;
  title?: { romaji?: string | null; english?: string | null; native?: string | null } | null;
  description?: string | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
  bannerImage?: string | null;
  startDate?: { year?: number | null } | null;
  averageScore?: number | null;
  popularity?: number | null;
  genres?: string[] | null;
  studios?: { nodes?: { name?: string | null }[] | null } | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  relations?: { edges?: { relationType?: string; node?: AniMedia }[] | null } | null;
  nextAiringEpisode?: { episode?: number | null; airingAt?: number | null } | null;
};

// AniList removed NOVEL from MediaType — light novels are MANGA with format NOVEL.
function mediaTypeOf(m: { type?: string | null; format?: string | null }): MediaType | null {
  if (m.type === "ANIME") return m.format === "MOVIE" ? "movie" : "anime";
  if (m.type === "MANGA") return m.format === "NOVEL" ? "light_novel" : "manga";
  return null;
}
const STATUS_MAP: Record<string, MediaStatusNormalized> = {
  RELEASING: "releasing",
  FINISHED: "finished",
  NOT_YET_RELEASED: "upcoming",
  HIATUS: "hiatus",
  CANCELLED: "cancelled",
};
const RELATION_MAP: Record<string, RelationTypeNormalized> = {
  ADAPTATION: "adaptation",
  PREQUEL: "prequel",
  SEQUEL: "sequel",
  SIDE_STORY: "side_story",
  SPINOFF: "spinoff",
  ALTERNATIVE: "alternate",
  PARENT: "parent",
  CONTAINS: "contains",
  COMPILATION: "contains",
};

export function mapAniMedia(m: AniMedia): MediaRecord {
  const mediaType = mediaTypeOf(m) ?? "anime";
  const title = m.title?.romaji || m.title?.english || m.title?.native || "Untitled";
  const relations: MediaRelation[] = (m.relations?.edges ?? [])
    .filter((e) => e.node && RELATION_MAP[e.relationType ?? ""] && mediaTypeOf(e.node))
    .map((e) => ({
      providerId: String(e.node!.id),
      mediaType: mediaTypeOf(e.node!),
      relationType: RELATION_MAP[e.relationType ?? ""],
      title: e.node!.title?.romaji || e.node!.title?.english || null,
    }));
  const episodes: MediaEpisode[] = [];
  if (m.nextAiringEpisode?.episode && m.nextAiringEpisode.airingAt) {
    episodes.push({
      number: m.nextAiringEpisode.episode,
      airedAt: new Date(m.nextAiringEpisode.airingAt * 1000).toISOString(),
    });
  }
  return {
    providerSource: "anilist",
    providerId: String(m.id),
    mediaType,
    title,
    nativeTitle: m.title?.native ?? null,
    synopsis: stripHtml(m.description),
    coverUrl: pickCover(m.coverImage?.extraLarge, m.coverImage?.large),
    bannerUrl: m.bannerImage ?? null,
    year: m.startDate?.year ?? null,
    status: STATUS_MAP[m.status ?? ""] ?? null,
    genres: m.genres ?? null,
    avgRating: normalizeRating100(m.averageScore),
    episodesTotal: m.episodes ?? null,
    chaptersTotal: m.chapters ?? null,
    volumesTotal: m.volumes ?? null,
    creator: m.studios?.nodes?.[0]?.name ?? null,
    externalIds: { anilist: String(m.id), ...(m.idMal ? { mal: String(m.idMal) } : {}) },
    relations,
    episodes,
  };
}

function typeToAni(typeFilter: SearchTypeFilter | undefined): "ANIME" | "MANGA" | undefined {
  if (!typeFilter || typeFilter === "any") return undefined;
  if (typeFilter === "anime" || typeFilter === "movie") return "ANIME";
  if (typeFilter === "manga" || typeFilter === "light_novel") return "MANGA";
  return undefined; // webseries/book have no AniList equivalent
}

const TRENDING_QUERY = `
query ($type: MediaType, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(type: $type, sort: TRENDING_DESC, isAdult: false) {
      id idMal type format status
      title { romaji english native }
      description(asHtml: false)
      coverImage { extraLarge large }
      bannerImage
      startDate { year }
      averageScore popularity genres
      studios { nodes { name } }
      episodes chapters volumes
    }
  }
}`;

/** What AniList is excited about right now. */
export async function anilistTrending(type: "ANIME" | "MANGA", perPage = 10): Promise<MediaRecord[]> {
  const data = await gql<{ Page: { media: AniMedia[] } }>(TRENDING_QUERY, { type, perPage });
  return (data?.Page.media ?? []).map(mapAniMedia);
}

export const anilist: ProviderClient = {
  name: "anilist",
  available: true,
  async search(query, typeFilter) {
    if (!query.trim()) return [];
    const type = typeToAni(typeFilter);
    // NOTE: AniList quirk — passing an explicit null `type` acts as a filter that
    // matches nothing. Omit the key entirely when no type filter is given.
    const variables: Record<string, unknown> = { search: query.trim(), perPage: 8 };
    if (type) variables.type = type;
    const data = await gql<{ Page: { media: AniMedia[] } }>(SEARCH_QUERY, variables);
    let records = (data?.Page.media ?? []).map(mapAniMedia);
    // narrow by format: MANGA search returns manga + novels; ANIME returns TV/OVA films + movies
    if (typeFilter === "manga") records = records.filter((r) => r.mediaType === "manga");
    if (typeFilter === "light_novel") records = records.filter((r) => r.mediaType === "light_novel");
    if (typeFilter === "anime") records = records.filter((r) => r.mediaType === "anime");
    if (typeFilter === "movie") records = records.filter((r) => r.mediaType === "movie");
    return records;
  },
  async byId(providerId) {
    const data = await gql<{ Media: AniMedia }>(BY_ID_QUERY, { id: Number(providerId) });
    return data?.Media ? mapAniMedia(data.Media) : null;
  },
};