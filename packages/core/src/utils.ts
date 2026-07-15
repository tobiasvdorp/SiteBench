import { createId } from "./id.js";
import type { RequestTimings } from "./types.js";

export {
  buildHistogram,
  combineHistograms,
  computePercentiles,
  histogramBucketPercentages,
  histogramTotalCount,
  percentile,
} from "./histogram.js";

export function createRunId() {
  return createId("run");
}

export function createTemplateId() {
  return createId("tpl");
}

export function createReportId() {
  return createId("rpt");
}

export function createRequestId() {
  return createId("req");
}

export function nowIso() {
  return new Date().toISOString();
}

export function primaryLatency(timings: RequestTimings): number {
  return timings.ttfbMs ?? timings.totalMs;
}

export function normalizeUrl(url: string, base?: string): string | null {
  try {
    const parsed = base ? new URL(url, base) : new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return null;
  }
}

export function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

export function detectResourceType(url: string, contentType?: string | null): import("./types.js").ResourceType {
  const path = new URL(url).pathname.toLowerCase();
  if (/\.(css)$/.test(path) || contentType?.includes("text/css")) return "css";
  if (/\.(js|mjs)$/.test(path) || contentType?.includes("javascript")) return "js";
  if (/\.(woff2?|ttf|otf|eot)$/.test(path) || contentType?.includes("font")) return "font";
  if (/\.(png|jpe?g|gif|webp|svg|avif|ico)$/.test(path) || contentType?.startsWith("image/")) return "image";
  if (/\.(html?|php|asp|aspx)$/.test(path) || contentType?.includes("text/html")) return "page";
  return "other";
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
