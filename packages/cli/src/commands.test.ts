import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SiteBench, ValidationFailure } from "@sitebench/core";

describe("CLI contract via SiteBench", () => {
  it("creates templates and lists runs in temporary database", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sitebench-cli-"));
    const dbPath = join(dir, "test.db");
    const bench = new SiteBench({ dbPath });

    const template = bench.createTemplate({
      name: "Test",
      startUrl: "https://example.com",
      rpsLimit: 2,
      workerCount: 1,
      maxPages: 5,
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

    expect(template.id).toBeTruthy();
    expect(bench.listTemplates()).toHaveLength(1);

    bench.close();
  });

  it("surfaces validation failures for invalid template input", () => {
    const bench = new SiteBench({ dbPath: ":memory:" });
    expect(() =>
      bench.createTemplate({
        name: "Bad",
        startUrl: "not-a-url",
        rpsLimit: 2,
      workerCount: 1,
        maxPages: 5,
        timeLimitSeconds: null,
        allowImages: false,
        excludePagesFromResults: false,
        dedupeRequests: true,
        respectRobots: true,
        requestTimeoutMs: 30_000,
        connectTimeoutMs: 10_000,
        maxRedirects: 5,
        maxRetries: 2,
      }),
    ).toThrow(ValidationFailure);
    bench.close();
  });
});
