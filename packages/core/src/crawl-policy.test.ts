import { describe, expect, it } from "vitest";
import { CrawlPolicy } from "./crawl-policy.js";
import { ASSET_RESOURCE_TYPES, RESOURCE_TYPES } from "./types.js";
import { emptyCrawlConfig } from "./validation.js";

describe("CrawlPolicy", () => {
  const origin = "https://example.com";
  const baseConfig = { ...emptyCrawlConfig(), startUrl: `${origin}/`, maxPages: 2 };

  it("allows same-origin pages up to maxPages", () => {
    const policy = new CrawlPolicy(origin, baseConfig);
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(true);
    policy.markPageQueued(`${origin}/a`);
    policy.markPageFetched();
    expect(policy.shouldEnqueuePage(`${origin}/b`).allowed).toBe(true);
    policy.markPageQueued(`${origin}/b`);
    policy.markPageFetched();
    expect(policy.shouldEnqueuePage(`${origin}/c`).allowed).toBe(false);
  });

  it("rejects off-origin links", () => {
    const policy = new CrawlPolicy(origin, baseConfig);
    expect(policy.shouldEnqueuePage("https://other.com/page").allowed).toBe(false);
  });

  it("respects robots.txt when enabled", () => {
    const policy = new CrawlPolicy(origin, { ...baseConfig, respectRobots: true });
    policy.setRobotsTxt("User-agent: *\nDisallow: /private", `${origin}/robots.txt`);
    expect(policy.shouldEnqueuePage(`${origin}/public`).allowed).toBe(true);
    expect(policy.shouldEnqueuePage(`${origin}/private/secret`).allowed).toBe(false);
  });

  it("skips robots checks when disabled", () => {
    const policy = new CrawlPolicy(origin, { ...baseConfig, respectRobots: false });
    policy.setRobotsTxt("User-agent: *\nDisallow: /", `${origin}/robots.txt`);
    expect(policy.shouldEnqueuePage(`${origin}/`).allowed).toBe(true);
  });

  it("blocks image assets when allowImages is false", () => {
    const policy = new CrawlPolicy(origin, { ...baseConfig, allowImages: false });
    expect(policy.shouldFetchAsset(`${origin}/logo.png`, "image").allowed).toBe(false);
    expect(policy.shouldFetchAsset(`${origin}/app.js`, "js").allowed).toBe(true);
  });

  it("allows image assets when allowImages is true", () => {
    const policy = new CrawlPolicy(origin, { ...baseConfig, allowImages: true });
    expect(policy.shouldFetchAsset(`${origin}/logo.png`, "image").allowed).toBe(true);
  });

  it("rejects duplicate pages in unique-explorer mode", () => {
    const policy = new CrawlPolicy(origin, {
      ...baseConfig,
      pageCrawlBehavior: "unique-explorer",
      dedupeResourceTypes: [...RESOURCE_TYPES],
    });
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(true);
    policy.markPageQueued(`${origin}/a`);
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(false);
  });

  it("allows rediscovery in hub-revisit mode and expands only on first visit", () => {
    const policy = new CrawlPolicy(origin, {
      ...baseConfig,
      pageCrawlBehavior: "hub-revisit",
      dedupeResourceTypes: [...ASSET_RESOURCE_TYPES],
      maxPages: 10,
    });
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(true);
    policy.markPageQueued(`${origin}/a`);
    expect(policy.shouldExpandPageLinks(`${origin}/a`)).toBe(true);
    policy.markPageExpanded(`${origin}/a`);
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(true);
    expect(policy.shouldExpandPageLinks(`${origin}/a`)).toBe(false);
  });

  it("caps visits in bounded-revisits mode", () => {
    const policy = new CrawlPolicy(origin, {
      ...baseConfig,
      pageCrawlBehavior: "bounded-revisits",
      maxPageVisits: 2,
      dedupeResourceTypes: [...ASSET_RESOURCE_TYPES],
      maxPages: 10,
    });
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(true);
    policy.markPageQueued(`${origin}/a`);
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(true);
    policy.markPageQueued(`${origin}/a`);
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(false);
  });

  it("allows unlimited rediscovery in stress mode", () => {
    const policy = new CrawlPolicy(origin, {
      ...baseConfig,
      pageCrawlBehavior: "stress",
      dedupeResourceTypes: [...ASSET_RESOURCE_TYPES],
      maxPages: 10,
    });
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(true);
    policy.markPageQueued(`${origin}/a`);
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(true);
    expect(policy.shouldExpandPageLinks(`${origin}/a`)).toBe(true);
    policy.markPageExpanded(`${origin}/a`);
    expect(policy.shouldExpandPageLinks(`${origin}/a`)).toBe(true);
  });

  it("rejects duplicate assets for types included in dedupeResourceTypes", () => {
    const policy = new CrawlPolicy(origin, {
      ...baseConfig,
      dedupeResourceTypes: ["js"],
    });
    expect(policy.shouldFetchAsset(`${origin}/app.js`, "js").allowed).toBe(true);
    policy.markAssetQueued(`${origin}/app.js`, "js");
    expect(policy.shouldFetchAsset(`${origin}/app.js`, "js").allowed).toBe(false);
  });

  it("allows duplicate assets when that type is omitted from dedupeResourceTypes", () => {
    const policy = new CrawlPolicy(origin, {
      ...baseConfig,
      dedupeResourceTypes: ["page", "css"],
    });
    expect(policy.shouldFetchAsset(`${origin}/app.js`, "js").allowed).toBe(true);
    policy.markAssetQueued(`${origin}/app.js`, "js");
    expect(policy.shouldFetchAsset(`${origin}/app.js`, "js").allowed).toBe(true);
  });
});
