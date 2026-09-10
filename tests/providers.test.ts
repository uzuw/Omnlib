import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapAniMedia } from "../lib/providers/anilist";
import { mapMovie, mapSearchItem } from "../lib/providers/tmdb";
import { mapVolume } from "../lib/providers/googlebooks";
import { mapDoc } from "../lib/providers/openlibrary";
import type { MediaRecord } from "../lib/providers/types";

const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/${name}`, "utf8"));

describe("anilist normalization", () => {
  it("maps search results", () => {
    const { data } = fixture("anilist-search-one-piece.json") as { data: { Page: { media: any[] } } };
    const records = data.Page.media.map(mapAniMedia);
    expect(records.length).toBeGreaterThan(0);
    const manga = records.find((r) => r.mediaType === "manga");
    expect(manga?.title).toBe("ONE PIECE");
    expect(manga?.avgRating).toBeGreaterThanOrEqual(0);
    expect(manga?.avgRating).toBeLessThanOrEqual(10);
    expect(manga?.coverUrl).toMatch(/^https:\/\//);
  });

  it("maps byId with relations + external ids", () => {
    const { data } = fixture("anilist-media-21.json") as { data: { Media: any } };
    const rec = mapAniMedia(data.Media);
    expect(rec.providerId).toBe("21");
    expect(rec.mediaType).toBe("anime");
    expect(rec.status).toBe("releasing");
    expect(rec.externalIds?.anilist).toBe("21");
    expect(rec.externalIds?.mal).toBe("21");
    expect((rec.relations ?? []).length).toBeGreaterThan(5);
    const types = new Set((rec.relations ?? []).map((r) => r.relationType));
    expect(types.has("side_story")).toBe(true);
    expect(rec.title).toMatch(/ONE PIECE/);
  });
});

describe("tmdb normalization", () => {
  it("maps webseries search item", () => {
    const { results } = fixture("tmdb-search-severance.json") as { results: any[] };
    const rec: MediaRecord = mapSearchItem(results[0]);
    expect(rec.mediaType).toBe("webseries");
    expect(rec.title).toBe("Severance");
    expect(rec.year).toBe(2022);
    expect(Math.abs((rec.avgRating ?? 0) - 8.2)).toBeLessThan(0.01);
    expect(rec.coverUrl).toMatch(/^https:\/\/image\.tmdb\.org\/t\/p\/w500/);
    expect(rec.externalIds?.tmdb).toBe("95396");
  });
});

describe("googlebooks normalization", () => {
  it("maps volume incl. isbn + https cover", () => {
    const { items } = fixture("googlebooks-search-hobbit.json") as { items: any[] };
    const rec = mapVolume(items[0]);
    expect(rec.mediaType).toBe("book");
    expect(rec.title).toBe("The Hobbit");
    expect(rec.creator).toContain("Tolkien");
    expect(rec.year).toBe(1937);
    expect(rec.externalIds?.isbn).toBe("9780547928227");
    expect(rec.coverUrl).toMatch(/^https:\/\//);
    expect(rec.coverUrl).toContain("zoom=2");
  });
});

describe("openlibrary normalization", () => {
  it("maps search doc with work key + cover", () => {
    const { docs } = fixture("openlibrary-search-hobbit.json") as { docs: any[] };
    const rec = mapDoc(docs[0]);
    expect(rec.mediaType).toBe("book");
    expect(rec.title).toMatch(/Hobbit/);
    expect(rec.providerId).toMatch(/^\/works\//);
    if (rec.coverUrl) expect(rec.coverUrl).toMatch(/^https:\/\/covers\.openlibrary\.org/);
    expect(rec.year).toBeGreaterThan(1900);
  });
});
describe("movie support", () => {
  it("maps AniList ANIME film to mediaType movie", () => {
    const rec = mapAniMedia({
      id: 999, type: "ANIME", format: "MOVIE", status: "FINISHED",
      title: { romaji: "Your Name", english: "Your Name", native: null },
      coverImage: { extraLarge: null, large: null },
    } as any);
    expect(rec.mediaType).toBe("movie");
    expect(rec.status).toBe("finished");
  });

  it("keeps TV anime as anime", () => {
    const rec = mapAniMedia({
      id: 9999, type: "ANIME", format: "TV", title: { romaji: "Frieren", english: null, native: null },
    } as any);
    expect(rec.mediaType).toBe("anime");
  });

  it("maps TMDB movie with runtime + collection", () => {
    const rec = mapMovie({
      id: 120, title: "The Lord of the Rings: The Fellowship of the Ring",
      release_date: "2001-12-19", runtime: 178, vote_average: 8.4,
      genres: [{ name: "Adventure" }, { name: "Fantasy" }],
      production_companies: [{ name: "New Line Cinema" }],
      belongs_to_collection: { id: 119, name: "The Lord of the Rings Collection", poster_path: "/o5T4rZ7mZ0vJf2ldmeG0QXlKa2n.jpg" },
    } as any);
    expect(rec.mediaType).toBe("movie");
    expect(rec.runtimeMinutes).toBe(178);
    expect(rec.year).toBe(2001);
    expect(rec.collection?.title).toBe("The Lord of the Rings Collection");
    expect(rec.collection?.providerId).toBe("119");
  });
});
