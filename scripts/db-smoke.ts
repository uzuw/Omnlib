import { and, eq } from "drizzle-orm";
import { db, sqlite } from "../lib/db/client";
import { media, userMedia } from "../lib/db/schema";

// idempotent: clean any leftover smoke rows first
const leftover = db.select().from(media).where(and(eq(media.providerSource, "anilist"), eq(media.providerId, "21-smoke"))).all();
for (const m of leftover) {
  db.delete(userMedia).where(eq(userMedia.mediaId, m.id)).run();
  db.delete(media).where(eq(media.id, m.id)).run();
}

const row = db.insert(media).values({
  mediaType: "anime",
  title: "One Piece",
  nativeTitle: "ワンピース",
  synopsis: "Pirates and rubber. Smoke test row.",
  year: 1999,
  status: "releasing",
  genres: ["Action", "Adventure"],
  episodesTotal: 1100,
  creator: "Toei Animation",
  providerSource: "anilist",
  providerId: "21-smoke",
}).returning().get();

const ids = (sqlite.prepare("SELECT rowid AS media_id FROM media_fts WHERE media_fts MATCH ?").all("rubber OR pirates") as { media_id: number }[]).map((r) => r.media_id);

db.insert(userMedia).values({ userId: 1, mediaId: row.id, status: "in_progress", progress: 5, progressUnit: "episode", total: row.episodesTotal ?? 0 }).run();
const libCount = db.select().from(userMedia).where(eq(userMedia.userId, 1)).all().length;

console.log("media inserted id:", row.id);
console.log("FTS match found:", ids.includes(row.id) ? "YES" : "NO");
console.log("library rows:", libCount);

db.delete(userMedia).where(eq(userMedia.mediaId, row.id)).run();
db.delete(media).where(eq(media.id, row.id)).run();
console.log("cleaned; media rows:", db.select().from(media).all().length);
