---
title: Product Vocabulary and MVP Boundary
parent: ../map.md
labels:
  - wayfinder:grilling
status: resolved
assignee: null
blocked_by: []
blocks:
  - Run Lifecycle and CLI GUI Contract
  - PRD and Architecture Assembly
---

## Question

What exact MVP promise, user workflow, and domain vocabulary should the app use for targets, named runs, deployments, templates, comparisons, crawler sessions, and results?

## Resolution

Resolved in [SiteBench MVP PRD](../../../prd/sitebench-mvp.md).

- **Vocabulary**: website under test = **site**; a single measurement execution = **run**; multiple runs viewed together = **comparison**; reusable preset = **template**.
- **MVP promise**: local HTTP crawler/load tester for one public site at a time, same start URL over time, same-origin crawl only, visual latency comparison without automatic pass/fail.
- **Run metadata**: user supplies run name only; timestamp and full config snapshot are automatic.
- **Out of MVP**: browser metrics, auth, multi-site projects, automated regression rules, storing image bytes, CI reporting.
