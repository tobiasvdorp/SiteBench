---
title: SiteBench MVP
status: draft
---

# SiteBench MVP

## Problem Statement

Teams deploying websites need a simple way to measure how HTTP performance changes between deployments without standing up browser automation, CI integrations, or cloud monitoring. Today, comparing "before and after" for the same URL often means ad-hoc curl scripts, manual spreadsheet work, or heavyweight load-testing tools that do not preserve named historical runs for visual comparison.

Developers and performance-minded operators lack a local tool that can crawl a single public site under controlled load, record repeatable named measurements over time, and overlay latency distributions so shifts between deployments are easy to see. They need something that works from both a terminal and a desktop GUI, stores results locally, and stays focused on HTTP-level timing rather than full browser metrics.

## Solution

SiteBench is a local TypeScript application with a shared core library, a CLI, and a React GUI. Users define reusable templates (start URL, crawl limits, requests-per-second cap, image fetching, timeouts), execute named runs against a single public site at a time, and persist every run with its exact configuration snapshot. The tool crawls same-origin links starting from one URL, schedules HTTP requests under a global RPS limit, measures response timings for pages and linked static assets, and stores aggregate results in SQLite.

Users compare multiple named runs visually through an overlay latency-distribution chart and percentile summary cards or table. They can toggle runs on and off, assign colors, and optionally designate a baseline run to show deltas. The MVP delivers measurement and comparison only; it does not judge pass or fail automatically.

## User Stories

### Product vocabulary and workflow

1. As a performance-minded developer, I want the app to use consistent terms (site, run, comparison, template), so that documentation, CLI output, and GUI labels all describe the same concepts.
2. As a user, I want to test one public site at a time, so that runs and comparisons stay focused on a single deployment target without multi-project complexity.
3. As a user, I want to measure the same start URL over time across deployments, so that I can see whether performance improved or regressed for a known entry point.
4. As a user, I want visual comparison without automatic pass/fail rules, so that I interpret latency shifts myself rather than relying on brittle thresholds in the MVP.

### Templates and configuration

5. As a user, I want to create saved templates with a start URL, RPS limit, crawl limits, image-fetch setting, and timeout settings, so that I can reuse a standard measurement profile.
6. As a user, I want sensible defaults for crawl limits and timeouts when I do not override them, so that a first run is safe and usable without deep configuration.
7. As a user, I want each executed run to snapshot the exact configuration used, so that historical results remain interpretable even if the template changes later.
8. As a user, I want template validation before a run starts, so that invalid URLs, limits, or timeout values fail fast with clear errors.
9. As a CLI user, I want to list, create, edit, duplicate, and delete templates from the terminal, so that I can manage configs without opening the GUI.
10. As a GUI user, I want to list, create, edit, duplicate, and delete templates in the app, so that I can manage configs without using the terminal.

### Runs and persistence

11. As a user, I want to name each run at creation time, so that comparisons use meaningful labels rather than opaque identifiers.
12. As a user, I want run timestamps recorded automatically, so that I do not have to supply date or time metadata manually.
13. As a user, I want completed runs stored in a local SQLite database, so that measurements persist across app restarts.
14. As a user, I want to list past runs for the current site, so that I can pick which measurements to compare.
15. As a user, I want to delete individual runs I no longer need, so that my local history stays manageable.
16. As a user, I want run records to include summary aggregates suitable for charts, so that the GUI can load comparisons without reprocessing raw logs on every view.

### CLI execution

17. As a CLI user, I want to start a run from a template by supplying only a run name, so that execution is quick for repeat measurements.
18. As a CLI user, I want to start a run with inline overrides for one-off experiments, so that I can deviate from a template without saving changes.
19. As a CLI user, I want live progress output during a run (pages discovered, requests completed, errors), so that I know the crawl is advancing.
20. As a CLI user, I want a non-zero exit code when a run fails to start due to validation or connectivity errors, so that scripts can detect failure.
21. As a CLI user, I want a summary printed when a run completes (request counts, error counts, key percentiles), so that I get immediate feedback without opening the GUI.

### GUI execution

