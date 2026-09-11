// Omnlib MCP server — exposes the library to AI agents over MCP (stdio).
// Deliberately thin: every tool shells out to scripts/omnlib-cli.ts with --json
// and returns the parsed result, so the CLI stays the single source of truth.
// Talks to a RUNNING Omnlib server via OMS_URL / OMS_PORT (same as the CLI).
//
//   npx tsx scripts/omnlib-mcp.ts   (wired up as `npm run mcp`)

import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "omnlib-cli.ts");

export interface ToolParams {
  command: string;
  positional?: string | number;
  extraPositional?: string;
  flags?: Record<string, string | number | boolean | undefined>;
}

/** Build CLI argv from tool params (pure — unit-tested). Always appends --json. */
export function buildArgs(p: ToolParams): string[] {
  const argv = [p.command];
  if (p.positional !== undefined) argv.push(String(p.positional));
  if (p.extraPositional !== undefined) argv.push(p.extraPositional);
  for (const [k, v] of Object.entries(p.flags ?? {})) {
    if (v === undefined || v === false) continue;
    if (v === true) argv.push(`--${k}`);
    else argv.push(`--${k}`, String(v));
  }
  argv.push("--json");
  return argv;
}

/** Run the CLI and return stdout (throws on non-zero exit with the CLI's stderr). */
export function runCli(argv: string[]): string {
  const r = spawnSync(process.execPath, ["--import", "tsx", CLI, ...argv], {
    encoding: "utf8",
    timeout: 90000,
    env: process.env, // passthrough OMS_URL / OMS_PORT
  });
  if (r.error) throw new Error(`failed to launch CLI: ${(r.error as Error).message}`);
  if (r.status !== 0) throw new Error(((r.stderr as string) || (r.stdout as string) || `CLI exited ${r.status}`).trim());
  return (r.stdout as string).trim();
}

function tool(name: string, params: ToolParams) {
  const out = runCli(buildArgs(params));
  try {
    return { content: [{ type: "text" as const, text: JSON.stringify(JSON.parse(out), null, 2) }] };
  } catch {
    return { content: [{ type: "text" as const, text: out || "(empty result)" }] };
  }
}

const server = new McpServer({ name: "omnlib", version: "0.1.0" });
const typeOpt = z.enum(["anime", "manga", "light_novel", "webseries", "movie", "book"]).optional();
const statusOpt = z.enum(["planned", "in_progress", "completed", "on_hold", "dropped"]).optional();

server.tool("list", "List library entries, optionally filtered.", { status: statusOpt, type: typeOpt },
  (a) => tool("list", { command: "list", flags: { status: a.status, type: a.type } }));
server.tool("find", "Search the catalog + providers for a title.", { query: z.string(), type: typeOpt },
  (a) => tool("find", { command: "find", positional: a.query, flags: { type: a.type } }));
server.tool("show", "Show one library entry by entry-id or media-id.", { id: z.number().int().positive() },
  (a) => tool("show", { command: "show", positional: a.id }));
server.tool("add", "Search-and-add a title (or add by provider:id ref) to the library.", {
  target: z.string(), status: statusOpt, type: typeOpt,
  index: z.number().int().positive().optional(), yes: z.boolean().optional(),
}, (a) => tool("add", { command: "add", positional: a.target, flags: { status: a.status, type: a.type, index: a.index, yes: a.yes } }));
server.tool("set", "Update an entry's status, rating, or notes.", {
  id: z.number().int().positive(), status: statusOpt,
  rating: z.number().min(0).max(10).optional(), notes: z.string().optional(),
}, (a) => tool("set", { command: "set", positional: a.id, flags: { status: a.status, rating: a.rating, notes: a.notes } }));
server.tool("progress", "Bump (+N/-N) or set (=N) an entry's progress.", {
  id: z.number().int().positive(), change: z.string().regex(/^[+=-]\d+(\.\d+)?$/),
}, (a) => tool("progress", { command: "progress", positional: a.id, extraPositional: a.change }));
server.tool("remove", "Remove an entry from the library. Requires explicit yes:true.", {
  id: z.number().int().positive(), yes: z.literal(true),
}, (a) => tool("remove", { command: "rm", positional: a.id, flags: { yes: a.yes } }));
server.tool("sync", "Refresh tracked items from providers.", { limit: z.number().int().positive().optional() },
  (a) => tool("sync", { command: "sync", flags: { limit: a.limit } }));

// run only when executed directly (not when imported by tests)
if (process.argv[1]?.endsWith("omnlib-mcp.ts")) {
  server.connect(new StdioServerTransport()).catch((e) => {
    process.stderr.write(String(e?.message ?? e) + "\n");
    process.exitCode = 1;
  });
}
