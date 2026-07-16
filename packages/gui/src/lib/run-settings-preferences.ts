import type { CrawlConfig, PageCrawlBehavior, ResourceType, Template } from "@sitebench/core";

const RUN_SETTINGS_KEY = "sitebench.run.settings";

const RESOURCE_TYPES: ResourceType[] = ["page", "css", "js", "font", "image", "other"];
const ASSET_RESOURCE_TYPES: ResourceType[] = ["css", "js", "font", "image", "other"];
const DEFAULT_DEDUPE_RESOURCE_TYPES: ResourceType[] = [...RESOURCE_TYPES];
const RESOURCE_TYPE_SET = new Set<string>(RESOURCE_TYPES);
const PAGE_CRAWL_BEHAVIORS: PageCrawlBehavior[] = [
  "unique-explorer",
  "hub-revisit",
  "bounded-revisits",
  "stress",
];
const PAGE_CRAWL_BEHAVIOR_SET = new Set<string>(PAGE_CRAWL_BEHAVIORS);
const DEFAULT_PAGE_CRAWL_BEHAVIOR: PageCrawlBehavior = "unique-explorer";
const DEFAULT_MAX_PAGE_VISITS = 3;

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

export type RunSettingsFormState = Omit<
  CrawlConfig,
  "maxPages" | "timeLimitSeconds" | "respectRobots" | "maxPageVisits"
> & {
  maxPages: string;
  timeLimitSeconds: string;
  maxPageVisits: string;
};

function optionalNumber(value: string) {
  if (value.trim() === "") return null;
  return Number(value);
}

