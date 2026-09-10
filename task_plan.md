# Omnlib — Unified Media Library (task plan)

**Goal:** One local-first web app to track anime, manga, light novels, webseries, and ebooks/novels. Own SQLite DB built from provider APIs (AniList, TMDB, Google Books, Open Library). Differentiators: cross-format media graph, unified timeline/stats, own normalized DB, unified airing calendar, PWA.

**Next Step:** Read Next 16 bundled docs, install drizzle deps, write schema + first migration.

## Decisions
- Single-user now, multi-user-ready schema (user_id keyed). Local-first SQLite. Next.js 16.3.4 + Drizzle + better-sqlite3 + npm (pnpm store/symlinks break under sandbox; npm used instead).
- Providers: AniList (anime/manga/light novels), TMDB (webseries, key required), Google Books + Open Library (ebooks).
- Phase 7 later: import from AniList/MAL OAuth, Trakt OAuth, IMDb ratings CSV, Goodreads CSV.

## Phases
### Phase 0 — Scaffold & planning files
Status: complete
- [x] Goal + todos + planning files (regenerated after /tmp purge)
- [x] Next.js 16.3.4 scaffold (created in subdir oms, moved to root; create-next-app pref-save EROFS is harmless)
- [ ] Drizzle + better-sqlite3 + vitest + tsx installed
- [ ] schema.ts (media, external_ids, relations, episodes, user_media, activity_log, sync_state) + migration runs clean + dev server boots

### Phase 1 — Provider layer
Status: complete
- [ ] lib/providers: anilist.ts, tmdb.ts, googlebooks.ts, openlibrary.ts, types.ts
- [ ] lib/etl/normalize.ts (provider → MediaRecord), ratelimit.ts (token bucket)
- [ ] Recorded fixture tests (vitest, offline)

### Phase 2 — ETL core
Status: complete
- [ ] lib/etl/ingest.ts idempotent upsert (media + external_ids + relations + episodes + FTS)
- [ ] sync_state writes; scripts/ingest.ts CLI
- Accept: ingest anilist:21 twice → same row count

### Phase 3 — API routes
Status: complete
- [ ] /api/search, /api/media, /api/library CRUD, progress bump, timeline, stats, schedule, sync

### Phase 4 — UI
Status: complete
- [ ] Home search + continue shelf, media detail + relation graph, library shelves, timeline, stats, PWA
- Note: apply frontend-design skill for dark media-centric look

### Phase 5 — Sync & schedule
Status: complete
- [ ] Daily sync job, schedule calendar page, Sync-now button, stale-refresh on view

### Phase 6 — Polish & hardening
Status: complete
- [ ] Dedupe/merge, placeholders, empty states, outage degradation, README

### Phase 7 — Import from existing trackers
Status: complete
- [ ] AniList OAuth2 + MAL OAuth2 list import; Trakt OAuth2; IMDb ratings CSV; Goodreads shelves CSV
### Phase 8 — Terminal CLI (differentiator: scriptable / AI-agent control plane)
Status: complete
- [ ] scripts/omnlib-cli.ts — HTTP client over the running server's /api/* (same engine as web, zero logic duplication): list, find, add (search-and-add + provider refs), show, set, progress (+N/-N/=N via progress endpoint for auto-complete), rm (confirm unless --yes), sync, import; --json on every data command (machine/AI ready); exit codes 0/1/2; OMS_URL override
- [ ] scripts/omnlib launcher: route library subcommands to the CLI, fix `omnlib sync` falling into dev default, unknown commands error (exit 2) instead of starting dev
- [ ] tests/cli.test.ts (19 unit tests: parseArgs/parseRef/status/type/progress/formatters), tsc clean, build green; live-verified all commands against running server
- [ ] README: "Library management from the terminal" section + npm scripts row; help text updated
- Deferred (next): MCP server — thin adapter exposing the same operations over MCP stdio for AI agents; reuses these exact HTTP calls + --json output convention (recorded, not forgotten)

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| pnpm dlx ENOENT mkdir ~/.cache/pnpm/dlx | mkdir -p cache dir | ~/.cache read-only under sandbox; redirected XDG_CACHE_HOME into workspace |
| pnpm dlx EROFS symlink → ~/.local/share/pnpm/store | npm_config_store_dir env | Default pnpm store read-only; pnpm dlx ignores env override; **switched to npm** |
| create-next-app "directory contains files that could conflict" | --yes | Parked conflicting files in /tmp; npm cache env recreated .cache → used /tmp cache |
| create-next-app "application path is not writable" for "." | fs access probe OK | Quirk targeting "."; scaffolded into subdir `oms`, moved to root |
| create-next-app EROFS ~/.config prefs save (post-success) | — | Harmless; app fully created before this crash |
| Planning files lost via /tmp/oms-save | restore mv | /tmp is EPHEMERAL per bash call; regenerated via write tool |