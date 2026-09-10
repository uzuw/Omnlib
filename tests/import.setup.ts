import fs from "node:fs";
import path from "node:path";

// isolation: import tests use their own fresh SQLite file
process.env.DATABASE_PATH = path.join(process.cwd(), "data", "test-import.db");
fs.rmSync(process.env.DATABASE_PATH, { force: true });
