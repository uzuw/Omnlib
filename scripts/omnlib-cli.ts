// Omnlib terminal CLI — manage your library from the terminal.
// Talks to a RUNNING Omnlib server (premise: daemon is up) over its own HTTP API,
// so it is the exact same code path the web dashboard uses. Every data command
// supports --json for machine/AI consumption (the foundation for a future MCP server).
//
//   npx tsx scripts/omnlib-cli.ts <command> [args]   (wired up as `omnlib <command>`)
//
// Commands: list | find | add | show | set | progress | rm | sync | import
// Exit codes: 0 ok, 1 server/API error, 2 usage error.
//
// Env: OMS_URL (full base URL, e.g. http://192.168.1.5:3000) wins over OMS_PORT (default 3000).

import { readFileSync } from "node:fs";
import * as readline from "node:readline";

// ---------------------------------------------------------------------------
// Wire types (JSON shapes the API returns; server may include more fields)
// ---------------------------------------------------------------------------

export interface EntryWire {
  id: number;
  userId: number;
  mediaId: number;
  status: string;
  progress: number;
  progressUnit: string;
  total: number | null;
  rating: number | null;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  rewatchCount: number;
  importedFrom: string | null;
  importedRef: string | null;
  updatedAt: string;
}

export interface MediaWire {
  id: number;
  mediaType: string;
  title: string;
  year: number | null;
  status: string | null;
  providerSource: string;
  providerId: string;
  episodesTotal: number | null;
  chaptersTotal: number | null;
  volumesTotal: number | null;
  synopsis: string | null;
  creator: string | null;
  avgRating: number | null;
  nativeTitle: string | null;
  coverUrl: string | null;
}

export interface HitWire {
  mediaId: number;
  providerSource: string;
  providerId: string;
  mediaType: string;
  title: string;
  nativeTitle: string | null;
  synopsis: string | null;
  coverUrl: string | null;
  year: number | null;
  status: string | null;
  genres: string[] | null;
  avgRating: number | null;
  episodesTotal: number | null;
  chaptersTotal: number | null;
  volumesTotal: number | null;
  creator: string | null;
  inDb: boolean;
}

export interface LibraryRow {
  entry: EntryWire;
  media: MediaWire;
}

export interface ImportSummaryWire {
  source: string;
  total: number;
  matched: number;
  imported: number;
  unresolved: { title: string; year: number | null; reason: string }[];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedArgs {
  command: string;
  positionals: string[];
  options: Record<string, string | boolean>;
}

export interface Ref {
  source: string;
  id: string;
}

export class CliError extends Error {
  exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested, no network)
// ---------------------------------------------------------------------------

/** Split argv into command + positionals + options. Options: --k v | --k=v | --flag. */
export function parseArgs(argv: string[]): ParsedArgs {
  // a leading flag (e.g. "--help") is not a command
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "";
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};
  if (argv[0] === "--help" || argv[0] === "-h") options["help"] = true;
  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--help" || a === "-h") {
      options["help"] = true;
      continue;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > -1) {
        options[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
      continue;
    }
    positionals.push(a);
  }
  return { command, positionals, options };
}

/** Parse "provider:id" (e.g. anilist:21, openlibrary:/works/OL123W). */
export function parseRef(s: string): Ref | null {
  const m = /^([a-z]+):(.+)$/.exec(s.trim());
  if (!m) return null;
  return { source: m[1], id: m[2] };
}

const LIBRARY_STATUSES = ["planned", "in_progress", "completed", "on_hold", "dropped"];
const MEDIA_TYPES = ["anime", "manga", "light_novel", "webseries", "movie", "book"];

export function parseStatus(s: string | boolean | undefined): string {
  if (typeof s !== "string" || !LIBRARY_STATUSES.includes(s)) {
    throw new CliError("invalid --status (planned|in_progress|completed|on_hold|dropped)", 2);
  }
  return s;
}

