import { DEFAULT_MAX_PAGE_VISITS, DEFAULT_PAGE_CRAWL_BEHAVIOR } from "./defaults.js";
import {
  PAGE_CRAWL_BEHAVIORS,
  type PageCrawlBehavior,
  type ResourceType,
} from "./types.js";

const PAGE_CRAWL_BEHAVIOR_SET = new Set<string>(PAGE_CRAWL_BEHAVIORS);

export const PAGE_CRAWL_BEHAVIOR_LABELS: Record<PageCrawlBehavior, string> = {
  "unique-explorer": "Unique explorer",
  "hub-revisit": "Hub revisit",
  "bounded-revisits": "Bounded revisits",
  stress: "Stress",
};

export const PAGE_CRAWL_BEHAVIOR_DESCRIPTIONS: Record<PageCrawlBehavior, string> = {
  "unique-explorer": "Fetch each page once and follow its links. Best for coverage.",
  "hub-revisit":
    "Re-fetch pages when rediscovered (e.g. via nav), but only follow links on the first visit.",
  "bounded-revisits":
    "Like hub revisit, but cap how many times each page URL may be fetched.",
  stress: "Re-fetch and re-follow links on every rediscovery. Load/stress mode, not user-like.",
};

/**
 * Resolve page crawl behavior from an explicit value, or infer from legacy page dedupe.
 * Missing page dedupe (old "no page dedupe") maps to stress.
 */
export function normalizePageCrawlBehavior(
  value: unknown,
  dedupeResourceTypes?: unknown,
  legacyDedupeRequests?: unknown,
): PageCrawlBehavior {
  if (typeof value === "string" && PAGE_CRAWL_BEHAVIOR_SET.has(value)) {
    return value as PageCrawlBehavior;
  }

  if (legacyDedupeRequests === false) return "stress";
  if (Array.isArray(dedupeResourceTypes) && !dedupeResourceTypes.includes("page")) {
    return "stress";
  }
  return DEFAULT_PAGE_CRAWL_BEHAVIOR;
}

export function normalizeMaxPageVisits(
  value: unknown,
  behavior: PageCrawlBehavior,
): number | null {
  if (behavior !== "bounded-revisits") return null;
  if (value === undefined || value === null || value === "") return DEFAULT_MAX_PAGE_VISITS;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 10_000) return DEFAULT_MAX_PAGE_VISITS;
  return num;
}

export function expandsOnlyOnFirstVisit(behavior: PageCrawlBehavior) {
  return behavior === "hub-revisit" || behavior === "bounded-revisits";
}

/** Keep asset dedupe selections; sync page membership with behavior for older readers. */
export function syncPageInDedupeResourceTypes(
  dedupeResourceTypes: ResourceType[],
  behavior: PageCrawlBehavior,
): ResourceType[] {
  const withoutPage = dedupeResourceTypes.filter((type) => type !== "page");
  if (behavior === "unique-explorer") return ["page", ...withoutPage];
  return withoutPage;
}
