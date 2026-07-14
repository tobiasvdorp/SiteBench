import { DatabaseSync } from "node:sqlite";
import type {
  CrawlConfig,
  HistogramBucket,
  RequestRecord,
  ResourceType,
  Run,
  RunAggregates,
  RunConfigSnapshot,
  RunStatus,
  Template,
  TemplateInput,
  TruncationReason,
} from "./types.js";
import { buildHistogram, computePercentiles, createRequestId, createRunId, createTemplateId, nowIso } from "./utils.js";
import { DEFAULT_CRAWL_CONFIG } from "./defaults.js";

const RESOURCE_TYPES: ResourceType[] = ["page", "css", "js", "font", "image", "other"];

function countResourceTypes(rows: { resource_type: string }[]) {
  return Object.fromEntries(
    RESOURCE_TYPES.map((type) => [type, rows.filter((row) => row.resource_type === type).length]),
  ) as RunAggregates["resourceTypeCounts"];
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  site_origin TEXT NOT NULL,
  status TEXT NOT NULL,
  config_snapshot_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  truncated INTEGER NOT NULL DEFAULT 0,
  truncation_reason TEXT,
  error_summary TEXT,
  aggregates_json TEXT
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  url TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  status_code INTEGER,
  error_class TEXT,
  error_message TEXT,
  dns_ms REAL,
  connect_ms REAL,
  ttfb_ms REAL,
  total_ms REAL NOT NULL,
  byte_count INTEGER NOT NULL DEFAULT 0,
  redirect_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runs_site_origin ON runs(site_origin);
CREATE INDEX IF NOT EXISTS idx_requests_run_id ON requests(run_id);
`;

type TemplateRow = {
  id: string;
  name: string;
  config_json: string;
  created_at: string;
  updated_at: string;
};

type RunRow = {
  id: string;
  name: string;
  site_origin: string;
  status: RunStatus;
  config_snapshot_json: string;
  started_at: string;
  completed_at: string | null;
  truncated: number;
  truncation_reason: TruncationReason | null;
  error_summary: string | null;
  aggregates_json: string | null;
};

type RequestRow = {
  id: string;
  run_id: string;
  url: string;
  resource_type: string;
  status_code: number | null;
  error_class: string | null;
  error_message: string | null;
  dns_ms: number | null;
  connect_ms: number | null;
  ttfb_ms: number | null;
  total_ms: number;
  byte_count: number;
  redirect_count: number;
  created_at: string;
};

function rowToTemplate(row: TemplateRow): Template {
  const config = JSON.parse(row.config_json) as CrawlConfig;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...config,
    workerCount: config.workerCount ?? DEFAULT_CRAWL_CONFIG.workerCount,
    timeLimitSeconds: config.timeLimitSeconds ?? null,
    excludePagesFromResults: config.excludePagesFromResults ?? DEFAULT_CRAWL_CONFIG.excludePagesFromResults,
  };
}

function rowToRun(row: RunRow): Run {
  const configSnapshot = JSON.parse(row.config_snapshot_json) as RunConfigSnapshot;
  return {
    id: row.id,
    name: row.name,
    siteOrigin: row.site_origin,
    status: row.status,
    configSnapshot: {
      ...configSnapshot,
      workerCount: configSnapshot.workerCount ?? DEFAULT_CRAWL_CONFIG.workerCount,
      timeLimitSeconds: configSnapshot.timeLimitSeconds ?? null,
      excludePagesFromResults:
        configSnapshot.excludePagesFromResults ?? DEFAULT_CRAWL_CONFIG.excludePagesFromResults,
    },
    startedAt: row.started_at,
    completedAt: row.completed_at,
    truncated: row.truncated === 1,
    truncationReason: row.truncation_reason,
    errorSummary: row.error_summary,
    aggregates: row.aggregates_json ? (JSON.parse(row.aggregates_json) as RunAggregates) : null,
  };
}

function rowToRequest(row: RequestRow): RequestRecord {
  return {
    id: row.id,
    runId: row.run_id,
    url: row.url,
    resourceType: row.resource_type as RequestRecord["resourceType"],
    statusCode: row.status_code,
    errorClass: row.error_class as RequestRecord["errorClass"],
    errorMessage: row.error_message,
    timings: {
      dnsMs: row.dns_ms,
      connectMs: row.connect_ms,
      ttfbMs: row.ttfb_ms,
      totalMs: row.total_ms,
    },
    byteCount: row.byte_count,
    redirectCount: row.redirect_count,
    createdAt: row.created_at,
  };
}

export class DatabaseStore {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(SCHEMA);
    this.migrate();
  }

  close() {
    this.db.close();
  }

  private migrate() {
    const columns = this.db.prepare("PRAGMA table_info(runs)").all() as { name: string }[];
    const columnNames = new Set(columns.map((column) => column.name));
    if (!columnNames.has("truncation_reason")) {
      this.db.exec("ALTER TABLE runs ADD COLUMN truncation_reason TEXT");
    }
  }

  listTemplates(): Template[] {
    const rows = this.db.prepare("SELECT * FROM templates ORDER BY updated_at DESC").all() as TemplateRow[];
    return rows.map(rowToTemplate);
  }

  getTemplate(id: string): Template | null {
    const row = this.db.prepare("SELECT * FROM templates WHERE id = ?").get(id) as TemplateRow | undefined;
    return row ? rowToTemplate(row) : null;
  }

  createTemplate(input: TemplateInput): Template {
    const id = createTemplateId();
    const now = nowIso();
    const config: CrawlConfig = {
      startUrl: input.startUrl,
      rpsLimit: input.rpsLimit,
      workerCount: input.workerCount,
      maxPages: input.maxPages,
      timeLimitSeconds: input.timeLimitSeconds,
      allowImages: input.allowImages,
      excludePagesFromResults: input.excludePagesFromResults,
      respectRobots: true,
      requestTimeoutMs: input.requestTimeoutMs,
      connectTimeoutMs: input.connectTimeoutMs,
      maxRedirects: input.maxRedirects,
      maxRetries: input.maxRetries,
    };

    this.db
      .prepare(
        "INSERT INTO templates (id, name, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, input.name, JSON.stringify(config), now, now);

    return { id, name: input.name, createdAt: now, updatedAt: now, ...config };
  }

  updateTemplate(id: string, input: TemplateInput): Template | null {
    const existing = this.getTemplate(id);
    if (!existing) return null;

    const now = nowIso();
    const config: CrawlConfig = {
      startUrl: input.startUrl,
      rpsLimit: input.rpsLimit,
      workerCount: input.workerCount,
      maxPages: input.maxPages,
      timeLimitSeconds: input.timeLimitSeconds,
      allowImages: input.allowImages,
      excludePagesFromResults: input.excludePagesFromResults,
      respectRobots: true,
      requestTimeoutMs: input.requestTimeoutMs,
      connectTimeoutMs: input.connectTimeoutMs,
      maxRedirects: input.maxRedirects,
      maxRetries: input.maxRetries,
    };

    this.db
      .prepare("UPDATE templates SET name = ?, config_json = ?, updated_at = ? WHERE id = ?")
      .run(input.name, JSON.stringify(config), now, id);

    return { id, name: input.name, createdAt: existing.createdAt, updatedAt: now, ...config };
  }

  duplicateTemplate(id: string): Template | null {
    const existing = this.getTemplate(id);
    if (!existing) return null;
    return this.createTemplate({
      name: `${existing.name} (copy)`,
      startUrl: existing.startUrl,
      rpsLimit: existing.rpsLimit,
      workerCount: existing.workerCount,
      maxPages: existing.maxPages,
      timeLimitSeconds: existing.timeLimitSeconds,
      allowImages: existing.allowImages,
      excludePagesFromResults: existing.excludePagesFromResults,
      respectRobots: existing.respectRobots,
      requestTimeoutMs: existing.requestTimeoutMs,
      connectTimeoutMs: existing.connectTimeoutMs,
      maxRedirects: existing.maxRedirects,
      maxRetries: existing.maxRetries,
    });
  }

  deleteTemplate(id: string): boolean {
    const result = this.db.prepare("DELETE FROM templates WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  }

  createRun(
    name: string,
    siteOrigin: string,
    snapshot: RunConfigSnapshot,
    status: RunStatus = "running",
  ): Run {
    const id = createRunId();
    const startedAt = nowIso();

    this.db
      .prepare(
        `INSERT INTO runs (id, name, site_origin, status, config_snapshot_json, started_at, truncated)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(id, name, siteOrigin, status, JSON.stringify(snapshot), startedAt);

    return {
      id,
      name,
      siteOrigin,
      status,
      configSnapshot: snapshot,
      startedAt,
      completedAt: null,
      truncated: false,
      truncationReason: null,
      errorSummary: null,
      aggregates: null,
    };
  }

  updateRunStatus(id: string, status: RunStatus, errorSummary?: string | null) {
    this.db
      .prepare("UPDATE runs SET status = ?, error_summary = ? WHERE id = ?")
      .run(status, errorSummary ?? null, id);
  }

  finalizeRun(
    id: string,
    aggregates: RunAggregates,
    truncated: boolean,
    status: RunStatus = "completed",
    truncationReason: TruncationReason | null = null,
  ) {
    this.db
      .prepare(
        "UPDATE runs SET status = ?, completed_at = ?, aggregates_json = ?, truncated = ?, truncation_reason = ? WHERE id = ?",
      )
      .run(status, nowIso(), JSON.stringify(aggregates), truncated ? 1 : 0, truncationReason, id);
  }

  failRun(id: string, message: string) {
    this.db
      .prepare(
        "UPDATE runs SET status = 'failed', completed_at = ?, error_summary = ? WHERE id = ?",
      )
      .run(nowIso(), message, id);
  }

  interruptRun(id: string, message: string) {
    const aggregates = this.computeAggregatesFromRequests(id);
    this.db
      .prepare(
        "UPDATE runs SET status = 'stopped', completed_at = ?, aggregates_json = ?, error_summary = ?, truncation_reason = NULL WHERE id = ?",
      )
      .run(nowIso(), JSON.stringify(aggregates), message, id);
  }

  reconcileStaleRunningRuns(
    message = "Run interrupted because the server restarted while this run was in progress.",
  ): number {
    const rows = this.db
      .prepare("SELECT id FROM runs WHERE status IN ('running', 'pending')")
      .all() as { id: string }[];

    for (const row of rows) this.interruptRun(row.id, message);
    return rows.length;
  }

  insertRequest(runId: string, record: Omit<RequestRecord, "id" | "runId" | "createdAt">) {
    const id = createRequestId();
    const createdAt = nowIso();
    this.db
      .prepare(
        `INSERT INTO requests (
          id, run_id, url, resource_type, status_code, error_class, error_message,
          dns_ms, connect_ms, ttfb_ms, total_ms, byte_count, redirect_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        runId,
        record.url,
        record.resourceType,
        record.statusCode,
        record.errorClass,
        record.errorMessage,
        record.timings.dnsMs,
        record.timings.connectMs,
        record.timings.ttfbMs,
        record.timings.totalMs,
        record.byteCount,
        record.redirectCount,
        createdAt,
      );
    return id;
  }

  listRuns(siteOrigin?: string): Run[] {
    const rows = siteOrigin
      ? (this.db
          .prepare("SELECT * FROM runs WHERE site_origin = ? ORDER BY started_at DESC")
          .all(siteOrigin) as RunRow[])
      : (this.db.prepare("SELECT * FROM runs ORDER BY started_at DESC").all() as RunRow[]);
    return rows.map(rowToRun);
  }

  getRun(id: string): Run | null {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id) as RunRow | undefined;
    return row ? rowToRun(row) : null;
  }

  deleteRun(id: string): boolean {
    const result = this.db.prepare("DELETE FROM runs WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  }

  getRequestLatencies(runId: string): number[] {
    const rows = this.db
      .prepare("SELECT ttfb_ms, total_ms FROM requests WHERE run_id = ?")
      .all(runId) as { ttfb_ms: number | null; total_ms: number }[];

    return rows.map((row) => row.ttfb_ms ?? row.total_ms);
  }

  computeAggregatesFromRequests(runId: string): RunAggregates {
    const rows = this.db
      .prepare(
        `SELECT resource_type, error_class, ttfb_ms, total_ms
         FROM requests WHERE run_id = ?`,
      )
      .all(runId) as {
      resource_type: string;
      error_class: string | null;
      ttfb_ms: number | null;
      total_ms: number;
    }[];

    const latencies = rows.map((row) => row.ttfb_ms ?? row.total_ms);
    const percentiles = computePercentiles(latencies);
    const histogram = buildHistogram(latencies);

    return {
      totalRequests: rows.length,
      errorCount: rows.filter((row) => row.error_class !== null).length,
      pageCount: rows.filter((row) => row.resource_type === "page").length,
      resourceTypeCounts: countResourceTypes(rows),
      ...percentiles,
      latencyHistogram: histogram,
    };
  }

  getRequestsForRun(
    runId: string,
    options: { resourceType?: ResourceType; limit?: number } = {},
  ): RequestRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM requests WHERE run_id = ? ORDER BY created_at ASC")
      .all(runId) as RequestRow[];

    let requests = rows.map(rowToRequest);
    if (options.resourceType) {
      requests = requests.filter((request) => request.resourceType === options.resourceType);
    }
    if (options.limit !== undefined) return requests.slice(-options.limit);
    return requests;
  }
}

export function createInMemoryStore() {
  return new DatabaseStore(":memory:");
}

export function templateInputFromTemplate(template: Template): TemplateInput {
  return {
    name: template.name,
    startUrl: template.startUrl,
    rpsLimit: template.rpsLimit,
    workerCount: template.workerCount,
    maxPages: template.maxPages,
    timeLimitSeconds: template.timeLimitSeconds,
    allowImages: template.allowImages,
    excludePagesFromResults: template.excludePagesFromResults,
    respectRobots: template.respectRobots,
    requestTimeoutMs: template.requestTimeoutMs,
    connectTimeoutMs: template.connectTimeoutMs,
    maxRedirects: template.maxRedirects,
    maxRetries: template.maxRetries,
  };
}

export function emptyTemplateInput(name = "New template"): TemplateInput {
  return { name, ...DEFAULT_CRAWL_CONFIG, startUrl: "https://example.com" };
}

export function aggregatesFromLatencies(
  latencies: number[],
  pageCount: number,
  errorCount: number,
  resourceTypeCounts?: RunAggregates["resourceTypeCounts"],
): RunAggregates {
  const percentiles = computePercentiles(latencies);
  return {
    totalRequests: latencies.length,
    errorCount,
    pageCount,
    resourceTypeCounts:
      resourceTypeCounts ??
      ({
        page: pageCount,
        css: 0,
        js: 0,
        font: 0,
        image: 0,
        other: Math.max(0, latencies.length - pageCount),
      } as RunAggregates["resourceTypeCounts"]),
    ...percentiles,
    latencyHistogram: buildHistogram(latencies),
  };
}

export type { HistogramBucket };
