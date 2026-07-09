import { fetch } from "undici";
import { CrawlPolicy } from "./crawl-policy.js";
import { extractAssets, extractPageLinks } from "./html-parser.js";
import { HttpMeasurer } from "./http-measurer.js";
import { RequestScheduler } from "./request-scheduler.js";
import { RunRecorder } from "./run-recorder.js";
import type { CrawlConfig, TruncationReason } from "./types.js";
import { normalizeUrl } from "./utils.js";

type QueueItem = {
  url: string;
  type: "page" | "asset";
  resourceType?: import("./types.js").ResourceType;
};

export type OrchestratorRunResult = {
  truncated: boolean;
  truncationReason: TruncationReason | null;
};

export type OrchestratorOptions = {
  config: CrawlConfig;
  origin: string;
  recorder: RunRecorder;
  measurer?: HttpMeasurer;
  scheduler?: RequestScheduler;
  abortSignal?: AbortSignal;
  now?: () => number;
};

export class CrawlOrchestrator {
  private readonly config: CrawlConfig;
  private readonly policy: CrawlPolicy;
  private readonly scheduler: RequestScheduler;
  private readonly measurer: HttpMeasurer;
  private readonly recorder: RunRecorder;
  private readonly abortSignal?: AbortSignal;
  private readonly now: () => number;
  private readonly startedAtMs: number;
  private pageQueue: string[] = [];
  private assetQueue: QueueItem[] = [];
  private stopped = false;
  private timeLimitReached = false;

  constructor(options: OrchestratorOptions) {
    this.config = options.config;
    this.policy = new CrawlPolicy(options.origin, options.config);
    this.scheduler = options.scheduler ?? new RequestScheduler(options.config.rpsLimit);
    this.measurer = options.measurer ?? new HttpMeasurer(options.config);
    this.recorder = options.recorder;
    this.abortSignal = options.abortSignal;
    this.now = options.now ?? Date.now;
    this.startedAtMs = this.now();
  }

  async initialize() {
    if (this.config.respectRobots) {
      const robotsUrl = `${this.policy.getOrigin()}/robots.txt`;
      try {
        const response = await fetch(robotsUrl, { signal: AbortSignal.timeout(10_000) });
        const text = response.ok ? await response.text() : "";
        this.policy.setRobotsTxt(text, robotsUrl);
      } catch {
        this.policy.setRobotsTxt("", robotsUrl);
      }
    }

    this.enqueuePage(this.config.startUrl);
  }

  stop() {
    this.stopped = true;
  }

  async run(): Promise<OrchestratorRunResult> {
    await this.initialize();

    while (!this.stopped && !this.abortSignal?.aborted) {
      if (this.isTimeLimitReached()) {
        this.timeLimitReached = true;
        break;
      }

      const hasWork = this.pageQueue.length > 0 || this.assetQueue.length > 0;
      if (!hasWork) break;

      if (this.policy.isPageLimitReached() && this.pageQueue.length === 0) {
        await this.drainAssets();
        break;
      }

      const nextPage = this.pageQueue.shift();
      if (nextPage) {
        await this.fetchPage(nextPage);
        continue;
      }

      const nextAsset = this.assetQueue.shift();
      if (nextAsset) await this.fetchAsset(nextAsset);
    }

    if (this.pageQueue.length > 0 || this.assetQueue.length > 0) {
      await this.drainAssets();
    }

    const queueHasPages = this.pageQueue.length > 0;
    const truncationReason = this.policy.getTruncationReason(queueHasPages, this.timeLimitReached);
    return {
      truncated: truncationReason !== null,
      truncationReason,
    };
  }

  private isTimeLimitReached() {
    const limit = this.config.timeLimitSeconds;
    if (limit === null) return false;
    const elapsedSeconds = (this.now() - this.startedAtMs) / 1000;
    return elapsedSeconds >= limit;
  }

  private async drainAssets() {
    while (this.assetQueue.length > 0 && !this.stopped && !this.abortSignal?.aborted) {
      if (this.isTimeLimitReached()) {
        this.timeLimitReached = true;
        break;
      }
      const item = this.assetQueue.shift();
      if (!item) break;
      await this.fetchAsset(item);
    }
  }

  private enqueuePage(url: string) {
    const decision = this.policy.shouldEnqueuePage(url);
    if (!decision.allowed) return;
    this.policy.markPageQueued(url);
    this.pageQueue.push(normalizeUrl(url)!);
    this.recorder.setPagesDiscovered(this.policy.getPagesFetched() + this.pageQueue.length);
    this.recorder.setQueueSize(this.pageQueue.length + this.assetQueue.length);
  }

  private enqueueAsset(url: string, resourceType: import("./types.js").ResourceType) {
    const decision = this.policy.shouldFetchAsset(url, resourceType);
    if (!decision.allowed) return;
    this.policy.markAssetQueued(url);
    this.assetQueue.push({ url: normalizeUrl(url)!, type: "asset", resourceType });
    this.recorder.setQueueSize(this.pageQueue.length + this.assetQueue.length);
  }

  private async fetchPage(url: string) {
    if (this.policy.isPageLimitReached()) return;

    const result = await this.measureWithRetries(url, "page");
    this.policy.markPageFetched();
    this.recorder.recordRequest(result);

    if (result.errorClass || !result.bodyText) return;

    const links = extractPageLinks(result.bodyText, url, this.policy.getOrigin());
    for (const link of links) this.enqueuePage(link.url);

    const assets = extractAssets(
      result.bodyText,
      url,
      this.policy.getOrigin(),
      this.config.allowImages,
    );
    for (const asset of assets) this.enqueueAsset(asset.url, asset.resourceType);
  }

  private async fetchAsset(item: QueueItem) {
    const result = await this.measureWithRetries(item.url, item.resourceType ?? "other");
    this.recorder.recordRequest(result);
  }

  private async measureWithRetries(url: string, resourceType: import("./types.js").ResourceType) {
    let attempt = 0;
    while (true) {
      await this.scheduler.acquire();
      const result = await this.measurer.measure(url, resourceType);
      const retryable =
        result.errorClass === "timeout" ||
        result.errorClass === "connection" ||
        result.errorClass === "dns";

      if (!retryable || attempt >= this.config.maxRetries) return result;
      attempt += 1;
    }
  }
}
