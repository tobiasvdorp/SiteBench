import robotsParserModule from "robots-parser";
import type { CrawlConfig, TruncationReason } from "./types.js";
import { detectResourceType, isSameOrigin, normalizeUrl } from "./utils.js";
import type { ResourceType } from "./types.js";

const robotsParser = robotsParserModule as unknown as (
  url: string,
  robotstxt: string,
) => {
  isAllowed(url: string, ua?: string): boolean | undefined;
};

export type EnqueueDecision = {
  allowed: boolean;
  reason?: string;
};

export class CrawlPolicy {
  private readonly origin: string;
  private readonly config: CrawlConfig;
  private robots: ReturnType<typeof robotsParser> | null = null;
  private fetchedPages = 0;
  private seenPages = new Set<string>();
  private seenAssets = new Set<string>();

  constructor(origin: string, config: CrawlConfig) {
    this.origin = origin;
    this.config = config;
  }

  setRobotsTxt(content: string | null, robotsUrl: string) {
    if (!content) {
      this.robots = robotsParser(robotsUrl, "");
      return;
    }
    this.robots = robotsParser(robotsUrl, content);
  }

  getOrigin() {
    return this.origin;
  }

  getPagesFetched() {
    return this.fetchedPages;
  }

  hasPageLimit() {
    return this.config.maxPages !== null;
  }

  isPageLimitReached() {
    if (this.config.maxPages === null) return false;
    return this.fetchedPages >= this.config.maxPages;
  }

  shouldEnqueuePage(url: string): EnqueueDecision {
    const normalized = normalizeUrl(url);
    if (!normalized) return { allowed: false, reason: "invalid-url" };
    if (!isSameOrigin(normalized, this.origin)) return { allowed: false, reason: "off-origin" };
    if (this.config.dedupeRequests && this.seenPages.has(normalized)) {
      return { allowed: false, reason: "duplicate" };
    }
    if (this.isPageLimitReached()) return { allowed: false, reason: "max-pages" };

    if (this.config.respectRobots && this.robots && !this.robots.isAllowed(normalized, "SiteBench")) {
      return { allowed: false, reason: "robots" };
    }

    return { allowed: true };
  }

  markPageQueued(url: string) {
    if (!this.config.dedupeRequests) return;
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    this.seenPages.add(normalized);
  }

  markPageFetched() {
    this.fetchedPages += 1;
  }

  shouldFetchAsset(url: string, resourceType: ResourceType): EnqueueDecision {
    const normalized = normalizeUrl(url);
    if (!normalized) return { allowed: false, reason: "invalid-url" };
    if (!isSameOrigin(normalized, this.origin)) return { allowed: false, reason: "off-origin" };
    if (this.config.dedupeRequests && this.seenAssets.has(normalized)) {
      return { allowed: false, reason: "duplicate" };
    }

    const resolvedType = resourceType === "other" ? detectResourceType(normalized) : resourceType;
    if (resolvedType === "image" && !this.config.allowImages) {
      return { allowed: false, reason: "images-disabled" };
    }

    if (this.config.respectRobots && this.robots && !this.robots.isAllowed(normalized, "SiteBench")) {
      return { allowed: false, reason: "robots" };
    }

    return { allowed: true };
  }

  markAssetQueued(url: string) {
    if (!this.config.dedupeRequests) return;
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    this.seenAssets.add(normalized);
  }

  getTruncationReason(queueHasPages: boolean, timeLimitReached: boolean): TruncationReason | null {
    if (!queueHasPages) return null;
    if (timeLimitReached) return "time-limit";
    if (this.isPageLimitReached()) return "max-pages";
    return null;
  }

  isTruncated(queueHasPages: boolean, timeLimitReached: boolean) {
    return this.getTruncationReason(queueHasPages, timeLimitReached) !== null;
  }
}
