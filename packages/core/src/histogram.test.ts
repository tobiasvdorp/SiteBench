import { describe, expect, it } from "vitest";
import { HISTOGRAM_BUCKET_SIZE_MS, HISTOGRAM_MAX_MS } from "./defaults.js";
import { buildHistogram } from "./utils.js";
import {
  axisTickIntervalMs,
  bucketIndicesInRange,
  computeAutoChartMaxMs,
  countRequestsBeyondMs,
  histogramBucketPercentages,
  histogramTotalCount,
  lastNonZeroBucketIndex,
  lastNonZeroBucketIndexAcross,
  maxLatencyMsAcross,
  shouldShowAxisTick,
  validateChartRange,
  combineHistograms,
  percentilesFromHistogram,
} from "./histogram.js";

describe("histogramBucketPercentages", () => {
  it("normalizes each bucket as a percentage of the run total", () => {
    const buckets = buildHistogram([100, 100, 200, 200]);
    const percentages = histogramBucketPercentages(buckets);

    expect(histogramTotalCount(buckets)).toBe(4);
    expect(percentages.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 5);
  });

  it("normalizes runs with different sizes independently", () => {
    const largeRun = buildHistogram([
      ...Array.from({ length: 50 }, () => 100),
      ...Array.from({ length: 50 }, () => 200),
    ]);
    const smallRun = buildHistogram([
      ...Array.from({ length: 5 }, () => 100),
      ...Array.from({ length: 5 }, () => 200),
    ]);

    const bucketIndex = 2;
    const largePercent = histogramBucketPercentages(largeRun)[bucketIndex];
    const smallPercent = histogramBucketPercentages(smallRun)[bucketIndex];

    expect(largePercent).toBeCloseTo(50, 5);
    expect(smallPercent).toBeCloseTo(50, 5);
  });

  it("returns zero percentages when the run has no requests", () => {
    const buckets = buildHistogram([]);
    expect(histogramBucketPercentages(buckets).every((value) => value === 0)).toBe(true);
  });
});

describe("chart range utilities", () => {
  it("finds the last non-zero bucket in a histogram", () => {
    const buckets = buildHistogram([100, 120, 350]);
    expect(lastNonZeroBucketIndex(buckets)).toBe(7);
  });

  it("returns -1 when no histogram has data", () => {
    expect(lastNonZeroBucketIndex(buildHistogram([]))).toBe(-1);
    expect(lastNonZeroBucketIndexAcross([buildHistogram([]), buildHistogram([])])).toBe(-1);
  });

  it("uses the farthest non-zero bucket across multiple histograms", () => {
    const shortRun = buildHistogram([100, 120]);
    const longRun = buildHistogram([100, 900]);
    expect(lastNonZeroBucketIndexAcross([shortRun, longRun])).toBe(18);
  });

  it("pads auto chart max to the next bucket with headroom", () => {
    expect(computeAutoChartMaxMs(350, HISTOGRAM_BUCKET_SIZE_MS, HISTOGRAM_MAX_MS)).toBe(400);
    expect(computeAutoChartMaxMs(500, HISTOGRAM_BUCKET_SIZE_MS, HISTOGRAM_MAX_MS)).toBe(550);
  });

  it("caps auto chart max at the histogram limit", () => {
    expect(computeAutoChartMaxMs(5000, HISTOGRAM_BUCKET_SIZE_MS, HISTOGRAM_MAX_MS)).toBe(5000);
  });

  it("validates custom chart ranges", () => {
    expect(validateChartRange(0, 500, HISTOGRAM_MAX_MS, HISTOGRAM_BUCKET_SIZE_MS).valid).toBe(true);
    expect(validateChartRange(0, 0, HISTOGRAM_MAX_MS, HISTOGRAM_BUCKET_SIZE_MS).valid).toBe(false);
    expect(validateChartRange(-10, 500, HISTOGRAM_MAX_MS, HISTOGRAM_BUCKET_SIZE_MS).valid).toBe(false);
    expect(validateChartRange(0, 6000, HISTOGRAM_MAX_MS, HISTOGRAM_BUCKET_SIZE_MS).valid).toBe(false);
  });

  it("maps chart ranges to bucket indices", () => {
    expect(bucketIndicesInRange(0, 500, HISTOGRAM_BUCKET_SIZE_MS, 100)).toEqual({
      startIndex: 0,
      endIndex: 9,
    });
    expect(bucketIndicesInRange(100, 350, HISTOGRAM_BUCKET_SIZE_MS, 100)).toEqual({
      startIndex: 2,
      endIndex: 6,
    });
  });

  it("chooses denser axis ticks for narrower ranges", () => {
    expect(axisTickIntervalMs(300)).toBe(100);
    expect(axisTickIntervalMs(900)).toBe(200);
    expect(axisTickIntervalMs(2000)).toBe(500);
    expect(axisTickIntervalMs(4000)).toBe(1000);
    expect(shouldShowAxisTick(200, 200)).toBe(true);
    expect(shouldShowAxisTick(150, 200)).toBe(false);
  });

  it("counts requests beyond a chart max across histograms", () => {
    const shortRun = buildHistogram([100, 120, 900]);
    const longRun = buildHistogram([100, 120, 950, 980]);
    const maxMs = 400;

    expect(countRequestsBeyondMs([shortRun, longRun], maxMs)).toBe(3);
    expect(maxLatencyMsAcross([shortRun, longRun])).toBe(1000);
  });
});

describe("combineHistograms", () => {
  it("combines histogram bucket counts across runs", () => {
    const first = buildHistogram([100, 120]);
    const second = buildHistogram([100, 200]);
    const combined = combineHistograms([first, second]);

    expect(combined[2]?.count).toBe(3);
    expect(histogramTotalCount(combined)).toBe(4);
  });
});

describe("percentilesFromHistogram", () => {
  it("derives percentile latencies from bucket counts", () => {
    const buckets = buildHistogram([
      ...Array.from({ length: 50 }, () => 100),
      ...Array.from({ length: 50 }, () => 200),
    ]);

    expect(percentilesFromHistogram(buckets).p50).toBe(150);
    expect(percentilesFromHistogram(buckets).p99).toBe(250);
  });

  it("returns zero percentiles when the histogram is empty", () => {
    expect(percentilesFromHistogram(buildHistogram([]))).toEqual({
      p50: 0,
      p75: 0,
      p90: 0,
      p95: 0,
      p99: 0,
    });
  });
});
