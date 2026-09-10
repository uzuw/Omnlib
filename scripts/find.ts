// CLI helper: search a provider and print ids — pnpm find <query> [type]
import { anilist } from "../lib/providers/anilist";
import { googlebooks } from "../lib/providers/googlebooks";
import { openlibrary } from "../lib/providers/openlibrary";

async function main() {
  const q = process.argv[2] ?? "";
  const type = (process.argv[3] ?? "any") as "any" | "light_novel" | "book";
  for (const [name, p] of [
    ["anilist", anilist],
    ["openlibrary", openlibrary],
    ["googlebooks", googlebooks],
  ] as const) {
    if (type !== "any" && name !== "anilist") continue;
    try {
      const r = name === "anilist" ? await p.search(q, type) : p.available ? await p.search(q) : [];
      for (const m of r.slice(0, 4)) {
        console.log(`${name}:${m.providerId} :: ${m.title} (${m.year}) [${m.mediaType}]`);
      }
    } catch {
      /* skip provider */
    }
  }
}
main();