function normalizeDedupeResourceTypes(
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

function normalizePageCrawlBehavior(
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

function normalizeMaxPageVisits(value: unknown, behavior: PageCrawlBehavior): number | null {
  if (behavior !== "bounded-revisits") return null;
  if (value === undefined || value === null || value === "") return DEFAULT_MAX_PAGE_VISITS;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 10_000) return DEFAULT_MAX_PAGE_VISITS;
  return num;
}

function syncPageInDedupeResourceTypes(
  dedupeResourceTypes: ResourceType[],
  behavior: PageCrawlBehavior,
): ResourceType[] {
  const withoutPage = dedupeResourceTypes.filter((type) => type !== "page");
  if (behavior === "unique-explorer") return ["page", ...withoutPage];
  return withoutPage;
}

export function defaultsToForm(defaults: CrawlConfig | null): RunSettingsFormState {
  const pageCrawlBehavior = normalizePageCrawlBehavior(
    defaults?.pageCrawlBehavior,
    defaults?.dedupeResourceTypes,
  );
  return {
    startUrl: defaults?.startUrl ?? "https://example.com",
    rpsLimit: defaults?.rpsLimit ?? 2,
    workerCount: defaults?.workerCount ?? 1,
    maxPages: defaults?.maxPages === null || defaults?.maxPages === undefined ? "" : String(defaults.maxPages),
    timeLimitSeconds:
      defaults?.timeLimitSeconds === null || defaults?.timeLimitSeconds === undefined
        ? ""
        : String(defaults.timeLimitSeconds),
    allowImages: defaults?.allowImages ?? false,
    excludePagesFromResults: defaults?.excludePagesFromResults ?? false,
    pageCrawlBehavior,
    maxPageVisits:
      defaults?.maxPageVisits === null || defaults?.maxPageVisits === undefined
        ? String(DEFAULT_MAX_PAGE_VISITS)
        : String(defaults.maxPageVisits),
    dedupeResourceTypes: syncPageInDedupeResourceTypes(
      defaults?.dedupeResourceTypes ?? [...DEFAULT_DEDUPE_RESOURCE_TYPES],
      pageCrawlBehavior,
    ),
    requestTimeoutMs: defaults?.requestTimeoutMs ?? 30_000,
    connectTimeoutMs: defaults?.connectTimeoutMs ?? 10_000,
    maxRedirects: defaults?.maxRedirects ?? 5,
    maxRetries: defaults?.maxRetries ?? 2,
  };
}

export function templateToForm(template: Template): RunSettingsFormState {
  const pageCrawlBehavior = normalizePageCrawlBehavior(
    template.pageCrawlBehavior,
    template.dedupeResourceTypes,
    (template as Template & { dedupeRequests?: boolean }).dedupeRequests,
  );
  return {
    startUrl: template.startUrl,
    rpsLimit: template.rpsLimit,
    workerCount: template.workerCount,
    maxPages: template.maxPages === null ? "" : String(template.maxPages),
    timeLimitSeconds: template.timeLimitSeconds === null ? "" : String(template.timeLimitSeconds),
    allowImages: template.allowImages,
    excludePagesFromResults: template.excludePagesFromResults,
    pageCrawlBehavior,
    maxPageVisits: String(
      normalizeMaxPageVisits(template.maxPageVisits, pageCrawlBehavior) ?? DEFAULT_MAX_PAGE_VISITS,
    ),
    dedupeResourceTypes: syncPageInDedupeResourceTypes(
      normalizeDedupeResourceTypes(
        template.dedupeResourceTypes,
        (template as Template & { dedupeRequests?: boolean }).dedupeRequests,
      ),
      pageCrawlBehavior,
    ),
    requestTimeoutMs: template.requestTimeoutMs,
    connectTimeoutMs: template.connectTimeoutMs,
    maxRedirects: template.maxRedirects,
    maxRetries: template.maxRetries,
  };
}

export function formToCrawlConfig(form: RunSettingsFormState): CrawlConfig {
  const pageCrawlBehavior = form.pageCrawlBehavior;
  return {
    startUrl: form.startUrl,
    rpsLimit: form.rpsLimit,
    workerCount: form.workerCount,
    maxPages: optionalNumber(form.maxPages),
    timeLimitSeconds: optionalNumber(form.timeLimitSeconds),
    allowImages: form.allowImages,
    excludePagesFromResults: form.excludePagesFromResults,
    pageCrawlBehavior,
    maxPageVisits: normalizeMaxPageVisits(optionalNumber(form.maxPageVisits), pageCrawlBehavior),
    dedupeResourceTypes: syncPageInDedupeResourceTypes(form.dedupeResourceTypes, pageCrawlBehavior),
    respectRobots: true,
    requestTimeoutMs: form.requestTimeoutMs,
    connectTimeoutMs: form.connectTimeoutMs,
    maxRedirects: form.maxRedirects,
    maxRetries: form.maxRetries,
  };
}

function readStoredForm(): RunSettingsFormState | null {
  try {
    const raw = localStorage.getItem(RUN_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunSettingsFormState> & { dedupeRequests?: boolean };
    if (typeof parsed.startUrl !== "string") return null;
    const pageCrawlBehavior = normalizePageCrawlBehavior(
      parsed.pageCrawlBehavior,
      parsed.dedupeResourceTypes,
      parsed.dedupeRequests,
    );
    return {
      startUrl: parsed.startUrl,
      rpsLimit: typeof parsed.rpsLimit === "number" ? parsed.rpsLimit : 2,
      workerCount: typeof parsed.workerCount === "number" ? parsed.workerCount : 1,
      maxPages: typeof parsed.maxPages === "string" ? parsed.maxPages : "",
      timeLimitSeconds: typeof parsed.timeLimitSeconds === "string" ? parsed.timeLimitSeconds : "",
      allowImages: parsed.allowImages === true,
      excludePagesFromResults: parsed.excludePagesFromResults === true,
      pageCrawlBehavior,
      maxPageVisits:
        typeof parsed.maxPageVisits === "string"
          ? parsed.maxPageVisits
          : String(DEFAULT_MAX_PAGE_VISITS),
      dedupeResourceTypes: syncPageInDedupeResourceTypes(
        normalizeDedupeResourceTypes(parsed.dedupeResourceTypes, parsed.dedupeRequests),
        pageCrawlBehavior,
      ),
      requestTimeoutMs: typeof parsed.requestTimeoutMs === "number" ? parsed.requestTimeoutMs : 30_000,
      connectTimeoutMs: typeof parsed.connectTimeoutMs === "number" ? parsed.connectTimeoutMs : 10_000,
      maxRedirects: typeof parsed.maxRedirects === "number" ? parsed.maxRedirects : 5,
      maxRetries: typeof parsed.maxRetries === "number" ? parsed.maxRetries : 2,
    };
  } catch {
    return null;
  }
}

export function hasStoredRunSettings() {
  return localStorage.getItem(RUN_SETTINGS_KEY) !== null;
}

export function getStoredRunSettings(defaults: CrawlConfig | null): RunSettingsFormState {
  return readStoredForm() ?? defaultsToForm(defaults);
}

export function setStoredRunSettings(settings: RunSettingsFormState) {
  localStorage.setItem(RUN_SETTINGS_KEY, JSON.stringify(settings));
}

export function toggleDedupeResourceType(
  current: ResourceType[],
  type: ResourceType,
  enabled: boolean,
): ResourceType[] {
  const next = new Set(current);
  if (enabled) next.add(type);
  else next.delete(type);
  return RESOURCE_TYPES.filter((resourceType) => next.has(resourceType));
}

export function isPageCrawlBehavior(value: string): value is PageCrawlBehavior {
  return PAGE_CRAWL_BEHAVIOR_SET.has(value);
}

export function resolvePageCrawlBehaviorLabel(
  pageCrawlBehavior: unknown,
  dedupeResourceTypes?: unknown,
): string {
  return PAGE_CRAWL_BEHAVIOR_LABELS[
    normalizePageCrawlBehavior(pageCrawlBehavior, dedupeResourceTypes)
  ];
}

export { ASSET_RESOURCE_TYPES, PAGE_CRAWL_BEHAVIORS, RESOURCE_TYPES };
