import { NextResponse } from "next/server";
import { PARSERS, runImport } from "@/lib/import/run";
import { SOURCE_LABEL, type ImportSource } from "@/lib/import/types";

const SOURCES = Object.keys(PARSERS) as ImportSource[];
const MAX_BYTES = 8_000_000;

export async function POST(req: Request) {
  let body: { source?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const source = body.source as ImportSource;
  if (!SOURCES.includes(source)) {
    return NextResponse.json({ error: "unknown source: " + body.source }, { status: 400 });
  }
  const content = body.content ?? "";
  if (!content.trim()) return NextResponse.json({ error: "empty export content" }, { status: 400 });
  if (content.length > MAX_BYTES) return NextResponse.json({ error: "export too large" }, { status: 413 });
  try {
    const items = PARSERS[source](content);
    if (items.length === 0) {
      return NextResponse.json({ error: "No items parsed. Expected " + SOURCE_LABEL[source] + " format." }, { status: 422 });
    }
    const summary = await runImport(items);
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json({ error: "parse failed: " + (e as Error).message }, { status: 422 });
  }
}
