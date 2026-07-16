export { SiteBench, ValidationFailure, StartFailure, DEFAULT_CRAWL_CONFIG, DEFAULT_DB_PATH } from "./sitebench.js";
export type { ComparisonSelection, StartRunInput, SiteBenchOptions } from "./sitebench.js";

export { ComparisonEngine } from "./comparison-engine.js";
export { CrawlOrchestrator } from "./crawl-orchestrator.js";
export { CrawlPolicy } from "./crawl-policy.js";
export { DatabaseStore, createInMemoryStore, aggregatesFromLatencies, emptyTemplateInput, templateInputFromTemplate } from "./database.js";
export {
  DEFAULT_ALLOW_IMAGES,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_EXCLUDE_PAGES_FROM_RESULTS,
  DEFAULT_DEDUPE_RESOURCE_TYPES,
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_PAGE_VISITS,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_PAGE_CRAWL_BEHAVIOR,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RESPECT_ROBOTS,
  DEFAULT_RPS_LIMIT,
  DEFAULT_TIME_LIMIT_SECONDS,
  DEFAULT_WORKER_COUNT,
  HISTOGRAM_BUCKET_SIZE_MS,
  HISTOGRAM_MAX_MS,
} from "./defaults.js";
export {
  PAGE_CRAWL_BEHAVIOR_DESCRIPTIONS,
  PAGE_CRAWL_BEHAVIOR_LABELS,
  expandsOnlyOnFirstVisit,
  normalizeMaxPageVisits,
  normalizePageCrawlBehavior,
  syncPageInDedupeResourceTypes,
} from "./page-crawl-behavior.js";
export { HttpMeasurer } from "./http-measurer.js";
export type { HttpTransport, MeasureResult } from "./http-measurer.js";
export { extractAssets, extractPageLinks } from "./html-parser.js";
export { RequestScheduler } from "./request-scheduler.js";
export { RunRecorder } from "./run-recorder.js";
export {
  getSiteOrigin,
  mergeCrawlConfig,
  normalizeDedupeResourceTypes,
  validateCrawlConfig,
  validateRunName,
  emptyCrawlConfig,
} from "./validation.js";
export { analyzeSlowPages, computeSlowPageThreshold } from "./slow-page-patterns.js";
export {
  buildHistogram,
  computePercentiles,
  createRunId,
  createTemplateId,
  createReportId,
  isSameOrigin,
  normalizeUrl,
  percentile,
  primaryLatency,
  sleep,
} from "./utils.js";
export {
  axisTickIntervalMs,
  bucketIndicesInRange,
  combineHistograms,
  computeAutoChartMaxMs,
  countRequestsBeyondMs,
  histogramBucketPercentages,
  histogramTotalCount,
  lastNonZeroBucketIndex,
  lastNonZeroBucketIndexAcross,
  maxLatencyMsAcross,
  percentilesFromHistogram,
  shouldShowAxisTick,
  validateChartRange,
} from "./histogram.js";

export type {
  ComparisonResult,
  ComparisonRunSeries,
  CrawlConfig,
  ErrorClass,
  HistogramBucket,
  PageCrawlBehavior,
  ProgressEvent,
  Report,
  ReportInput,
  ReportResourceFilter,
  RequestProgressItem,
  RequestRecord,
  RequestTimings,
  ResponseHeaders,
  ResourceType,
  Run,
  RunAggregates,
  RunCompletedEvent,
  RunConfigSnapshot,
  RunEvent,
  RunFailedEvent,
  RunListener,
  RunStatus,
  SlowPageAnalysis,
  SlowPagePattern,
  SlowPagePatternConfidence,
  Template,
  TemplateInput,
  TruncationReason,
  ValidationError,
  ValidationResult,
} from "./types.js";

export { ASSET_RESOURCE_TYPES, DEFAULT_COLORS, PAGE_CRAWL_BEHAVIORS, RESOURCE_TYPES } from "./types.js";
