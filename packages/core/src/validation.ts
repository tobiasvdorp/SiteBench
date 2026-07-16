import {
  DEFAULT_ALLOW_IMAGES,
  DEFAULT_EXCLUDE_PAGES_FROM_RESULTS,
  DEFAULT_DEDUPE_RESOURCE_TYPES,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_CRAWL_CONFIG,
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
} from "./defaults.js";
import {
  normalizeMaxPageVisits,
  normalizePageCrawlBehavior,
  syncPageInDedupeResourceTypes,
} from "./page-crawl-behavior.js";
import {
  ASSET_RESOURCE_TYPES,
  PAGE_CRAWL_BEHAVIORS,
  RESOURCE_TYPES,
  type CrawlConfig,
  type PageCrawlBehavior,
  type ResourceType,
  type ValidationError,
  type ValidationResult,
} from "./types.js";

type PartialCrawlConfig = Partial<CrawlConfig> & {
  /** @deprecated Prefer `dedupeResourceTypes`. Kept for reading older configs. */
  dedupeRequests?: boolean;
};

const PUBLIC_SCHEMES = new Set(["http:", "https:"]);
const PAGE_CRAWL_BEHAVIOR_SET = new Set<string>(PAGE_CRAWL_BEHAVIORS);

export function getSiteOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!PUBLIC_SCHEMES.has(parsed.protocol)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function pushError(errors: ValidationError[], field: string, message: string) {
  errors.push({ field, message });
}

function validateUrl(value: unknown, field: string, errors: ValidationError[]): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    pushError(errors, field, "URL is required");
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    pushError(errors, field, "URL must be a valid absolute URL");
    return null;
  }

  if (!PUBLIC_SCHEMES.has(parsed.protocol)) {
    pushError(errors, field, "Only public http and https URLs are supported");
    return null;
  }

  if (parsed.username || parsed.password) {
    pushError(errors, field, "URLs with credentials are not supported");
    return null;
  }

  return parsed.href;
}

function validatePositiveInt(
  value: unknown,
  field: string,
  errors: ValidationError[],
  min = 1,
  max = 10_000,
): number | null {
  if (value === undefined || value === null) return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    pushError(errors, field, `Must be an integer between ${min} and ${max}`);
    return null;
  }
  return num;
}

function validateOptionalLimit(
  value: unknown,
  field: string,
  errors: ValidationError[],
  min: number,
  max: number,
): number | null {
  if (value === undefined || value === null || value === "") return null;
  return validatePositiveInt(value, field, errors, min, max);
}

function validateBoolean(value: unknown, field: string, errors: ValidationError[]): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") {
    pushError(errors, field, "Must be a boolean");
    return null;
  }
  return value;
}

const RESOURCE_TYPE_SET = new Set<string>(RESOURCE_TYPES);

/**
 * Normalize dedupe settings from current `dedupeResourceTypes` or legacy `dedupeRequests`.
 * Legacy `false` maps to asset types only (old runtime skipped page dedupe but always deduped assets).
 */
export function normalizeDedupeResourceTypes(
  dedupeResourceTypes: unknown,
  legacyDedupeRequests?: unknown,
): ResourceType[] {
  if (Array.isArray(dedupeResourceTypes)) {
    const selected = new Set(
      dedupeResourceTypes.filter(
        (type): type is ResourceType => typeof type === "string" && RESOURCE_TYPE_SET.has(type),
      ),
    );
    return RESOURCE_TYPES.filter((type) => selected.has(type));
  }

  if (legacyDedupeRequests === false) return [...ASSET_RESOURCE_TYPES];
  return [...DEFAULT_DEDUPE_RESOURCE_TYPES];
}

function validateDedupeResourceTypes(
  value: unknown,
  field: string,
  errors: ValidationError[],
  legacyDedupeRequests?: unknown,
): ResourceType[] {
  if (value === undefined || value === null) {
    return normalizeDedupeResourceTypes(undefined, legacyDedupeRequests);
  }
  if (!Array.isArray(value)) {
    pushError(errors, field, "Must be an array of resource types");
    return [...DEFAULT_DEDUPE_RESOURCE_TYPES];
  }
  for (const entry of value) {
    if (typeof entry !== "string" || !RESOURCE_TYPE_SET.has(entry)) {
      pushError(
        errors,
        field,
        `Invalid resource type "${String(entry)}"; expected one of ${RESOURCE_TYPES.join(", ")}`,
      );
      return [...DEFAULT_DEDUPE_RESOURCE_TYPES];
    }
  }
  return normalizeDedupeResourceTypes(value);
}

