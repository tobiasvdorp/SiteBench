import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CrawlOrchestrator } from "./crawl-orchestrator.js";
import { createInMemoryStore } from "./database.js";
import { RunRecorder } from "./run-recorder.js";
import { startFixtureServer, type FixtureServer } from "./test-support/fixture-server.js";

describe("CrawlOrchestrator", () => {
  let fixture: FixtureServer;
  let baseUrl: string;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    baseUrl = fixture.baseUrl;
  });

  afterAll(async () => {
    await fixture.close();
  });

  it("crawls fixture site respecting maxPages", async () => {
    const store = createInMemoryStore();
    const snapshot = {
      startUrl: `${baseUrl}/`,
      rpsLimit: 20,
      maxPages: 1,
      timeLimitSeconds: null,
      allowImages: false,
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

    const run = store.createRun("fixture", baseUrl, snapshot);
    const recorder = new RunRecorder(store, run.id);

    const orchestrator = new CrawlOrchestrator({
      config: snapshot,
      origin: baseUrl,
      recorder,
    });

    const { truncated } = await orchestrator.run();
    recorder.finalize(truncated);

    const requests = store.getRequestsForRun(run.id);
    const pages = requests.filter((r) => r.resourceType === "page");
    expect(pages.length).toBe(1);
    expect(requests.some((r) => r.resourceType === "css")).toBe(true);
  });

  it("stops cleanly when the time limit is reached", async () => {
    const store = createInMemoryStore();
    const snapshot = {
      startUrl: `${baseUrl}/`,
      rpsLimit: 20,
      maxPages: null,
      timeLimitSeconds: 1,
      allowImages: false,
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
    const recorder = new RunRecorder(store, run.id);
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
