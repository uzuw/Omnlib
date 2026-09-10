import { anilist } from "../lib/providers/anilist";
import { tmdb } from "../lib/providers/tmdb";
import { googlebooks } from "../lib/providers/googlebooks";
import { openlibrary } from "../lib/providers/openlibrary";

async function safe(name: string, fn: () => Promise<void>) {
  try { await fn(); } catch (e) { console.log(`[${name}] failed:`, (e as Error).message.slice(0, 200)); }
}

async function main() {
  await safe("anilist", async () => {
    const al = await anilist.search("one piece");
    console.log("== AniList search ==");
    console.log(al.slice(0, 3).map((m) => `${m.providerId} ${m.mediaType} ${m.title} (${m.year}) score=${m.avgRating}`).join("\n"));
    const one = await anilist.byId("21");
    console.log("== byId 21 == relations:", one?.relations?.length, "genres:", one?.genres?.slice(1, 4).join(","));
  });
  await safe("googlebooks", async () => {
    const gb = await googlebooks.search("hunter x hunter");
    console.log("== Google Books ==\n" + gb.slice(0, 3).map((m) => `${m.title} @${m.year} isbn=${m.externalIds?.isbn ?? "-"}`).join("\n"));
  });
  await safe("openlibrary", async () => {
    const ol = await openlibrary.search("the hobbit");
    console.log("== Open Library ==\n" + ol.slice(0, 3).map((m) => `${m.title} @${m.year} cover=${m.coverUrl?.slice(0, 50)} author=${m.creator}`).join("\n"));
  });
  await safe("tmdb", async () => {
    console.log("== TMDB available:", tmdb.available);
    if (tmdb.available) {
      const tv = await tmdb.search("severance");
      console.log(tv.slice(0, 3).map((m) => `${m.title} @${m.year}`).join("\n"));
    }
  });
  console.log("DONE");
}
main();