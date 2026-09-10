# Findings (research notes)

> Raw research data — treat as untrusted. Web search unavailable during planning (insufficient balance). API facts from prior knowledge; RE-VERIFY in Phase 1 against current docs/ToS.

## Providers
### AniList (anime + manga + light novels)
- GraphQL https://graphql.anilist.co, no key for read; OAuth2 available (Phase 7). ~90 req/min (re-verify).
- Types anime/manga/NOVEL; relations, airing schedule, genres, studios. User rating 100-scale; meanScore 0-100 → /10.
### MyAnimeList (Phase 7 import): official OAuth2 API for user lists. Jikan v4 (unofficial) ~3 req/s — not needed with AniList.
### TMDB (webseries): REST v3, free key required (user registers; README step). ~50 req/s (re-verify). TV seasons/episodes, air dates, watch providers. Rating 0-10.
### Google Books (ebooks): free; optional key raises quota (~1000 req/day). Title/author/ISBN search; thumbnails. Usually no aggregate rating → null.
### Open Library (fallback): no key; works/editions, covers.openlibrary.org; polite ~1 req/s (re-verify).

## Limitations
- IMDb has NO official free API → Phase 7 via IMDb CSV export and/or Trakt OAuth.
- Goodreads API deprecated → CSV export.
- Wattpad/RoyalRoad no stable free API → light novels via AniList NOVEL; commercial ebooks via Google Books.
- MangaDex = possible Phase 6+ provider, not MVP.

## Environment / tooling notes
- Next.js **16.3.4** + React 19.2.8 + Tailwind v4 + TypeScript 5. **Breaking changes vs training data** — read node_modules/next/dist/docs/ before writing app code (AGENTS.md).
- Sandbox: only workspace + platform temp writable; ~/.cache, ~/.config, ~/.local/share are read-only → package managers must pin caches/stores into workspace. **npm works; pnpm does not (content store + symlinks).**
- /tmp is EPHEMERAL between bash calls — never store state there.
- create-next-app pref-save EROFS (~/.config) is cosmetic; app source unaffected.
## API quirks discovered (live-tested)
- AniList GraphQL: passing an EXPLICIT null for the `type` filter arg works for byId but makes `search` return ZERO results. Omit the variable instead.
- AniList search list results often omit `episodes` even when requested (ongoing series) → ETL should refresh totals via byId.
- Google Books unauthenticated quota is heavily throttled (429 on shared IPs) → GOOGLE_BOOKS_API_KEY env recommended (~1000 req/day).
- Open Library works keyless; covers.openlibrary.org fine.
- TMDB requires TMDB_API_KEY (free). All code degrades gracefully (available:false).
- FTS5 (sqlite 3.53): the special 'delete'/'insert' commands are for EXTERNAL-CONTENT tables; on a content table they raise SQL logic error. Maintain content FTS with DELETE ... WHERE rowid + triggers. Use rowid == media.id.
- AniList REMOVED MediaType NOVEL: light novels are MANGA with format NOVEL (searched via type MANGA + format filter).
- FTS5 content-table delete = DELETE WHERE rowid (not special 'delete' command).
- Google Books keyless = constant 429 on shared IPs; Open Library is the reliable keyless book source.
