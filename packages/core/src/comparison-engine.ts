import type { DatabaseStore } from "./database.js";
import { DEFAULT_COLORS } from "./types.js";
import type { ComparisonResult, ComparisonRunSeries } from "./types.js";

export type ComparisonSelection = {
  runId: string;
  visible?: boolean;
  color?: string;
  isBaseline?: boolean;
};

export class ComparisonEngine {
  private readonly store: DatabaseStore;

  constructor(store: DatabaseStore) {
    this.store = store;
  }

  compare(siteOrigin: string, selections: ComparisonSelection[]): ComparisonResult {
    const runs: ComparisonRunSeries[] = [];

    for (const [index, selection] of selections.entries()) {
      const run = this.store.getRun(selection.runId);
      if (!run || !run.aggregates) continue;

      const percentiles = {
        p50: run.aggregates.p50,
        p75: run.aggregates.p75,
        p90: run.aggregates.p90,
        p95: run.aggregates.p95,
        p99: run.aggregates.p99,
      };

      const storedPercentiles = run.aggregates.percentilesByResourceType;
      const storedAssetPercentiles = run.aggregates.assetPercentiles;
      const computedPercentiles =
        storedPercentiles && storedAssetPercentiles
          ? { percentilesByResourceType: storedPercentiles, assetPercentiles: storedAssetPercentiles }
          : this.store.computePercentilesByResourceType(selection.runId);

      runs.push({
        runId: run.id,
        runName: run.name,
        color: selection.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length],
        visible: selection.visible ?? true,
        isBaseline: selection.isBaseline ?? false,
        histogram: run.aggregates.latencyHistogram,
        histogramsByResourceType:
          run.aggregates.latencyHistogramsByResourceType ??
          this.store.computeHistogramsByResourceType(selection.runId),
        percentiles,
        percentilesByResourceType: computedPercentiles.percentilesByResourceType,
        assetPercentiles: computedPercentiles.assetPercentiles,
        deltas: null,
      });
    }

    const baselineSeries = runs.find((series) => series.isBaseline);
    if (baselineSeries) {
      for (const series of runs) {
        if (series.isBaseline) continue;
        series.deltas = {
          p50: series.percentiles.p50 - baselineSeries.percentiles.p50,
          p75: series.percentiles.p75 - baselineSeries.percentiles.p75,
          p90: series.percentiles.p90 - baselineSeries.percentiles.p90,
          p95: series.percentiles.p95 - baselineSeries.percentiles.p95,
          p99: series.percentiles.p99 - baselineSeries.percentiles.p99,
        };
      }
    }

    return { siteOrigin, runs };
  }

  listComparableRuns(siteOrigin: string) {
    return this.store
      .listRuns(siteOrigin)
      .filter((run) => (run.status === "completed" || run.status === "stopped") && run.aggregates);
  }
}
