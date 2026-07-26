import type { RequestRecord, SlowPageAnalysis, SlowPagePattern, SlowPagePatternConfidence } from "./types.js";
import { percentile } from "./histogram.js";

const EMPTY_HEADERS: RequestRecord["responseHeaders"] = {};

type Feature = {
  dimension: string;
  value: string;
  label: string;
};

type AnalyzeSlowPagesOptions = {
  thresholdMs?: number;
  slowPageLimit?: number;
  patternLimit?: number;
};

function formatBytes(bytes: number) {
  if (bytes >= 1_048_576) return "> 1 MB";
  if (bytes >= 102_400) return "100 KB – 1 MB";
  if (bytes >= 10_240) return "10 – 100 KB";
  return "< 10 KB";
}

function statusBucket(statusCode: number | null) {
  if (statusCode === null) return "No status";
  if (statusCode >= 500) return "5xx";
  if (statusCode >= 400) return "4xx";
  if (statusCode >= 300) return "3xx";
  return "2xx";
}

function cacheBucket(headers: RequestRecord["responseHeaders"]) {
  const cacheControl = headers["cache-control"]?.toLowerCase() ?? "";
  if (!cacheControl) return "No Cache-Control";
  if (cacheControl.includes("no-store") || cacheControl.includes("no-cache")) return "No cache";
  if (cacheControl.includes("max-age=0")) return "max-age=0";
  return "Cacheable";
}

function pageLatency(request: RequestRecord) {
  return request.timings.totalMs;
}

function urlFeatures(url: string): Feature[] {
  const features: Feature[] = [];

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);

    if (segments.length > 0) {
      features.push({
        dimension: "path-prefix",
        value: `/${segments[0]}/`,
        label: `Path starts with /${segments[0]}/`,
      });
    }

    features.push({
      dimension: "path-depth",
      value: String(segments.length),
      label: `Path depth ${segments.length}`,
    });

    if (parsed.search) {
      features.push({
        dimension: "query-string",
        value: "present",
        label: "Has query string",
      });
    }

    const extension = parsed.pathname.split(".").pop()?.toLowerCase();
    if (extension && parsed.pathname.includes(".") && extension.length <= 5) {
      features.push({
        dimension: "extension",
        value: `.${extension}`,
        label: `Extension .${extension}`,
      });
    }

    if (/\d{4,}/.test(parsed.pathname)) {
      features.push({
        dimension: "numeric-id",
        value: "present",
        label: "Numeric ID in path",
      });
    }
  } catch {
    features.push({
      dimension: "url",
      value: "invalid",
      label: "Invalid URL",
    });
  }

  return features;
}

function requestFeatures(request: RequestRecord): Feature[] {
  const headers = request.responseHeaders ?? EMPTY_HEADERS;
  const latency = pageLatency(request);
  const ttfb = request.timings.ttfbMs ?? latency;
  const downloadMs = Math.max(0, request.timings.totalMs - ttfb);
  const features = urlFeatures(request.url);

  features.push({
    dimension: "status",
    value: statusBucket(request.statusCode),
    label: `HTTP ${statusBucket(request.statusCode)}`,
  });

  features.push({
    dimension: "response-size",
    value: formatBytes(request.byteCount),
    label: `Response size ${formatBytes(request.byteCount)}`,
  });

  if (request.redirectCount > 0) {
    features.push({
      dimension: "redirects",
      value: request.redirectCount >= 2 ? "2+" : "1",
      label: request.redirectCount >= 2 ? "2+ redirects" : "1 redirect",
    });
  }

  if (request.errorClass) {
    features.push({
      dimension: "error",
      value: request.errorClass,
      label: `Error: ${request.errorClass}`,
    });
  }

  if (request.contentType) {
    const simplified = request.contentType.split(";")[0]?.trim() ?? request.contentType;
    features.push({
      dimension: "content-type",
      value: simplified,
      label: `Content-Type ${simplified}`,
    });
  }

  const server = headers.server?.trim();
  if (server) {
    features.push({
      dimension: "server",
      value: server,
      label: `Server: ${server}`,
    });
  }

  features.push({
    dimension: "cache",
    value: cacheBucket(headers),
    label: cacheBucket(headers),
  });

  if (ttfb >= request.timings.totalMs * 0.8 && request.timings.totalMs >= 200) {
    features.push({
      dimension: "bottleneck",
      value: "ttfb",
      label: "Slow TTFB (server wait)",
    });
  } else if (downloadMs >= request.timings.totalMs * 0.5 && request.byteCount >= 102_400) {
    features.push({
      dimension: "bottleneck",
      value: "download",
      label: "Slow download (large body)",
    });
  }

  return features;
}

