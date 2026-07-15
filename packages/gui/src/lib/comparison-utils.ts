import type { ComparisonRunSeries, HistogramBucket, Report, RequestRecord, ResourceType } from "@sitebench/core";
import {
  axisTickIntervalMs,
  bucketIndicesInRange,
  combineHistograms,
  computeAutoChartMaxMs,
  histogramBucketPercentages,
  histogramTotalCount,
  HISTOGRAM_BUCKET_SIZE_MS,
  HISTOGRAM_MAX_MS,
  lastNonZeroBucketIndexAcross,
  shouldShowAxisTick,
  validateChartRange,
} from "@sitebench/core/histogram";
import type { ChartRangeMode, ChartResourceFilter, ChartValueMode } from "@/lib/comparison-preferences";

const PERCENTILE_KEYS = ["p50", "p75", "p90", "p95", "p99"] as const;

const ASSET_RESOURCE_TYPES: ResourceType[] = ["css", "js", "font", "image", "other"];

export const CHART_RESOURCE_FILTER_OPTIONS: { value: ChartResourceFilter; label: string }[] = [
  { value: "all", label: "All requests" },
  { value: "page", label: "Pages" },
  { value: "assets", label: "Assets" },
  { value: "css", label: "CSS" },
  { value: "js", label: "JS" },
  { value: "font", label: "Fonts" },
  { value: "image", label: "Images" },
  { value: "other", label: "Other" },
];

export function chartResourceFilterLabel(filter: ChartResourceFilter): string {
  return CHART_RESOURCE_FILTER_OPTIONS.find((option) => option.value === filter)?.label ?? "All requests";
}

export function reportMatchesComparisonState(
  report: Report,
  runIds: string[],
  baselineRunId: string | null,
  resourceFilter: ChartResourceFilter,
) {
  if (runIds.length !== report.runIds.length) return false;
  if (!runIds.every((runId) => report.runIds.includes(runId))) return false;
  if (baselineRunId !== report.baselineRunId) return false;
  if (resourceFilter !== report.resourceFilter) return false;
  return true;
}

export function timelineResourceFilterDescription(filter: ChartResourceFilter): string {
  if (filter === "all") return "request";
  if (filter === "assets") return "asset request";
  return `${chartResourceFilterLabel(filter).toLowerCase()} request`;
}

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

export function resolveBaselineRunId(runIds: string[], preferredRunId: string | null = null): string | null {
  if (runIds.length === 0) return null;
  if (preferredRunId && runIds.includes(preferredRunId)) return preferredRunId;
  return runIds[0] ?? null;
}

export function computeBaselineDeltas(
  baseline: ComparisonRunSeries["percentiles"],
  target: ComparisonRunSeries["percentiles"],
  valueMode: ChartValueMode = "count",
): NonNullable<ComparisonRunSeries["deltas"]> {
  return Object.fromEntries(
    PERCENTILE_KEYS.map((key) => {
      const baselineValue = baseline[key];
      const targetValue = target[key];
      if (valueMode === "count") return [key, targetValue - baselineValue];
      if (baselineValue === 0) return [key, targetValue === 0 ? 0 : 100];
      return [key, ((targetValue - baselineValue) / baselineValue) * 100];
    }),
  ) as NonNullable<ComparisonRunSeries["deltas"]>;
}

export function resolvePercentilesForFilter(
  run: ComparisonRunSeries,
  resourceFilter: ChartResourceFilter,
): ComparisonRunSeries["percentiles"] {
  if (resourceFilter === "all") return run.percentiles;
  if (resourceFilter === "assets") return run.assetPercentiles;
  return run.percentilesByResourceType[resourceFilter];
}

export type SummaryRun = ComparisonRunSeries & {
  summaryPercentiles: ComparisonRunSeries["percentiles"];
  summaryDeltas: ComparisonRunSeries["deltas"];
};

