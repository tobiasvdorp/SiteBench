import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ComparisonResult, RequestRecord } from "@sitebench/core";
import {
  HISTOGRAM_BUCKET_SIZE_MS,
  HISTOGRAM_MAX_MS,
} from "@sitebench/core/histogram";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Metric } from "@/components/ui/metric";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  getStoredChartRangeMaxMs,
  getStoredChartRangeMinMs,
  getStoredChartRangeMode,
  getStoredRunColor,
  type ChartRangeMode,
  type ChartResourceFilter,
} from "@/lib/comparison-preferences";
import { getRunRequests } from "@/lib/api";
import {
  buildDistributionChartData,
  buildDerivedRunSeriesFromRequests,
  buildSummaryRuns,
  buildTimelineTrendChart,
  buildTimelineRunSeries,
  chartRequestScopeLabel,
  chartResourceFilterLabel,
  formatAxisTick,
  formatDistributionAxisValue,
  formatSummaryDelta,
  formatTimelineProgressTick,
  timelineResourceFilterDescription,
  resolveBaselineRunId,
  resolveEffectiveChartRange,
  type TimelineTrendChart,
  TIMELINE_BUCKET_COUNT,
  withBaseline,
} from "@/lib/comparison-utils";

type Props = {
  comparison: ComparisonResult;
  baselineRunId: string | null;
  resourceFilter: ChartResourceFilter;
  uniqueRequests: boolean;
};

type DistributionTooltipProps = {
  active?: boolean;
  payload?: readonly {
    name?: string | number;
    value?: number | string | (string | number)[];
    color?: string;
    payload?: { latencyMs?: number };
  }[];
  label?: string | number;
  percentileMarkers: ReturnType<typeof buildDistributionChartData>["percentileMarkers"];
};

const CHART_TICK_COLOR = "oklch(0.6 0.03 220)";
const CHART_GRID_COLOR = "oklch(0.55 0.04 220 / 15%)";
const VALUE_MODE = "percent" as const;

