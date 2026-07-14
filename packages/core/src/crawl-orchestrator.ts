import { fetch } from "undici";
import { CrawlPolicy } from "./crawl-policy.js";
import { extractAssets, extractCssAssetUrls, extractPageLinks } from "./html-parser.js";
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

type WorkItem =
  | { kind: "page"; url: string }
  | { kind: "asset"; item: QueueItem };

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
  private inFlight = 0;
  private pagesInFlight = 0;
  private waiters: Array<() => void> = [];

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
    this.notifyWorkAvailable();
  }

  async run(): Promise<OrchestratorRunResult> {
    await this.initialize();

    const workers = Array.from({ length: this.config.workerCount }, () => this.runWorker());
    await Promise.all(workers);
    await this.drainRemainingAssets();

    const queueHasPages = this.pageQueue.length > 0;
    const truncationReason = this.policy.getTruncationReason(queueHasPages, this.timeLimitReached);
    return {
      truncated: truncationReason !== null,
      truncationReason,
    };
  }

  private async runWorker() {
    while (!this.stopped && !this.abortSignal?.aborted) {
      if (this.isTimeLimitReached()) {
        this.timeLimitReached = true;
        return;
      }

      const work = this.claimWork();
      if (!work) {
        if (this.inFlight === 0 && !this.hasQueuedWork()) return;
        await this.waitForWork();
        continue;
      }

      try {
        if (work.kind === "page") await this.fetchPage(work.url);
        else await this.fetchAsset(work.item);
      } finally {
        this.inFlight -= 1;
        if (work.kind === "page") this.pagesInFlight -= 1;
        this.notifyWorkAvailable();
      }
    }
  }

  private claimWork(): WorkItem | null {
    if (this.policy.isPageLimitReached()) this.pageQueue = [];

    const asset = this.assetQueue.shift();
    if (asset) {
      this.inFlight += 1;
      return { kind: "asset", item: asset };
    }

    if (!this.policy.isPageLimitReached() && this.canStartPageFetch()) {
      const url = this.pageQueue.shift();
      if (!url) return null;

      this.inFlight += 1;
      this.pagesInFlight += 1;
      return { kind: "page", url };
    }

    return null;
  }

  private async drainRemainingAssets() {
    while (this.assetQueue.length > 0 && !this.stopped && !this.abortSignal?.aborted) {
      if (this.isTimeLimitReached()) {
        this.timeLimitReached = true;
        return;
      }

      const item = this.assetQueue.shift();
      if (!item) return;
      await this.fetchAsset(item);
    }
  }

  private canStartPageFetch() {
    const maxPages = this.config.maxPages;
    if (maxPages === null) return true;
    return this.policy.getPagesFetched() + this.pagesInFlight < maxPages;
  }

  private hasQueuedWork() {
    return this.pageQueue.length > 0 || this.assetQueue.length > 0;
  }

  private waitForWork() {
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  private notifyWorkAvailable() {
    const waiters = this.waiters;
    this.waiters = [];
    for (const wake of waiters) wake();
  }

  private isTimeLimitReached() {
    const limit = this.config.timeLimitSeconds;
    if (limit === null) return false;
    const elapsedSeconds = (this.now() - this.startedAtMs) / 1000;
    return elapsedSeconds >= limit;
  }

  private enqueuePage(url: string) {
    const decision = this.policy.shouldEnqueuePage(url);
    if (!decision.allowed) return;
    this.policy.markPageQueued(url);
    this.pageQueue.push(normalizeUrl(url)!);
    this.recorder.setPagesDiscovered(this.policy.getPagesFetched() + this.pageQueue.length);
    this.recorder.setQueueSize(this.pageQueue.length + this.assetQueue.length);
    this.notifyWorkAvailable();
  }

  private enqueueAsset(url: string, resourceType: import("./types.js").ResourceType) {
    const decision = this.policy.shouldFetchAsset(url, resourceType);
    if (!decision.allowed) return;
    this.policy.markAssetQueued(url);
    this.assetQueue.push({ url: normalizeUrl(url)!, type: "asset", resourceType });
    this.recorder.setQueueSize(this.pageQueue.length + this.assetQueue.length);
    this.notifyWorkAvailable();
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

    if (result.errorClass || !result.bodyText || result.resourceType !== "css") return;

    const nestedAssets = extractCssAssetUrls(
      result.bodyText,
      item.url,
      this.policy.getOrigin(),
      this.config.allowImages,
    );
    for (const asset of nestedAssets) this.enqueueAsset(asset.url, asset.resourceType);
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