export function buildSummaryRuns(
  runs: ComparisonRunSeries[],
  baselineRunId: string | null,
  resourceFilter: ChartResourceFilter,
  valueMode: ChartValueMode,
): SummaryRun[] {
  const summaryRuns = runs.map((run) => ({
    ...run,
    summaryPercentiles: resolvePercentilesForFilter(run, resourceFilter),
    summaryDeltas: null as ComparisonRunSeries["deltas"],
  }));

  const effectiveBaselineRunId = resolveBaselineRunId(
    summaryRuns.map((run) => run.runId),
    baselineRunId,
  );
  const baseline = summaryRuns.find((run) => run.runId === effectiveBaselineRunId);
  if (!baseline) return summaryRuns;

  return summaryRuns.map((run) => ({
    ...run,
    summaryDeltas:
      run.runId === effectiveBaselineRunId
        ? null
        : computeBaselineDeltas(baseline.summaryPercentiles, run.summaryPercentiles, valueMode),
  }));
}

export function formatSummaryDelta(delta: number, valueMode: ChartValueMode): string {
  const suffix = valueMode === "percent" ? "%" : "";
  return `(${delta >= 0 ? "+" : ""}${delta.toFixed(1)}${suffix})`;
}

export function withBaseline(
  runs: ComparisonRunSeries[],
  baselineRunId: string | null,
  valueMode: ChartValueMode = "count",
): ComparisonRunSeries[] {
  const effectiveBaselineRunId = resolveBaselineRunId(
    runs.map((run) => run.runId),
    baselineRunId,
  );
  const baseline = runs.find((run) => run.runId === effectiveBaselineRunId);
  if (!baseline) {
    return runs.map((run) => ({ ...run, isBaseline: false, deltas: null }));
  }

  return runs.map((run) => ({
    ...run,
    isBaseline: run.runId === effectiveBaselineRunId,
    deltas:
      run.runId === effectiveBaselineRunId
        ? null
        : computeBaselineDeltas(baseline.percentiles, run.percentiles, valueMode),
  }));
}

export function resolveHistogramForFilter(
  run: ComparisonRunSeries,
  resourceFilter: ChartResourceFilter,
): HistogramBucket[] {
  if (resourceFilter === "all") return run.histogram;
  if (resourceFilter === "assets") {
    return combineHistograms(ASSET_RESOURCE_TYPES.map((type) => run.histogramsByResourceType[type]));
  }
  return run.histogramsByResourceType[resourceFilter];
}

export function bucketChartValue(
  histogram: HistogramBucket[],
  bucketIndex: number,
  valueMode: ChartValueMode,
): number {
  const count = histogram[bucketIndex]?.count ?? 0;
  if (valueMode === "count") return count;

  const total = histogramTotalCount(histogram);
  if (total === 0) return 0;
  return (count / total) * 100;
}

