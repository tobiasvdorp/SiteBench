import { describe, expect, it } from "vitest";
import {
  validateCrawlConfig,
  validateRunName,
  getSiteOrigin,
  mergeCrawlConfig,
  emptyCrawlConfig,
} from "./validation.js";

describe("validateCrawlConfig", () => {
  it("accepts valid configuration", () => {
    const result = validateCrawlConfig({
      startUrl: "https://example.com",
      rpsLimit: 2,
      maxPages: 10,
      timeLimitSeconds: null,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.startUrl).toBe("https://example.com/");
      expect(result.config.rpsLimit).toBe(2);
    }
  });

  it("rejects non-public schemes", () => {
    const result = validateCrawlConfig({ startUrl: "file:///tmp/test" });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid numeric limits", () => {
    const result = validateCrawlConfig({
      startUrl: "https://example.com",
      rpsLimit: 0,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects connect timeout greater than request timeout", () => {
    const result = validateCrawlConfig({
      startUrl: "https://example.com",
      maxPages: 10,
      requestTimeoutMs: 5000,
      connectTimeoutMs: 8000,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a time-only limit", () => {
    const result = validateCrawlConfig({
      startUrl: "https://example.com",
      rpsLimit: 2,
      maxPages: null,
      timeLimitSeconds: 30,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.maxPages).toBeNull();
      expect(result.config.timeLimitSeconds).toBe(30);
    }
  });

  it("rejects configurations without page or time limits", () => {
    const result = validateCrawlConfig({
      startUrl: "https://example.com",
      rpsLimit: 2,
      maxPages: null,
      timeLimitSeconds: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.field === "limits")).toBe(true);
    }
  });

  it("accepts valid worker count", () => {
    const result = validateCrawlConfig({
      startUrl: "https://example.com",
      workerCount: 4,
      maxPages: 10,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.workerCount).toBe(4);
  });

  it("rejects invalid worker count", () => {
    const result = validateCrawlConfig({
      startUrl: "https://example.com",
      workerCount: 0,
      maxPages: 10,
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateRunName", () => {
  it("requires a non-empty name", () => {
    expect(validateRunName("")).toHaveLength(1);
    expect(validateRunName("  ")).toHaveLength(1);
    expect(validateRunName("baseline")).toHaveLength(0);
  });
});

describe("getSiteOrigin", () => {
  it("returns origin for valid URLs", () => {
    expect(getSiteOrigin("https://example.com/path")).toBe("https://example.com");
  });
});

describe("mergeCrawlConfig", () => {
  it("applies overrides on top of base", () => {
    const merged = mergeCrawlConfig(emptyCrawlConfig(), { maxPages: 25, rpsLimit: 5 });
    expect(merged.maxPages).toBe(25);
    expect(merged.rpsLimit).toBe(5);
  });
});
