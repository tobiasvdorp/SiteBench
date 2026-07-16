import type { ComparisonRunSeries, HistogramBucket, Report, RequestRecord, ResourceType } from "@sitebench/core";
import { buildHistogram, computePercentiles } from "@sitebench/core/histogram";
import {
  axisTickIntervalMs,
  bucketIndicesInRange,
  combineHistograms,
  computeAutoChartMaxMs,
  countRequestsBeyondMs,
  histogramBucketPercentages,
  histogramTotalCount,
  HISTOGRAM_BUCKET_SIZE_MS,
  HISTOGRAM_MAX_MS,
  lastNonZeroBucketIndexAcross,
  maxLatencyMsAcross,
  shouldShowAxisTick,
  validateChartRange,
} from "@sitebench/core/histogram";
import type { ChartRangeMode, ChartResourceFilter, ChartValueMode } from "@/lib/comparison-preferences";

const PERCENTILE_KEYS = ["p50", "p75", "p90", "p95", "p99"] as const;

const ASSET_RESOURCE_TYPES: ResourceType[] = ["css", "js", "font", "image", "other"];
const RESOURCE_TYPES: ResourceType[] = ["page", ...ASSET_RESOURCE_TYPES];

export const CHART_RESOURCE_FILTER_OPTIONS: { value: ChartResourceFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "page", label: "Pages" },
  { value: "assets", label: "Assets" },
  { value: "css", label: "CSS" },
  { value: "js", label: "JS" },
  { value: "font", label: "Fonts" },
  { value: "image", label: "Images" },
  { value: "other", label: "Other" },
];

export function chartResourceFilterLabel(filter: ChartResourceFilter): string {
  return CHART_RESOURCE_FILTER_OPTIONS.find((option) => option.value === filter)?.label ?? "All types";
}

export function chartRequestScopeLabel(uniqueOnly: boolean): string {
  return uniqueOnly ? "unique requests" : "all requests";
}

function requestLatencyMs(request: RequestRecord): number {
  return request.timings.ttfbMs ?? request.timings.totalMs;
}

export function dedupeRequestsByUrl(requests: RequestRecord[]): RequestRecord[] {
  const seen = new Set<string>();
  const result: RequestRecord[] = [];
  for (const request of requests) {
    if (seen.has(request.url)) continue;
    seen.add(request.url);
    result.push(request);
  }
  return result;
}

export function scopeRequestsForChart(
  requests: RequestRecord[],
  resourceFilter: ChartResourceFilter,
  uniqueOnly: boolean,
): RequestRecord[] {
  const filtered = filterRequestsForChart(requests, resourceFilter);
  if (!uniqueOnly) return filtered;
  return dedupeRequestsByUrl(filtered);
}

export function buildDerivedRunSeriesFromRequests(
  run: ComparisonRunSeries,
  requests: RequestRecord[],
): ComparisonRunSeries {
  const uniqueRequests = dedupeRequestsByUrl(requests);
  const latencies = uniqueRequests.map(requestLatencyMs);
  const histogramsByResourceType = Object.fromEntries(
    RESOURCE_TYPES.map((type) => {
      const typeRequests = dedupeRequestsByUrl(requests.filter((request) => request.resourceType === type));
      return [type, buildHistogram(typeRequests.map(requestLatencyMs))];
    }),
  ) as Record<ResourceType, HistogramBucket[]>;
  const percentilesByResourceType = Object.fromEntries(
    RESOURCE_TYPES.map((type) => {
      const typeRequests = dedupeRequestsByUrl(requests.filter((request) => request.resourceType === type));
      return [type, computePercentiles(typeRequests.map(requestLatencyMs))];
    }),
  ) as Record<ResourceType, ComparisonRunSeries["percentiles"]>;
  const assetRequests = dedupeRequestsByUrl(
    requests.filter((request) => ASSET_RESOURCE_TYPES.includes(request.resourceType)),
  );

  return {
    ...run,
    histogram: buildHistogram(latencies),
    histogramsByResourceType,
    percentiles: computePercentiles(latencies),
    percentilesByResourceType,
    assetPercentiles: computePercentiles(assetRequests.map(requestLatencyMs)),
  };
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
  fullMaxMs: number;
  truncatedRequestCount: number;
  tailMaxMs: number;
  capPercentile: "p95" | "p99" | null;
};

function resolveFullChartMaxMs(histograms: HistogramBucket[][]): number {
  const lastIndex = lastNonZeroBucketIndexAcross(histograms);
  if (lastIndex < 0) return HISTOGRAM_MAX_MS;

  return computeAutoChartMaxMs(
    histograms[0]?.[lastIndex]?.maxMs ?? 0,
    HISTOGRAM_BUCKET_SIZE_MS,
    HISTOGRAM_MAX_MS,
  );
}

function resolvePercentileCappedMaxMs(
  visibleRuns: ComparisonRunSeries[],
  resourceFilter: ChartResourceFilter,
  capPercentile: "p95" | "p99",
  fullMaxMs: number,
): number {
  const capMs = visibleRuns.reduce((max, run) => {
    const value = resolvePercentilesForFilter(run, resourceFilter)[capPercentile];
    return Math.max(max, value);
  }, 0);

  if (capMs <= 0) return fullMaxMs;

  return Math.min(
    fullMaxMs,
    computeAutoChartMaxMs(capMs, HISTOGRAM_BUCKET_SIZE_MS, HISTOGRAM_MAX_MS),
  );
}

