import { describe, expect, it } from "vitest";
import { CrawlPolicy } from "./crawl-policy.js";
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

  it("rejects duplicate pages when dedupeRequests is enabled", () => {
    const policy = new CrawlPolicy(origin, { ...baseConfig, dedupeRequests: true });
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(true);
    policy.markPageQueued(`${origin}/a`);
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(false);
  });

  it("allows duplicate pages when dedupeRequests is disabled", () => {
    const policy = new CrawlPolicy(origin, { ...baseConfig, dedupeRequests: false, maxPages: 10 });
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(true);
    policy.markPageQueued(`${origin}/a`);
    expect(policy.shouldEnqueuePage(`${origin}/a`).allowed).toBe(true);
  });

  it("allows duplicate assets when dedupeRequests is disabled", () => {
    const policy = new CrawlPolicy(origin, { ...baseConfig, dedupeRequests: false });
    expect(policy.shouldFetchAsset(`${origin}/app.js`, "js").allowed).toBe(true);
    policy.markAssetQueued(`${origin}/app.js`);
    expect(policy.shouldFetchAsset(`${origin}/app.js`, "js").allowed).toBe(true);
  });
});
