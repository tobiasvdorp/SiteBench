import robotsParserModule from "robots-parser";
import { expandsOnlyOnFirstVisit } from "./page-crawl-behavior.js";
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
  private readonly dedupeTypes: Set<ResourceType>;
  private robots: ReturnType<typeof robotsParser> | null = null;
  private fetchedPages = 0;
  private pageQueueCounts = new Map<string, number>();
  private expandedPages = new Set<string>();
  private seenAssets = new Set<string>();

  constructor(origin: string, config: CrawlConfig) {
    this.origin = origin;
    this.config = config;
    this.dedupeTypes = new Set(config.dedupeResourceTypes);
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

  shouldDedupe(resourceType: ResourceType) {
    return this.dedupeTypes.has(resourceType);
  }

  shouldEnqueuePage(url: string): EnqueueDecision {
    const normalized = normalizeUrl(url);
    if (!normalized) return { allowed: false, reason: "invalid-url" };
    if (!isSameOrigin(normalized, this.origin)) return { allowed: false, reason: "off-origin" };
    if (this.isPageLimitReached()) return { allowed: false, reason: "max-pages" };

    const queuedCount = this.pageQueueCounts.get(normalized) ?? 0;
    if (!this.allowsAnotherPageVisit(queuedCount)) {
      return { allowed: false, reason: "duplicate" };
    }

    if (this.config.respectRobots && this.robots && !this.robots.isAllowed(normalized, "SiteBench")) {
      return { allowed: false, reason: "robots" };
    }

    return { allowed: true };
  }

  markPageQueued(url: string) {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    this.pageQueueCounts.set(normalized, (this.pageQueueCounts.get(normalized) ?? 0) + 1);
  }

  shouldExpandPageLinks(url: string) {
    const normalized = normalizeUrl(url);
    if (!normalized) return false;
    if (!expandsOnlyOnFirstVisit(this.config.pageCrawlBehavior)) return true;
    return !this.expandedPages.has(normalized);
  }

  markPageExpanded(url: string) {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    this.expandedPages.add(normalized);
  }

  markPageFetched() {
    this.fetchedPages += 1;
  }

  shouldFetchAsset(url: string, resourceType: ResourceType): EnqueueDecision {
    const normalized = normalizeUrl(url);
    if (!normalized) return { allowed: false, reason: "invalid-url" };
    if (!isSameOrigin(normalized, this.origin)) return { allowed: false, reason: "off-origin" };

    const resolvedType = resourceType === "other" ? detectResourceType(normalized) : resourceType;
    if (this.shouldDedupe(resolvedType) && this.seenAssets.has(normalized)) {
      return { allowed: false, reason: "duplicate" };
    }

    if (resolvedType === "image" && !this.config.allowImages) {
      return { allowed: false, reason: "images-disabled" };
    }

    if (this.config.respectRobots && this.robots && !this.robots.isAllowed(normalized, "SiteBench")) {
      return { allowed: false, reason: "robots" };
    }

    return { allowed: true };
  }

  markAssetQueued(url: string, resourceType: ResourceType = "other") {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    const resolvedType = resourceType === "other" ? detectResourceType(normalized) : resourceType;
    if (!this.shouldDedupe(resolvedType)) return;
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

  private allowsAnotherPageVisit(queuedCount: number) {
    switch (this.config.pageCrawlBehavior) {
      case "unique-explorer":
        return queuedCount === 0;
      case "bounded-revisits": {
        const maxVisits = this.config.maxPageVisits ?? 1;
        return queuedCount < maxVisits;
      }
      case "hub-revisit":
      case "stress":
        return true;
    }
  }
}
