// ETL CLI: warm the local catalog from provider APIs (the "own database" loop).
//   pnpm ingest --sync anilist:21          deep-ingest one item by provider:id
//   pnpm ingest --sync tmdb:95396          (pulls episodes too when possible)
//   pnpm ingest --sync openlibrary:/works/OL123W
//   pnpm ingest --sync googlebooks:abc123
//   pnpm ingest --link                      resolve staged relations
//   pnpm ingest --stats                     count catalog rows
import { anilist } from "../lib/providers/anilist";
import { tmdb } from "../lib/providers/tmdb";
import { googlebooks } from "../lib/providers/googlebooks";
import { openlibrary } from "../lib/providers/openlibrary";
import { ingestRecord, resolveRelations } from "../lib/etl/ingest";
import { db } from "../lib/db/client";
import { media, mediaRelationStaging } from "../lib/db/schema";
import type { ProviderClient } from "../lib/providers/types";

const providers: Record<string, ProviderClient> = { anilist, tmdb, googlebooks, openlibrary };

async function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--sync");
  const sync = idx >= 0 ? args[idx + 1] : undefined;

  if (args.includes("--link")) {
    console.log("resolved pending relations:", resolveRelations());
    return;
  }
  if (args.includes("--stats")) {
    console.log("media rows:", db.select().from(media).all().length);
    console.log("pending staging rows:", db.select().from(mediaRelationStaging).all().length);
    return;
  }
  if (sync) {
    const [pname, pid] = sync.split(":");
    const provider = providers[pname];
    if (!provider) throw new Error(`unknown provider ${pname} (use anilist|tmdb|googlebooks|openlibrary)`);
    const rec = await provider.byId(pid);
    if (!rec) {
      console.log(`${pname}:${pid} not found`);
      return;
    }
    const episodes = provider.episodes ? await provider.episodes(pid) : [];
    if (episodes.length) rec.episodes = episodes;
    const out = ingestRecord(rec);
    console.log(
      `ingested ${pname}:${pid} -> media#${out.mediaId} ${rec.title} created=${out.created} relationsLinked=${out.relationsLinked} staged=${out.relationsStaged} episodes=${out.episodesUpserted}`,
    );
    return;
  }
  console.log("usage: --sync provider:id | --link | --stats");
}

main().catch((e) => {
  console.error("ingest failed:", (e as Error).message);
  process.exit(1);
});