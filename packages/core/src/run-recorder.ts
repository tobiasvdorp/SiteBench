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

export class RunRecorder {
  private readonly store: DatabaseStore;
  private readonly runId: string;
  private readonly listener?: RunListener;
  private latencies: number[] = [];
  private recentRequests: RequestProgressItem[] = [];
  private stats: RecorderStats = {
    pagesDiscovered: 0,
    pagesFetched: 0,
    requestsCompleted: 0,
    errors: 0,
    queueSize: 0,
  };

  constructor(store: DatabaseStore, runId: string, listener?: RunListener) {
    this.store = store;
    this.runId = runId;
    this.listener = listener;
  }

  recordRequest(result: MeasureResult) {
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
    if (result.resourceType === "page" && !result.errorClass) this.stats.pagesFetched += 1;

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
