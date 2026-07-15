import type { HistogramBucket } from "./types.js";
import { HISTOGRAM_BUCKET_SIZE_MS, HISTOGRAM_MAX_MS } from "./defaults.js";

export { HISTOGRAM_BUCKET_SIZE_MS, HISTOGRAM_MAX_MS };

export function histogramTotalCount(buckets: HistogramBucket[]): number {
  return buckets.reduce((sum, bucket) => sum + bucket.count, 0);
}

export function histogramBucketPercentages(buckets: HistogramBucket[]): number[] {
  const total = histogramTotalCount(buckets);
  if (total === 0) return buckets.map(() => 0);
  return buckets.map((bucket) => (bucket.count / total) * 100);
}

export function combineHistograms(histograms: HistogramBucket[][]): HistogramBucket[] {
  const first = histograms.find((histogram) => histogram.length > 0);
  if (!first) return [];

  return first.map((bucket, index) => ({
    minMs: bucket.minMs,
    maxMs: bucket.maxMs,
    count: histograms.reduce((sum, histogram) => sum + (histogram[index]?.count ?? 0), 0),
  }));
}

export function lastNonZeroBucketIndex(buckets: HistogramBucket[]): number {
  for (let index = buckets.length - 1; index >= 0; index -= 1) {
    if (buckets[index].count > 0) return index;
  }
  return -1;
}

export function lastNonZeroBucketIndexAcross(histograms: HistogramBucket[][]): number {
  let lastIndex = -1;
  for (const buckets of histograms) {
    const index = lastNonZeroBucketIndex(buckets);
    if (index > lastIndex) lastIndex = index;
  }
  return lastIndex;
}

export function computeAutoChartMaxMs(
  farthestBucketMaxMs: number,
  bucketSizeMs: number,
  histogramMaxMs: number,
): number {
  if (farthestBucketMaxMs <= 0) return Math.min(bucketSizeMs, histogramMaxMs);

  const paddedMaxMs = Math.ceil((farthestBucketMaxMs * 1.1) / bucketSizeMs) * bucketSizeMs;
  const nextBucketMaxMs = farthestBucketMaxMs + bucketSizeMs;
  return Math.min(Math.max(paddedMaxMs, nextBucketMaxMs), histogramMaxMs);
}

export function validateChartRange(
  minMs: number,
  maxMs: number,
  histogramMaxMs: number,
  bucketSizeMs: number,
): { valid: boolean; error: string | null; minMs: number; maxMs: number } {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    return { valid: false, error: "Enter valid numbers.", minMs: 0, maxMs: histogramMaxMs };
  }

  if (minMs < 0) {
    return { valid: false, error: "Minimum must be at least 0 ms.", minMs: 0, maxMs };
  }

  if (maxMs > histogramMaxMs) {
    return {
      valid: false,
      error: `Maximum cannot exceed ${histogramMaxMs} ms.`,
      minMs,
      maxMs: histogramMaxMs,
    };
  }

  if (maxMs <= minMs) {
    return { valid: false, error: "Maximum must be greater than minimum.", minMs, maxMs };
  }

  if (maxMs - minMs < bucketSizeMs) {
    return {
      valid: false,
      error: `Range must span at least ${bucketSizeMs} ms.`,
      minMs,
      maxMs,
    };
  }

  return { valid: true, error: null, minMs, maxMs };
}

export function bucketIndexForMs(ms: number, bucketSizeMs: number): number {
  return Math.floor(ms / bucketSizeMs);
}

export function bucketIndicesInRange(
  minMs: number,
  maxMs: number,
  bucketSizeMs: number,
  bucketCount: number,
): { startIndex: number; endIndex: number } {
  const startIndex = Math.max(0, bucketIndexForMs(minMs, bucketSizeMs));
  const endIndex = Math.min(
    bucketCount - 1,
    Math.max(startIndex, bucketIndexForMs(maxMs - 1, bucketSizeMs)),
  );
  return { startIndex, endIndex };
}

export function axisTickIntervalMs(rangeMs: number): number {
  if (rangeMs <= 400) return 100;
  if (rangeMs <= 1000) return 200;
  if (rangeMs <= 2500) return 500;
  return 1000;
}

export function shouldShowAxisTick(bucketMinMs: number, tickIntervalMs: number): boolean {
  return bucketMinMs % tickIntervalMs === 0;
}

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

const PERCENTILE_TARGETS = {
  p50: 50,
  p75: 75,
  p90: 90,
  p95: 95,
  p99: 99,
} as const;

export type HistogramPercentiles = {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
};

export function percentilesFromHistogram(buckets: HistogramBucket[]): HistogramPercentiles {
  const total = histogramTotalCount(buckets);
  if (total === 0) return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };

  let cumulative = 0;
  const entries = Object.entries(PERCENTILE_TARGETS) as [keyof HistogramPercentiles, number][];
  const result = Object.fromEntries(entries.map(([key]) => [key, 0])) as HistogramPercentiles;
  let entryIndex = 0;

  for (const bucket of buckets) {
    cumulative += bucket.count;
    while (entryIndex < entries.length) {
      const [key, target] = entries[entryIndex];
      const threshold = Math.ceil((target / 100) * total);
      if (cumulative < threshold) break;
      result[key] = bucket.maxMs;
      entryIndex += 1;
    }
    if (entryIndex >= entries.length) break;
  }

  return result;
}
