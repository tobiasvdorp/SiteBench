import type { ComparisonRunSeries, HistogramBucket } from "@sitebench/core";

const PERCENTILE_KEYS = ["p50", "p75", "p90", "p95", "p99"] as const;

export function formatBucketLabel(bucket: HistogramBucket): string {
  if (bucket.maxMs >= 5000) return `${bucket.minMs}–${bucket.maxMs} ms (max)`;
  if (bucket.minMs >= 1000) return `${(bucket.minMs / 1000).toFixed(1)}–${(bucket.maxMs / 1000).toFixed(1)} s`;
  return `${bucket.minMs}–${bucket.maxMs} ms`;
}

export function formatAxisTick(minMs: number): string {
  if (minMs === 0) return "0";
  if (minMs % 1000 === 0) return `${minMs / 1000}s`;
  return `${minMs}ms`;
}

export function computeBaselineDeltas(
  baseline: ComparisonRunSeries["percentiles"],
  target: ComparisonRunSeries["percentiles"],
): NonNullable<ComparisonRunSeries["deltas"]> {
  return Object.fromEntries(
    PERCENTILE_KEYS.map((key) => [key, target[key] - baseline[key]]),
  ) as NonNullable<ComparisonRunSeries["deltas"]>;
}

export function withBaseline(
  runs: ComparisonRunSeries[],
  baselineRunId: string | null,
): ComparisonRunSeries[] {
  const baseline = runs.find((run) => run.runId === baselineRunId);
  if (!baseline) {
    return runs.map((run) => ({ ...run, isBaseline: false, deltas: null }));
  }

  return runs.map((run) => ({
    ...run,
    isBaseline: run.runId === baselineRunId,
    deltas: run.runId === baselineRunId ? null : computeBaselineDeltas(baseline.percentiles, run.percentiles),
  }));
}

export function bucketTotalCount(
  runs: ComparisonRunSeries[],
  bucketIndex: number,
  visible: Record<string, boolean>,
): number {
  return runs.reduce((sum, run) => {
    if (!visible[run.runId]) return sum;
    return sum + (run.histogram[bucketIndex]?.count ?? 0);
  }, 0);
}