function DistributionTooltip({ active, payload, label, percentileMarkers }: DistributionTooltipProps) {
  if (!active || !payload?.length) return null;

  const latencyMs = payload[0]?.payload?.latencyMs ?? Number(label ?? 0);
  const entries = payload.filter((entry) => Number(entry.value) > 0);

  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2.5 text-popover-foreground shadow-lg">
      <p className="mb-2 font-medium">
        <Metric unit="ms">{latencyMs.toFixed(0)}</Metric>
      </p>
      {entries.length > 0 ? (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li key={String(entry.name)} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-sm">
              <span className="size-2.5 rounded-sm" style={{ background: entry.color }} />
              <span className="truncate">{entry.name}</span>
              <Metric className="font-semibold">{formatDistributionAxisValue(Number(entry.value))}</Metric>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No requests in this bucket</p>
      )}
      {percentileMarkers.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
          {percentileMarkers.map((marker) => (
            <p key={marker.runId} className="text-xs text-muted-foreground">
              <span className="font-medium" style={{ color: marker.color }}>
                {marker.runName}
              </span>
              {": p50 "}
              <Metric className="text-xs">{marker.percentiles.p50.toFixed(1)}</Metric>
              {" ms · p95 "}
              <Metric className="text-xs">{marker.percentiles.p95.toFixed(1)}</Metric>
              {" ms"}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

type TimelineTrendTooltipProps = {
  active?: boolean;
  payload?: readonly {
    name?: string | number;
    value?: number | string | (string | number)[];
    color?: string;
    payload?: TimelineTrendChart["data"][number];
  }[];
  label?: string | number;
  runs: TimelineTrendChart["runs"];
};

function TimelineTrendTooltip({ active, payload, label, runs }: TimelineTrendTooltipProps) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  const progress = row?.progress ?? Number(label ?? 0);
  const entries = runs.flatMap((run) => {
    const bucket = row?.buckets[run.runId];
    if (!bucket) return [];
    return [{ run, bucket }];
  });

  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2.5 text-popover-foreground shadow-lg">
      <p className="mb-2 font-medium">{formatTimelineProgressTick(progress)} run progress</p>
      {entries.length > 0 ? (
        <ul className="space-y-1.5">
          {entries.map(({ run, bucket }) => (
            <li key={run.runId} className="text-sm">
              <span className="font-medium" style={{ color: run.color }}>
                {run.runName}
              </span>
              <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                <p>
                  p50 <Metric className="text-xs font-semibold text-popover-foreground">{bucket.p50.toFixed(1)}</Metric> ms
                  {" · p95 "}
                  <Metric className="text-xs font-semibold text-popover-foreground">{bucket.p95.toFixed(1)}</Metric> ms
                </p>
                <p>{bucket.count} request{bucket.count === 1 ? "" : "s"} in bucket</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No requests in this window</p>
      )}
    </div>
  );
}

function DeltaValue({ delta }: { delta: number }) {
  return (
    <span
      className={cn("ml-1 text-xs font-mono", {
        "text-destructive": delta > 0,
        "text-success": delta < 0,
        "text-muted-foreground": delta === 0,
      })}
    >
      {formatSummaryDelta(delta, VALUE_MODE)}
    </span>
  );
}

function resolveInitialColors(comparison: ComparisonResult): Record<string, string> {
  return Object.fromEntries(
    comparison.runs.map((run) => [run.runId, getStoredRunColor(run.runId) ?? run.color]),
  );
}

export function ComparisonView({ comparison, baselineRunId, resourceFilter, uniqueRequests }: Props) {
  const [runColors, setRunColors] = useState<Record<string, string>>(() => resolveInitialColors(comparison));
  const [rangeMode] = useState<ChartRangeMode>(() => getStoredChartRangeMode());
  const [customMinMs] = useState(() => getStoredChartRangeMinMs() ?? 0);
  const [customMaxMs] = useState(() => getStoredChartRangeMaxMs() ?? HISTOGRAM_MAX_MS);
  const [requestsByRunId, setRequestsByRunId] = useState<Record<string, RequestRecord[]>>({});
  const [requestsLoading, setRequestsLoading] = useState(false);

  const effectiveBaselineRunId = useMemo(
    () => resolveBaselineRunId(comparison.runs.map((run) => run.runId), baselineRunId),
    [comparison.runs, baselineRunId],
  );

  const runs = useMemo(() => {
    const coloredRuns = comparison.runs.map((run) => ({
      ...run,
      color: runColors[run.runId] ?? run.color,
    }));
    const sourceRuns = uniqueRequests
      ? coloredRuns.map((run) => buildDerivedRunSeriesFromRequests(run, requestsByRunId[run.runId] ?? []))
      : coloredRuns;

    return withBaseline(sourceRuns, effectiveBaselineRunId, VALUE_MODE);
  }, [comparison.runs, runColors, effectiveBaselineRunId, uniqueRequests, requestsByRunId]);

  useEffect(() => {
    setRunColors(resolveInitialColors(comparison));
  }, [comparison]);

  const summaryRuns = useMemo(
    () => buildSummaryRuns(runs, effectiveBaselineRunId, resourceFilter, VALUE_MODE),
    [runs, effectiveBaselineRunId, resourceFilter],
  );

  const chartRange = useMemo(
    () => resolveEffectiveChartRange(runs, rangeMode, customMinMs, customMaxMs, resourceFilter),
    [runs, rangeMode, customMinMs, customMaxMs, resourceFilter],
  );

  const distributionChart = useMemo(
    () =>
      buildDistributionChartData(
        summaryRuns,
        Object.fromEntries(runs.map((run) => [run.runId, true])),
        resourceFilter,
        chartRange,
      ),
    [summaryRuns, runs, resourceFilter, chartRange.minMs, chartRange.maxMs],
  );

  useEffect(() => {
    const runIds = comparison.runs.map((run) => run.runId);
    if (runIds.length === 0) {
      setRequestsByRunId({});
      return;
    }

    let cancelled = false;
    setRequestsLoading(true);

    void (async () => {
      try {
        const entries = await Promise.all(
          comparison.runs.map(async (run) => {
            const requests = await getRunRequests(run.runId);
            return [run.runId, requests] as const;
          }),
        );
        if (!cancelled) setRequestsByRunId(Object.fromEntries(entries));
      } finally {
        if (!cancelled) setRequestsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [comparison.runs]);

  const timelineRuns = useMemo(
    () =>
      runs
        .map((run) =>
          buildTimelineRunSeries(run, requestsByRunId[run.runId] ?? [], resourceFilter, uniqueRequests),
        )
        .filter((series) => series.points.length > 0),
    [runs, requestsByRunId, resourceFilter, uniqueRequests],
  );

  const requestScopeLabel = chartRequestScopeLabel(uniqueRequests);
  const resourceFilterLabel = chartResourceFilterLabel(resourceFilter).toLowerCase();
  const chartDataPending = uniqueRequests && requestsLoading;

  const timelineTrendChart = useMemo(() => buildTimelineTrendChart(timelineRuns), [timelineRuns]);

  if (comparison.runs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            title="No comparable runs"
            description="Select completed or stopped runs with stored data to compare."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-6">
      <Card>
        <CardHeader>
          <SectionHeader
            title="Percentile summary"
            description={`Latency percentiles for ${requestScopeLabel} (${resourceFilterLabel}) with baseline deltas as relative change. The chart below shows each run's share of requests per ${HISTOGRAM_BUCKET_SIZE_MS} ms bucket; dashed lines mark p50 per run.`}
          />
        </CardHeader>
        <CardContent className="space-y-6">
          {chartDataPending ? (
            <EmptyState
              title="Loading comparison data"
              description="Fetching per-request data to compute unique request metrics."
              className="min-h-[280px] border-0 bg-transparent"
            />
          ) : (
            <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>p50</TableHead>
                <TableHead>p75</TableHead>
                <TableHead>p90</TableHead>
                <TableHead>p95</TableHead>
                <TableHead>p99</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryRuns.map((run) => (
                <TableRow
                  key={run.runId}
                  className={cn({
                    "bg-primary/5": run.isBaseline,
                  })}
                >
                  <TableCell>
                    <span className="font-medium" style={{ color: run.color }}>
                      {run.runName}
                    </span>
                    {run.isBaseline && (
                      <Badge variant="warning" className="ml-2">
                        baseline
                      </Badge>
                    )}
                  </TableCell>
                  {(["p50", "p75", "p90", "p95", "p99"] as const).map((key) => (
                    <TableCell key={key}>
                      <Metric unit="ms">{run.summaryPercentiles[key].toFixed(1)}</Metric>
                      {run.summaryDeltas && <DeltaValue delta={run.summaryDeltas[key]!} />}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {distributionChart.data.length === 0 ? (
            <EmptyState
              title="No distribution data"
              description="No request distribution data for the selected runs in the current range."
              className="min-h-[280px] border-0 bg-transparent"
            />
          ) : (
            <div className="min-h-[320px] w-full rounded-lg border border-border/40 bg-surface-elevated/30 p-2">
              <ResponsiveContainer width="100%" height={340}>
                <AreaChart data={distributionChart.data} margin={{ top: 8, right: 12, left: 0, bottom: 20 }}>
                  <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="latencyMs"
                    type="number"
                    domain={[distributionChart.range.minMs, distributionChart.range.maxMs]}
                    ticks={distributionChart.axisTicks}
                    tick={{ fontSize: 10, fill: CHART_TICK_COLOR, fontFamily: "var(--font-mono)" }}
                    tickFormatter={(value) => formatAxisTick(Number(value))}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                  />
                  <YAxis
                    allowDecimals
                    domain={[0, distributionChart.maxPercent]}
                    tickFormatter={(value) => formatDistributionAxisValue(Number(value))}
                    tick={{ fill: CHART_TICK_COLOR, fontSize: 10, fontFamily: "var(--font-mono)" }}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                  />
                  <Tooltip
                    cursor={{ stroke: "oklch(0.78 0.14 195 / 35%)", strokeWidth: 1 }}
                    content={(props) => (
                      <DistributionTooltip
                        active={props.active}
                        payload={props.payload}
                        label={props.label}
                        percentileMarkers={distributionChart.percentileMarkers}
                      />
                    )}
                  />
                  {distributionChart.percentileMarkers.map((marker) => {
                    if (marker.percentiles.p50 <= 0) return null;
                    return (
                      <ReferenceLine
                        key={`${marker.runId}-p50`}
                        x={marker.percentiles.p50}
                        stroke={marker.color}
                        strokeDasharray="4 4"
                        strokeOpacity={0.75}
                      />
                    );
                  })}
                  {summaryRuns.map((run) => (
                    <Area
                      key={run.runId}
                      type="monotone"
                      dataKey={run.runName}
                      stroke={run.color}
                      fill={run.color}
                      fillOpacity={0.15}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      animationDuration={600}
                      animationEasing="ease-out"
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader
            title="Response time timeline"
            description={`p50 response time per ${timelineResourceFilterDescription(resourceFilter)} (${requestScopeLabel}) across run progress (0–100%). Each run is split into ${TIMELINE_BUCKET_COUNT} time buckets so you can compare trends without individual request noise.`}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {requestsLoading ? (
            <EmptyState
              title="Loading timeline"
              description="Fetching per-request data for the selected runs."
              className="min-h-[280px] border-0 bg-transparent"
            />
          ) : timelineRuns.length === 0 ? (
            <EmptyState
              title="No timeline data"
              description={`No ${requestScopeLabel} for ${resourceFilterLabel} found for the selected runs.`}
              className="min-h-[280px] border-0 bg-transparent"
            />
          ) : (
            <div className="min-h-[320px] w-full rounded-lg border border-border/40 bg-surface-elevated/30 p-2">
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={timelineTrendChart.data} margin={{ top: 8, right: 12, left: 0, bottom: 20 }}>
                  <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    type="number"
                    dataKey="progress"
                    domain={[0, 100]}
                    allowDataOverflow={false}
                    allowDecimals={false}
                    ticks={timelineTrendChart.progressTicks}
                    tick={{ fontSize: 10, fill: CHART_TICK_COLOR, fontFamily: "var(--font-mono)" }}
                    tickFormatter={(value) => formatTimelineProgressTick(Number(value))}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                  />
                  <YAxis
                    type="number"
                    domain={[0, timelineTrendChart.maxResponseMs]}
                    allowDataOverflow={false}
                    tick={{ fill: CHART_TICK_COLOR, fontSize: 10, fontFamily: "var(--font-mono)" }}
                    tickFormatter={(value) => `${Math.round(Number(value))}ms`}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                  />
                  <Tooltip
                    cursor={{ stroke: "oklch(0.78 0.14 195 / 35%)", strokeWidth: 1 }}
                    content={(props) => (
                      <TimelineTrendTooltip
                        active={props.active}
                        payload={props.payload}
                        label={props.label}
                        runs={timelineTrendChart.runs}
                      />
                    )}
                  />
                  {timelineTrendChart.runs.map((run) => (
                    <Line
                      key={run.runId}
                      type="monotone"
                      dataKey={run.runName}
                      stroke={run.color}
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      animationDuration={600}
                      animationEasing="ease-out"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Lines show the p50 response time within each {Math.round(100 / TIMELINE_BUCKET_COUNT)}% slice of run progress. Hover a point for p95 and request count per run.
            {uniqueRequests
              ? " Only the first occurrence of each URL is included, so revisits are excluded."
              : " All recorded requests are included, including revisits to the same URL."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