export function bucketTotalCount(
  runs: ComparisonRunSeries[],
  bucketIndex: number,
  visible: Record<string, boolean>,
  resourceFilter: ChartResourceFilter,
): number {
  return runs.reduce((sum, run) => {
    if (!visible[run.runId]) return sum;
    const histogram = resolveHistogramForFilter(run, resourceFilter);
    return sum + (histogram[bucketIndex]?.count ?? 0);
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
  resourceFilter: ChartResourceFilter = "all",
): EffectiveChartRange {
  const histograms = visibleRuns.map((run) => resolveHistogramForFilter(run, resourceFilter));
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

export function formatChartAxisValue(value: number, valueMode: ChartValueMode): string {
  if (valueMode === "percent") return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
  return String(Math.round(value));
}

export function formatChartTooltipValue(
  run: ComparisonRunSeries,
  bucketIndex: number,
  resourceFilter: ChartResourceFilter,
  valueMode: ChartValueMode,
): string {
  const histogram = resolveHistogramForFilter(run, resourceFilter);
  const count = histogram[bucketIndex]?.count ?? 0;
  if (valueMode === "count") return String(count);

  const total = histogramTotalCount(histogram);
  if (total === 0) return "0%";

  const percent = histogramBucketPercentages(histogram)[bucketIndex] ?? 0;
  return `${percent.toFixed(1)}% (${count})`;
}

export type DistributionChartRow = {
  latencyMs: number;
  axisLabel: string;
  [runName: string]: number | string;
};

export type DistributionPercentileMarker = {
  runId: string;
  runName: string;
  color: string;
  percentiles: ComparisonRunSeries["percentiles"];
};

export function buildDistributionChartData(
  summaryRuns: SummaryRun[],
  visible: Record<string, boolean>,
  resourceFilter: ChartResourceFilter,
  range: { minMs: number; maxMs: number },
): {
  data: DistributionChartRow[];
  axisTicks: number[];
  range: { minMs: number; maxMs: number };
  maxPercent: number;
  percentileMarkers: DistributionPercentileMarker[];
} {
  const activeRuns = summaryRuns.filter((run) => visible[run.runId]);
  if (activeRuns.length === 0) {
    return { data: [], axisTicks: [], range: { minMs: 0, maxMs: 0 }, maxPercent: 0, percentileMarkers: [] };
  }

  const bucketCount = activeRuns[0]?.histogram.length ?? 0;
  if (bucketCount === 0) {
    return { data: [], axisTicks: [], range: { minMs: 0, maxMs: 0 }, maxPercent: 0, percentileMarkers: [] };
  }

  const { startIndex, endIndex } = bucketIndicesInRange(
    range.minMs,
    range.maxMs,
    HISTOGRAM_BUCKET_SIZE_MS,
    bucketCount,
  );

  const tickIntervalMs = axisTickIntervalMs(range.maxMs - range.minMs);
  const data: DistributionChartRow[] = [];
  let maxPercent = 0;

  for (let index = startIndex; index <= endIndex; index += 1) {
    const bucket = activeRuns[0].histogram[index];
    if (!bucket) continue;

    const row: DistributionChartRow = {
      latencyMs: bucket.minMs,
      axisLabel: shouldShowAxisTick(bucket.minMs, tickIntervalMs) ? formatAxisTick(bucket.minMs) : "",
    };

    for (const run of activeRuns) {
      const histogram = resolveHistogramForFilter(run, resourceFilter);
      const percent = bucketChartValue(histogram, index, "percent");
      row[run.runName] = percent;
      maxPercent = Math.max(maxPercent, percent);
    }

    data.push(row);
  }

  if (data.length === 0 || maxPercent <= 0) {
    return { data: [], axisTicks: [], range: { minMs: 0, maxMs: 0 }, maxPercent: 0, percentileMarkers: [] };
  }

  return {
    data,
    axisTicks: data.filter((row) => row.axisLabel).map((row) => row.latencyMs),
    range: { minMs: range.minMs, maxMs: range.maxMs },
    maxPercent: Math.ceil(maxPercent * 1.12 * 10) / 10,
    percentileMarkers: activeRuns.map((run) => ({
      runId: run.runId,
      runName: run.runName,
      color: run.color,
      percentiles: run.summaryPercentiles,
    })),
  };
}

export function formatDistributionAxisValue(value: number): string {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export type TimelinePoint = {
  progress: number;
  rawElapsedMs: number;
  responseMs: number;
};

export type TimelineRunSeries = {
  runId: string;
  runName: string;
  color: string;
  durationMs: number;
  points: TimelinePoint[];
};

const TIMELINE_BUCKET_COUNT = 50;

export { TIMELINE_BUCKET_COUNT };

export type TimelineTrendBucket = {
  p50: number;
  p95: number;
  count: number;
};

export type TimelineTrendRow = {
  progress: number;
  buckets: Record<string, TimelineTrendBucket | undefined>;
  [runName: string]: number | string | Record<string, TimelineTrendBucket | undefined> | null | undefined;
};

export type TimelineTrendChart = {
  data: TimelineTrendRow[];
  runs: Pick<TimelineRunSeries, "runId" | "runName" | "color">[];
  maxResponseMs: number;
  progressTicks: number[];
};

export function filterRequestsForChart(
  requests: RequestRecord[],
  resourceFilter: ChartResourceFilter,
): RequestRecord[] {
  if (resourceFilter === "all") return requests;
  if (resourceFilter === "assets") {
    return requests.filter((request) => ASSET_RESOURCE_TYPES.includes(request.resourceType));
  }
  return requests.filter((request) => request.resourceType === resourceFilter);
}

export function buildTimelineRunSeries(
  run: ComparisonRunSeries,
  requests: RequestRecord[],
  resourceFilter: ChartResourceFilter,
): TimelineRunSeries {
  const filtered = filterRequestsForChart(requests, resourceFilter);
  if (filtered.length === 0) {
    return {
      runId: run.runId,
      runName: run.runName,
      color: run.color,
      durationMs: 0,
      points: [],
    };
  }

  const firstRequestMs = new Date(filtered[0].createdAt).getTime();
  const rawPoints = filtered.map((request) => ({
    elapsedMs: Math.max(0, new Date(request.createdAt).getTime() - firstRequestMs),
    responseMs: request.timings.totalMs,
  }));
  const durationMs = rawPoints.reduce((max, point) => Math.max(max, point.elapsedMs), 0);
  const points = rawPoints.map((point) => ({
    progress: durationMs > 0 ? (point.elapsedMs / durationMs) * 100 : 0,
    rawElapsedMs: point.elapsedMs,
    responseMs: point.responseMs,
  }));

  return {
    runId: run.runId,
    runName: run.runName,
    color: run.color,
    durationMs,
    points,
  };
}

export function formatElapsedAxisTick(elapsedMs: number): string {
  if (elapsedMs === 0) return "0";

  const totalSeconds = Math.round(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0 && seconds === 0) return `${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  if (totalSeconds > 0) return `${totalSeconds}s`;
  return `${Math.round(elapsedMs)}ms`;
}

export function formatTimelineProgressTick(progress: number): string {
  if (progress === 0) return "0%";
  if (progress === 100) return "100%";
  return `${Math.round(progress)}%`;
}

function timelineBucketIndex(progress: number, bucketCount = TIMELINE_BUCKET_COUNT): number {
  if (progress >= 100) return bucketCount - 1;
  return Math.min(bucketCount - 1, Math.floor((progress / 100) * bucketCount));
}

function timelinePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function timelinePercentiles(values: number[]) {
  return {
    p50: timelinePercentile(values, 50),
    p95: timelinePercentile(values, 95),
  };
}

export function buildTimelineTrendChart(series: TimelineRunSeries[]): TimelineTrendChart {
  if (series.length === 0) {
    return { data: [], runs: [], maxResponseMs: 1, progressTicks: [0, 25, 50, 75, 100] };
  }

  const data: TimelineTrendRow[] = Array.from({ length: TIMELINE_BUCKET_COUNT }, (_, index) => ({
    progress: ((index + 0.5) / TIMELINE_BUCKET_COUNT) * 100,
    buckets: {},
  }));

  let maxResponseMs = 0;

  for (const run of series) {
    const bucketValues = Array.from({ length: TIMELINE_BUCKET_COUNT }, () => [] as number[]);

    for (const point of run.points) {
      bucketValues[timelineBucketIndex(point.progress)].push(point.responseMs);
    }

    for (let index = 0; index < TIMELINE_BUCKET_COUNT; index += 1) {
      const values = bucketValues[index];
      if (values.length === 0) {
        data[index].buckets[run.runId] = undefined;
        data[index][run.runName] = null;
        continue;
      }

      const percentiles = timelinePercentiles(values);
      const bucket: TimelineTrendBucket = {
        p50: percentiles.p50,
        p95: percentiles.p95,
        count: values.length,
      };

      data[index].buckets[run.runId] = bucket;
      data[index][run.runName] = percentiles.p50;
      maxResponseMs = Math.max(maxResponseMs, percentiles.p95);
    }
  }

  return {
    data,
    runs: series.map((run) => ({ runId: run.runId, runName: run.runName, color: run.color })),
    maxResponseMs: Math.ceil(maxResponseMs * 1.08) || 1,
    progressTicks: [0, 25, 50, 75, 100],
  };
}
