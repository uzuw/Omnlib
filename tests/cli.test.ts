// Unit tests for the Omnlib terminal CLI — pure helpers only (no network).
import { describe, expect, it } from "vitest";
import {
  parseArgs,
  parseRef,
  parseStatus,
  parseType,
  parseProgressArg,
  formatEntries,
  formatHits,
  formatDetail,
  formatSync,
  formatImport,
  CliError,
  type EntryWire,
  type MediaWire,
  type HitWire,
} from "../scripts/omnlib-cli";

describe("parseArgs", () => {
  it("parses command + positionals + value flags", () => {
    const a = parseArgs(["add", "one piece", "--status", "in_progress", "--type", "anime", "--json"]);
    expect(a.command).toBe("add");
    expect(a.positionals).toEqual(["one piece"]);
    expect(a.options["status"]).toBe("in_progress");
    expect(a.options["type"]).toBe("anime");
    expect(a.options["json"]).toBe(true);
  });

  it("supports --k=v form", () => {
    const a = parseArgs(["list", "--status=planned"]);
    expect(a.options["status"]).toBe("planned");
  });

  it("treats a leading --help as help, not a command", () => {
    const a = parseArgs(["--help"]);
    expect(a.command).toBe("");
    expect(a.options["help"]).toBe(true);
    const b = parseArgs(["-h"]);
    expect(b.options["help"]).toBe(true);
  });

  it("treats a flagged value as a boolean when the next token is a flag", () => {
    const a = parseArgs(["list", "--json", "--status", "planned"]);
    expect(a.options["json"]).toBe(true);
    expect(a.options["status"]).toBe("planned");
  });

  it("empty argv yields empty command", () => {
    const a = parseArgs([]);
    expect(a.command).toBe("");
    expect(a.positionals).toEqual([]);
  });
});

describe("parseRef", () => {
  it("parses provider:ref", () => {
    expect(parseRef("anilist:21")).toEqual({ source: "anilist", id: "21" });
    expect(parseRef("openlibrary:/works/OL123W")).toEqual({ source: "openlibrary", id: "/works/OL123W" });
    expect(parseRef("googlebooks:abc123")).toEqual({ source: "googlebooks", id: "abc123" });
  });

  it("rejects non-refs", () => {
    expect(parseRef("one piece")).toBeNull();
    expect(parseRef("")).toBeNull();
    expect(parseRef(":21")).toBeNull();
    expect(parseRef("ANILIST:21")).toBeNull(); // providers are lowercase
  });
});

describe("parseStatus / parseType", () => {
  it("accepts valid library statuses", () => {
    for (const s of ["planned", "in_progress", "completed", "on_hold", "dropped"]) {
      expect(parseStatus(s)).toBe(s);
    }
  });

  it("rejects invalid status with exit code 2", () => {
    expect(() => parseStatus("watching")).toThrow(CliError);
    try {
      parseStatus("watching");
    } catch (e) {
      expect((e as CliError).exitCode).toBe(2);
    }
  });

  it("parseType passes through valid types / any; rejects invalid", () => {
    expect(parseType("anime")).toBe("anime");
    expect(parseType("any")).toBeUndefined();
    expect(parseType(undefined)).toBeUndefined();
    expect(() => parseType("video")).toThrow(CliError);
  });
});

describe("parseProgressArg", () => {
  it("parses +N / -N / =N", () => {
    expect(parseProgressArg("+3")).toEqual({ mode: "delta", value: 3 });
    expect(parseProgressArg("-1")).toEqual({ mode: "delta", value: -1 });
    expect(parseProgressArg("=12")).toEqual({ mode: "set", value: 12 });
    expect(parseProgressArg("+1.5")).toEqual({ mode: "delta", value: 1.5 });
  });

  it("rejects junk with exit code 2", () => {
    expect(() => parseProgressArg("x")).toThrow(CliError);
    expect(() => parseProgressArg("5")).toThrow(CliError); // bare numbers not allowed
  });
});

describe("formatters", () => {
  const entry = (over: Partial<EntryWire> = {}): EntryWire => ({
    id: 3, userId: 1, mediaId: 7, status: "in_progress", progress: 12, progressUnit: "episode",
    total: null, rating: 8.5, startedAt: null, completedAt: null, notes: null,
    rewatchCount: 0, importedFrom: null, importedRef: null, updatedAt: "2024-01-01T00:00:00.000Z", ...over,
  });
  const media = (over: Partial<MediaWire> = {}): MediaWire => ({
    id: 7, mediaType: "anime", title: "ONE PIECE", year: 1999, status: "releasing",
    providerSource: "anilist", providerId: "21", episodesTotal: 1177, chaptersTotal: null,
    volumesTotal: null, synopsis: null, creator: null, avgRating: null, nativeTitle: null,
    coverUrl: null, ...over,
  });
  const hit = (over: Partial<HitWire> = {}): HitWire => ({
    mediaId: 0, providerSource: "anilist", providerId: "21", mediaType: "anime",
    title: "ONE PIECE", nativeTitle: null, synopsis: null, coverUrl: null, year: 1999,
    status: null, genres: null, avgRating: null, episodesTotal: null, chaptersTotal: null,
    volumesTotal: null, creator: null, inDb: false, ...over,
  });

  it("formatEntries renders a table with progress/total", () => {
    const t = formatEntries([{ entry: entry(), media: media() }]);
    expect(t).toContain("ONE PIECE");
    expect(t).toContain("12/1177");
    expect(t).toContain("in_progress");
  });

  it("formatEntries handles empty", () => {
    expect(formatEntries([])).toContain("library is empty");
  });

  it("formatHits renders numbered refs + in-catalog marker", () => {
    const hits = [
      hit(),
      hit({ providerSource: "tmdb", providerId: "550", title: "Fight Club", mediaType: "movie", mediaId: 5 }),
    ];
    const t = formatHits(hits);
    expect(t).toContain("#1");
    expect(t).toContain("#2");
    expect(t).toContain("anilist:21");
    expect(t).toContain("[in catalog #5]");
  });

  it("formatHits handles empty", () => {
    expect(formatHits([])).toBe("no results.");
  });

  it("formatDetail shows progress, rating, notes", () => {
    const d = formatDetail(
      entry({ id: 3, status: "completed", progress: 1177, rating: 10, notes: "peak",
        startedAt: "2020-01-01T00:00:00.000Z", completedAt: "2024-06-01T00:00:00.000Z" }),
      media(),
    );
    expect(d).toContain("ONE PIECE");
    expect(d).toContain("1177 / 1177");
    expect(d).toContain("rating:   10/10");
    expect(d).toContain("notes:    peak");
  });

  it("formatSync summarizes counts", () => {
    expect(formatSync({ ok: ["A"], failed: ["B"], skipped: 1 })).toContain("1 ok, 1 failed, 1 skipped");
    expect(formatSync({ ok: ["A"], failed: ["B"], skipped: 1 })).toContain("updated: A");
  });

  it("formatImport summarizes", () => {
    expect(formatImport({ source: "anilist", total: 3, matched: 2, imported: 1, unresolved: [{ title: "X", year: 1999, reason: "no" }] }))
      .toContain("total=3 matched=2 imported=1 unresolved=1");
  });
});
