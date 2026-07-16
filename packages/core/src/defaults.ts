import {
  RESOURCE_TYPES,
  type CrawlConfig,
  type PageCrawlBehavior,
  type ResourceType,
} from "./types.js";

export const DEFAULT_MAX_PAGES = 50;
export const DEFAULT_TIME_LIMIT_SECONDS: number | null = null;
export const DEFAULT_RPS_LIMIT = 2;
export const DEFAULT_WORKER_COUNT = 1;
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
export const START_URL_PROBE_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_REDIRECTS = 5;
export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_ALLOW_IMAGES = false;
export const DEFAULT_EXCLUDE_PAGES_FROM_RESULTS = false;
export const DEFAULT_PAGE_CRAWL_BEHAVIOR: PageCrawlBehavior = "unique-explorer";
export const DEFAULT_MAX_PAGE_VISITS = 3;
export const DEFAULT_DEDUPE_RESOURCE_TYPES: ResourceType[] = [...RESOURCE_TYPES];
export const DEFAULT_RESPECT_ROBOTS = true;

export const DEFAULT_CRAWL_CONFIG: CrawlConfig = {
  startUrl: "",
  rpsLimit: DEFAULT_RPS_LIMIT,
  workerCount: DEFAULT_WORKER_COUNT,
  maxPages: DEFAULT_MAX_PAGES,
  timeLimitSeconds: DEFAULT_TIME_LIMIT_SECONDS,
  allowImages: DEFAULT_ALLOW_IMAGES,
  excludePagesFromResults: DEFAULT_EXCLUDE_PAGES_FROM_RESULTS,
  pageCrawlBehavior: DEFAULT_PAGE_CRAWL_BEHAVIOR,
  maxPageVisits: null,
  dedupeResourceTypes: [...DEFAULT_DEDUPE_RESOURCE_TYPES],
  respectRobots: DEFAULT_RESPECT_ROBOTS,
  requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS,
  maxRedirects: DEFAULT_MAX_REDIRECTS,
  maxRetries: DEFAULT_MAX_RETRIES,
};

export const HISTOGRAM_BUCKET_SIZE_MS = 50;
export const HISTOGRAM_MAX_MS = 5000;

