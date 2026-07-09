const COLORS_KEY = "sitebench.comparison.runColors";
const VISIBILITY_KEY = "sitebench.comparison.visibility";
const BASELINE_KEY_PREFIX = "sitebench.comparison.baseline.";

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
