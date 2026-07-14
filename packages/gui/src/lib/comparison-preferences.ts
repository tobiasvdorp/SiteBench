const COLORS_KEY = "sitebench.comparison.runColors";
const VISIBILITY_KEY = "sitebench.comparison.visibility";
const CHART_RANGE_MODE_KEY = "sitebench.comparison.chartRangeMode";
const CHART_RANGE_MIN_KEY = "sitebench.comparison.chartRangeMinMs";
const CHART_RANGE_MAX_KEY = "sitebench.comparison.chartRangeMaxMs";
const CHART_VALUE_MODE_KEY = "sitebench.comparison.chartValueMode";
const CHART_RESOURCE_FILTER_KEY = "sitebench.comparison.chartResourceFilter";
const SELECTED_RUN_IDS_KEY = "sitebench.comparison.selectedRunIds";
const BASELINE_KEY_PREFIX = "sitebench.comparison.baseline.";

export type ChartRangeMode = "auto" | "custom";
export type ChartValueMode = "count" | "percent";
export type ChartResourceFilter = "all" | "assets" | "page" | "css" | "js" | "font" | "image" | "other";
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getStoredRunColor(runId: string): string | null {
  const colors = readJson<Record<string, string>>(COLORS_KEY, {});
  return colors[runId] ?? null;
}

export function setStoredRunColor(runId: string, color: string) {
  const colors = readJson<Record<string, string>>(COLORS_KEY, {});
  colors[runId] = color;
  writeJson(COLORS_KEY, colors);
}

export function getStoredVisibility(runId: string): boolean | null {
  const visibility = readJson<Record<string, boolean>>(VISIBILITY_KEY, {});
  const value = visibility[runId];
  return typeof value === "boolean" ? value : null;
}

export function setStoredVisibility(runId: string, visible: boolean) {
  const visibility = readJson<Record<string, boolean>>(VISIBILITY_KEY, {});
  visibility[runId] = visible;
  writeJson(VISIBILITY_KEY, visibility);
}

export function getStoredBaseline(siteOrigin: string): string | null {
  return localStorage.getItem(`${BASELINE_KEY_PREFIX}${siteOrigin}`);
}

export function setStoredBaseline(siteOrigin: string, runId: string | null) {
  const key = `${BASELINE_KEY_PREFIX}${siteOrigin}`;
  if (!runId) localStorage.removeItem(key);
  else localStorage.setItem(key, runId);
}

export function getStoredChartRangeMode(): ChartRangeMode {
  const value = localStorage.getItem(CHART_RANGE_MODE_KEY);
  return value === "custom" ? "custom" : "auto";
}

export function setStoredChartRangeMode(mode: ChartRangeMode) {
  localStorage.setItem(CHART_RANGE_MODE_KEY, mode);
}

export function getStoredChartRangeMinMs(): number | null {
  const value = localStorage.getItem(CHART_RANGE_MIN_KEY);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function setStoredChartRangeMinMs(minMs: number) {
  localStorage.setItem(CHART_RANGE_MIN_KEY, String(minMs));
}

export function getStoredChartRangeMaxMs(): number | null {
  const value = localStorage.getItem(CHART_RANGE_MAX_KEY);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function setStoredChartRangeMaxMs(maxMs: number) {
  localStorage.setItem(CHART_RANGE_MAX_KEY, String(maxMs));
}

export function getStoredChartValueMode(): ChartValueMode {
  return localStorage.getItem(CHART_VALUE_MODE_KEY) === "percent" ? "percent" : "count";
}

export function setStoredChartValueMode(mode: ChartValueMode) {
  localStorage.setItem(CHART_VALUE_MODE_KEY, mode);
}

const CHART_RESOURCE_FILTERS: ChartResourceFilter[] = [
  "all",
  "page",
  "assets",
  "css",
  "js",
  "font",
  "image",
  "other",
];

export function getStoredChartResourceFilter(): ChartResourceFilter {
  const value = localStorage.getItem(CHART_RESOURCE_FILTER_KEY);
  if (value && CHART_RESOURCE_FILTERS.includes(value as ChartResourceFilter)) {
    return value as ChartResourceFilter;
  }
  return "all";
}

export function setStoredChartResourceFilter(filter: ChartResourceFilter) {
  localStorage.setItem(CHART_RESOURCE_FILTER_KEY, filter);
}

export function getStoredSelectedRunIds(): string[] {
  const runIds = readJson<unknown[]>(SELECTED_RUN_IDS_KEY, []);
  return runIds.filter((runId): runId is string => typeof runId === "string" && runId.length > 0);
}

export function setStoredSelectedRunIds(runIds: string[]) {
  writeJson(SELECTED_RUN_IDS_KEY, runIds);
}
