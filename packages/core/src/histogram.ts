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
