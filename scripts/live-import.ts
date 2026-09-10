// live import check: posts real fixture files through /api/import
import { readFileSync } from "node:fs";

const ANI = readFileSync("tests/live/ani-export.json", "utf8");
const IMDB = readFileSync("tests/live/imdb-ratings.csv", "utf8");

async function post(source: string, content: string) {
  const res = await fetch("http://localhost:3000/api/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, content }),
  });
  const j = await res.json();
  const s = j.summary;
  console.log("[" + source + " " + res.status + "] " + (s ? "total=" + s.total + " matched=" + s.matched + " imported=" + s.imported + " unresolved=" + s.unresolved.length : "ERR " + j.error));
  for (const u of (s?.unresolved ?? []).slice(0, 3)) console.log("   ? " + u.title + " -- " + u.reason);
}

(async () => {
  await post("anilist", ANI);
  await post("anilist", ANI);
  await post("imdb", IMDB);
  await post("imdb", IMDB);
})();