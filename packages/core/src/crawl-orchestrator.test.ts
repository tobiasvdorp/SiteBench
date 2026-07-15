import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CrawlOrchestrator } from "./crawl-orchestrator.js";
import { createInMemoryStore } from "./database.js";
import { HttpMeasurer } from "./http-measurer.js";
import { RunRecorder } from "./run-recorder.js";
import { startFixtureServer, type FixtureServer } from "./test-support/fixture-server.js";
import type { ResourceType } from "./types.js";
import { sleep } from "./utils.js";

function createSnapshot(
  baseUrl: string,
  allowImages: boolean,
  maxPages: number | null = 1,
  excludePagesFromResults = false,
  dedupeRequests = true,
) {
  return {
    startUrl: `${baseUrl}/`,
    rpsLimit: 20,
    workerCount: 1,
    maxPages,
    timeLimitSeconds: null,
    allowImages,
    excludePagesFromResults,
    dedupeRequests,
    respectRobots: false,
    requestTimeoutMs: 5000,
    connectTimeoutMs: 2000,
    maxRedirects: 3,
    maxRetries: 0,
    templateId: null,
    templateName: null,
    runName: "fixture",
    siteOrigin: baseUrl,
  };
}

function resourceTypes(requests: { resourceType: ResourceType }[]) {
  return new Set(requests.map((request) => request.resourceType));
}

function hitCount(hits: ReadonlyMap<string, number>, path: string) {
  return hits.get(path) ?? 0;
}

async function runFixtureCrawl(
  baseUrl: string,
  allowImages: boolean,
  maxPages: number | null = 1,
  excludePagesFromResults = false,
  dedupeRequests = true,
) {
  const store = createInMemoryStore();
  const snapshot = createSnapshot(baseUrl, allowImages, maxPages, excludePagesFromResults, dedupeRequests);
  const run = store.createRun(`fixture-${allowImages}-${maxPages}`, baseUrl, snapshot);
  const recorder = new RunRecorder(store, run.id, { excludePagesFromResults });

  const orchestrator = new CrawlOrchestrator({
    config: snapshot,
    origin: baseUrl,
    recorder,
  });

  const result = await orchestrator.run();
  const aggregates = recorder.finalize(result.truncated, "completed", result.truncationReason);

  return {
    result,
    requests: store.getRequestsForRun(run.id),
    aggregates,
  };
}

