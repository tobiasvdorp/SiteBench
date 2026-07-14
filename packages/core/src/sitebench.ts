import { ComparisonEngine } from "./comparison-engine.js";
import { CrawlOrchestrator } from "./crawl-orchestrator.js";
import { DatabaseStore } from "./database.js";
import { DEFAULT_DB_PATH } from "./db-path.js";
import { DEFAULT_CRAWL_CONFIG } from "./defaults.js";
import { HttpMeasurer } from "./http-measurer.js";
import { RunRecorder } from "./run-recorder.js";
import type {
  CrawlConfig,
  Run,
  RunConfigSnapshot,
  RunListener,
  Template,
  TemplateInput,
} from "./types.js";
import {
  getSiteOrigin,
  mergeCrawlConfig,
  validateCrawlConfig,
  validateRunName,
} from "./validation.js";
import { templateInputFromTemplate } from "./database.js";
import type { ComparisonSelection } from "./comparison-engine.js";

export type SiteBenchOptions = {
  dbPath?: string;
};

export type StartRunInput = {
  runName: string;
  templateId?: string;
  overrides?: Partial<CrawlConfig>;
  listener?: RunListener;
};

export class SiteBench {
  readonly store: DatabaseStore;
  readonly comparison: ComparisonEngine;
  private activeRuns = new Map<string, AbortController>();

  constructor(options: SiteBenchOptions = {}) {
    this.store = new DatabaseStore(options.dbPath ?? DEFAULT_DB_PATH);
    this.store.reconcileStaleRunningRuns();
    this.comparison = new ComparisonEngine(this.store);
  }

  close() {
    for (const controller of this.activeRuns.values()) controller.abort();
    this.store.close();
  }

  listTemplates() {
    return this.store.listTemplates();
  }

  getTemplate(id: string) {
    return this.store.getTemplate(id);
  }

  createTemplate(input: TemplateInput) {
    const validation = validateCrawlConfig(input);
    if (!validation.ok) throw new ValidationFailure(validation.errors);
    return this.store.createTemplate({ ...validation.config, name: input.name, respectRobots: true });
  }

  updateTemplate(id: string, input: TemplateInput) {
    const validation = validateCrawlConfig(input);
    if (!validation.ok) throw new ValidationFailure(validation.errors);
    const updated = this.store.updateTemplate(id, { ...validation.config, name: input.name, respectRobots: true });
    if (!updated) throw new Error("Template not found");
    return updated;
  }

  duplicateTemplate(id: string) {
    const duplicated = this.store.duplicateTemplate(id);
    if (!duplicated) throw new Error("Template not found");
    return duplicated;
  }

  deleteTemplate(id: string) {
    return this.store.deleteTemplate(id);
  }

  listRuns(siteOrigin?: string) {
    return this.store.listRuns(siteOrigin);
  }

  getRun(id: string) {
    return this.store.getRun(id);
  }

  getRunRequests(id: string, options?: { resourceType?: import("./types.js").ResourceType; limit?: number }) {
    return this.store.getRequestsForRun(id, options);
  }

  deleteRun(id: string) {
    const stopped = this.stopRun(id);
    return this.store.deleteRun(id) || stopped;
  }

  stopRun(id: string) {
    const controller = this.activeRuns.get(id);
    if (!controller) return false;
    controller.abort();
    this.activeRuns.delete(id);
    return true;
  }

