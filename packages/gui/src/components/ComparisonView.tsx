import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ComparisonResult, ComparisonRunSeries } from "@sitebench/core";
import {
  axisTickIntervalMs,
  bucketIndicesInRange,
  HISTOGRAM_BUCKET_SIZE_MS,
  HISTOGRAM_MAX_MS,
  shouldShowAxisTick,
} from "@sitebench/core/histogram";
import { Eye, EyeOff, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Metric } from "@/components/ui/metric";
import { SectionHeader } from "@/components/ui/section-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  getStoredBaseline,
  getStoredChartRangeMaxMs,
  getStoredChartRangeMinMs,
  getStoredChartRangeMode,
  getStoredChartResourceFilter,
  getStoredChartValueMode,
  getStoredRunColor,
  getStoredVisibility,
  setStoredBaseline,
  setStoredChartRangeMaxMs,
  setStoredChartRangeMinMs,
  setStoredChartRangeMode,
  setStoredChartResourceFilter,
  setStoredChartValueMode,
  setStoredRunColor,
  setStoredVisibility,
  type ChartRangeMode,
  type ChartResourceFilter,
  type ChartValueMode,
} from "@/lib/comparison-preferences";
import {
  bucketChartValue,
  bucketTotalCount,
  buildDistributionChartData,
  buildSummaryRuns,
  CHART_RESOURCE_FILTER_OPTIONS,
  chartResourceFilterLabel,
  formatAxisTick,
  formatBucketLabel,
  formatChartAxisValue,
  formatChartRangeLabel,
  formatChartTooltipValue,
  formatDistributionAxisValue,
  formatSummaryDelta,
  resolveBaselineRunId,
  resolveEffectiveChartRange,
  resolveHistogramForFilter,
  withBaseline,
} from "@/lib/comparison-utils";

type Props = {
  comparison: ComparisonResult;
  onBaselineChange?: (runId: string) => void;
};

