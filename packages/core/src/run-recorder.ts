import type { DatabaseStore } from "./database.js";
import type { MeasureResult } from "./http-measurer.js";
import type { RequestProgressItem, RunAggregates, RunListener, RunStatus, TruncationReason } from "./types.js";
import { primaryLatency } from "./utils.js";

const RECENT_REQUESTS_LIMIT = 150;

export type RecorderStats = {
  pagesDiscovered: number;
  pagesFetched: number;
  requestsCompleted: number;
  errors: number;
  queueSize: number;
};

export type RunRecorderOptions = {
  excludePagesFromResults?: boolean;
};

export class RunRecorder {
  private readonly store: DatabaseStore;
  private readonly runId: string;
  private readonly listener?: RunListener;
  private readonly excludePagesFromResults: boolean;
  private latencies: number[] = [];
  private recentRequests: RequestProgressItem[] = [];
  private stats: RecorderStats = {
    pagesDiscovered: 0,
    pagesFetched: 0,
    requestsCompleted: 0,
    errors: 0,
    queueSize: 0,
  };

  constructor(
    store: DatabaseStore,
    runId: string,
    options: RunRecorderOptions = {},
    listener?: RunListener,
  ) {
    this.store = store;
    this.runId = runId;
    this.excludePagesFromResults = options.excludePagesFromResults ?? false;
    this.listener = listener;
  }

  recordRequest(result: MeasureResult) {
    const shouldPersist = !(this.excludePagesFromResults && result.resourceType === "page");

    if (shouldPersist) {
      this.store.insertRequest(this.runId, {
        url: result.url,
        resourceType: result.resourceType,
        statusCode: result.statusCode,
        errorClass: result.errorClass,
        errorMessage: result.errorMessage,
        timings: result.timings,
        byteCount: result.byteCount,
        redirectCount: result.redirectCount,
      });

      this.stats.requestsCompleted += 1;
      if (result.errorClass) this.stats.errors += 1;
      if (!result.errorClass) this.latencies.push(primaryLatency(result.timings));

      this.recentRequests.push({
        url: result.url,
        resourceType: result.resourceType,
        statusCode: result.statusCode,
        errorClass: result.errorClass,
        errorMessage: result.errorMessage,
        totalMs: result.timings.totalMs,
        at: new Date().toISOString(),
      });
      if (this.recentRequests.length > RECENT_REQUESTS_LIMIT) this.recentRequests.shift();
    }

    if (result.resourceType === "page" && !result.errorClass) this.stats.pagesFetched += 1;

    this.emitProgress();
  }

  setPagesDiscovered(count: number) {
    this.stats.pagesDiscovered = count;
    this.emitProgress();
  }

  setQueueSize(size: number) {
    this.stats.queueSize = size;
    this.emitProgress();
  }

  finalize(
    truncated: boolean,
    status: RunStatus = "completed",
    truncationReason: TruncationReason | null = null,
  ): RunAggregates {
    const aggregates = this.store.computeAggregatesFromRequests(this.runId);
    if (this.excludePagesFromResults) aggregates.pageCount = this.stats.pagesFetched;
    this.store.finalizeRun(this.runId, aggregates, truncated, status, truncationReason);
    return aggregates;
  }

  fail(message: string) {
    this.store.failRun(this.runId, message);
  }

  private emitProgress() {
    if (!this.listener) return;
    this.listener({
      type: "progress",
      runId: this.runId,
      ...this.stats,
      recentRequests: this.recentRequests,
    });
  }
}
