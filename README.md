# Omnlib

> **omni-library** — one local-first library for every story. Track **anime, manga, light novels, webseries, movies and books** in one place: unified search, cross-format story graphs, a single timeline and stats dashboard, an airing calendar, and one-command imports from the trackers you already use.

![stack](https://img.shields.io/badge/Next.js%2016-TypeScript-black) ![db](https://img.shields.io/badge/SQLite-Drizzle-orange) ![pwa](https://img.shields.io/badge/PWA-offline%20capable-blue)

---

## ✨ Features

- **Six formats, one library** — anime, manga, light novels, webseries, movies and ebooks/novels, each with its own accent, shelf and semantics (episodes, chapters, `%` for films/books).
- **Own database, built from APIs** — Omnlib ETLs AniList, Kitsu (manga/manhwa fallback), TMDB, Google Books and Open Library into a local SQLite catalog with an FTS5 search index; the UI reads *your* DB, and providers are consulted only when you search, add, refresh or sync.
- **Story universe graph** — every item shows its adaptations and source material across formats (*Mushoku Tensei*: light novel ⇄ anime; anime films link to their series; TMDB franchises are grouped into **Collections**).
- **Unified everything** — one timeline of every action, one stats dashboard (12-month activity line, genre donut, completion rate), one *Coming up* calendar of episodes you track.
- **Trending before you search** — AniList + TMDB weekly trending per format on the home screen, replaced instantly by live search results.
- **Track from anywhere** — progress steppers with auto-complete, ratings, per-item refresh, and a one-command **Sync now** button (same engine as the CLI).
- **Import from other trackers** — AniList JSON, MyAnimeList XML, IMDb ratings CSV and Goodreads CSV export, resolved against providers and merged idempotently with provenance.
- **PWA** — installable, offline-capable shell (network-first for data, cache-first for assets).

## 🧰 Tech stack

| Layer | Choice |
|---|---|
| Frontend / API | Next.js 16 (App Router, TypeScript, Turbopack) |
| ORM / DB | Drizzle ORM · better-sqlite3 · FTS5 |
| Data sources | AniList (GraphQL), Kitsu (manga fallback), TMDB (REST), Google Books, Open Library |
| Styling | Tailwind v4 + custom design system |
| Tests | Vitest (offline fixture-based) |
| PWA | Web App Manifest + service worker |

## 🚀 Installation

**Prerequisites:** Node.js ≥ 20 and npm.

```bash
git clone https://github.com/uzuw/Omnlib.git
cd Omnlib
npm install
npm run db:migrate        # create the SQLite database + FTS search index
npm run dev               # http://localhost:3000
```

Optional configuration (copy `.env.example` → `.env.local`):

| Variable | Required | What it unlocks |
|---|---|---|
| `TMDB_API_KEY` | for webseries + live-action movies | Live TMDB search, weekly trending, franchise Collections |
| `GOOGLE_BOOKS_API_KEY` | recommended | Raises the (otherwise heavily throttled) Google Books quota |
| `DATABASE_PATH` | no | Override the SQLite file location (default `data/oms.db`) |
| `OMS_PORT` | no | Default port for the `omnlib` launcher (default 3000) |

## 🖥️ CLI guide

### The `omnlib` launcher (run from anywhere)

```bash
./scripts/install-omnlib.sh     # symlinks `omnlib` into ~/.local/bin (once)
```

| Command | What it does |
|---|---|
| `omnlib` / `omnlib dev` | Dev server with HMR at http://localhost:3000 (auto-creates the DB on first run) |
| `omnlib start` | Production server (auto-builds once) |
| `omnlib migrate` | (Re)create the database + search index |
| `omnlib status` | Is the app running? |
| `omnlib stop` | Stop the server on the port (Ctrl+C alternative) |
| `omnlib help` | All commands |
| `OMS_PORT=4000 omnlib` | Run on a different port |

### Library management from the terminal

While the server is **running**, `omnlib` can manage your library directly — every command is a thin client of the same HTTP API the web app uses, so the dashboard and terminal always agree.

| Command | What it does |
|---|---|
| `omnlib list [--status s] [--type t] [--json]` | List your library (filter by status/type; `--json` for machines/AI) |
| `omnlib find <q> [--type t] [--json]` | Search catalog + live providers, print provider refs |
| `omnlib add <title | provider:id> [--status s] [--type t] [--index N] [--yes] [--json]` | Search-and-add in one step, or add by ref (`anilist:21`, `kitsu:56748`, `tmdb:550`, `googlebooks:isbn`, `openlibrary:/works/…`) |
| `omnlib show <entry-id | media-id> [--json]` | Show one entry: progress, rating, notes, synopsis |
| `omnlib set <entry-id> [--status s] [--rating N] [--notes "..."]` | Update status / rating / notes |
| `omnlib progress <entry-id> <+N | -N | =N> [--json]` | Bump or set progress — auto-completes at the total (same engine as the web) |
| `omnlib rm <entry-id> [--yes]` | Remove from library (confirm prompt unless `--yes`) |
| `omnlib sync [--limit N] [--json]` | Refresh tracked items (the Sync button engine, from a terminal) |
| `omnlib import <source> <file> [--json]` | Import a tracker export (anilist/mal/imdb/goodreads) |
| `omnlib cli` | Full CLI reference |

Examples:

```bash
omnlib find "one piece"                      # find + print refs like anilist:21
omnlib add anilist:21 --status in_progress   # add by provider ref
omnlib add "steins gate" --index 2           # search, pick hit #2, add
omnlib progress 7 +1                         # watched one more episode
omnlib progress 7 =24                        # jump straight to 24 (auto-complete)
omnlib set 7 --rating 8 --notes "rewatch"
omnlib list --type anime --json | jq .       # machine-readable for scripts/AI agents
```

Env: `OMS_URL=http://host:port` overrides the local port (`OMS_PORT`, default 3000) — handy for remote servers. Single-user (acts as user 1, same as the web).

> 🤖 **AI agents:** every CLI command takes `--json` (machine-readable output, stable exit codes: 0 ok, 1 server/API error, 2 usage error). An MCP server wraps the CLI for agent clients — run `npm run mcp` (stdio) and point your client at `scripts/omnlib-mcp.ts` with `OMS_PORT` set to the running server. Tools: `list find show add set progress remove sync` (`remove` needs `yes: true`).

### npm scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / production build / production serve |
| `npm run db:generate` | Generate Drizzle migrations from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations + (re)build the FTS5 index |
| `npm run ingest -- --sync anilist:21` | Deep-ingest one item into the catalog |
| `npm run ingest -- --link` | Resolve pending relation links |
| `npm run sync -- --limit 25` | Refresh tracked/releasing items (cron-friendly) |
| `npm run find -- "mushoku tensei" light_novel` | Search providers, print ids |
| `npm run import-file anilist ~/Downloads/anilist_export.json` | Import a tracker export (direct-DB script) |
| `npm run omnlib-cli [-- <cmd>]` | Run the terminal CLI directly (used by `omnlib <cmd>`) |
| `npm run mcp` | MCP server over the CLI for AI agents (stdio) |
| `npm test` | Vitest suite (offline) |

## 🌐 Web app guide

| Page | What it is |
|---|---|
| **Discover** (/) | Trending per format, then unified live search across all providers |
| **Media page** | Story-universe graph, collection card, progress/rating/status controls, episodes |
| **Library** (/library) | Shelves per format with progress bars and filters |
| **Timeline** (/timeline) | Every action in one stream |
| **Schedule** (/schedule) | Next 14 days of episodes you track (anime + webseries) |
| **Collections** (/collections) | Franchises / trilogies (TMDB `belongs_to_collection`) |
| **Import** (/import) | Drop an AniList / MAL / IMDb / Goodreads export |
| **Stats** (/stats) | Activity line, genre donut, format & status bars, 8 key metrics |

## 📥 Importing your existing history

| Source | Where to export | Format |
|---|---|---|
| AniList | Settings → Data → Export | JSON |
| MyAnimeList | Settings → Export | XML |
| IMDb | Your Ratings → ⋮ → Export ratings | CSV |
| Goodreads | My Books → Import/Export → Export library | CSV |

Import via the web UI (`/import`) or the CLI (`npm run import-file <source> <file>`). Items are resolved to providers (AniList id / MAL via AniList / IMDb via TMDB `/find` / book ISBN via Google Books & Open Library), fetched into your catalog, and merged **idempotently** with `imported_from`/`imported_ref` provenance — existing entries are never duplicated, only filled where they have gaps, and the first import provenance wins.

## 🗂️ Project structure

```
app/             App Router pages + API route handlers
components/      Nav, ThemeToggle, SyncButton, service-worker registration
lib/db/          Drizzle schema, SQLite client, migrations
lib/providers/   AniList, Kitsu, TMDB, Google Books, Open Library clients
lib/etl/         normalize, rate-limit, ingest (upsert + relation staging), refresh
lib/import/      parsers (AniList/MAL/IMDb/Goodreads), resolution, import engine
scripts/         CLI: omnlib launcher, install, ingest, sync, find, import-file, db tooling, MCP server
tests/           offline fixture tests (vitest)
drizzle/         generated migrations
data/            SQLite database — an EMPTY copy is committed so clones boot instantly
```

## 🧪 Development

```bash
npm run db:generate   # after editing lib/db/schema.ts
npm run db:migrate    # apply migrations + rebuild FTS index
npm test              # offline fixture tests
npm run build         # production build validation
```

Rate limits are built in (per-provider token buckets, 429 back-off, overall timeouts) so syncs stay polite.

## 🧭 Roadmap (post-MVP)

**Tracker integrations**
- Trakt OAuth and AniList/MAL OAuth connect flows (beyond file import)
- Crunchyroll import/sync (watchlist + watch history via account export)
- More anime/manga trackers: Simkl, Kitsu, MangaUpdates, Anime-Planet
- More movie/TV trackers: Letterboxd (CSV import), TV Time
- More providers: MangaDex (chapters), …

**Sync & notifications**
- Cloud sync — optional encrypted SQLite backup/sync to Google Drive, so your library follows you across devices
- Push notifications for new episodes

**Stats & discovery**
- More charts (streak records, per-format ratings, yearly recap)

## ⚠️ Known limitations

- Webnovels on Wattpad/RoyalRoad have no stable free API — light novels come from AniList, commercial ebooks from Google Books/Open Library.
- IMDb has no official free API — both the import (CSV → TMDB `/find`) and any future integration work around that.
- Without `TMDB_API_KEY`, webseries/live-action movies work DB-only; Google Books without a key is heavily throttled (Open Library still covers books).
- Single-user by design (schema is `user_id`-keyed and ready for auth/multi-user later).

## 📄 License

[MIT](./LICENSE)

---

*Made for people who want every story in one library — local-first, no account required.*