function patternConfidence(enrichment: number, slowCount: number): SlowPagePatternConfidence {
  if (enrichment >= 2.5 && slowCount >= 3) return "high";
  if (enrichment >= 1.8 && slowCount >= 2) return "medium";
  return "low";
}

function featureKey(feature: Feature) {
  return `${feature.dimension}:${feature.value}`;
}

export function computeSlowPageThreshold(pages: RequestRecord[], percentileRank = 90) {
  if (pages.length === 0) return 0;
  const latencies = pages.map((page) => pageLatency(page)).sort((a, b) => a - b);
  return Math.max(500, percentile(latencies, percentileRank));
}

export function analyzeSlowPages(
  pages: RequestRecord[],
  options: AnalyzeSlowPagesOptions = {},
): SlowPageAnalysis {
  if (pages.length === 0) {
    return { thresholdMs: 0, slowPages: [], patterns: [] };
  }

  const thresholdMs = options.thresholdMs ?? computeSlowPageThreshold(pages);
  const slowPages = pages
    .filter((page) => pageLatency(page) >= thresholdMs)
    .sort((a, b) => pageLatency(b) - pageLatency(a))
    .slice(0, options.slowPageLimit ?? 50);

  if (slowPages.length === 0) {
    return { thresholdMs, slowPages: [], patterns: [] };
  }

  const slowIds = new Set(slowPages.map((page) => page.id));
  const featureStats = new Map<
    string,
    {
      feature: Feature;
      slowCount: number;
      totalCount: number;
      latencySum: number;
    }
  >();

  for (const page of pages) {
    const isSlow = slowIds.has(page.id);
    const latency = pageLatency(page);

    for (const feature of requestFeatures(page)) {
      const key = featureKey(feature);
      const existing = featureStats.get(key) ?? {
        feature,
        slowCount: 0,
        totalCount: 0,
        latencySum: 0,
      };

      existing.totalCount += 1;
      existing.latencySum += latency;
      if (isSlow) existing.slowCount += 1;
      featureStats.set(key, existing);
    }
  }

  const slowRate = slowPages.length / pages.length;
  const patterns: SlowPagePattern[] = [];

  for (const stats of featureStats.values()) {
    if (stats.slowCount < 2) continue;
    if (stats.totalCount < 2) continue;

    const overallRate = stats.totalCount / pages.length;
    const featureSlowRate = stats.slowCount / slowPages.length;
    const enrichment = overallRate > 0 ? featureSlowRate / overallRate : 0;
    if (enrichment < 1.4) continue;
    if (featureSlowRate <= slowRate) continue;

    patterns.push({
      label: stats.feature.label,
      dimension: stats.feature.dimension,
      value: stats.feature.value,
      slowCount: stats.slowCount,
      totalCount: stats.totalCount,
      avgLatencyMs: stats.latencySum / stats.totalCount,
      enrichment,
      confidence: patternConfidence(enrichment, stats.slowCount),
    });
  }

  patterns.sort((a, b) => b.enrichment * b.slowCount - a.enrichment * a.slowCount);

  return {
    thresholdMs,
    slowPages,
    patterns: patterns.slice(0, options.patternLimit ?? 8),
  };
}
