import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "oms.db");

function createClient() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

// dev-HMR-safe singleton
const globalForDb = globalThis as unknown as { __omsDb?: ReturnType<typeof createClient> };
export const { sqlite, db } = globalForDb.__omsDb ?? (globalForDb.__omsDb = createClient());
export const dbPathLabel = dbPath;