  async startRun(input: StartRunInput): Promise<Run> {
    const nameErrors = validateRunName(input.runName);
    if (nameErrors.length > 0) throw new ValidationFailure(nameErrors);

    let baseConfig: CrawlConfig;
    let template: Template | null = null;

    if (input.templateId) {
      template = this.store.getTemplate(input.templateId);
      if (!template) throw new Error("Template not found");
      baseConfig = templateInputFromTemplate(template);
    } else if (input.overrides) {
      baseConfig = mergeCrawlConfig(
        {
          startUrl: input.overrides.startUrl ?? "",
          rpsLimit: input.overrides.rpsLimit ?? DEFAULT_CRAWL_CONFIG.rpsLimit,
          workerCount: input.overrides.workerCount ?? DEFAULT_CRAWL_CONFIG.workerCount,
          maxPages:
            input.overrides.maxPages ??
            (input.overrides.timeLimitSeconds ? null : DEFAULT_CRAWL_CONFIG.maxPages),
          timeLimitSeconds: input.overrides.timeLimitSeconds ?? DEFAULT_CRAWL_CONFIG.timeLimitSeconds,
          allowImages: input.overrides.allowImages ?? DEFAULT_CRAWL_CONFIG.allowImages,
          excludePagesFromResults:
            input.overrides.excludePagesFromResults ?? DEFAULT_CRAWL_CONFIG.excludePagesFromResults,
          respectRobots: input.overrides.respectRobots ?? DEFAULT_CRAWL_CONFIG.respectRobots,
          requestTimeoutMs: input.overrides.requestTimeoutMs ?? DEFAULT_CRAWL_CONFIG.requestTimeoutMs,
          connectTimeoutMs: input.overrides.connectTimeoutMs ?? DEFAULT_CRAWL_CONFIG.connectTimeoutMs,
          maxRedirects: input.overrides.maxRedirects ?? DEFAULT_CRAWL_CONFIG.maxRedirects,
          maxRetries: input.overrides.maxRetries ?? DEFAULT_CRAWL_CONFIG.maxRetries,
        },
        {},
      );
    } else {
      throw new Error("Either templateId or overrides with startUrl are required");
    }

    const merged = {
      ...mergeCrawlConfig(baseConfig, input.overrides ?? {}),
      ...(input.templateId ? { respectRobots: true } : {}),
    };
    const validation = validateCrawlConfig(merged);
    if (!validation.ok) throw new ValidationFailure(validation.errors);

    const origin = getSiteOrigin(validation.config.startUrl);
    if (!origin) throw new ValidationFailure([{ field: "startUrl", message: "Invalid start URL origin" }]);

    const snapshot: RunConfigSnapshot = {
      ...validation.config,
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
      runName: input.runName.trim(),
      siteOrigin: origin,
    };

    const run = this.store.createRun(input.runName.trim(), origin, snapshot, "pending");
    const controller = new AbortController();
    this.activeRuns.set(run.id, controller);

    void this.executeRun(run, validation.config, origin, input.listener, controller.signal);

    return run;
  }

  compare(siteOrigin: string, selections: ComparisonSelection[]) {
    return this.comparison.compare(siteOrigin, selections);
  }

  private async executeRun(
    run: Run,
    config: CrawlConfig,
    origin: string,
    listener: RunListener | undefined,
    signal: AbortSignal,
  ) {
    const measurer = new HttpMeasurer(config);

    try {
      if (signal.aborted) {
        this.store.interruptRun(run.id, "Run stopped");
        return;
      }

      const probe = await measurer.probeStartUrl(config.startUrl);
      if (signal.aborted) {
        this.store.interruptRun(run.id, "Run stopped");
        return;
      }
      if (!probe.ok) {
        this.store.failRun(run.id, probe.message);
        listener?.({ type: "failed", runId: run.id, message: probe.message });
        return;
      }

      this.store.updateRunStatus(run.id, "running");

      const recorder = new RunRecorder(
        this.store,
        run.id,
        { excludePagesFromResults: config.excludePagesFromResults },
        listener,
      );

      const orchestrator = new CrawlOrchestrator({
        config,
        origin,
        recorder,
        measurer,
        abortSignal: signal,
      });

      const { truncated, truncationReason } = await orchestrator.run();
      const status = signal.aborted ? "stopped" : "completed";
      recorder.finalize(truncated, status, truncationReason);
      const completed = this.store.getRun(run.id);
      if (!completed) return;

      if (status === "stopped") return;

      listener?.({
        type: "completed",
        runId: run.id,
        run: completed,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Run failed";
      this.store.failRun(run.id, message);
      listener?.({ type: "failed", runId: run.id, message });
    } finally {
      this.activeRuns.delete(run.id);
    }
  }
}

export class ValidationFailure extends Error {
  errors: { field: string; message: string }[];

  constructor(errors: { field: string; message: string }[]) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join("; "));
    this.name = "ValidationFailure";
    this.errors = errors;
  }
}

export class StartFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartFailure";
  }
}

export { DEFAULT_DB_PATH } from "./db-path.js";
export { DEFAULT_CRAWL_CONFIG } from "./defaults.js";
export type { ComparisonSelection } from "./comparison-engine.js";
