export type RunStatus = "pending" | "running" | "completed" | "failed" | "stopped";

export type ResourceType =
  | "page"
  | "css"
  | "js"
  | "font"
  | "image"
  | "other";

export const RESOURCE_TYPES: ResourceType[] = ["page", "css", "js", "font", "image", "other"];
export const ASSET_RESOURCE_TYPES: ResourceType[] = ["css", "js", "font", "image", "other"];

export type ErrorClass =
  | "dns"
  | "tls"
  | "timeout"
  | "connection"
  | "http"
  | "redirect"
  | "robots"
  | "validation"
  | "unknown";

export type TruncationReason = "max-pages" | "time-limit";

/**
 * How page discovery behaves when a URL is seen again.
 * - unique-explorer: fetch each page once and expand its links
 * - hub-revisit: refetch rediscovered pages, but expand links only on the first visit
 * - bounded-revisits: like hub-revisit, capped by maxPageVisits per URL
 * - stress: refetch and re-expand every rediscovery (load/stress mode)
 */
export type PageCrawlBehavior =
  | "unique-explorer"
  | "hub-revisit"
  | "bounded-revisits"
  | "stress";

export const PAGE_CRAWL_BEHAVIORS: PageCrawlBehavior[] = [
  "unique-explorer",
  "hub-revisit",
  "bounded-revisits",
  "stress",
];

export type CrawlConfig = {
  startUrl: string;
  rpsLimit: number;
  workerCount: number;
  maxPages: number | null;
  timeLimitSeconds: number | null;
  allowImages: boolean;
  excludePagesFromResults: boolean;
  pageCrawlBehavior: PageCrawlBehavior;
  /** Total fetches allowed per page URL when behavior is bounded-revisits. */
  maxPageVisits: number | null;
  dedupeResourceTypes: ResourceType[];
  respectRobots: boolean;
  requestTimeoutMs: number;
  connectTimeoutMs: number;
  maxRedirects: number;
  maxRetries: number;
};

export type Template = CrawlConfig & {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type TemplateInput = CrawlConfig & {
  name: string;
};

export type RunConfigSnapshot = CrawlConfig & {
  templateId: string | null;
  templateName: string | null;
  runName: string;
  siteOrigin: string;
};

export type RequestTimings = {
  dnsMs: number | null;
  connectMs: number | null;
  ttfbMs: number | null;
  totalMs: number;
};

export type ResponseHeaders = Record<string, string>;

export type RequestRecord = {
  id: string;
  runId: string;
  url: string;
  resourceType: ResourceType;
  statusCode: number | null;
  errorClass: ErrorClass | null;
  errorMessage: string | null;
  timings: RequestTimings;
  byteCount: number;
  redirectCount: number;
  contentType: string | null;
  responseHeaders: ResponseHeaders;
  createdAt: string;
};

export type SlowPagePatternConfidence = "high" | "medium" | "low";

export type SlowPagePattern = {
  label: string;
  dimension: string;
  value: string;
  slowCount: number;
  totalCount: number;
  avgLatencyMs: number;
  enrichment: number;
  confidence: SlowPagePatternConfidence;
};

export type SlowPageAnalysis = {
  thresholdMs: number;
  slowPages: RequestRecord[];
  patterns: SlowPagePattern[];
};

export type ResourceTypeCounts = Record<ResourceType, number>;

export type LatencyPercentiles = {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
};

export type RunAggregates = {
  totalRequests: number;
  uniqueRequests: number;
  errorCount: number;
  pageCount: number;
  resourceTypeCounts: ResourceTypeCounts;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  latencyHistogram: HistogramBucket[];
  latencyHistogramsByResourceType?: Record<ResourceType, HistogramBucket[]>;
  percentilesByResourceType?: Record<ResourceType, LatencyPercentiles>;
  assetPercentiles?: LatencyPercentiles;
};

export type HistogramBucket = {
  minMs: number;
  maxMs: number;
  count: number;
};

export type Run = {
  id: string;
  name: string;
  siteOrigin: string;
  status: RunStatus;
  configSnapshot: RunConfigSnapshot;
  startedAt: string;
  completedAt: string | null;
  aggregates: RunAggregates | null;
  truncated: boolean;
  truncationReason: TruncationReason | null;
  errorSummary: string | null;
};

export type ValidationError = {
  field: string;
  message: string;
};

export type ValidationResult =
  | { ok: true; config: CrawlConfig }
  | { ok: false; errors: ValidationError[] };

export type RequestProgressItem = {
  url: string;
  resourceType: ResourceType;
  statusCode: number | null;
  errorClass: ErrorClass | null;
  errorMessage: string | null;
  totalMs: number;
  at: string;
};

export type ProgressEvent = {
  type: "progress";
  runId: string;
  pagesDiscovered: number;
  pagesFetched: number;
  requestsCompleted: number;
  errors: number;
  queueSize: number;
  recentRequests: RequestProgressItem[];
};

export type RunCompletedEvent = {
  type: "completed";
  runId: string;
  run: Run;
};

export type RunFailedEvent = {
  type: "failed";
  runId: string;
  message: string;
};

export type RunEvent = ProgressEvent | RunCompletedEvent | RunFailedEvent;

export type RunListener = (event: RunEvent) => void;

export type ComparisonRunSeries = {
  runId: string;
  runName: string;
  color: string;
  visible: boolean;
  isBaseline: boolean;
  histogram: HistogramBucket[];
  histogramsByResourceType: Record<ResourceType, HistogramBucket[]>;
  percentiles: LatencyPercentiles;
  percentilesByResourceType: Record<ResourceType, LatencyPercentiles>;
  assetPercentiles: LatencyPercentiles;
  deltas: {
    p50: number | null;
    p75: number | null;
    p90: number | null;
    p95: number | null;
    p99: number | null;
  } | null;
};

export type ComparisonResult = {
  siteOrigin: string;
  runs: ComparisonRunSeries[];
};

export type ReportResourceFilter =
  | "all"
  | "assets"
  | "page"
  | "css"
  | "js"
  | "font"
  | "image"
  | "other";

export type Report = {
  id: string;
  name: string;
  siteOrigin: string;
  runIds: string[];
  baselineRunId: string | null;
  resourceFilter: ReportResourceFilter;
  createdAt: string;
  updatedAt: string;
};

export type ReportInput = {
  name: string;
  siteOrigin: string;
  runIds: string[];
  baselineRunId: string | null;
  resourceFilter: ReportResourceFilter;
};

export const DEFAULT_COLORS = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#0891b2",
  "#ea580c",
  "#4b5563",
] as const;