type ChartRow = {
  label: string;
  axisLabel: string;
  bucketIndex: number;
  [runName: string]: string | number;
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
        <p className="text-xs text-muted-foreground">No requests from visible runs in this bucket</p>
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

type LatencyTooltipProps = {
  active?: boolean;
  payload?: readonly {
    name?: string | number;
    value?: number | string | (string | number)[];
    color?: string;
    payload?: ChartRow;
  }[];
  label?: string | number;
  runs: ComparisonRunSeries[];
  visible: Record<string, boolean>;
  resourceFilter: ChartResourceFilter;
  valueMode: ChartValueMode;
};

const CHART_TICK_COLOR = "oklch(0.6 0.03 220)";
const CHART_GRID_COLOR = "oklch(0.55 0.04 220 / 15%)";

function LatencyTooltip({
  active,
  payload,
  label,
  runs,
  visible,
  resourceFilter,
  valueMode,
}: LatencyTooltipProps) {
  if (!active || !payload?.length) return null;

  const bucketIndex = payload[0]?.payload?.bucketIndex;
  if (bucketIndex === undefined) return null;

  const bucketLabel = payload[0]?.payload?.label ?? String(label ?? "");
  const total = bucketTotalCount(runs, bucketIndex, visible, resourceFilter);
  const entries = payload.filter((entry) => Number(entry.value) > 0);
  const totalLabel =
    valueMode === "percent"
      ? `${total} request${total === 1 ? "" : "s"} total in this range`
      : `${total} request${total === 1 ? "" : "s"} in this latency range`;

  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2.5 text-popover-foreground shadow-lg">
      <p className="mb-1 font-medium">{bucketLabel}</p>
      <p className="mb-2 text-xs text-muted-foreground">{totalLabel}</p>
      {entries.length > 0 ? (
        <ul className="space-y-1.5">
          {entries.map((entry) => {
            const run = runs.find((item) => item.runName === entry.name);
            const displayValue =
              run && bucketIndex !== undefined
                ? formatChartTooltipValue(run, bucketIndex, resourceFilter, valueMode)
                : entry.value;

            return (
              <li key={String(entry.name)} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-sm">
                <span className="size-2.5 rounded-sm" style={{ background: entry.color }} />
                <span className="truncate">{entry.name}</span>
                <Metric className="font-semibold">{displayValue}</Metric>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No requests from visible runs</p>
      )}
    </div>
  );
}

function resolveInitialBaseline(comparison: ComparisonResult): string | null {
  const runIds = comparison.runs.map((run) => run.runId);
  const stored = getStoredBaseline(comparison.siteOrigin);
  const fromComparison = comparison.runs.find((run) => run.isBaseline)?.runId ?? null;
  return resolveBaselineRunId(runIds, stored ?? fromComparison);
}

function resolveInitialColors(comparison: ComparisonResult): Record<string, string> {
  return Object.fromEntries(
    comparison.runs.map((run) => [run.runId, getStoredRunColor(run.runId) ?? run.color]),
  );
}

function resolveInitialVisibility(comparison: ComparisonResult): Record<string, boolean> {
  return Object.fromEntries(
    comparison.runs.map((run) => [run.runId, getStoredVisibility(run.runId) ?? run.visible]),
  );
}

function DeltaValue({ delta, valueMode }: { delta: number; valueMode: ChartValueMode }) {
  return (
    <span
      className={cn("ml-1 text-xs font-mono", {
        "text-destructive": delta > 0,
        "text-success": delta < 0,
        "text-muted-foreground": delta === 0,
      })}
    >
      {formatSummaryDelta(delta, valueMode)}
    </span>
  );
}

export function ComparisonView({ comparison, onBaselineChange }: Props) {
  const [runColors, setRunColors] = useState<Record<string, string>>(() => resolveInitialColors(comparison));
  const [visible, setVisible] = useState<Record<string, boolean>>(() => resolveInitialVisibility(comparison));
  const [baselineRunId, setBaselineRunId] = useState<string | null>(() => resolveInitialBaseline(comparison));
  const [rangeMode, setRangeMode] = useState<ChartRangeMode>(() => getStoredChartRangeMode());
  const [valueMode, setValueMode] = useState<ChartValueMode>(() => getStoredChartValueMode());
  const [resourceFilter, setResourceFilter] = useState<ChartResourceFilter>(() => getStoredChartResourceFilter());
  const [customMinMs, setCustomMinMs] = useState(() => getStoredChartRangeMinMs() ?? 0);
  const [customMaxMs, setCustomMaxMs] = useState(() => getStoredChartRangeMaxMs() ?? HISTOGRAM_MAX_MS);

  useEffect(() => {
    const runIds = comparison.runs.map((run) => run.runId);
    if (runIds.length === 0) return;
    const next = resolveBaselineRunId(runIds, baselineRunId);
    if (!next || next === baselineRunId) return;
    setBaselineRunId(next);
    setStoredBaseline(comparison.siteOrigin, next);
    onBaselineChange?.(next);
  }, [comparison.runs, comparison.siteOrigin, baselineRunId, onBaselineChange]);

  const runs = useMemo(
    () =>
      withBaseline(
        comparison.runs.map((run) => ({ ...run, color: runColors[run.runId] ?? run.color })),
        baselineRunId,
      ),
    [comparison.runs, runColors, baselineRunId],
  );

  const visibleRuns = useMemo(
    () => runs.filter((run) => visible[run.runId]),
    [runs, visible],
  );

  const summaryRuns = useMemo(
    () => buildSummaryRuns(runs, baselineRunId, resourceFilter, valueMode),
    [runs, baselineRunId, resourceFilter, valueMode],
  );

  const visibleSummaryRuns = useMemo(
    () => summaryRuns.filter((run) => visible[run.runId]),
    [summaryRuns, visible],
  );

  const chartRange = useMemo(
    () => resolveEffectiveChartRange(visibleRuns, rangeMode, customMinMs, customMaxMs, resourceFilter),
    [visibleRuns, rangeMode, customMinMs, customMaxMs, resourceFilter],
  );

  const distributionChart = useMemo(
    () => buildDistributionChartData(summaryRuns, visible, resourceFilter, chartRange),
    [summaryRuns, visible, resourceFilter, chartRange.minMs, chartRange.maxMs],
  );

  const chartData = useMemo(() => {
    if (runs.length === 0) return [];
    const bucketCount = runs[0]?.histogram.length ?? 0;
    const { startIndex, endIndex } = bucketIndicesInRange(
      chartRange.minMs,
      chartRange.maxMs,
      HISTOGRAM_BUCKET_SIZE_MS,
      bucketCount,
    );
    const tickIntervalMs = axisTickIntervalMs(chartRange.maxMs - chartRange.minMs);

    return Array.from({ length: bucketCount }, (_, index) => {
      if (index < startIndex || index > endIndex) return null;

      const bucket = runs[0].histogram[index];
      const row: ChartRow = {
        label: formatBucketLabel(bucket),
        axisLabel: shouldShowAxisTick(bucket.minMs, tickIntervalMs) ? formatAxisTick(bucket.minMs) : "",
        bucketIndex: index,
      };

      for (const run of runs) {
        if (!visible[run.runId]) continue;
        const histogram = resolveHistogramForFilter(run, resourceFilter);
        row[run.runName] = bucketChartValue(histogram, index, valueMode);
      }

      return row;
    }).filter((row): row is ChartRow => row !== null);
  }, [runs, visible, chartRange.minMs, chartRange.maxMs, resourceFilter, valueMode]);

  const axisTicks = useMemo(
    () => chartData.filter((row) => row.axisLabel).map((row) => row.label),
    [chartData],
  );

  const visibleCount = visibleRuns.length;
  const totalCount = runs.length;
  const baselineRun = runs.find((run) => run.runId === baselineRunId);

  const setRunVisible = (runId: string, nextVisible: boolean) => {
    setVisible((current) => ({ ...current, [runId]: nextVisible }));
    setStoredVisibility(runId, nextVisible);
  };

  const setAllVisible = (nextVisible: boolean) => {
    const next = Object.fromEntries(runs.map((run) => [run.runId, nextVisible]));
    setVisible(next);
    for (const run of runs) setStoredVisibility(run.runId, nextVisible);
  };

  const setRunColor = (runId: string, color: string) => {
    setRunColors((current) => ({ ...current, [runId]: color }));
    setStoredRunColor(runId, color);
  };

  const setBaseline = (runId: string) => {
    if (runId === baselineRunId) return;
    setBaselineRunId(runId);
    setStoredBaseline(comparison.siteOrigin, runId);
    onBaselineChange?.(runId);
  };

  const setChartRangeMode = (mode: ChartRangeMode) => {
    setRangeMode(mode);
    setStoredChartRangeMode(mode);
  };

  const setChartValueMode = (mode: ChartValueMode) => {
    setValueMode(mode);
    setStoredChartValueMode(mode);
  };

  const setChartResourceFilter = (filter: ChartResourceFilter) => {
    setResourceFilter(filter);
    setStoredChartResourceFilter(filter);
  };

  const updateCustomMinMs = (value: number) => {
    setCustomMinMs(value);
    setStoredChartRangeMinMs(value);
  };

  const updateCustomMaxMs = (value: number) => {
    setCustomMaxMs(value);
    setStoredChartRangeMaxMs(value);
  };

  const parseRangeInput = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  if (comparison.runs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <SectionHeader title={`Comparison — ${comparison.siteOrigin}`} />
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No comparable runs"
            description="Select completed or stopped runs with stored data and click Compare."
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
            title={`Comparison — ${comparison.siteOrigin}`}
            description={`${totalCount} run${totalCount === 1 ? "" : "s"} · ${visibleCount} visible on chart${baselineRun ? ` · baseline: ${baselineRun.runName}` : ""}`}
            action={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setAllVisible(true)} disabled={visibleCount === totalCount}>
                  <Eye className="size-4" />
                  Show all
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAllVisible(false)} disabled={visibleCount === 0}>
                  <EyeOff className="size-4" />
                  Hide all
                </Button>
              </div>
            }
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {runs.map((run) => (
              <div
                key={run.runId}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all",
                  {
                    "opacity-50": !visible[run.runId],
                    "ring-1 ring-warning/40 border-warning/30": run.isBaseline,
                  },
                )}
                style={{ borderColor: run.isBaseline ? undefined : run.color }}
                title={run.runName}
              >
                <input
                  type="color"
                  className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
                  value={runColors[run.runId] ?? run.color}
                  onChange={(e) => setRunColor(run.runId, e.target.value)}
                  aria-label={`Color for ${run.runName}`}
                />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`visible-${run.runId}`}
                    checked={visible[run.runId] ?? true}
                    onCheckedChange={(checked) => setRunVisible(run.runId, checked === true)}
                    aria-label={`Show ${run.runName} on chart`}
                  />
                  <Label
                    htmlFor={`visible-${run.runId}`}
                    className="max-w-40 truncate font-normal"
                    style={{ color: run.color }}
                  >
                    {run.runName}
                  </Label>
                </div>
                {!run.isBaseline && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => setBaseline(run.runId)}
                    aria-pressed={false}
                    title="Set as baseline"
                  >
                    <Star className="size-3.5" />
                    set baseline
                  </Button>
                )}
                {run.isBaseline && (
                  <span className="inline-flex items-center gap-1 px-2 text-xs text-warning" title="Current baseline">
                    <Star className="size-3.5 fill-current" />
                    baseline
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="surface-inset flex flex-wrap items-end gap-3 p-3">
            <div className="space-y-1">
              <Label className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
                Y-axis
              </Label>
              <div className="inline-flex rounded-lg border border-border/60 p-0.5" role="group" aria-label="Chart value mode">
                <Button
                  type="button"
                  size="sm"
                  variant={valueMode === "count" ? "default" : "ghost"}
                  className="h-7 px-3"
                  onClick={() => setChartValueMode("count")}
                  aria-pressed={valueMode === "count"}
                >
                  Count
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={valueMode === "percent" ? "default" : "ghost"}
                  className="h-7 px-3"
                  onClick={() => setChartValueMode("percent")}
                  aria-pressed={valueMode === "percent"}
                >
                  Percent
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
                Requests
              </Label>
              <Select value={resourceFilter} onValueChange={(value) => setChartResourceFilter(value as ChartResourceFilter)}>
                <SelectTrigger size="sm" className="h-8 w-40" aria-label="Chart resource filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_RESOURCE_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
                Latency range
              </Label>
              <div className="inline-flex rounded-lg border border-border/60 p-0.5" role="group" aria-label="Chart latency range mode">
                <Button
                  type="button"
                  size="sm"
                  variant={rangeMode === "auto" ? "default" : "ghost"}
                  className="h-7 px-3"
                  onClick={() => setChartRangeMode("auto")}
                  aria-pressed={rangeMode === "auto"}
                >
                  Auto
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={rangeMode === "custom" ? "default" : "ghost"}
                  className="h-7 px-3"
                  onClick={() => setChartRangeMode("custom")}
                  aria-pressed={rangeMode === "custom"}
                >
                  Custom
                </Button>
              </div>
            </div>

            {rangeMode === "custom" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="chart-range-min" className="text-xs text-muted-foreground">
                    Min (ms)
                  </Label>
                  <Input
                    id="chart-range-min"
                    type="number"
                    min={0}
                    max={HISTOGRAM_MAX_MS}
                    step={HISTOGRAM_BUCKET_SIZE_MS}
                    className="h-8 w-28 font-mono"
                    value={customMinMs}
                    onChange={(event) => updateCustomMinMs(parseRangeInput(event.target.value, customMinMs))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="chart-range-max" className="text-xs text-muted-foreground">
                    Max (ms)
                  </Label>
                  <Input
                    id="chart-range-max"
                    type="number"
                    min={HISTOGRAM_BUCKET_SIZE_MS}
                    max={HISTOGRAM_MAX_MS}
                    step={HISTOGRAM_BUCKET_SIZE_MS}
                    className="h-8 w-28 font-mono"
                    value={customMaxMs}
                    onChange={(event) => updateCustomMaxMs(parseRangeInput(event.target.value, customMaxMs))}
                  />
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              Showing {formatChartRangeLabel(chartRange.minMs, chartRange.maxMs)}
              {rangeMode === "auto" && " based on visible runs"}
              {chartRange.isFallback && chartRange.rangeError && (
                <span className="block text-warning">
                  Invalid custom range. Using auto ({chartRange.rangeError})
                </span>
              )}
            </p>
          </div>

          <div className="min-h-[320px] w-full rounded-lg border border-border/40 bg-surface-elevated/30 p-2">
            {visibleCount === 0 ? (
              <EmptyState
                title="All runs hidden"
                description="Show at least one run to display the latency distribution."
                action={
                  <Button variant="outline" size="sm" onClick={() => setAllVisible(true)}>
                    Show all runs
                  </Button>
                }
                className="min-h-[280px] border-0 bg-transparent"
              />
            ) : chartData.length === 0 ? (
              <EmptyState
                title="No distribution data"
                description="No latency distribution data for the visible runs."
                className="min-h-[280px] border-0 bg-transparent"
              />
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 20 }} barCategoryGap="15%">
                  <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    ticks={axisTicks}
                    tick={{ fontSize: 10, fill: CHART_TICK_COLOR, fontFamily: "var(--font-mono)" }}
                    tickFormatter={(value) => {
                      const row = chartData.find((entry) => entry.label === value);
                      return row?.axisLabel ?? "";
                    }}
                    angle={-35}
                    textAnchor="end"
                    height={56}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                  />
                  <YAxis
                    allowDecimals={valueMode === "percent"}
                    tickFormatter={(value) => formatChartAxisValue(Number(value), valueMode)}
                    tick={{ fill: CHART_TICK_COLOR, fontSize: 10, fontFamily: "var(--font-mono)" }}
                    axisLine={{ stroke: CHART_GRID_COLOR }}
                    tickLine={{ stroke: CHART_GRID_COLOR }}
                  />
                  <Tooltip
                    cursor={{ fill: "oklch(0.78 0.14 195 / 8%)" }}
                    content={(props) => (
                      <LatencyTooltip
                        active={props.active}
                        payload={props.payload}
                        label={props.label}
                        runs={runs}
                        visible={visible}
                        resourceFilter={resourceFilter}
                        valueMode={valueMode}
                      />
                    )}
                  />
                  {visibleRuns.map((run) => (
                    <Bar
                      key={run.runId}
                      dataKey={run.runName}
                      fill={run.color}
                      stackId="latency"
                      maxBarSize={40}
                      radius={[2, 2, 0, 0]}
                      animationDuration={600}
                      animationEasing="ease-out"
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Stacked bars show {valueMode === "percent" ? "each run's share of requests" : "request counts"} per{" "}
            <Metric className="text-xs">{HISTOGRAM_BUCKET_SIZE_MS}</Metric> ms latency bucket for{" "}
            {chartResourceFilterLabel(resourceFilter).toLowerCase()} ({formatChartRangeLabel(chartRange.minMs, chartRange.maxMs)}).
            Latencies above <Metric className="text-xs">{HISTOGRAM_MAX_MS}</Metric> ms are grouped in the final bucket.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader
            title="Percentile summary"
            description={
              valueMode === "percent"
                ? `Latency percentiles for ${chartResourceFilterLabel(resourceFilter).toLowerCase()} with baseline deltas as relative change. The chart below shows each run's share of requests per ${HISTOGRAM_BUCKET_SIZE_MS} ms bucket; dashed lines mark p50 per run.`
                : `Latency percentiles for ${chartResourceFilterLabel(resourceFilter).toLowerCase()} with baseline deltas in milliseconds. The chart below shows each run's share of requests per ${HISTOGRAM_BUCKET_SIZE_MS} ms bucket; dashed lines mark p50 per run.`
            }
          />
        </CardHeader>
        <CardContent className="space-y-6">
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
                    "opacity-50": !visible[run.runId],
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
                    {!visible[run.runId] && (
                      <Badge variant="muted" className="ml-2">
                        hidden
                      </Badge>
                    )}
                  </TableCell>
                  {(["p50", "p75", "p90", "p95", "p99"] as const).map((key) => (
                    <TableCell key={key}>
                      <Metric unit="ms">{run.summaryPercentiles[key].toFixed(1)}</Metric>
                      {run.summaryDeltas && (
                        <DeltaValue delta={run.summaryDeltas[key]!} valueMode={valueMode} />
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {visibleSummaryRuns.length === 0 ? (
            <EmptyState
              title="All runs hidden"
              description="Show at least one run to display the distribution curves."
              action={
                <Button variant="outline" size="sm" onClick={() => setAllVisible(true)}>
                  Show all runs
                </Button>
              }
              className="min-h-[280px] border-0 bg-transparent"
            />
          ) : distributionChart.data.length === 0 ? (
            <EmptyState
              title="No distribution data"
              description="No request distribution data for the visible runs in the current range."
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
                  {visibleSummaryRuns.map((run) => (
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
        </CardContent>
      </Card>
    </div>
  );
}
