import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ComparisonResult, ComparisonRunSeries } from "@sitebench/core";
import { Eye, EyeOff, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  getStoredRunColor,
  getStoredVisibility,
  setStoredBaseline,
  setStoredRunColor,
  setStoredVisibility,
} from "@/lib/comparison-preferences";
import {
  bucketTotalCount,
  formatAxisTick,
  formatBucketLabel,
  withBaseline,
} from "@/lib/comparison-utils";

type Props = {
  comparison: ComparisonResult;
};

type ChartRow = {
  label: string;
  axisLabel: string;
  bucketIndex: number;
  [runName: string]: string | number;
};

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
};

function LatencyTooltip({ active, payload, label, runs, visible }: LatencyTooltipProps) {
  if (!active || !payload?.length) return null;

  const bucketIndex = payload[0]?.payload?.bucketIndex;
  if (bucketIndex === undefined) return null;

  const bucketLabel = payload[0]?.payload?.label ?? String(label ?? "");
  const total = bucketTotalCount(runs, bucketIndex, visible);
  const entries = payload.filter((entry) => Number(entry.value) > 0);

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{bucketLabel}</p>
      <p className="mb-2 text-xs text-muted-foreground">
        {total} request{total === 1 ? "" : "s"} in this latency range
      </p>
      {entries.length > 0 ? (
        <ul className="space-y-1">
          {entries.map((entry) => (
            <li key={String(entry.name)} className="grid grid-cols-[10px_1fr_auto] items-center gap-2 text-sm">
              <span className="size-2.5 rounded-full" style={{ background: entry.color }} />
              <span>{entry.name}</span>
              <strong>{entry.value}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No requests from visible runs</p>
      )}
    </div>
  );
}

function resolveInitialBaseline(comparison: ComparisonResult): string | null {
  const stored = getStoredBaseline(comparison.siteOrigin);
  if (stored && comparison.runs.some((run) => run.runId === stored)) return stored;
  return comparison.runs.find((run) => run.isBaseline)?.runId ?? null;
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

export function ComparisonView({ comparison }: Props) {
  const [runColors, setRunColors] = useState<Record<string, string>>(() => resolveInitialColors(comparison));
  const [visible, setVisible] = useState<Record<string, boolean>>(() => resolveInitialVisibility(comparison));
  const [baselineRunId, setBaselineRunId] = useState<string | null>(() => resolveInitialBaseline(comparison));

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

  const chartData = useMemo(() => {
    if (runs.length === 0) return [];
    const bucketCount = runs[0]?.histogram.length ?? 0;

    return Array.from({ length: bucketCount }, (_, index) => {
      const bucket = runs[0].histogram[index];
      const row: ChartRow = {
        label: formatBucketLabel(bucket),
        axisLabel: index % 10 === 0 ? formatAxisTick(bucket.minMs) : "",
        bucketIndex: index,
      };

      for (const run of runs) {
        if (!visible[run.runId]) continue;
        row[run.runName] = run.histogram[index]?.count ?? 0;
      }

      return row;
    }).filter((row) => Object.keys(row).length > 3);
  }, [runs, visible]);

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

  const setBaseline = (runId: string | null) => {
    setBaselineRunId(runId);
    setStoredBaseline(comparison.siteOrigin, runId);
  };

  if (comparison.runs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Comparison — {comparison.siteOrigin}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12 text-center text-muted-foreground">
            <p>No comparable runs are available for this comparison.</p>
            <p className="text-sm">Select completed or stopped runs with stored data and click Compare selected.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Comparison — {comparison.siteOrigin}</CardTitle>
            <CardDescription>
              {totalCount} run{totalCount === 1 ? "" : "s"} · {visibleCount} visible on chart
              {baselineRun && <> · baseline: {baselineRun.runName}</>}
            </CardDescription>
          </div>
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
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {runs.map((run) => (
              <div
                key={run.runId}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-opacity",
                  {
                    "opacity-50": !visible[run.runId],
                    "ring-1 ring-primary/40": run.isBaseline,
                  },
                )}
                style={{ borderColor: run.color }}
                title={run.runName}
              >
                <input
                  type="color"
                  className="size-5 cursor-pointer rounded-full border-0 bg-transparent p-0"
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn("h-7 px-2 text-xs", {
                    "text-amber-400": run.isBaseline,
                    "text-muted-foreground": !run.isBaseline,
                  })}
                  onClick={() => setBaseline(run.isBaseline ? null : run.runId)}
                  aria-pressed={run.isBaseline}
                  title={run.isBaseline ? "Clear baseline" : "Set as baseline"}
                >
                  <Star className={cn("size-3.5", { "fill-current": run.isBaseline })} />
                  {run.isBaseline ? "baseline" : "set baseline"}
                </Button>
              </div>
            ))}
          </div>

          <div className="min-h-[320px] w-full">
            {visibleCount === 0 ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed text-muted-foreground">
                <p>All runs are hidden on the chart.</p>
                <Button variant="outline" size="sm" onClick={() => setAllVisible(true)}>
                  Show all runs
                </Button>
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                <p>No latency distribution data for the visible runs.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="label"
                    ticks={axisTicks}
                    tick={{ fontSize: 11, fill: "oklch(0.68 0.02 260)" }}
                    tickFormatter={(value) => {
                      const row = chartData.find((entry) => entry.label === value);
                      return row?.axisLabel ?? "";
                    }}
                    angle={-35}
                    textAnchor="end"
                    height={56}
                  />
                  <YAxis allowDecimals={false} tick={{ fill: "oklch(0.68 0.02 260)" }} />
                  <Tooltip
                    content={(props) => (
                      <LatencyTooltip
                        active={props.active}
                        payload={props.payload}
                        label={props.label}
                        runs={runs}
                        visible={visible}
                      />
                    )}
                  />
                  {visibleRuns.map((run) => (
                    <Bar key={run.runId} dataKey={run.runName} fill={run.color} stackId="latency" maxBarSize={48} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Stacked bars show request counts per 50 ms latency bucket (0–5 s).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Percentile summary</CardTitle>
          <CardDescription>Latency percentiles with baseline deltas when a baseline is selected.</CardDescription>
        </CardHeader>
        <CardContent>
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
              {runs.map((run) => (
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
                      {run.percentiles[key].toFixed(1)} ms
                      {run.deltas && (
                        <span
                          className={cn("ml-1 text-xs", {
                            "text-red-400": (run.deltas[key] ?? 0) > 0,
                            "text-emerald-400": (run.deltas[key] ?? 0) < 0,
                            "text-muted-foreground": (run.deltas[key] ?? 0) === 0,
                          })}
                        >
                          ({run.deltas[key]! >= 0 ? "+" : ""}{run.deltas[key]!.toFixed(1)})
                        </span>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
