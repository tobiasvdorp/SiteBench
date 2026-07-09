---
title: Site Performance Comparison App
labels:
  - wayfinder:map
tracker: local-markdown
status: open
---

## Destination

A PRD plus technical architecture and implementation-ticket plan for a TypeScript/React app that locally tests an online site's performance, stores named runs, and visually compares deployments over time.

The planned MVP focuses on an HTTP crawler/load tester for the same URL over time, with same-origin traversal, configurable requests-per-second limits, optional image/srcset downloading, saved run templates, and a GUI that supports everything the CLI can do through the underlying CLI/core.

## Notes

- Planning only: this map should produce decisions and implementation-ready tickets, not app code.
- Use English for issue titles, comments, docs, branch names, PR text, and code comments.
- If subagents are used while working this map, use Composer 2.5.
- Current known decisions from charting:
  - Comparison is primarily named runs against the same URL over time.
  - Crawling starts from one URL and follows same-origin links only.
  - MVP measurement mode is HTTP crawler timings, not browser metrics.
  - Visual comparison should primarily reveal latency distribution shifts between named runs.
  - Runs and saved templates should persist in a local app database.

## Decisions so far

- **[SiteBench MVP PRD](../../prd/sitebench-mvp.md)** — Draft PRD capturing current MVP decisions: HTTP crawler/load tester (not browser metrics), product vocabulary (site / run / comparison / template), single public site at a time, same-origin crawl from one start URL, global RPS limit with internal concurrency, optional image/srcset measurement without storing bytes, robots.txt respected by default, SQLite persistence with immutable per-run config snapshots, shared TypeScript core used by CLI and GUI (no subprocess bridge), overlay latency-distribution comparison with percentile summaries and optional baseline deltas, and deep modules (CrawlPolicy, RequestScheduler, HttpMeasurer, CrawlOrchestrator, RunRecorder, ComparisonEngine, config validation).

## Not yet specified

- Whether run data needs import/export in addition to the local app database.
- How much URL-level drill-down is needed beyond the main latency-distribution comparison.
- Exact default values for max pages, RPS, timeouts, and retry counts.
- Whether comparison run colors persist across sessions or remain view-local.

## Out of scope

- Implementing the app during this Wayfinder map; implementation starts after the PRD, architecture, and ticket plan are clear.