function validatePageCrawlBehavior(
  value: unknown,
  field: string,
  errors: ValidationError[],
  dedupeResourceTypes: unknown,
  legacyDedupeRequests?: unknown,
): PageCrawlBehavior {
  if (value === undefined || value === null) {
    return normalizePageCrawlBehavior(undefined, dedupeResourceTypes, legacyDedupeRequests);
  }
  if (typeof value !== "string" || !PAGE_CRAWL_BEHAVIOR_SET.has(value)) {
    pushError(
      errors,
      field,
      `Invalid page crawl behavior; expected one of ${PAGE_CRAWL_BEHAVIORS.join(", ")}`,
    );
    return DEFAULT_PAGE_CRAWL_BEHAVIOR;
  }
  return value as PageCrawlBehavior;
}

function validateMaxPageVisits(
  value: unknown,
  field: string,
  errors: ValidationError[],
  behavior: PageCrawlBehavior,
): number | null {
  if (behavior !== "bounded-revisits") return null;
  if (value === undefined || value === null || value === "") return DEFAULT_MAX_PAGE_VISITS;
  return validatePositiveInt(value, field, errors, 1, 10_000) ?? DEFAULT_MAX_PAGE_VISITS;
}

type ValidateCrawlConfigOptions = {
  applyDefaultMaxPages?: boolean;
};

export function validateRunName(name: unknown): ValidationError[] {
  if (typeof name !== "string" || name.trim() === "") {
    return [{ field: "runName", message: "Run name is required" }];
  }
  if (name.trim().length > 120) {
    return [{ field: "runName", message: "Run name must be at most 120 characters" }];
  }
  return [];
}

