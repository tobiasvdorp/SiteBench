import { describe, expect, it } from "vitest";
import { createInMemoryStore } from "./database.js";
import { ComparisonEngine } from "./comparison-engine.js";
import { aggregatesFromLatencies } from "./database.js";

describe("DatabaseStore", () => {
  it("round-trips templates and runs with immutable snapshots", () => {
    const store = createInMemoryStore();

    const template = store.createTemplate({
      name: "Default",
      startUrl: "https://example.com",
      rpsLimit: 2,
      workerCount: 1,
      maxPages: 10,
      timeLimitSeconds: null,
      allowImages: false,
      excludePagesFromResults: false,
      dedupeRequests: true,
      respectRobots: true,
      requestTimeoutMs: 30_000,
      connectTimeoutMs: 10_000,
      maxRedirects: 5,
      maxRetries: 2,
    });

    expect(store.listTemplates()).toHaveLength(1);

    const snapshot = {
      ...template,
      templateId: template.id,
      templateName: template.name,
      runName: "Run A",
      siteOrigin: "https://example.com",
    };

    const run = store.createRun("Run A", "https://example.com", snapshot);
    store.insertRequest(run.id, {
      url: "https://example.com",
      resourceType: "page",
      statusCode: 200,
      errorClass: null,
      errorMessage: null,
      timings: { dnsMs: 1, connectMs: 2, ttfbMs: 50, totalMs: 80 },
      byteCount: 100,
      redirectCount: 0,
    });

    const aggregates = store.computeAggregatesFromRequests(run.id);
    store.finalizeRun(run.id, aggregates, false);

    const loaded = store.getRun(run.id);
    expect(loaded?.configSnapshot.runName).toBe("Run A");
    expect(loaded?.aggregates?.totalRequests).toBe(1);
    expect(loaded?.aggregates?.resourceTypeCounts.page).toBe(1);

    store.updateTemplate(template.id, {
      ...template,
      name: "Changed",
      maxPages: 99,
    });

    const unchangedRun = store.getRun(run.id);
    expect(unchangedRun?.configSnapshot.maxPages).toBe(10);
  });

  it("always stores respectRobots as true for templates", () => {
    const store = createInMemoryStore();

    const template = store.createTemplate({
      name: "Robots ignored input",
      startUrl: "https://example.com",
      rpsLimit: 2,
      workerCount: 1,
      maxPages: 10,
      timeLimitSeconds: null,
      allowImages: false,
      excludePagesFromResults: false,
      dedupeRequests: true,
      respectRobots: false,
      requestTimeoutMs: 30_000,
      connectTimeoutMs: 10_000,
      maxRedirects: 5,
      maxRetries: 2,
    });

    expect(template.respectRobots).toBe(true);
    expect(store.getTemplate(template.id)?.respectRobots).toBe(true);

    const updated = store.updateTemplate(template.id, {
      ...template,
      name: "Still ignored input",
      respectRobots: false,
    });

    expect(updated?.respectRobots).toBe(true);
    expect(store.getTemplate(template.id)?.respectRobots).toBe(true);
  });

  it("persists request resource types for retrieval", () => {
    const store = createInMemoryStore();
    const snapshot = {
      startUrl: "https://example.com",
      rpsLimit: 2,
      workerCount: 1,
      maxPages: 10,
      timeLimitSeconds: null,
      allowImages: true,
      excludePagesFromResults: false,
      dedupeRequests: true,
      respectRobots: true,
      requestTimeoutMs: 30_000,
      connectTimeoutMs: 10_000,
      maxRedirects: 5,
      maxRetries: 2,
      templateId: null,
      templateName: null,
      runName: "Assets",
      siteOrigin: "https://example.com",
    };

    const run = store.createRun("Assets", "https://example.com", snapshot);
    const records = [
      { url: "https://example.com", resourceType: "page" as const },
      { url: "https://example.com/app.js", resourceType: "js" as const },
      { url: "https://example.com/style.css", resourceType: "css" as const },
      { url: "https://example.com/font.woff2", resourceType: "font" as const },
      { url: "https://example.com/photo.jpg", resourceType: "image" as const },
    ];

    for (const record of records) {
      store.insertRequest(run.id, {
        url: record.url,
        resourceType: record.resourceType,
        statusCode: 200,
        errorClass: null,
        errorMessage: null,
        timings: { dnsMs: 1, connectMs: 2, ttfbMs: 50, totalMs: 80 },
        byteCount: 100,
        redirectCount: 0,
      });
    }

    const loaded = store.getRequestsForRun(run.id);
    expect(loaded.map((request) => request.resourceType)).toEqual(records.map((record) => record.resourceType));
  });

  it("reconciles stale running runs on startup", () => {
    const store = createInMemoryStore();
    const snapshot = {
      startUrl: "https://example.com",
      rpsLimit: 2,
      workerCount: 1,
      maxPages: 10,
      timeLimitSeconds: null,
      allowImages: false,
      excludePagesFromResults: false,
      dedupeRequests: true,
      respectRobots: true,
      requestTimeoutMs: 30_000,
      connectTimeoutMs: 10_000,
      maxRedirects: 5,
      maxRetries: 2,
      templateId: null,
      templateName: null,
      runName: "Interrupted",
      siteOrigin: "https://example.com",
    };

    const run = store.createRun("Interrupted", "https://example.com", snapshot);
    store.insertRequest(run.id, {
      url: "https://example.com",
      resourceType: "page",
      statusCode: 200,
      errorClass: null,
      errorMessage: null,
      timings: { dnsMs: 1, connectMs: 2, ttfbMs: 50, totalMs: 80 },
      byteCount: 100,
      redirectCount: 0,
    });

    expect(store.reconcileStaleRunningRuns()).toBe(1);

    const loaded = store.getRun(run.id);
    expect(loaded?.status).toBe("stopped");
    expect(loaded?.completedAt).not.toBeNull();
    expect(loaded?.errorSummary).toContain("server restarted");
    expect(loaded?.aggregates?.totalRequests).toBe(1);
  });
});

