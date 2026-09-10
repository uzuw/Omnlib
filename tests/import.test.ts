import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { activityLog, media, mediaExternalIds, userMedia } from "../lib/db/schema";
import { parseAniListJson, parseImdbCsv, parseGoodreadsCsv, parseMalXml } from "../lib/import/parsers";
import { parseCsv } from "../lib/import/csv";
import { runImport } from "../lib/import/run";

const ANI_EXPORT = JSON.stringify({
  data: { MediaListCollection: { lists: [
    { name: "Current", entries: [{ id: 1, mediaId: 21, status: "CURRENT", score: 95, progress: 12, repeat: 1, startedAt: { year: 2020, month: 1, day: 1 }, media: { id: 21, type: "ANIME", format: "TV", title: { romaji: "ONE PIECE" } } }] },
    { name: "Completed", entries: [{ id: 2, mediaId: 85470, status: "COMPLETED", score: 92, progress: 26, completedAt: { year: 2022, month: 6 }, media: { id: 85470, type: "MANGA", format: "NOVEL", title: { romaji: "Mushoku Tensei: Isekai Ittara Honki Dasu" } } }] },
  ] } },
});

const MAL_XML = `<?xml version="1.0" encoding="UTF-8"?><myanimelist><myinfo><user_id>1</user_id></myinfo><anime>
<anime><series_animedb_id>21</series_animedb_id><series_title>One Piece</series_title><my_status>1</my_status><my_score>8</my_score><my_watched_episodes>505</my_watched_episodes><my_start_date>2020-01-01</my_start_date><my_times_watched>3</my_times_watched></anime>
<anime><series_animedb_id>21</series_animedb_id><series_title>Duplicate</series_title><my_status>6</my_status><my_score>0</my_score><my_watched_episodes>0</my_watched_episodes></anime>
</anime></myanimelist>`;

const IMDB_CSV = [
  "position,const,created,modified,title,titleType,imdbRating,runtime,year,genres,numVotes,releaseDate,url,Your Rating,Date Rated",
  "1,tt0816692,2023-01-01,2023-01-01,Interstellar,movie,8.7,169,2014,Sci-Fi,1098123,2014-11-07,https://www.imdb.com/title/tt0816692/,9,2023-01-01",
  "2,tt0944947,2023-01-01,2023-01-01,Game of Thrones,tvSeries,9.2,57,2011,Fantasy,812183,2011-04-17,https://www.imdb.com/title/tt0944947/,10,2023-01-02",
  "3,tt0133093,2023-01-01,2023-01-01,The Matrix,short,8.7,0,1999,Sci-Fi,0,1999-03-31,https://www.imdb.com/title/tt0133093/,7,2023-01-03",
].join("\n");

const GOODREADS_CSV = [
  "Book Id,Title,Author,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Original Publication Year,Date Added,Exclusive Shelf,My Review,Read Count",
  "100,The Hobbit,J.R.R. Tolkien,9780547928227,9780547928227,5,4.27,... ,Paperback,300,1937,2021-05-01,read,Great read,2",
  "101,Some Unread Book,Someone,1234567890,9781234567890,0,3.5,... ,Hardcover,200,2010,2021-06-01,to-read,,0",
].join("\n");

beforeAll(async () => {
  await import("../scripts/db-migrate");
  // seed catalog rows + one external id, so resolution is offline
  const m1 = db.insert(media).values({ mediaType: "anime", title: "ONE PIECE", providerSource: "anilist", providerId: "21", status: "releasing" }).returning().get();
  const m2 = db.insert(media).values({ mediaType: "light_novel", title: "Mushoku Tensei: Isekai Ittara Honki Dasu", providerSource: "anilist", providerId: "85470", status: "finished" }).returning().get();
  db.insert(mediaExternalIds).values({ mediaId: m1.id, provider: "mal", externalId: "21" }).run();
});

describe("csv parser", () => {
  it("handles quoted fields and newlines", () => {
    const rows = parseCsv('a,"b,c","d""e"\nf,g\n');
    expect(rows).toEqual([["a", "b,c", 'd"e'], ["f", "g"]]);
  });
});

describe("anilist parser", () => {
  it("parses entries into ImportItems", () => {
    const items = parseAniListJson(ANI_EXPORT);
    expect(items).toHaveLength(2);
    expect(items[0].sourceId).toBe("21");
    expect(items[0].status).toBe("in_progress");
    expect(items[0].score).toBe(9.5);
    expect(items[0].progress).toBe(12);
    expect(items[0].mediaType).toBe("anime");
    expect(items[1].mediaType).toBe("light_novel");
    expect(items[1].status).toBe("completed");
  });
});

describe("mal parser", () => {
  it("maps statuses and discards-zero rows", () => {
    const items = parseMalXml(MAL_XML);
    expect(items[0].status).toBe("in_progress");
    expect(items[0].score).toBe(8);
    expect(items[0].progress).toBe(505);
    expect(items[0].repeat).toBe(3);
  });
});

describe("imdb + goodreads parsers", () => {
  it("parses rated CSV rows", () => {
    const items = parseImdbCsv(IMDB_CSV);
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe("Interstellar");
    expect(items[0].mediaType).toBe("movie");
    expect(items[0].score).toBe(9);
    expect(items[0].status).toBe("completed");
    expect(items[1].mediaType).toBe("webseries");
  });
  it("parses goodreads shelves", () => {
    const items = parseGoodreadsCsv(GOODREADS_CSV);
    expect(items).toHaveLength(2);
    expect(items[0].status).toBe("completed");
    expect(items[0].score).toBe(10);
    expect(items[0].extraIds?.isbn).toBe("9780547928227");
    expect(items[1].status).toBe("planned");
  });
});

describe("import engine", () => {
  it("creates entries with imported provenance, idempotent on re-run", async () => {
    const s1 = await runImport(parseAniListJson(ANI_EXPORT));
    expect(s1.total).toBe(2);
    expect(s1.matched).toBe(2);
    expect(s1.imported).toBe(2);
    const entries = db.select().from(userMedia).all();
    expect(entries).toHaveLength(2);
    const op = entries.find((e) => e.mediaId === 1);
    expect(op?.importedFrom).toBe("anilist");
    expect(op?.importedRef).toBe("anilist:21");
    expect(op?.status).toBe("in_progress");
    expect(op?.progress).toBe(12);
    expect(op?.rating).toBe(9.5);
    // re-import: no duplicates, still all matched/imported
    const s2 = await runImport(parseAniListJson(ANI_EXPORT));
    expect(s2.total).toBe(2);
    expect(db.select().from(userMedia).all()).toHaveLength(2);
    const log = db.select().from(activityLog).where(eq(activityLog.action, "imported")).all();
    expect(log.length).toBeGreaterThanOrEqual(4);
  });
  it("resolves MAL ids via external_ids without duplicating entries", async () => {
    const s = await runImport(parseMalXml(MAL_XML).filter((i) => (i.progress ?? 0) > 0));
    expect(s.matched).toBe(1);
    // media 1 was already imported from AniList — first provenance wins, no duplicate row
    const all = db.select().from(userMedia).all();
    expect(all).toHaveLength(2);
    const op = all.find((e) => e.mediaId === 1);
    expect(op?.importedFrom).toBe("anilist");
  });
});