export function validateCrawlConfig(
  input: PartialCrawlConfig,
  options: ValidateCrawlConfigOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const applyDefaultMaxPages = options.applyDefaultMaxPages ?? false;

  const startUrl = validateUrl(input.startUrl, "startUrl", errors);
  const rpsLimit =
    validatePositiveInt(input.rpsLimit, "rpsLimit", errors, 1, 100) ?? DEFAULT_RPS_LIMIT;
  const workerCount =
    validatePositiveInt(input.workerCount, "workerCount", errors, 1, 20) ?? DEFAULT_WORKER_COUNT;

  let maxPages = validateOptionalLimit(input.maxPages, "maxPages", errors, 1, 10_000);
  if (maxPages === null && applyDefaultMaxPages && input.maxPages === undefined) {
    maxPages = DEFAULT_MAX_PAGES;
  }

  const timeLimitSeconds =
    validateOptionalLimit(input.timeLimitSeconds, "timeLimitSeconds", errors, 1, 86_400) ??
    DEFAULT_TIME_LIMIT_SECONDS;

  const allowImages = validateBoolean(input.allowImages, "allowImages", errors) ?? DEFAULT_ALLOW_IMAGES;
  const excludePagesFromResults =
    validateBoolean(input.excludePagesFromResults, "excludePagesFromResults", errors) ??
    DEFAULT_EXCLUDE_PAGES_FROM_RESULTS;
  const pageCrawlBehavior = validatePageCrawlBehavior(
    input.pageCrawlBehavior,
    "pageCrawlBehavior",
    errors,
    input.dedupeResourceTypes,
    input.dedupeRequests,
  );
  const maxPageVisits = validateMaxPageVisits(
    input.maxPageVisits,
    "maxPageVisits",
    errors,
    pageCrawlBehavior,
  );
  const dedupeResourceTypes = syncPageInDedupeResourceTypes(
    validateDedupeResourceTypes(
      input.dedupeResourceTypes,
      "dedupeResourceTypes",
      errors,
      input.dedupeRequests,
    ),
    pageCrawlBehavior,
  );
  const respectRobots =
    validateBoolean(input.respectRobots, "respectRobots", errors) ?? DEFAULT_RESPECT_ROBOTS;
  const requestTimeoutMs =
    validatePositiveInt(input.requestTimeoutMs, "requestTimeoutMs", errors, 1000, 300_000) ??
    DEFAULT_REQUEST_TIMEOUT_MS;
  const connectTimeoutMs =
    validatePositiveInt(input.connectTimeoutMs, "connectTimeoutMs", errors, 500, 120_000) ??
    DEFAULT_CONNECT_TIMEOUT_MS;
  const maxRedirects =
    validatePositiveInt(input.maxRedirects, "maxRedirects", errors, 0, 20) ?? DEFAULT_MAX_REDIRECTS;
  const maxRetries =
    validatePositiveInt(input.maxRetries, "maxRetries", errors, 0, 10) ?? DEFAULT_MAX_RETRIES;

  if (connectTimeoutMs > requestTimeoutMs) {
    pushError(errors, "connectTimeoutMs", "Connect timeout must not exceed request timeout");
  }

  if (maxPages === null && timeLimitSeconds === null) {
    pushError(
      errors,
      "limits",
      "Either maxPages or timeLimitSeconds (or both) is required",
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    config: {
      startUrl: startUrl!,
      rpsLimit,
      workerCount,
      maxPages,
      timeLimitSeconds,
      allowImages,
      excludePagesFromResults,
      pageCrawlBehavior,
      maxPageVisits,
      dedupeResourceTypes,
      respectRobots,
      requestTimeoutMs,
      connectTimeoutMs,
      maxRedirects,
      maxRetries,
    },
  };
}

export function mergeCrawlConfig(base: CrawlConfig, overrides: PartialCrawlConfig): CrawlConfig {
  const pageCrawlBehavior =
    overrides.pageCrawlBehavior ??
    normalizePageCrawlBehavior(
      base.pageCrawlBehavior,
      overrides.dedupeResourceTypes ?? base.dedupeResourceTypes,
      overrides.dedupeRequests,
    );
  const maxPageVisits = normalizeMaxPageVisits(
    overrides.maxPageVisits !== undefined ? overrides.maxPageVisits : base.maxPageVisits,
    pageCrawlBehavior,
  );
  const dedupeResourceTypes = syncPageInDedupeResourceTypes(
    overrides.dedupeResourceTypes ?? base.dedupeResourceTypes,
    pageCrawlBehavior,
  );

  return {
    startUrl: overrides.startUrl ?? base.startUrl,
    rpsLimit: overrides.rpsLimit ?? base.rpsLimit,
    workerCount: overrides.workerCount ?? base.workerCount,
    maxPages: overrides.maxPages !== undefined ? overrides.maxPages : base.maxPages,
    timeLimitSeconds:
      overrides.timeLimitSeconds !== undefined ? overrides.timeLimitSeconds : base.timeLimitSeconds,
    allowImages: overrides.allowImages ?? base.allowImages,
    excludePagesFromResults:
      overrides.excludePagesFromResults ?? base.excludePagesFromResults,
    pageCrawlBehavior,
    maxPageVisits,
    dedupeResourceTypes,
    respectRobots: overrides.respectRobots ?? base.respectRobots,
    requestTimeoutMs: overrides.requestTimeoutMs ?? base.requestTimeoutMs,
    connectTimeoutMs: overrides.connectTimeoutMs ?? base.connectTimeoutMs,
    maxRedirects: overrides.maxRedirects ?? base.maxRedirects,
    maxRetries: overrides.maxRetries ?? base.maxRetries,
  };
}

export function emptyCrawlConfig(): CrawlConfig {
  return { ...DEFAULT_CRAWL_CONFIG };
}

export function classifyHttpStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

export function isRunComparable(run: { status: string; aggregates: unknown | null }): boolean {
  if (!run.aggregates) return false;
  return run.status === "completed" || run.status === "stopped";
}

export {
  normalizeMaxPageVisits,
  normalizePageCrawlBehavior,
  syncPageInDedupeResourceTypes,
} from "./page-crawl-behavior.js";