describe("ComparisonEngine", () => {
  it("computes baseline deltas across runs", () => {
    const store = createInMemoryStore();
    const engine = new ComparisonEngine(store);

    const makeRun = (name: string, latencies: number[]) => {
      const snapshot = {
        startUrl: "https://example.com",
        rpsLimit: 2,
        workerCount: 1,
        maxPages: 10,
        timeLimitSeconds: null,
        allowImages: false,
        excludePagesFromResults: false,
        dedupeRequests: true,
        respectRobots: true,
        requestTimeoutMs: 30_000,
        connectTimeoutMs: 10_000,
        maxRedirects: 5,
        maxRetries: 2,
        templateId: null,
        templateName: null,
        runName: name,
        siteOrigin: "https://example.com",
      };
      const run = store.createRun(name, "https://example.com", snapshot);
      for (const latency of latencies) {
        store.insertRequest(run.id, {
          url: "https://example.com",
          resourceType: "page",
          statusCode: 200,
          errorClass: null,
          errorMessage: null,
          timings: { dnsMs: null, connectMs: null, ttfbMs: latency, totalMs: latency + 10 },
          byteCount: 10,
          redirectCount: 0,
        });
      }
      const aggregates = aggregatesFromLatencies(latencies, latencies.length, 0);
      store.finalizeRun(run.id, aggregates, false);
      return run.id;
    };

    const baselineId = makeRun("Baseline", [100, 110, 120]);
    const compareId = makeRun("Compare", [150, 160, 170]);

    const result = engine.compare("https://example.com", [
      { runId: baselineId, isBaseline: true },
      { runId: compareId },
    ]);

    expect(result.runs).toHaveLength(2);
    const compare = result.runs.find((r) => r.runId === compareId);
    expect(compare?.deltas?.p50).toBeGreaterThan(0);
  });

  it("round-trips comparison reports", () => {
    const store = createInMemoryStore();

    const created = store.createReport({
      name: "Before vs after",
      siteOrigin: "https://example.com",
      runIds: ["run_a", "run_b"],
      baselineRunId: "run_a",
      resourceFilter: "assets",
    });

    expect(store.listReports()).toHaveLength(1);
    expect(store.getReport(created.id)?.name).toBe("Before vs after");
    expect(store.getReport(created.id)?.runIds).toEqual(["run_a", "run_b"]);
    expect(store.getReport(created.id)?.resourceFilter).toBe("assets");

    expect(store.deleteReport(created.id)).toBe(true);
    expect(store.listReports()).toHaveLength(0);
  });

  it("updates comparison reports", () => {
    const store = createInMemoryStore();

    const created = store.createReport({
      name: "Before vs after",
      siteOrigin: "https://example.com",
      runIds: ["run_a", "run_b"],
      baselineRunId: "run_a",
      resourceFilter: "all",
    });

    const updated = store.updateReport(created.id, {
      name: "Before vs after",
      siteOrigin: "https://example.com",
      runIds: ["run_a", "run_b", "run_c"],
      baselineRunId: "run_a",
      resourceFilter: "page",
    });

    expect(updated?.runIds).toEqual(["run_a", "run_b", "run_c"]);
    expect(updated?.resourceFilter).toBe("page");
    expect(store.getReport(created.id)?.runIds).toEqual(["run_a", "run_b", "run_c"]);
  });

  it("handles single-run comparison", () => {
    const store = createInMemoryStore();
    const engine = new ComparisonEngine(store);
    const result = engine.compare("https://example.com", []);
    expect(result.runs).toHaveLength(0);
  });
});