22. As a GUI user, I want to start a run from a saved template by entering a run name, so that the GUI supports the same core workflow as the CLI.
23. As a GUI user, I want to monitor an in-progress run with status and counters, so that I can see crawl activity without switching to the terminal.
24. As a GUI user, I want the GUI to call the shared core directly rather than spawning CLI subprocesses, so that behavior stays consistent and responsive.
25. As a GUI user, I want every CLI-capable action available in the GUI for the MVP, so that I am not forced to use the terminal for any primary workflow.

### Crawling and same-origin policy

26. As a user, I want crawling to start from a single configured URL, so that every run has a clear entry point.
27. As a user, I want the crawler to follow only same-origin links discovered in HTML, so that the run stays within one site boundary.
28. As a user, I want a maximum page count with a sensible default, so that accidental unbounded crawls against production are unlikely.
29. As a user, I want robots.txt respected by default, so that the tool behaves responsibly toward site owners.
30. As a user, I want an option to disable robots.txt checking for environments where I control the target and accept the risk, so that testing is not blocked by overly restrictive rules when explicitly chosen.
31. As a user, I want the crawler to stop when page limits, time limits, or queue exhaustion conditions are met, so that run duration remains predictable.

### Rate limiting and concurrency

32. As a user, I want a global requests-per-second limit across the entire run, so that load on the target stays within my chosen cap.
33. As a user, I want the tool to manage concurrency internally to honor the RPS limit, so that I do not have to tune worker counts separately.
34. As a user, I want rate limiting applied consistently to page fetches and asset fetches, so that total load reflects all HTTP traffic generated by the crawl.
35. As a user, I want the scheduler to avoid burst spikes that violate the configured RPS ceiling, so that measurements reflect steady controlled load.

### Resource fetching and measurement

36. As a user, I want HTML pages measured for time-to-first-byte and total response time, so that document latency is captured.
37. As a user, I want linked CSS, JavaScript, fonts, and other static assets fetched and measured, so that page-weight performance is represented realistically.
38. As a user, I want an optional setting to download images and srcset candidates for measurement, so that image-heavy pages can be tested when I choose.
39. As a user, I want image bytes discarded after measurement when image fetching is enabled, so that local storage does not grow with binary payloads.
40. As a user, I want failed requests recorded with error type and URL, so that comparisons can reveal reliability differences between runs.
41. As a user, I want redirects followed up to a bounded depth, so that common canonical URL patterns do not break measurement.
42. As a user, I want per-request timeout settings enforced, so that hung connections do not stall the entire run indefinitely.

### Comparison and visualization

43. As a user, I want to select multiple named runs and view them in one comparison, so that I can overlay measurements from different deployments.
44. As a user, I want an overlay latency-distribution chart with a distinct color per run, so that distribution shape shifts are visible at a glance.
45. As a user, I want to show or hide individual runs on the chart, so that crowded comparisons remain readable.
46. As a user, I want percentile summary cards or a table (for example p50, p75, p90, p95, p99), so that I can read headline numbers alongside the distribution.
47. As a user, I want to optionally mark one run as a baseline, so that delta values against that run are calculated and displayed.
48. As a user, I want baseline deltas shown in the percentile summary when a baseline is selected, so that improvement or regression is quantified without automatic pass/fail.
49. As a GUI user, I want comparison views to load from stored aggregates, so that charts render quickly for typical run counts.

### Error handling and safety

50. As a user, I want unreachable start URLs to fail with a clear message before crawling begins, so that I do not wait through a doomed run.
51. As a user, I want DNS, TLS, timeout, and HTTP error statuses categorized consistently, so that error summaries are comparable across runs.
52. As a user, I want the tool to refuse authenticated or non-public URL schemes in the MVP, so that scope stays limited to already-reachable public endpoints.
53. As a user, I want partial runs preserved when stopped or interrupted where practical, so that incomplete data is not silently discarded.
54. As a user, I want warnings when crawl limits are hit before the queue empties, so that I know coverage was truncated.

### Architecture and extensibility (MVP expectations)

