import { fetch, Agent, type Dispatcher } from "undici";
import { START_URL_PROBE_TIMEOUT_MS } from "./defaults.js";
import type { CrawlConfig, ErrorClass, RequestTimings } from "./types.js";
import { detectResourceType } from "./utils.js";
import type { ResourceType } from "./types.js";

export type MeasureResult = {
  url: string;
  resourceType: ResourceType;
  statusCode: number | null;
  errorClass: ErrorClass | null;
  errorMessage: string | null;
  timings: RequestTimings;
  byteCount: number;
  redirectCount: number;
  bodyText: string | null;
  contentType: string | null;
};

export type HttpTransport = (
  url: string,
  init: { method: string; signal: AbortSignal; dispatcher?: Dispatcher },
) => Promise<{
  status: number;
  headers: Record<string, string>;
  body: AsyncIterable<Uint8Array> | null;
}>;

function classifyError(error: unknown): { errorClass: ErrorClass; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("abort") || lower.includes("timeout")) {
    return { errorClass: "timeout", message };
  }
  if (lower.includes("getaddrinfo") || lower.includes("enotfound") || lower.includes("dns")) {
    return { errorClass: "dns", message };
  }
  if (lower.includes("certificate") || lower.includes("ssl") || lower.includes("tls")) {
    return { errorClass: "tls", message };
  }
  if (lower.includes("econnrefused") || lower.includes("connect")) {
    return { errorClass: "connection", message };
  }

  return { errorClass: "unknown", message };
}

async function readBody(
  body: AsyncIterable<Uint8Array> | null,
  discardAfterMeasure: boolean,
): Promise<{ bytes: number; text: string | null }> {
  if (!body) return { bytes: 0, text: null };

  let bytes = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of body) {
    bytes += chunk.byteLength;
    if (!discardAfterMeasure) chunks.push(Buffer.from(chunk));
  }

  if (discardAfterMeasure) return { bytes, text: null };

  return { bytes, text: Buffer.concat(chunks).toString("utf8") };
}

export class HttpMeasurer {
  private readonly config: CrawlConfig;
  private readonly transport: HttpTransport;
  private readonly agent: Agent;

  constructor(config: CrawlConfig, transport?: HttpTransport) {
    this.config = config;
    this.agent = new Agent({
      connect: { timeout: config.connectTimeoutMs },
    });
    this.transport =
      transport ??
      (async (url, init) => {
        const response = await fetch(url, {
          method: init.method,
          signal: init.signal,
          redirect: "manual",
          dispatcher: init.dispatcher ?? this.agent,
        });

        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key.toLowerCase()] = value;
        });

        return {
          status: response.status,
          headers,
          body: response.body,
        };
      });
  }

  async measure(url: string, resourceType?: ResourceType): Promise<MeasureResult> {
    const resolvedType = resourceType ?? detectResourceType(url);
    const discardBody = resolvedType === "image";
    let redirectCount = 0;
    let currentUrl = url;
    const startedAt = performance.now();
    let dnsMs: number | null = null;
    let connectMs: number | null = null;
    let ttfbMs: number | null = null;

    try {
      while (redirectCount <= this.config.maxRedirects) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
        const requestStart = performance.now();

        try {
          const response = await this.transport(currentUrl, {
            method: "GET",
            signal: controller.signal,
            dispatcher: this.agent,
          });

          ttfbMs = performance.now() - requestStart;
          connectMs = connectMs ?? ttfbMs;
          dnsMs = dnsMs ?? ttfbMs;

          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.location;
            if (!location) {
              return {
                url: currentUrl,
                resourceType: resolvedType,
                statusCode: response.status,
                errorClass: "redirect",
                errorMessage: "Redirect response missing Location header",
                timings: { dnsMs, connectMs, ttfbMs, totalMs: performance.now() - startedAt },
                byteCount: 0,
                redirectCount,
                bodyText: null,
                contentType: response.headers["content-type"] ?? null,
              };
            }

            redirectCount += 1;
            if (redirectCount > this.config.maxRedirects) {
              return {
                url: currentUrl,
                resourceType: resolvedType,
                statusCode: response.status,
                errorClass: "redirect",
                errorMessage: "Maximum redirect depth exceeded",
                timings: { dnsMs, connectMs, ttfbMs, totalMs: performance.now() - startedAt },
                byteCount: 0,
                redirectCount,
                bodyText: null,
                contentType: null,
              };
            }

            currentUrl = new URL(location, currentUrl).href;
            continue;
          }

          const { bytes, text } = await readBody(response.body, discardBody);
          const totalMs = performance.now() - startedAt;
          const isErrorStatus = response.status >= 400;

          return {
            url: currentUrl,
            resourceType: resolvedType,
            statusCode: response.status,
            errorClass: isErrorStatus ? "http" : null,
            errorMessage: isErrorStatus ? `HTTP ${response.status}` : null,
            timings: { dnsMs, connectMs, ttfbMs, totalMs },
            byteCount: bytes,
            redirectCount,
            bodyText: text,
            contentType: response.headers["content-type"] ?? null,
          };
        } finally {
          clearTimeout(timeout);
        }
      }

      return {
        url: currentUrl,
        resourceType: resolvedType,
        statusCode: null,
        errorClass: "redirect",
        errorMessage: "Maximum redirect depth exceeded",
        timings: { dnsMs, connectMs, ttfbMs, totalMs: performance.now() - startedAt },
        byteCount: 0,
        redirectCount,
        bodyText: null,
        contentType: null,
      };
    } catch (error) {
      const classified = classifyError(error);
      return {
        url: currentUrl,
        resourceType: resolvedType,
        statusCode: null,
        errorClass: classified.errorClass,
        errorMessage: classified.message,
        timings: {
          dnsMs,
          connectMs,
          ttfbMs,
          totalMs: performance.now() - startedAt,
        },
        byteCount: 0,
        redirectCount,
        bodyText: null,
        contentType: null,
      };
    }
  }

  async probeStartUrl(url: string): Promise<{ ok: true } | { ok: false; message: string }> {
    const probeTimeoutMs = Math.min(this.config.requestTimeoutMs, START_URL_PROBE_TIMEOUT_MS);
    const probeConfig =
      probeTimeoutMs === this.config.requestTimeoutMs
        ? this.config
        : {
            ...this.config,
            requestTimeoutMs: probeTimeoutMs,
            connectTimeoutMs: Math.min(this.config.connectTimeoutMs, probeTimeoutMs),
          };
    const measurer = probeConfig === this.config ? this : new HttpMeasurer(probeConfig, this.transport);
    const result = await measurer.measure(url, "page");
    if (result.errorClass && result.errorClass !== "http") {
      return { ok: false, message: result.errorMessage ?? "Start URL is unreachable" };
    }
    if (result.statusCode && result.statusCode >= 400) {
      return { ok: false, message: `Start URL returned HTTP ${result.statusCode}` };
    }
    return { ok: true };
  }
}
