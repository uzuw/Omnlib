// Applies drizzle migrations, then creates the FTS5 search index + triggers (idempotent).
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite, dbPathLabel } from "../lib/db/client";

migrate(db, { migrationsFolder: "./drizzle" });

// NOTE (learned): special FTS5 'delete' command only works on external-content tables.
// For a content table, maintain the index with DELETE ... WHERE rowid.
const fts = [
  `DROP TRIGGER IF EXISTS media_fts_insert`,
  `DROP TRIGGER IF EXISTS media_fts_delete`,
  `DROP TRIGGER IF EXISTS media_fts_update`,
  `DROP TABLE IF EXISTS media_fts`,
  `CREATE VIRTUAL TABLE media_fts USING fts5(
    title,
    native_title,
    synopsis,
    creator,
    tokenize = 'unicode61'
  )`,
  `CREATE TRIGGER media_fts_insert AFTER INSERT ON media BEGIN
    INSERT INTO media_fts(rowid, title, native_title, synopsis, creator)
    VALUES (new.id, new.title, coalesce(new.native_title,''), coalesce(new.synopsis,''), coalesce(new.creator,''));
  END`,
  `CREATE TRIGGER media_fts_delete AFTER DELETE ON media BEGIN
    DELETE FROM media_fts WHERE rowid = old.id;
  END`,
  `CREATE TRIGGER media_fts_update AFTER UPDATE ON media BEGIN
    DELETE FROM media_fts WHERE rowid = old.id;
    INSERT INTO media_fts(rowid, title, native_title, synopsis, creator)
    VALUES (new.id, new.title, coalesce(new.native_title,''), coalesce(new.synopsis,''), coalesce(new.creator,''));
  END`,
  // backfill index for already-existing media rows
  `INSERT INTO media_fts(rowid, title, native_title, synopsis, creator)
     SELECT id, title, coalesce(native_title,''), coalesce(synopsis,''), coalesce(creator,'') FROM media`,
];
for (const ddl of fts) sqlite.exec(ddl);

console.log("db ready:", dbPathLabel);