55. As a maintainer, I want a shared core library used by both CLI and GUI, so that measurement logic is implemented once.
56. As a maintainer, I want core modules designed as deep, testable units, so that behavior can be verified without driving the full GUI.
57. As a user, I want the MVP to remain HTTP-crawler-based without browser metrics, so that the tool stays lightweight and local-first.

## Implementation Decisions

### Architecture

- Single repository containing three surfaces: a shared TypeScript core library, a CLI entrypoint, and a React GUI. Both CLI and GUI import and invoke the core directly; the GUI does not shell out to the CLI.
- Local persistence via SQLite. The database holds templates, runs, per-run configuration snapshots, request-level measurements, error records, and precomputed aggregates used by comparison views.
- One active site context per comparison workflow in the MVP. A site is identified by its configured start URL origin; runs belong to that site.
- Public HTTP and HTTPS URLs only in the MVP. No authentication headers, cookies, login flows, or private network targets.

### Domain model

- **Site**: The website under test, represented by origin and start URL. Only one site is actively measured and compared at a time in the MVP.
- **Template**: A reusable configuration preset containing start URL, global RPS limit, max pages, image-fetch toggle, timeout values, and related crawl options. Templates are editable and versionless; runs do not mutate when templates change.
- **Run**: A named measurement execution. Requires a user-supplied name. Timestamp and full configuration snapshot are captured automatically at start. Stores status, progress metadata, aggregates, and per-request results.
- **Comparison**: A GUI-oriented view state that selects multiple runs, assigns display colors, toggles visibility, and optionally designates one baseline run for delta calculations. Comparisons are not persisted as first-class entities in the MVP; they are derived from stored runs.

### Core modules

The following deep modules form the shared core. Each exposes a narrow interface and encapsulates detailed behavior internally.

- **Template and config validation**: Validates template fields and run overrides (URL shape, positive numeric limits, timeout ranges, required name). Returns structured validation errors consumable by CLI and GUI.
- **CrawlPolicy**: Encodes same-origin link extraction rules, robots.txt respect (default on), max pages, redirect limits, and which resource types to fetch. Decides whether a discovered URL should be enqueued.
- **RequestScheduler**: Global rate limiter enforcing the configured RPS ceiling across all request types. Manages internal concurrency so that throughput approaches but does not exceed the limit. Provides a simple acquire-or-wait interface to the orchestrator.
- **HttpMeasurer**: Performs individual HTTP requests with timeouts, records timing phases (DNS/connect/TTFB/total as available), status codes, redirect chains, and byte counts. Does not persist response bodies except as needed transiently for HTML parsing and asset discovery.
- **CrawlOrchestrator**: Coordinates the crawl graph: seed queue from start URL, parse HTML for same-origin links, schedule page and asset fetches through the RequestScheduler, invoke HttpMeasurer, and emit progress events until stop conditions trigger.
- **RunRecorder**: Accepts orchestrator and measurer events, writes run lifecycle state, per-request rows, and rolling aggregates to SQLite stores. Finalizes summary statistics at run end.
- **ComparisonEngine**: Reads stored aggregates for selected runs, aligns percentile metrics, computes optional baseline deltas, and produces chart-ready series for latency distributions and summary tables.

### Crawl and load semantics

- Crawl starts at the template start URL and enqueues discovered same-origin links found in HTML `a[href]` (and equivalent navigational links). Off-origin links are ignored.
- `maxPages` has a conservative default applied when creating templates, but it may be omitted when `timeLimitSeconds` is set. Crawl stops when the page limit is reached, the time limit expires, or no new eligible URLs remain.
- `robots.txt` is fetched for the site origin and honored by default. Disabling robots checks is an explicit template option for controlled environments.
- Global RPS limit applies to all HTTP requests issued during the run (pages and assets). The RequestScheduler is the single choke point for rate control.
- Retries: transient network failures may be retried up to a small fixed count without exceeding RPS accounting fairly; permanent failures are recorded and skipped.
- Assets: CSS, JS, fonts, and linked static resources referenced by fetched pages are requested and measured. When `allowImages` is enabled, `img` and `srcset` candidates are also fetched and timed; response bodies for images are not retained after measurement.

