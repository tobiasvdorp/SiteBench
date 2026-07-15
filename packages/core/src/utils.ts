import { createId } from "./id.js";
import { HISTOGRAM_BUCKET_SIZE_MS, HISTOGRAM_MAX_MS } from "./defaults.js";
import type { HistogramBucket, RequestTimings } from "./types.js";

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

export function computePercentiles(values: number[]) {
  return {
    p50: percentile(values, 50),
    p75: percentile(values, 75),
    p90: percentile(values, 90),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
  };
}

export function buildHistogram(values: number[]): HistogramBucket[] {
  const bucketCount = Math.ceil(HISTOGRAM_MAX_MS / HISTOGRAM_BUCKET_SIZE_MS);
  const buckets: HistogramBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    minMs: i * HISTOGRAM_BUCKET_SIZE_MS,
    maxMs: (i + 1) * HISTOGRAM_BUCKET_SIZE_MS,
    count: 0,
  }));

  for (const value of values) {
    const clamped = Math.min(value, HISTOGRAM_MAX_MS - 1);
    const index = Math.floor(clamped / HISTOGRAM_BUCKET_SIZE_MS);
    buckets[index].count += 1;
  }

  return buckets;
}

export { histogramBucketPercentages, histogramTotalCount, combineHistograms } from "./histogram.js";

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
