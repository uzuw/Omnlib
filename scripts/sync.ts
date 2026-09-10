// CLI wrapper of the same refresh engine the web app uses (pnpm sync).
import { refreshLibrary } from "../lib/etl/refresh";

async function main() {
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) || 20 : 20;
  console.log("refreshing tracked items from providers…");
  const r = await refreshLibrary({ limit });
  console.log(`sync done: ${r.ok.length} ok, ${r.failed.length} failed, ${r.skipped} skipped`);
  for (const t of r.ok) console.log("  ✓ " + t);
  for (const t of r.failed) console.log("  ✗ " + t);
}
main().catch((e) => {
  console.error("sync failed:", e);
  process.exit(1);
});