import type { ComparisonRunSeries, HistogramBucket } from "@sitebench/core";
import {
  computeAutoChartMaxMs,
  HISTOGRAM_BUCKET_SIZE_MS,
  HISTOGRAM_MAX_MS,
  lastNonZeroBucketIndexAcross,
  validateChartRange,
} from "@sitebench/core/histogram";
import type { ChartRangeMode } from "@/lib/comparison-preferences";

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

export type EffectiveChartRange = {
  minMs: number;
  maxMs: number;
  mode: ChartRangeMode;
  rangeError: string | null;
  isFallback: boolean;
};

export function resolveEffectiveChartRange(
  visibleRuns: ComparisonRunSeries[],
  rangeMode: ChartRangeMode,
  customMinMs: number,
  customMaxMs: number,
): EffectiveChartRange {
  const histograms = visibleRuns.map((run) => run.histogram);
  const lastIndex = lastNonZeroBucketIndexAcross(histograms);
  const autoMinMs = 0;
  const autoMaxMs =
    lastIndex < 0
      ? HISTOGRAM_MAX_MS
      : computeAutoChartMaxMs(
          histograms[0]?.[lastIndex]?.maxMs ?? 0,
          HISTOGRAM_BUCKET_SIZE_MS,
          HISTOGRAM_MAX_MS,
        );

  if (rangeMode === "auto") {
    return { minMs: autoMinMs, maxMs: autoMaxMs, mode: "auto", rangeError: null, isFallback: false };
  }

  const validation = validateChartRange(
    customMinMs,
    customMaxMs,
    HISTOGRAM_MAX_MS,
    HISTOGRAM_BUCKET_SIZE_MS,
  );

  if (!validation.valid) {
    return {
      minMs: autoMinMs,
      maxMs: autoMaxMs,
      mode: "custom",
      rangeError: validation.error,
      isFallback: true,
    };
  }

  return {
    minMs: validation.minMs,
    maxMs: validation.maxMs,
    mode: "custom",
    rangeError: null,
    isFallback: false,
  };
}

export function formatChartRangeLabel(minMs: number, maxMs: number): string {
  const formatMs = (ms: number) => {
    if (ms >= 1000 && ms % 1000 === 0) return `${ms / 1000}s`;
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };

  return `${formatMs(minMs)}–${formatMs(maxMs)}`;
}
