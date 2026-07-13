import { describe, expect, it } from "vitest";
import { createInMemoryStore } from "./database.js";
import { RunRecorder } from "./run-recorder.js";
import type { MeasureResult } from "./http-measurer.js";

function pageResult(url: string): MeasureResult {
  return {
    url,
    resourceType: "page",
    statusCode: 200,
    errorClass: null,
    errorMessage: null,
    timings: { dnsMs: 1, connectMs: 2, ttfbMs: 40, totalMs: 60 },
    byteCount: 500,
    redirectCount: 0,
    bodyText: "<html></html>",
    contentType: "text/html",
  };
}

function cssResult(url: string): MeasureResult {
  return {
    url,
    resourceType: "css",
    statusCode: 200,
    errorClass: null,
    errorMessage: null,
    timings: { dnsMs: 1, connectMs: 2, ttfbMs: 20, totalMs: 30 },
    byteCount: 100,
    redirectCount: 0,
    bodyText: "body {}",
    contentType: "text/css",
  };
}

describe("RunRecorder", () => {
  it("persists page requests by default", () => {
    const store = createInMemoryStore();
    const run = store.createRun("run", "https://example.com", {
      startUrl: "https://example.com/",
      rpsLimit: 2,
      maxPages: 1,
      timeLimitSeconds: null,
      allowImages: false,
      excludePagesFromResults: false,
      respectRobots: true,
      requestTimeoutMs: 30_000,
      connectTimeoutMs: 10_000,
      maxRedirects: 5,
      maxRetries: 2,
      templateId: null,
      templateName: null,
      runName: "run",
      siteOrigin: "https://example.com",
    });
    const recorder = new RunRecorder(store, run.id);

    recorder.recordRequest(pageResult("https://example.com/"));
    recorder.recordRequest(cssResult("https://example.com/style.css"));

    const requests = store.getRequestsForRun(run.id);
    expect(requests).toHaveLength(2);
    expect(recorder.finalize(false).pageCount).toBe(1);
  });

  it("skips persisting page requests when excludePagesFromResults is enabled", () => {
    const store = createInMemoryStore();
    const run = store.createRun("run", "https://example.com", {
      startUrl: "https://example.com/",
      rpsLimit: 2,
      maxPages: 2,
      timeLimitSeconds: null,
      allowImages: false,
      excludePagesFromResults: true,
      respectRobots: true,
      requestTimeoutMs: 30_000,
      connectTimeoutMs: 10_000,
      maxRedirects: 5,
      maxRetries: 2,
      templateId: null,
      templateName: null,
      runName: "run",
      siteOrigin: "https://example.com",
    });
    const recorder = new RunRecorder(store, run.id, { excludePagesFromResults: true });

    recorder.recordRequest(pageResult("https://example.com/"));
    recorder.recordRequest(pageResult("https://example.com/page2"));
    recorder.recordRequest(cssResult("https://example.com/style.css"));

    const requests = store.getRequestsForRun(run.id);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.resourceType).toBe("css");

    const aggregates = recorder.finalize(false);
    expect(aggregates.pageCount).toBe(2);
    expect(aggregates.totalRequests).toBe(1);
    expect(aggregates.resourceTypeCounts.page).toBe(0);
  });
});
