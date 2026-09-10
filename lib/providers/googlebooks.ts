import type { MediaRecord, ProviderClient, SearchTypeFilter } from "./types";
import { buckets, fetchWithRetry } from "../etl/ratelimit";
import { extractYear, toHttps } from "../etl/normalize";

const KEY = process.env.GOOGLE_BOOKS_API_KEY || "";
const BASE = "https://www.googleapis.com/books/v1";

type GbVolume = {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    description?: string;
    publishedDate?: string;
    pageCount?: number;
    categories?: string[];
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
};

export function mapVolume(v: GbVolume): MediaRecord {
  const info = v.volumeInfo ?? {};
  const thumb = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail;
  // upgrade thumbnail to the largest tier google serves
  const cover = thumb
    ? toHttps(thumb.replace("zoom=1", "zoom=2").replace("&edge=curl", ""))
    : null;
  const isbn = info.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier
    ?? info.industryIdentifiers?.find((i) => i.type === "ISBN_10")?.identifier;
  return {
    providerSource: "googlebooks",
    providerId: v.id,
    mediaType: "book",
    title: info.title ?? "Untitled",
    nativeTitle: null,
    synopsis: info.description ?? null,
    coverUrl: cover,
    bannerUrl: null,
    year: extractYear(info.publishedDate),
    status: "finished",
    genres: info.categories?.slice(0, 8) ?? null,
    avgRating: null,
    creator: info.authors?.length ? info.authors.join(", ") : null,
    externalIds: {
      googlebooks: v.id,
      ...(isbn ? { isbn } : {}),
    },
  };
}

export const googlebooks: ProviderClient = {
  name: "googlebooks",
  available: true,
  async search(query, typeFilter) {
    if (typeFilter && typeFilter !== "any" && typeFilter !== "book") return [];
    if (!query.trim()) return [];
    const params = new URLSearchParams({ q: query.trim(), maxResults: "10" });
    if (KEY) params.set("key", KEY);
    const res = await fetchWithRetry(BASE + "/volumes?" + params.toString(), buckets.googlebooks, KEY ? { retries: 4, on429CooldownMs: 3000 } : { retries: 0 });
    const json = (await res.json()) as { items?: GbVolume[] };
    return (json.items ?? []).map(mapVolume);
  },
  async byId(providerId) {
    const params = KEY ? "?key=" + KEY : "";
    const res = await fetchWithRetry(BASE + "/volumes/" + providerId + params, buckets.googlebooks, KEY ? { retries: 4, on429CooldownMs: 3000 } : { retries: 0 });
    const v = (await res.json()) as GbVolume;
    if (!v.id) return null;
    return mapVolume(v);
  },
};