export function parseType(s: string | boolean | undefined): string | undefined {
  if (s === undefined || s === true) return undefined;
  if (typeof s !== "string" || s === "any") return undefined;
  if (!MEDIA_TYPES.includes(s)) throw new CliError("invalid --type (anime|manga|light_novel|webseries|movie|book)", 2);
  return s;
}

export function parseProgressArg(s: string): { mode: "delta" | "set"; value: number } {
  const m = /^([+-=])(\d+(?:\.\d+)?)$/.exec(s);
  if (!m) throw new CliError("invalid progress (use +N, -N, or =N)", 2);
  const value = Number(m[2]);
  return { mode: m[1] === "=" ? "set" : "delta", value: m[1] === "-" ? -value : value };
}

export function parseNumberFlag(v: string | boolean | undefined, name: string): number | undefined {
  if (v === undefined || v === true) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new CliError("invalid " + name + ": " + v, 2);
  return n;
}

// ---------------------------------------------------------------------------
// HTTP layer
// ---------------------------------------------------------------------------

export function baseUrl(): string {
  if (process.env.OMS_URL) return process.env.OMS_URL.replace(/\/+$/, "");
  return "http://localhost:" + (process.env.OMS_PORT || 3000);
}

async function api(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const url = baseUrl() + path;
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new CliError(
      "cannot reach Omnlib at " + baseUrl() + " — is it running?\n  start it with: omnlib dev   (or set OMS_URL for a remote server)",
    );
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg = body && typeof body.error === "string" ? body.error : "HTTP " + res.status + " " + res.statusText + " (" + path + ")";
    throw new CliError(msg);
  }
  return body ?? {};
}

function apiGet(path: string): Promise<Record<string, unknown>> {
  return api(path, { headers: { accept: "application/json" } });
}

