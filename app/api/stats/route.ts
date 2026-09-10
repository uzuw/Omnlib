import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, sqlite } from "@/lib/db/client";
import { activityLog, media, userMedia } from "@/lib/db/schema";
import { CURRENT_USER_ID } from "@/lib/constants";

export async function GET() {
  const lib = db
    .select({ entry: userMedia, media: media })
    .from(userMedia)
    .innerJoin(media, eq(userMedia.mediaId, media.id))
    .where(eq(userMedia.userId, CURRENT_USER_ID))
    .all();

  const countsByType: Record<string, number> = {};
  const countsByStatus: Record<string, number> = {};
  let ratedTotal = 0;
  let ratedCount = 0;
  let episodesWatched = 0;
  let chaptersRead = 0;
  let completedCount = 0;
  const genres: Record<string, number> = {};

  for (const r of lib) {
    countsByType[r.media.mediaType] = (countsByType[r.media.mediaType] ?? 0) + 1;
    countsByStatus[r.entry.status] = (countsByStatus[r.entry.status] ?? 0) + 1;
    if (r.entry.rating != null) {
      ratedTotal += r.entry.rating;
      ratedCount++;
    }
    if (r.entry.progressUnit === "episode") episodesWatched += r.entry.progress;
    if (r.entry.progressUnit === "chapter") chaptersRead += r.entry.progress;
    if (r.entry.status === "completed") completedCount++;
    for (const g of r.media.genres ?? []) genres[g] = (genres[g] ?? 0) + 1;
  }

  // monthly activity: CONTIGUOUS last-12-months series (zero-filled for charting)
  const rawMonthly = (sqlite
    .prepare(
      `SELECT strftime('%Y-%m', occurred_at/1000, 'unixepoch') AS month, count(*) AS n
       FROM activity_log WHERE user_id = ? AND occurred_at >= ?
       GROUP BY month ORDER BY month`,
    )
    .all(CURRENT_USER_ID, Date.now() - 1000 * 60 * 60 * 24 * 365) as { month: string; n: number }[]);
  const byMonth = new Map(rawMonthly.map((m) => [m.month, m.n]));
  const now = new Date();
  const monthly: { month: string; label: string; n: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    monthly.push({ month: key, label: d.toLocaleString("en", { month: "short" }), n: byMonth.get(key) ?? 0 });
  }

  const totalGenres = Object.keys(genres).length;
  const completionRate = lib.length ? Math.round((completedCount / lib.length) * 100) : 0;
  const timeHours =
    (lib
      .filter((r) => r.entry.progressUnit === "episode")
      .reduce((s, r) => s + r.entry.progress * (r.media.mediaType === "anime" ? 24 : 44), 0)) / 60;

  return NextResponse.json({
    totals: { items: lib.length, completed: completedCount },
    countsByType,
    countsByStatus,
    avgRating: ratedCount ? ratedTotal / ratedCount : null,
    watched: { episodes: episodesWatched, hours: Math.round(timeHours * 10) / 10 },
    chaptersRead,
    completionRate,
    genreCount: totalGenres,
    topGenres: Object.entries(genres).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
    monthlyActivity: monthly,
  });
}