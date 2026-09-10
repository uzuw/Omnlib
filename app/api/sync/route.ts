import { NextResponse } from "next/server";
import { refreshLibrary, lastSyncAt } from "@/lib/etl/refresh";

// POST /api/sync[?mediaId=123&limit=15] — pull fresh data from providers into our DB.
export async function POST(req: Request) {
  const u = new URL(req.url);
  const mediaId = u.searchParams.get("mediaId") ? Number(u.searchParams.get("mediaId")) : undefined;
  const limit = Math.min(Number(u.searchParams.get("limit") ?? 15), 40);
  if (mediaId && !Number.isInteger(mediaId)) {
    return NextResponse.json({ error: "bad mediaId" }, { status: 400 });
  }
  try {
    const result = await refreshLibrary({ mediaId, limit });
    return NextResponse.json({ ...result, lastSyncAt: lastSyncAt() });
  } catch (e) {
    return NextResponse.json({ error: "sync failed: " + (e as Error).message }, { status: 500 });
  }
}

// GET /api/sync — status: last sync time + how many tracked items need refreshing.
export async function GET() {
  const last = lastSyncAt();
  return NextResponse.json({ lastSyncAt: last ? last.toISOString() : null });
}