function apiJson(path: string, method: string, payload: unknown): Promise<Record<string, unknown>> {
  return api(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function libraryRows(data: Record<string, unknown>): LibraryRow[] {
  return Array.isArray(data.entries) ? (data.entries as LibraryRow[]) : [];
}

// ---------------------------------------------------------------------------
// Formatters (pure, unit-tested)
// ---------------------------------------------------------------------------

export function formatEntries(rows: LibraryRow[]): string {
  if (!rows.length) return "library is empty — add something with: omnlib add <title>";
  const head = ["id", "media", "type", "status", "progress", "rating", "title"];
  const lines = rows.map(({ entry, media: m }) => {
    const total = entry.total ?? m.episodesTotal ?? m.chaptersTotal ?? m.volumesTotal ?? "";
    const prog = total !== "" ? entry.progress + "/" + total : String(entry.progress ?? 0);
    return [
      String(entry.id),
      String(m.id),
      m.mediaType,
      entry.status,
      prog,
      entry.rating != null ? String(entry.rating) : "—",
      m.title,
    ];
  });
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (row: string[]) => row.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  return [fmt(head), ...lines.map(fmt)].join("\n");
}

export function formatHits(hits: HitWire[]): string {
  if (!hits.length) return "no results.";
  return hits
    .map((h, i) => {
      const ref = h.providerSource + ":" + h.providerId;
      const inDb = h.mediaId > 0 ? "  [in catalog #" + h.mediaId + "]" : "";
      return "#" + (i + 1) + "  " + ref + " :: " + h.title + " (" + (h.year ?? "—") + ") [" + h.mediaType + "]" + inDb;
    })
    .join("\n");
}

export function formatDetail(entry: EntryWire, media: MediaWire): string {
  const total = entry.total ?? media.episodesTotal ?? media.chaptersTotal ?? media.volumesTotal ?? null;
  const prog = total != null && total > 0 ? entry.progress + " / " + total : String(entry.progress ?? 0);
  const lines: string[] = [];
  lines.push("#" + entry.id + "  " + media.title + "   (" + media.mediaType + (media.year ? " · " + media.year : "") + ")");
  lines.push("  provider: " + media.providerSource + ":" + media.providerId);
  lines.push("  status:   " + entry.status);
  lines.push("  progress: " + prog + (entry.progressUnit ? " " + entry.progressUnit : ""));
  if (entry.rating != null) lines.push("  rating:   " + entry.rating + "/10");
  if (entry.notes) lines.push("  notes:    " + entry.notes);
  if (entry.startedAt) lines.push("  started:  " + new Date(entry.startedAt).toISOString().slice(0, 10));
  if (entry.completedAt) lines.push("  completed:" + new Date(entry.completedAt).toISOString().slice(0, 10));
  if (media.synopsis) lines.push("  synopsis: " + media.synopsis.slice(0, 220) + (media.synopsis.length > 220 ? "…" : ""));
  return lines.join("\n");
}

export function formatSync(r: { ok: string[]; failed: string[]; skipped: number }): string {
  return "sync done: " + r.ok.length + " ok, " + r.failed.length + " failed, " + (r.skipped ?? 0) + " skipped"
    + (r.ok.length ? "\n  updated: " + r.ok.join(", ") : "")
    + (r.failed.length ? "\n  failed:  " + r.failed.join(", ") : "");
}

export function formatImport(s: ImportSummaryWire): string {
  return "source=" + s.source + " total=" + s.total + " matched=" + s.matched + " imported=" + s.imported
    + " unresolved=" + (s.unresolved?.length ?? 0);
}

// ---------------------------------------------------------------------------
// Interactive prompt (TTY only)
// ---------------------------------------------------------------------------

function promptChoice(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdList(args: ParsedArgs): Promise<number> {
  const p: string[] = [];
  const status = args.options["status"];
  const type = args.options["type"];
  if (typeof status === "string") p.push("status=" + encodeURIComponent(status));
  if (typeof type === "string") p.push("type=" + encodeURIComponent(type));
  const qs = p.length ? "?" + p.join("&") : "";
  const data = await apiGet("/api/library" + qs);
  const rows = libraryRows(data);
  if (args.options["json"]) {
    process.stdout.write(JSON.stringify({ entries: rows }) + "\n");
    return 0;
  }
  process.stdout.write(formatEntries(rows) + "\n");
  return 0;
}

async function cmdFind(args: ParsedArgs): Promise<number> {
  const q = args.positionals[0];
  if (!q) throw new CliError("usage: omnlib find <query> [--type t] [--json]", 2);
  const type = args.options["type"];
  const p = ["q=" + encodeURIComponent(q)];
  if (typeof type === "string") p.push("type=" + encodeURIComponent(type));
  const data = await apiGet("/api/search?" + p.join("&"));
  const hits = Array.isArray(data.results) ? (data.results as HitWire[]) : [];
  if (args.options["json"]) {
    process.stdout.write(JSON.stringify(data) + "\n");
    return 0;
  }
  process.stdout.write(formatHits(hits) + "\n");
  return 0;
}

/** Pick a search hit: 1 → auto; --index N → that; TTY → prompt; else error. */
async function pickHit(hits: HitWire[], args: ParsedArgs): Promise<HitWire> {
  if (hits.length === 1) return hits[0];
  const idxFlag = args.options["index"];
  if (typeof idxFlag === "string") {
    const n = Number(idxFlag);
    if (!Number.isInteger(n) || n < 1 || n > hits.length) throw new CliError("invalid --index (1.." + hits.length + ")", 2);
    return hits[n - 1];
  }
  if (args.options["yes"] || args.options["pick"] === "first") return hits[0];
  if (process.stdin.isTTY) {
    process.stdout.write(formatHits(hits) + "\n");
    const ans = await promptChoice("which one? [#, or 0 to abort] ");
    const n = Number(ans);
    if (!Number.isInteger(n) || n < 1 || n > hits.length) throw new CliError("aborted.", 1);
    return hits[n - 1];
  }
  throw new CliError("multiple matches — pick one with --index N (or --yes for the first)", 2);
}

async function cmdAdd(args: ParsedArgs): Promise<number> {
  const target = args.positionals[0];
  if (!target) throw new CliError("usage: omnlib add <title|provider:id> [--status s] [--type t] [--index N] [--yes] [--json]", 2);
  const status = args.options["status"] !== undefined ? parseStatus(args.options["status"]) : "planned";
  const type = parseType(args.options["type"]);

  const ref = parseRef(target);
  let mediaId: number;
  let title: string;
  let mediaType: string | null = null;
  if (ref) {
    const data = await apiJson("/api/media", "POST", {
      providerSource: ref.source,
      providerId: ref.id,
      mediaType: type,
    });
    mediaId = Number(data.mediaId);
    title = typeof data.title === "string" ? data.title : ref.source + ":" + ref.id;
    const m = data.media as MediaWire | undefined;
    mediaType = m?.mediaType ?? null;
  } else {
    const p = ["q=" + encodeURIComponent(target)];
    if (type) p.push("type=" + encodeURIComponent(type));
    const data = await apiGet("/api/search?" + p.join("&"));
    const hits = Array.isArray(data.results) ? (data.results as HitWire[]) : [];
    if (!hits.length) throw new CliError("no results for: " + target, 1);
    const hit = await pickHit(hits, args);
    if (hit.mediaId > 0) {
      mediaId = hit.mediaId;
      title = hit.title;
      mediaType = hit.mediaType;
    } else {
      // save-to-catalog first (same two-step as the web UI)
      const saved = await apiJson("/api/media", "POST", {
        providerSource: hit.providerSource,
        providerId: hit.providerId,
        mediaType: hit.mediaType,
      });
      mediaId = Number(saved.mediaId);
      title = typeof saved.title === "string" ? saved.title : hit.title;
      const m = saved.media as MediaWire | undefined;
      mediaType = m?.mediaType ?? hit.mediaType;
    }
  }

  let created: Record<string, unknown>;
  try {
    created = await apiJson("/api/library", "POST", { mediaId, status });
  } catch (e) {
    if (e instanceof CliError && e.message.includes("already in library")) {
      const existing = await apiGet("/api/library");
      const row = libraryRows(existing).find((r) => r.entry.mediaId === mediaId);
      const hint = row ? " (entry #" + row.entry.id + " — use omnlib show " + row.entry.id + ")" : "";
      if (args.options["json"]) {
        process.stdout.write(JSON.stringify({ ok: false, error: "already in library" + hint, mediaId }) + "\n");
      } else {
        process.stdout.write("already in library" + hint + "\n");
      }
      return 0;
    }
    throw e;
  }
  const entry = created.entry as EntryWire;
  if (args.options["json"]) {
    process.stdout.write(JSON.stringify({ entry, mediaId: entry.mediaId, title, added: true }) + "\n");
    return 0;
  }
  process.stdout.write("added #" + entry.id + "  " + title + " (" + (mediaType ?? "?") + ") — " + status + "\n");
  return 0;
}

async function cmdShow(args: ParsedArgs): Promise<number> {
  const id = Number(args.positionals[0]);
  if (!Number.isInteger(id) || id <= 0) throw new CliError("usage: omnlib show <entry-id|media-id> [--json]", 2);
  const data = await apiGet("/api/library");
  const rows = libraryRows(data);
  const row = rows.find((r) => r.entry.id === id) ?? rows.find((r) => r.media.id === id);
  if (!row) throw new CliError("no library entry for id " + id, 1);
  if (args.options["json"]) {
    process.stdout.write(JSON.stringify({ entry: row.entry, media: row.media }) + "\n");
    return 0;
  }
  process.stdout.write(formatDetail(row.entry, row.media) + "\n");
  return 0;
}

async function cmdSet(args: ParsedArgs): Promise<number> {
  const id = Number(args.positionals[0]);
  if (!Number.isInteger(id) || id <= 0) throw new CliError('usage: omnlib set <entry-id> [--status s] [--rating N] [--notes "..."]', 2);
  const payload: Record<string, unknown> = {};
  if (args.options["status"] !== undefined) payload.status = parseStatus(args.options["status"]);
  const rating = parseNumberFlag(args.options["rating"], "--rating");
  if (rating !== undefined) {
    if (rating < 0 || rating > 10) throw new CliError("rating must be 0..10", 2);
    payload.rating = rating;
  }
  if (typeof args.options["notes"] === "string") payload.notes = args.options["notes"];
  if (Object.keys(payload).length === 0) throw new CliError("nothing to set — pass --status/--rating/--notes", 2);
  const out = await apiJson("/api/library/" + id, "PATCH", payload);
  const entry = out.entry as EntryWire;
  if (args.options["json"]) {
    process.stdout.write(JSON.stringify({ entry }) + "\n");
    return 0;
  }
  process.stdout.write("updated #" + entry.id + " — " + entry.status
    + (entry.rating != null ? " · rating " + entry.rating : "")
    + (entry.notes ? " · notes set" : "") + "\n");
  return 0;
}

async function cmdProgress(args: ParsedArgs): Promise<number> {
  const id = Number(args.positionals[0]);
  const deltaArg = args.positionals[1];
  if (!Number.isInteger(id) || id <= 0 || !deltaArg) throw new CliError("usage: omnlib progress <entry-id> <+N|-N|=N> [--json]", 2);
  const { mode, value } = parseProgressArg(deltaArg);
  // Both modes go through the progress endpoint so auto-complete/status rules
  // stay in ONE place (the same engine the web +/– buttons use).
  let out: Record<string, unknown>;
  if (mode === "delta") {
    out = await apiJson("/api/library/" + id + "/progress", "POST", { delta: value });
  } else {
    const cur = await apiGet("/api/library");
    const row = libraryRows(cur).find((r) => r.entry.id === id);
    if (!row) throw new CliError("no library entry for id " + id, 1);
    const delta = value - row.entry.progress;
    out = await apiJson("/api/library/" + id + "/progress", "POST", { delta: Math.round(delta * 1000) / 1000 });
  }
  const entry = out.entry as EntryWire;
  if (args.options["json"]) {
    process.stdout.write(JSON.stringify({ entry, completed: entry.status === "completed" }) + "\n");
    return 0;
  }
  process.stdout.write("#" + entry.id + " progress " + entry.progress + (entry.status === "completed" ? " — completed ✓" : "") + "\n");
  return 0;
}

async function cmdRm(args: ParsedArgs): Promise<number> {
  const id = Number(args.positionals[0]);
  if (!Number.isInteger(id) || id <= 0) throw new CliError("usage: omnlib rm <entry-id> [--yes]", 2);
  // Quiet lookup by entry id only (DELETE takes an entry id, not a media id).
  const data = await apiGet("/api/library");
  const row = libraryRows(data).find((r) => r.entry.id === id);
  if (!row) throw new CliError("no library entry for id " + id, 1);
  if (!args.options["yes"]) {
    if (!process.stdin.isTTY) throw new CliError("refusing to delete without confirmation — pass --yes", 2);
    const ans = await promptChoice("remove entry #" + id + " from your library? [y/N] ");
    if (ans !== "y" && ans !== "Y" && ans !== "yes") {
      process.stdout.write("aborted.\n");
      return 0;
    }
  }
  await api("/api/library/" + id, { method: "DELETE" });
  if (args.options["json"]) {
    process.stdout.write(JSON.stringify({ ok: true, removed: id }) + "\n");
    return 0;
  }
  process.stdout.write("removed #" + id + " from your library\n");
  return 0;
}

async function cmdSync(args: ParsedArgs): Promise<number> {
  const limit = parseNumberFlag(args.options["limit"], "--limit");
  const qs = limit !== undefined ? "?limit=" + limit : "";
  const data = await api("/api/sync" + qs, { method: "POST" });
  if (args.options["json"]) {
    process.stdout.write(JSON.stringify(data) + "\n");
    return 0;
  }
  const r = {
    ok: Array.isArray(data.ok) ? (data.ok as string[]) : [],
    failed: Array.isArray(data.failed) ? (data.failed as string[]) : [],
    skipped: Number(data.skipped ?? 0),
  };
  process.stdout.write(formatSync(r) + "\n");
  return 0;
}

async function cmdImport(args: ParsedArgs): Promise<number> {
  const source = args.positionals[0];
  const file = args.positionals[1];
  if (!source || !file) throw new CliError("usage: omnlib import <anilist|mal|imdb|goodreads|trakt> <export-file> [--json]", 2);
  let content: string;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    throw new CliError("cannot read file: " + file, 1);
  }
  const data = await apiJson("/api/import", "POST", { source, content });
  const summary = data.summary as ImportSummaryWire | undefined;
  if (args.options["json"]) {
    process.stdout.write(JSON.stringify({ summary }) + "\n");
    return 0;
  }
  if (!summary) {
    process.stdout.write("import failed: " + String(data.error ?? "unknown error") + "\n");
    return 1;
  }
  process.stdout.write(formatImport(summary) + "\n");
  for (const u of (summary.unresolved ?? []).slice(0, 10)) {
    process.stdout.write("  ? " + u.title + " (" + (u.year ?? "—") + ") — " + u.reason + "\n");
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export const COMMANDS: Record<string, (a: ParsedArgs) => Promise<number>> = {
  list: cmdList,
  find: cmdFind,
  add: cmdAdd,
  show: cmdShow,
  set: cmdSet,
  progress: cmdProgress,
  rm: cmdRm,
  sync: cmdSync,
  import: cmdImport,
};

const USAGE = [
  "omnlib — manage your library from the terminal (server must be running)",
  "",
  "  omnlib list [--status s] [--type t] [--json]      list your library",
  "  omnlib find <q> [--type t] [--json]               search catalog + providers",
  "  omnlib add <title|provider:id> [--status s] [--type t] [--index N] [--yes] [--json]",
  "                                                   search-and-add, or add by ref (anilist:21)",
  "  omnlib show <entry-id|media-id> [--json]          show one entry",
  '  omnlib set <entry-id> [--status s] [--rating N] [--notes "..."]',
  "                                                   update status/rating/notes",
  "  omnlib progress <entry-id> <+N|-N|=N> [--json]    bump or set progress (auto-completes)",
  "  omnlib rm <entry-id> [--yes]                      remove from library",
  "  omnlib sync [--limit N] [--json]                  refresh tracked items from providers",
  "  omnlib import <source> <file> [--json]            import a tracker export (anilist|mal|imdb|goodreads|trakt)",
  "",
  "env: OMS_URL (http://host:port) overrides OMS_PORT (default 3000)",
].join("\n");

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.options["help"]) {
    process.stdout.write(USAGE + "\n");
    return 0;
  }
  if (!args.command) {
    process.stdout.write(USAGE + "\n");
    return 2;
  }
  if (args.command === "help") {
    process.stdout.write(USAGE + "\n");
    return 0;
  }
  const fn = COMMANDS[args.command];
  if (!fn) throw new CliError("unknown command: " + args.command + "\n" + USAGE, 2);
  return fn(args);
}

// run only when executed directly (not when imported by tests)
if (process.argv[1] && (process.argv[1].endsWith("omnlib-cli.ts") || process.argv[1].endsWith("omnlib-cli"))) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((e) => {
      process.stderr.write((e as Error).message + "\n");
      process.exitCode = e instanceof CliError ? e.exitCode : 1;
    });
}