### Storage and aggregates

- Every run stores an immutable configuration snapshot JSON blob reflecting exact settings used.
- Per-request records capture URL, resource type, status or error class, timings, and run association.
- Run-level aggregates include total requests, error counts, page count, and latency percentile summaries precomputed for GUI use.
- Templates are stored separately from runs and referenced only at execution time to build the snapshot.

### CLI and GUI contracts

- CLI commands cover template CRUD, run start (from template or overrides), run list/show/delete, and comparison summary export is not required in MVP.
- GUI surfaces mirror CLI capabilities: template management, run launch, live progress, run history, and comparison visualization.
- Both surfaces receive progress and completion events from the shared core through a subscription or callback interface defined in the core, not via process stdout parsing.

### Technology choices

- TypeScript throughout the core, CLI, and GUI.
- React for the GUI.
- SQLite via a typed data-access layer in the core (specific driver choice left to implementation).
- Charting library choice deferred to implementation; the ComparisonEngine outputs normalized data structures independent of rendering library.

## Testing Decisions

### What makes a good test

- Test external behavior through public module interfaces, not private implementation details or file layout.
- Prefer deterministic unit and integration tests with controlled HTTP fixtures (local test server or mock transport) over live internet dependencies.
- Assert on observable outcomes: validation errors, enqueue decisions, rate-limit spacing, recorded timings, stored rows, aggregate percentiles, and CLI exit codes/output text.
- Avoid testing React component styling or pixel-level chart rendering in the MVP; GUI tests are optional and not required for MVP completion.

### Modules to test

- **Template and config validation**: Valid and invalid configurations, edge values, missing run name, malformed URLs.
- **CrawlPolicy**: Same-origin filtering, robots.txt allow/disallow decisions, max page cutoff, image setting effect on asset classes.
- **RequestScheduler**: Observed request spacing under RPS limits, concurrency behavior under load, no long bursts above cap.
- **HttpMeasurer**: Timeout enforcement, status and error classification, redirect handling, timing fields populated from fixture responses.
- **CrawlOrchestrator**: End-to-end crawl against a fixture site graph respecting limits and producing expected request set.
- **RunRecorder / SQLite stores**: Schema round-trips, run lifecycle states, immutable config snapshot, aggregate persistence.
- **ComparisonEngine**: Percentile alignment across runs, baseline delta math, empty and single-run edge cases.
- **CLI**: Command parsing, validation failure exit codes, run start/list/delete happy paths against temporary SQLite database and fixture server.

### Prior art

- Greenfield repository; no existing test patterns. Establish conventions with fixture-based HTTP servers and temporary SQLite files per test suite.

## Out of Scope

- Implementing application code during this PRD session.
- Browser-driven metrics, Core Web Vitals, or headless browser rendering.
- Authentication, login flows, cookies, custom headers, or secrets in templates.
- Automated regression pass/fail thresholds or alerting.
- Persisting image or other response bodies beyond transient measurement needs.
- Multiple sites or projects managed concurrently in the MVP.
- CI report publishing, shared team dashboards, or remote storage.
- Import/export of run data (unless added in a future iteration).
- URL-level drill-down views beyond aggregate latency distribution and percentile summaries.
- Load testing across multiple start URLs or domain origins in one run.

## Further Notes

### Unresolved questions for a future revision

- Whether run data import/export should be supported alongside the local SQLite database.
- How much per-URL drill-down (slowest pages, error grouping by path) is needed beyond distribution and percentile summaries.
- Exact default values for max pages, RPS, timeouts, and retry counts (implementation should choose conservative defaults and document them).
- Whether comparison color assignments persist per user session only or are stored with run metadata.
- Extension point for browser metrics: architecture should keep HttpMeasurer and CrawlOrchestrator separable so a future browser-backed measurer could plug in without rewriting storage or comparison logic.

### Wayfinder alignment

This PRD supersedes open grilling notes in the Site Performance Comparison App Wayfinder map for MVP boundary, vocabulary, crawl semantics, storage model, visualization set, and template UX. Implementation tickets may now be derived from the modules and user stories above.
