// CLI: import a tracker export file — pnpm import-file <source> <file>
//   sources: anilist | mal | imdb | goodreads
import { readFileSync } from "node:fs";
import { PARSERS, runImport } from "../lib/import/run";

async function main() {
  const source = process.argv[2] as "anilist" | "mal" | "imdb" | "goodreads";
  const file = process.argv[3];
  if (!source || !file || !PARSERS[source]) {
    console.log("usage: pnpm import-file <anilist|mal|imdb|goodreads> <export-file>");
    process.exit(1);
  }
  const content = readFileSync(file, "utf8");
  const items = PARSERS[source](content);
  console.log("parsed " + items.length + " items from " + file);
  const s = await runImport(items);
  console.log(
    "source=" + s.source + " total=" + s.total + " matched=" + s.matched + " imported=" + s.imported + " unresolved=" + s.unresolved.length,
  );
  for (const u of s.unresolved.slice(0, 25)) console.log("  ? " + u.title + " (" + (u.year ?? "—") + ") — " + u.reason);
}
main().catch((e) => { console.error("import failed:", e); process.exit(1); });