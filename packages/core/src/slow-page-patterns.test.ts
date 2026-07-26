import { describe, expect, it } from "vitest";
import { analyzeSlowPages, computeSlowPageThreshold } from "./slow-page-patterns.js";
import type { RequestRecord } from "./types.js";

function page(
  id: string,
  url: string,
  ttfbMs: number,
  totalMs: number,
  overrides: Partial<RequestRecord> = {},
): RequestRecord {
  return {
    id,
    runId: "run-1",
    url,
    resourceType: "page",
    statusCode: 200,
    errorClass: null,
    errorMessage: null,
    timings: { dnsMs: 1, connectMs: 2, ttfbMs, totalMs },
    byteCount: 12_000,
    redirectCount: 0,
    contentType: "text/html",
    responseHeaders: { server: "nginx" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("analyzeSlowPages", () => {
  it("detects path-prefix enrichment for slow blog pages", () => {
    const pages = [
      page("1", "https://example.com/blog/post-1", 120, 150),
      page("2", "https://example.com/blog/post-2", 130, 160),
      page("3", "https://example.com/blog/post-3", 2_100, 2_200),
      page("4", "https://example.com/blog/post-4", 2_300, 2_400),
      page("5", "https://example.com/about", 110, 140),
      page("6", "https://example.com/contact", 100, 130),
    ];

    const analysis = analyzeSlowPages(pages, { thresholdMs: 1_000 });

    expect(analysis.slowPages).toHaveLength(2);
    expect(analysis.patterns.some((pattern) => pattern.dimension === "path-prefix" && pattern.value === "/blog/")).toBe(true);
  });

  it("detects large-response and slow-download patterns", () => {
    const pages = [
      page("1", "https://example.com/a", 120, 150, { byteCount: 8_000 }),
      page("2", "https://example.com/b", 130, 160, { byteCount: 9_000 }),
      page("3", "https://example.com/heavy", 400, 2_500, { byteCount: 1_500_000 }),
      page("4", "https://example.com/heavy-2", 420, 2_600, { byteCount: 1_600_000 }),
    ];

    const analysis = analyzeSlowPages(pages, { thresholdMs: 1_000 });

    expect(analysis.patterns.some((pattern) => pattern.dimension === "response-size" && pattern.value === "> 1 MB")).toBe(true);
    expect(analysis.patterns.some((pattern) => pattern.dimension === "bottleneck" && pattern.value === "download")).toBe(true);
  });

  it("returns empty patterns when no pages exceed threshold", () => {
    const pages = [page("1", "https://example.com/a", 120, 150), page("2", "https://example.com/b", 130, 160)];
    const analysis = analyzeSlowPages(pages, { thresholdMs: 5_000 });

    expect(analysis.slowPages).toHaveLength(0);
    expect(analysis.patterns).toHaveLength(0);
  });
});

describe("computeSlowPageThreshold", () => {
  it("uses p90 with a minimum floor", () => {
    const pages = Array.from({ length: 10 }, (_, index) =>
      page(String(index), `https://example.com/${index}`, 100 + index * 10, 120 + index * 10),
    );

    expect(computeSlowPageThreshold(pages)).toBeGreaterThanOrEqual(500);
  });
});