describe("CrawlOrchestrator", () => {
  let fixture: FixtureServer;
  let baseUrl: string;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    baseUrl = fixture.baseUrl;
  });

  beforeEach(() => {
    fixture.resetHits();
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("issues real HTTP requests for css, js, and fonts with allowImages false", async () => {
    const { requests, aggregates } = await runFixtureCrawl(baseUrl, false, 1);
    const hits = fixture.getHits();
    const types = resourceTypes(requests);

    expect(hitCount(hits, "/")).toBe(1);
    expect(hitCount(hits, "/style.css")).toBeGreaterThan(0);
    expect(hitCount(hits, "/app.js")).toBeGreaterThan(0);
    expect(hitCount(hits, "/module.js")).toBeGreaterThan(0);
    expect(hitCount(hits, "/font.woff2")).toBeGreaterThan(0);
    expect(hitCount(hits, "/font-from-css.woff2")).toBeGreaterThan(0);
    expect(hitCount(hits, "/photo.jpg")).toBe(0);
    expect(hitCount(hits, "/photo-small.jpg")).toBe(0);
    expect(hitCount(hits, "/photo-large.jpg")).toBe(0);
    expect(hitCount(hits, "/page2")).toBe(0);

    expect(requests.filter((request) => request.resourceType === "page")).toHaveLength(1);
    expect(types.has("css")).toBe(true);
    expect(types.has("js")).toBe(true);
    expect(types.has("font")).toBe(true);
    expect(types.has("image")).toBe(false);
    expect(aggregates.totalRequests).toBeGreaterThan(aggregates.pageCount);
    expect(aggregates.resourceTypeCounts.css).toBeGreaterThan(0);
    expect(aggregates.resourceTypeCounts.js).toBeGreaterThan(0);
    expect(aggregates.resourceTypeCounts.font).toBeGreaterThan(0);
    expect(aggregates.resourceTypeCounts.image).toBe(0);
  });

  it("issues real HTTP requests for images when allowImages is true", async () => {
    const { requests, aggregates } = await runFixtureCrawl(baseUrl, true, 1);
    const hits = fixture.getHits();

    expect(hitCount(hits, "/photo.jpg")).toBeGreaterThan(0);
    expect(hitCount(hits, "/photo-small.jpg")).toBeGreaterThan(0);
    expect(hitCount(hits, "/photo-large.jpg")).toBe(0);

    const imageRequests = requests.filter((request) => request.resourceType === "image");
    expect(imageRequests.length).toBeGreaterThan(0);
    expect(imageRequests.every((request) => request.byteCount > 0)).toBe(true);
    expect(aggregates.resourceTypeCounts.image).toBeGreaterThan(0);
    expect(aggregates.totalRequests).toBeGreaterThan(aggregates.pageCount);
  });

  it("fetches images before additional pages when using multiple workers", async () => {
    const store = createInMemoryStore();
    const snapshot = {
      ...createSnapshot(baseUrl, true, 2),
      workerCount: 4,
      rpsLimit: 100,
    };
    const run = store.createRun("parallel-images-before-pages", baseUrl, snapshot);
    const recorder = new RunRecorder(store, run.id, { excludePagesFromResults: false });
    const baseMeasurer = new HttpMeasurer(snapshot);
    let page2Started = false;
    let imagesBeforePage2 = 0;

    const measurer = {
      probeStartUrl: baseMeasurer.probeStartUrl.bind(baseMeasurer),
      measure: async (url: string, resourceType?: ResourceType) => {
        if (resourceType === "page" && url.endsWith("/page2")) page2Started = true;
        const result = await baseMeasurer.measure(url, resourceType);
        if (resourceType === "image" && !page2Started) imagesBeforePage2 += 1;
        return result;
      },
    } as HttpMeasurer;

    const orchestrator = new CrawlOrchestrator({
      config: snapshot,
      origin: baseUrl,
      recorder,
      measurer,
    });

    await orchestrator.run();
    const requests = store.getRequestsForRun(run.id);

    expect(imagesBeforePage2).toBeGreaterThan(0);
    expect(requests.filter((request) => request.resourceType === "image").length).toBeGreaterThan(0);
    expect(fixture.getHits().get("/page2")).toBeGreaterThan(0);
  });

  it("discovers css-referenced fonts from fetched stylesheets", async () => {
    const { requests } = await runFixtureCrawl(baseUrl, false, 1);

    expect(requests.some((request) => request.url.endsWith("/font-from-css.woff2"))).toBe(true);
    expect(fixture.getHits().get("/font-from-css.woff2")).toBeGreaterThan(0);
  });

  it("fetches assets before additional pages when maxPages allows more pages", async () => {
    const { requests, aggregates } = await runFixtureCrawl(baseUrl, false, 2);
    const hits = fixture.getHits();

    expect(hitCount(hits, "/page2")).toBe(1);
    expect(hitCount(hits, "/page2.js")).toBeGreaterThan(0);
    expect(hitCount(hits, "/style.css")).toBeGreaterThan(0);
    expect(aggregates.totalRequests).toBeGreaterThan(aggregates.pageCount);
    expect(requests.filter((request) => request.resourceType === "page")).toHaveLength(2);
  });

  it("re-fetches previously visited pages when dedupeRequests is disabled", async () => {
    const { requests } = await runFixtureCrawl(baseUrl, false, 3, false, false);
    const hits = fixture.getHits();

    expect(hitCount(hits, "/")).toBe(2);
    expect(hitCount(hits, "/page2")).toBe(1);
    expect(requests.filter((request) => request.resourceType === "page")).toHaveLength(3);
  });

  it("still crawls pages but omits them from saved requests when excludePagesFromResults is true", async () => {
    const { requests, aggregates } = await runFixtureCrawl(baseUrl, false, 2, true);
    const hits = fixture.getHits();

    expect(hitCount(hits, "/")).toBe(1);
    expect(hitCount(hits, "/page2")).toBe(1);
    expect(hitCount(hits, "/style.css")).toBeGreaterThan(0);
    expect(requests.filter((request) => request.resourceType === "page")).toHaveLength(0);
    expect(requests.some((request) => request.resourceType === "css")).toBe(true);
    expect(aggregates.pageCount).toBe(2);
    expect(aggregates.totalRequests).toBe(requests.length);
    expect(aggregates.resourceTypeCounts.page).toBe(0);
  });

  it("runs multiple requests concurrently when workerCount is greater than 1", async () => {
    const store = createInMemoryStore();
    const snapshot = {
      ...createSnapshot(baseUrl, false, 1),
      workerCount: 4,
      rpsLimit: 100,
    };
    const run = store.createRun("parallel-workers", baseUrl, snapshot);
    const recorder = new RunRecorder(store, run.id, { excludePagesFromResults: false });
    const baseMeasurer = new HttpMeasurer(snapshot);
    let concurrent = 0;
    let maxConcurrent = 0;

    const measurer = {
      probeStartUrl: baseMeasurer.probeStartUrl.bind(baseMeasurer),
      measure: async (url: string, resourceType?: ResourceType) => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await sleep(50);
        concurrent -= 1;
        return baseMeasurer.measure(url, resourceType);
      },
    } as HttpMeasurer;

    const orchestrator = new CrawlOrchestrator({
      config: snapshot,
      origin: baseUrl,
      recorder,
      measurer,
    });

    await orchestrator.run();

    expect(maxConcurrent).toBeGreaterThan(1);
  });

  it("stops cleanly when the time limit is reached", async () => {
    const store = createInMemoryStore();
    const snapshot = {
      startUrl: `${baseUrl}/`,
      rpsLimit: 20,
      workerCount: 1,
      maxPages: null,
      timeLimitSeconds: 1,
      allowImages: false,
      excludePagesFromResults: false,
      dedupeRequests: true,
      respectRobots: false,
      requestTimeoutMs: 5000,
      connectTimeoutMs: 2000,
      maxRedirects: 3,
      maxRetries: 0,
      templateId: null,
      templateName: null,
      runName: "time-limited",
      siteOrigin: baseUrl,
    };

    const run = store.createRun("time-limited", baseUrl, snapshot);
    const recorder = new RunRecorder(store, run.id, { excludePagesFromResults: false });
    let nowCalls = 0;

    const orchestrator = new CrawlOrchestrator({
      config: snapshot,
      origin: baseUrl,
      recorder,
      now: () => {
        nowCalls += 1;
        return nowCalls === 1 ? 0 : 2000;
      },
    });

    const result = await orchestrator.run();
    recorder.finalize(result.truncated, "completed", result.truncationReason);

    const loaded = store.getRun(run.id);
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("time-limit");
    expect(loaded?.truncationReason).toBe("time-limit");
  });
});