export function resolveEffectiveChartRange(
  visibleRuns: ComparisonRunSeries[],
  rangeMode: ChartRangeMode,
  customMinMs: number,
  customMaxMs: number,
  resourceFilter: ChartResourceFilter = "all",
): EffectiveChartRange {
  const histograms = visibleRuns.map((run) => resolveHistogramForFilter(run, resourceFilter));
  const fullMaxMs = resolveFullChartMaxMs(histograms);
  const autoMinMs = 0;

  if (rangeMode === "custom") {
    const validation = validateChartRange(
      customMinMs,
      customMaxMs,
      HISTOGRAM_MAX_MS,
      HISTOGRAM_BUCKET_SIZE_MS,
    );

    if (!validation.valid) {
      return {
        minMs: autoMinMs,
        maxMs: fullMaxMs,
        mode: "custom",
        rangeError: validation.error,
        isFallback: true,
        fullMaxMs,
        truncatedRequestCount: 0,
        tailMaxMs: 0,
        capPercentile: null,
      };
    }

    const maxMs = validation.maxMs;
    const truncatedRequestCount =
      maxMs < fullMaxMs ? countRequestsBeyondMs(histograms, maxMs) : 0;

    return {
      minMs: validation.minMs,
      maxMs,
      mode: "custom",
      rangeError: null,
      isFallback: false,
      fullMaxMs,
      truncatedRequestCount,
      tailMaxMs: truncatedRequestCount > 0 ? maxLatencyMsAcross(histograms) : 0,
      capPercentile: null,
    };
  }

  const capPercentile = rangeMode === "p95" || rangeMode === "p99" ? rangeMode : null;
  const maxMs =
    capPercentile === null
      ? fullMaxMs
      : resolvePercentileCappedMaxMs(visibleRuns, resourceFilter, capPercentile, fullMaxMs);
  const truncatedRequestCount =
    maxMs < fullMaxMs ? countRequestsBeyondMs(histograms, maxMs) : 0;

  return {
    minMs: autoMinMs,
    maxMs,
    mode: rangeMode,
    rangeError: null,
    isFallback: false,
    fullMaxMs,
    truncatedRequestCount,
    tailMaxMs: truncatedRequestCount > 0 ? maxLatencyMsAcross(histograms) : 0,
    capPercentile,
  };
}

export function formatTruncatedRangeNote(
  count: number,
  capPercentile: "p95" | "p99",
  tailMaxMs: number,
): string | null {
  if (count <= 0) return null;

  const tailLabel =
    tailMaxMs >= 1000 && tailMaxMs % 1000 === 0
      ? `${tailMaxMs / 1000}s`
      : tailMaxMs >= 1000
        ? `${(tailMaxMs / 1000).toFixed(1)}s`
        : `${tailMaxMs}ms`;
  const requestLabel = count === 1 ? "request" : "requests";

  return `${count} ${requestLabel} beyond ${capPercentile} (max ${tailLabel}) — switch to Full range to see the tail.`;
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
  elapsedMs: number;
  responseMs: number;
  url: string;
  resourceType: ResourceType;
};

export type TimelineRunSeries = {
  runId: string;
  runName: string;
  color: string;
  durationMs: number;
  points: TimelinePoint[];
};

export type TimelineScatterChart = {
  runs: TimelineRunSeries[];
  maxResponseMs: number;
  maxElapsedMs: number;
  elapsedTicks: number[];
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
  uniqueOnly = false,
): TimelineRunSeries {
  const filtered = scopeRequestsForChart(requests, resourceFilter, uniqueOnly);
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
  const points = filtered.map((request) => ({
    elapsedMs: Math.max(0, new Date(request.createdAt).getTime() - firstRequestMs),
    responseMs: request.timings.totalMs,
    url: request.url,
    resourceType: request.resourceType,
  }));
  const durationMs = points.reduce((max, point) => Math.max(max, point.elapsedMs), 0);

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

function timelineElapsedTicks(maxElapsedMs: number): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(maxElapsedMs * fraction));
}

export function buildTimelineScatterChart(series: TimelineRunSeries[]): TimelineScatterChart {
  if (series.length === 0) {
    return {
      runs: [],
      maxResponseMs: 1,
      maxElapsedMs: 1,
      elapsedTicks: [0, 1],
    };
  }

  const maxElapsedMs = Math.max(...series.map((run) => run.durationMs), 0) || 1;
  let maxResponseMs = 0;

  for (const run of series) {
    for (const point of run.points) {
      maxResponseMs = Math.max(maxResponseMs, point.responseMs);
    }
  }

  return {
    runs: series,
    maxResponseMs: Math.ceil(maxResponseMs * 1.08) || 1,
    maxElapsedMs,
    elapsedTicks: timelineElapsedTicks(maxElapsedMs),
  };
}
