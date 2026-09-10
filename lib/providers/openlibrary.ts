import type { MediaRecord, ProviderClient, SearchTypeFilter } from "./types";
import { buckets, fetchWithRetry } from "../etl/ratelimit";
import { extractYear } from "../etl/normalize";

const BASE = "https://openlibrary.org";

type OlDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
};

export const coverUrl = (coverId?: number | null) =>
  coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null;

export function mapDoc(d: OlDoc): MediaRecord {
  return {
    providerSource: "openlibrary",
    providerId: d.key ?? d.title ?? "?",
    mediaType: "book",
    title: d.title ?? "Untitled",
    nativeTitle: null,
    synopsis: null,
    coverUrl: coverUrl(d.cover_i),
    bannerUrl: null,
    year: d.first_publish_year ?? null,
    status: "finished",
    genres: null,
    avgRating: null,
    creator: d.author_name?.[0] ?? null,
    externalIds: {
      openlibrary: d.key ?? "",
      ...(d.isbn?.[0] ? { isbn: d.isbn[0] } : {}),
    },
  };
}

export const openlibrary: ProviderClient = {
  name: "openlibrary",
  available: true,
  async search(query, typeFilter) {
    if (typeFilter && typeFilter !== "any" && typeFilter !== "book") return [];
    if (!query.trim()) return [];
    const params = new URLSearchParams({
      q: query.trim(),
      limit: "10",
      fields: "key,title,author_name,first_publish_year,cover_i,isbn",
    });
    const res = await fetchWithRetry(BASE + "/search.json?" + params.toString(), buckets.openlibrary);
    const json = (await res.json()) as { docs?: OlDoc[] };
    return (json.docs ?? []).map(mapDoc);
  },
  async byId(providerId) {
    // providerId is a works key like "/works/OL123W" or raw "OL123W"
    const key = providerId.startsWith("/") ? providerId : "/works/" + providerId;
    const res = await fetchWithRetry(BASE + key + ".json", buckets.openlibrary);
    const w = (await res.json()) as {
      title?: string;
      description?: string | { value?: string } | null;
      subjects?: string[];
      covers?: number[];
      authors?: { key?: string }[];
      first_publish_date?: string;
    };
    if (!w.title) return null;
    let creator: string | null = null;
    if (w.authors?.[0]?.key) {
      try {
        const a = await fetchWithRetry(BASE + w.authors[0].key + ".json", buckets.openlibrary);
        const author = (await a.json()) as { name?: string };
        creator = author.name ?? null;
      } catch {
        creator = null;
      }
    }
    return {
      providerSource: "openlibrary",
      providerId: key,
      mediaType: "book",
      title: w.title,
      nativeTitle: null,
      synopsis: typeof w.description === "string" ? w.description : w.description?.value ?? null,
      coverUrl: coverUrl(w.covers?.[0]),
      bannerUrl: null,
      year: extractYear(w.first_publish_date),
      status: "finished",
      genres: (w.subjects ?? []).slice(0, 8),
      avgRating: null,
      creator,
      externalIds: { openlibrary: key },
    };
  },
};