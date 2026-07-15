import type { CrawlConfig, Template } from "@sitebench/core";

const RUN_SETTINGS_KEY = "sitebench.run.settings";

export type RunSettingsFormState = Omit<CrawlConfig, "maxPages" | "timeLimitSeconds" | "respectRobots"> & {
  maxPages: string;
  timeLimitSeconds: string;
};

function optionalNumber(value: string) {
  if (value.trim() === "") return null;
  return Number(value);
}

export function defaultsToForm(defaults: CrawlConfig | null): RunSettingsFormState {
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
    dedupeRequests: defaults?.dedupeRequests ?? true,
    requestTimeoutMs: defaults?.requestTimeoutMs ?? 30_000,
    connectTimeoutMs: defaults?.connectTimeoutMs ?? 10_000,
    maxRedirects: defaults?.maxRedirects ?? 5,
    maxRetries: defaults?.maxRetries ?? 2,
  };
}

export function templateToForm(template: Template): RunSettingsFormState {
  return {
    startUrl: template.startUrl,
    rpsLimit: template.rpsLimit,
    workerCount: template.workerCount,
    maxPages: template.maxPages === null ? "" : String(template.maxPages),
    timeLimitSeconds: template.timeLimitSeconds === null ? "" : String(template.timeLimitSeconds),
    allowImages: template.allowImages,
    excludePagesFromResults: template.excludePagesFromResults,
    dedupeRequests: template.dedupeRequests,
    requestTimeoutMs: template.requestTimeoutMs,
    connectTimeoutMs: template.connectTimeoutMs,
    maxRedirects: template.maxRedirects,
    maxRetries: template.maxRetries,
  };
}

export function formToCrawlConfig(form: RunSettingsFormState): CrawlConfig {
  return {
    ...form,
    maxPages: optionalNumber(form.maxPages),
    timeLimitSeconds: optionalNumber(form.timeLimitSeconds),
    respectRobots: true,
  };
}

function readStoredForm(): RunSettingsFormState | null {
  try {
    const raw = localStorage.getItem(RUN_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RunSettingsFormState>;
    if (typeof parsed.startUrl !== "string") return null;
    return {
      startUrl: parsed.startUrl,
      rpsLimit: typeof parsed.rpsLimit === "number" ? parsed.rpsLimit : 2,
      workerCount: typeof parsed.workerCount === "number" ? parsed.workerCount : 1,
      maxPages: typeof parsed.maxPages === "string" ? parsed.maxPages : "",
      timeLimitSeconds: typeof parsed.timeLimitSeconds === "string" ? parsed.timeLimitSeconds : "",
      allowImages: parsed.allowImages === true,
      excludePagesFromResults: parsed.excludePagesFromResults === true,
      dedupeRequests: parsed.dedupeRequests !== false,
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
