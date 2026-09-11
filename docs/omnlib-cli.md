# Omnlib CLI — agent tool doc

> Read this file when operating the user's Omnlib library from a terminal or script.
> The CLI is a thin client of the web app's own HTTP API: dashboard and terminal always agree.

## 0. Preconditions

- The Omnlib server **must be running**. Every data command fails with exit 1
  (`cannot reach Omnlib at …`) when it is not.
- Check/fix server state first:
  - `omnlib status` — is it running?
  - `omnlib dev` (or bare `omnlib`) — start dev server (default http://localhost:3000)
  - `omnlib start` — production server. `omnlib stop` — stop it.
- Target selection: `OMS_URL=http://host:port` overrides `OMS_PORT` (default 3000).
  Always prefer `OMS_URL` when driving a remote or non-default-port server.
- Single-user app: all commands act as user 1, same as the web UI.
- Vocabulary (exact strings, validated server- and client-side):
  - status: `planned | in_progress | completed | on_hold | dropped`
  - type: `anime | manga | light_novel | webseries | movie | book` (`any` = no filter)
  - providers: `anilist | tmdb | googlebooks | openlibrary` (all lowercase)
  - refs: `provider:id`, e.g. `anilist:21`, `tmdb:550`, `openlibrary:/works/OL123W`

## 1. Exit codes

| Code | Meaning |
|---|---|
| 0 | ok (including graceful no-ops like `add` of an already-tracked item) |
| 1 | server/API error, not found, unreachable server, aborted prompt |
| 2 | usage error (bad flags, invalid enum, ambiguous pick without `--index`) |

Rule: on exit 2, re-read usage and retry with corrected args. On exit 1, read stderr —
it carries the server's error string verbatim. Never retry a 409-style
`already in library` as an error; it prints the existing entry id — use it.

## 2. Machine output

Append `--json` to any data command for single-line JSON on stdout (parse it, do not regex human tables).
Human output is a padded table / detail block; JSON shapes:

- `list --json` → `{"entries":[{"entry":{…},"media":{…}}]}`
- `find --json` → `{"query","type","count","results":[{mediaId,providerSource,providerId,mediaType,title,…}]}`.
  `mediaId > 0` means already in the local catalog; `mediaId: 0` means provider-only (needs saving before tracking).
- `add --json` → `{"entry":{…},"mediaId","title","added":true}` or `{"ok":false,"error":"already in library (entry #N …)","mediaId"}` (exit 0).
- `show --json` → `{"entry":{…},"media":{…}}`
- `set --json` → `{"entry":{…}}`
- `progress --json` → `{"entry":{…},"completed":bool}`
- `rm --json` → `{"ok":true,"removed":<entry-id>}` (prints nothing else; safe to parse)
- `sync --json` → `{"ok":[titles],"failed":[titles],"skipped":n,"lastSyncAt":…}`
- `import --json` → `{"summary":{"source","total","matched","imported","unresolved":[{title,year,reason}]}}`

## 3. Commands

### `omnlib list [--status s] [--type t] [--json]`
List tracked entries. Filter server-side with status/type. Empty library prints a hint line (exit 0).

### `omnlib find <query> [--type t] [--json]`
Search local catalog first, then live providers (providers need network + optional API keys).
Returns numbered `provider:id :: Title (year) [type]` lines, with `[in catalog #M]` markers.

### `omnlib add <title|provider:id> [--status s] [--type t] [--index N] [--yes] [--json]`
Two modes:
- **By ref** (`anilist:21`): saves to catalog if needed, then tracks. Deterministic — prefer this whenever a ref is known.
- **By title**: searches, then picks the hit. Multiple hits require disambiguation:
  single hit auto-picks; otherwise pass `--index N`, or `--yes` for hit #1.
  In non-interactive runs (no TTY) always pass `--index` or `--yes` — otherwise exit 2.
- Default `--status planned`. Idempotent: re-adding prints `already in library (entry #N …)` with exit 0.

### `omnlib show <entry-id|media-id> [--json]`
Detail view (status, progress/total, rating, notes, dates, synopsis snippet).
Accepts a media id as fallback convenience — but `set`/`progress`/`rm` take **entry ids only**.

### `omnlib set <entry-id> [--status s] [--rating N] [--notes "..."]`
Update status/rating/notes. Rating must be 0–10. At least one of the three flags is required.

### `omnlib progress <entry-id> <+N|-N|=N> [--json]`
- `+N`/`-N`: relative bump through the progress engine (same engine as the web +/– buttons).
- `=N`: absolute set (implemented as computed delta — same engine, same auto-complete rules).
- Reaching the total flips status to `completed` automatically. Movies are 0–100 scale.

### `omnlib rm <entry-id> [--yes] [--json]`
Delete by **entry id** (not media id). Without `--yes` it prompts `[y/N]` on a TTY and
refuses (exit 2) when stdin is not a TTY. No output except the result line / JSON.

### `omnlib sync [--limit N] [--json]`
Refresh tracked/releasing items from providers (same engine as the web Sync button).
Default limit 15, server caps at 40. Reports `ok / failed / skipped` title lists.

### `omnlib import <source> <export-file> [--json]`
Import a tracker export file. Working sources: `anilist` (JSON), `mal` (XML),
`imdb` (ratings CSV), `goodreads` (shelves CSV). `trakt` is accepted by the API but has
no file parser yet — it always returns `No items parsed` (OAuth flow is future work).
Merges idempotently with provenance (`imported_from`/`imported_ref`); existing entries are
never duplicated, only gap-filled. Prints the first 10 unresolved items in human mode;
full list is in `--json` (`summary.unresolved`).

## 4. Recipes (copy-paste patterns)

```bash
# health check + target a specific server
omnlib status
OMS_URL=http://192.168.1.5:3000 omnlib list --json | jq '.entries | length'

# track something new, deterministically
omnlib find "mushoku tensei" --type light_novel --json | jq '.results[] | "\(.providerSource):\(.providerId) :: \(.title)"'
omnlib add anilist:108233 --status in_progress   # by ref, no ambiguity

# ambiguous title, non-interactive: pin the hit
omnlib add "one piece" --index 2 --yes --json | jq .

# log progress
omnlib progress 7 +1            # one more episode/chapter
omnlib progress 7 =24           # jump to 24 (auto-completes at total)
omnlib set 7 --rating 8 --status completed

# refresh + import
omnlib sync --limit 25 --json | jq .
omnlib import anilist ~/Downloads/anilist_export.json --json | jq '.summary | {total, matched, imported}'
omnlib import anilist ~/Downloads/anilist_export.json --json | jq '.summary.unresolved'
```

## 5. Failure handling for agents

- `cannot reach Omnlib` (exit 1) → run `omnlib status`; start with `omnlib dev` (or `start`), then retry the original command unchanged.
- `no results for: X` (exit 1) → try `--type` variants or fewer words; provider search needs network/keys.
- `multiple matches — pick one with --index N` (exit 2) → re-run `find --json`, inspect hits, retry `add` with `--index N`.
- `no library entry for id N` (exit 1) → run `omnlib list --json` and resolve the correct **entry** id (not media id).
- `invalid --status/--type` or `rating must be 0..10` (exit 2) → fix args, retry.
- `refusing to delete without confirmation` (exit 2) → only pass `--yes` when the user (or task) explicitly authorized deletion; otherwise stop and ask.
- `import` reports `unresolved` items → report them to the user; do not fabricate catalog entries for them.
- Never parse human tables when `--json` exists. Never guess provider ids — always `find` first.
