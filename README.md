# SiteBench

Local HTTP performance measurement and comparison for public websites. SiteBench crawls a single site under a configurable requests-per-second cap, stores named runs in SQLite, and overlays latency distributions across deployments.

## Architecture

- `@sitebench/core` — shared TypeScript library (validation, crawl orchestration, SQLite storage, comparison engine)
- `@sitebench/cli` — terminal interface
- `@sitebench/gui` — React UI with a local API server that imports the core directly (no CLI subprocess)

## Conservative defaults

| Setting | Default | Notes |
|---------|---------|-------|
| `maxPages` | 50 | Stops crawl when reached; may be omitted when `timeLimitSeconds` is set |
| `timeLimitSeconds` | none | Optional run duration limit in seconds |
| `rpsLimit` | 2 | Global cap across pages and assets |
| `workerCount` | 1 | Concurrent request workers per run |
| `requestTimeoutMs` | 30000 | Per-request ceiling |
| `connectTimeoutMs` | 10000 | Must be ≤ request timeout |
| `maxRedirects` | 5 | Redirect chain limit |
| `maxRetries` | 2 | Transient network errors only |
| `allowImages` | false | When enabled, image bodies are measured then discarded |
| `respectRobots` | true | Set false only for environments you control |

Run `pnpm --filter @sitebench/cli dev defaults` to print defaults from the CLI.

## Prerequisites

- Node.js 22.5+ (uses built-in `node:sqlite`; run with `NODE_OPTIONS='--experimental-sqlite'` on Node 22)
- pnpm 9+

## Setup

```bash
pnpm install
pnpm build
```

## CLI

```bash
# Show defaults
pnpm dev:cli defaults

# Template CRUD
pnpm dev:cli template create --name "Example" --url https://example.com
pnpm dev:cli template list
pnpm dev:cli template duplicate <template-id>
pnpm dev:cli template delete <template-id>

# Start a run
pnpm dev:cli run start --name "baseline" --template <template-id>
pnpm dev:cli run start --name "experiment" --url https://example.com --rps 1 --max-pages 10
pnpm dev:cli run start --name "timebox" --url https://example.com --no-max-pages --time-limit-seconds 60

# Run history
pnpm dev:cli run list
pnpm dev:cli run show <run-id>
pnpm dev:cli run delete <run-id>
```

Environment variables:

- `SITEBENCH_DB` — SQLite file path (default: `./sitebench.db` in the repository root)

Validation and connectivity failures exit with code 1.

## GUI

Start the API server and Vite dev UI with watch mode:

```bash
pnpm dev:gui
```

Start the built GUI and API without development watch mode:

```bash
pnpm build
pnpm start:gui
```

- Dev UI: http://localhost:5173
- Built UI: http://localhost:4173
- API: http://localhost:8787

Use `SITEBENCH_API_PORT` to move the API server. For built GUI runs, set `VITE_API_BASE` before `pnpm build` if the API is not on `http://localhost:8787`.

The GUI supports URL-backed pages at `/runs`, `/compare`, and `/templates`. It includes template management, run launch with live progress, run history/details for any run, and comparison view with overlay latency distribution, run toggles, baseline selection, and percentile deltas.

## Tests

```bash
pnpm test
pnpm typecheck
```

Core modules have fixture-based unit/integration tests. GUI pixel/style tests are intentionally omitted per MVP scope.

## Intentionally deferred (PRD out of scope)

- Browser / Core Web Vitals metrics
- Authentication, cookies, custom headers
- Automatic pass/fail thresholds
- Multi-site project management
- Import/export of run data
- Per-URL drill-down beyond aggregates
- Persisting comparison color preferences across sessions
- CI report publishing

## Database

SQLite schema stores templates, runs with immutable config snapshots, per-request measurements, and precomputed aggregates for fast comparison rendering.
