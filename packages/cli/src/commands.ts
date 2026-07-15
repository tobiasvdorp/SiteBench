import type { Command } from "commander";
import {
  DEFAULT_ALLOW_IMAGES,
  DEFAULT_DEDUPE_REQUESTS,
  DEFAULT_EXCLUDE_PAGES_FROM_RESULTS,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_RESPECT_ROBOTS,
  DEFAULT_RPS_LIMIT,
  DEFAULT_TIME_LIMIT_SECONDS,
  DEFAULT_WORKER_COUNT,
  SiteBench,
  StartFailure,
  ValidationFailure,
  type CrawlConfig,
  type TemplateInput,
} from "@sitebench/core";

function getBench(command: Command): SiteBench {
  let current: Command | null = command;
  while (current) {
    const bench = current.getOptionValue("bench") as SiteBench | undefined;
    if (bench) return bench;
    current = current.parent ?? null;
  }
  throw new Error("SiteBench instance not initialized");
}

function parseBool(value: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Expected true or false");
}

function parseOverrides(command: Command): Partial<CrawlConfig> {
  const opts = command.opts();
  const overrides: Partial<CrawlConfig> = {};

  if (opts.url) overrides.startUrl = opts.url;
  if (opts.rps !== undefined) overrides.rpsLimit = Number(opts.rps);
  if (opts.workers !== undefined) overrides.workerCount = Number(opts.workers);
  if (opts.maxPages === false) overrides.maxPages = null;
  else if (opts.maxPages !== undefined) overrides.maxPages = Number(opts.maxPages);
  if (opts.timeLimitSeconds !== undefined) overrides.timeLimitSeconds = Number(opts.timeLimitSeconds);
  if (opts.allowImages !== undefined) overrides.allowImages = parseBool(String(opts.allowImages));
  if (opts.excludePagesFromResults !== undefined) {
    overrides.excludePagesFromResults = parseBool(String(opts.excludePagesFromResults));
  }
  if (opts.dedupeRequests !== undefined) overrides.dedupeRequests = parseBool(String(opts.dedupeRequests));
  if (opts.respectRobots !== undefined) overrides.respectRobots = parseBool(String(opts.respectRobots));
  if (opts.requestTimeout !== undefined) overrides.requestTimeoutMs = Number(opts.requestTimeout);
  if (opts.connectTimeout !== undefined) overrides.connectTimeoutMs = Number(opts.connectTimeout);
  if (opts.maxRedirects !== undefined) overrides.maxRedirects = Number(opts.maxRedirects);
  if (opts.maxRetries !== undefined) overrides.maxRetries = Number(opts.maxRetries);

  return overrides;
}

function templateInputFromOptions(name: string, command: Command): TemplateInput {
  const opts = command.opts();
  return {
    name,
    startUrl: opts.url,
    rpsLimit: Number(opts.rps ?? DEFAULT_RPS_LIMIT),
    workerCount: Number(opts.workers ?? DEFAULT_WORKER_COUNT),
    maxPages: opts.maxPages === false ? null : Number(opts.maxPages ?? DEFAULT_MAX_PAGES),
    timeLimitSeconds:
      opts.timeLimitSeconds === undefined ? DEFAULT_TIME_LIMIT_SECONDS : Number(opts.timeLimitSeconds),
    allowImages: opts.allowImages !== undefined ? parseBool(String(opts.allowImages)) : DEFAULT_ALLOW_IMAGES,
    excludePagesFromResults:
      opts.excludePagesFromResults !== undefined
        ? parseBool(String(opts.excludePagesFromResults))
        : DEFAULT_EXCLUDE_PAGES_FROM_RESULTS,
    dedupeRequests:
      opts.dedupeRequests !== undefined ? parseBool(String(opts.dedupeRequests)) : DEFAULT_DEDUPE_REQUESTS,
    respectRobots: true,
    requestTimeoutMs: Number(opts.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT_MS),
    connectTimeoutMs: Number(opts.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT_MS),
    maxRedirects: Number(opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS),
    maxRetries: Number(opts.maxRetries ?? DEFAULT_MAX_RETRIES),
  };
}

function printTemplate(template: ReturnType<SiteBench["getTemplate"]>) {
  if (!template) return;
  console.log(`${template.id}\t${template.name}\t${template.startUrl}`);
  console.log(
    `  rps=${template.rpsLimit} workers=${template.workerCount} maxPages=${template.maxPages ?? "none"} timeLimitSeconds=${template.timeLimitSeconds ?? "none"} allowImages=${template.allowImages} excludePagesFromResults=${template.excludePagesFromResults} dedupeRequests=${template.dedupeRequests} respectRobots=${template.respectRobots}`,
  );
}

function printRunSummary(run: NonNullable<ReturnType<SiteBench["getRun"]>>) {
  const agg = run.aggregates;
  console.log(`Run: ${run.name} (${run.id})`);
  console.log(`Status: ${run.status}`);
  console.log(`Site: ${run.siteOrigin}`);
  console.log(`Started: ${run.startedAt}`);
  if (run.completedAt) console.log(`Completed: ${run.completedAt}`);
  if (run.truncated && run.truncationReason === "time-limit") console.log("Warning: time limit reached before queue emptied");
  else if (run.truncated) console.log("Warning: crawl truncated before queue emptied");
  if (agg) {
    console.log(`Requests: ${agg.totalRequests}, Errors: ${agg.errorCount}, Pages: ${agg.pageCount}`);
    console.log(
      `Percentiles (ms): p50=${agg.p50.toFixed(1)} p75=${agg.p75.toFixed(1)} p90=${agg.p90.toFixed(1)} p95=${agg.p95.toFixed(1)} p99=${agg.p99.toFixed(1)}`,
    );
  }
}

export function createCli(program: Command) {
  program
    .command("defaults")
    .description("Show conservative default configuration values")
    .action(() => {
      console.log("Conservative defaults:");
      console.log(`  maxPages: ${DEFAULT_MAX_PAGES}`);
      console.log(`  timeLimitSeconds: ${DEFAULT_TIME_LIMIT_SECONDS ?? "none"}`);
      console.log(`  rpsLimit: ${DEFAULT_RPS_LIMIT}`);
      console.log(`  workerCount: ${DEFAULT_WORKER_COUNT}`);
      console.log(`  requestTimeoutMs: ${DEFAULT_REQUEST_TIMEOUT_MS}`);
      console.log(`  connectTimeoutMs: ${DEFAULT_CONNECT_TIMEOUT_MS}`);
      console.log(`  maxRedirects: ${DEFAULT_MAX_REDIRECTS}`);
      console.log(`  maxRetries: ${DEFAULT_MAX_RETRIES}`);
      console.log(`  allowImages: ${DEFAULT_ALLOW_IMAGES}`);
      console.log(`  excludePagesFromResults: ${DEFAULT_EXCLUDE_PAGES_FROM_RESULTS}`);
      console.log(`  dedupeRequests: ${DEFAULT_DEDUPE_REQUESTS}`);
      console.log(`  respectRobots: ${DEFAULT_RESPECT_ROBOTS}`);
    });

  const templates = program.command("template").description("Manage templates");

  templates
    .command("list")
    .description("List saved templates")
    .action(function () {
      const bench = getBench(this);
      for (const template of bench.listTemplates()) {
        printTemplate(template);
      }
    });

  templates
    .command("create")
    .description("Create a template")
    .requiredOption("--name <name>", "Template name")
    .requiredOption("--url <url>", "Start URL")
    .option("--rps <number>", "Requests per second", String(DEFAULT_RPS_LIMIT))
    .option("--workers <number>", "Concurrent request workers", String(DEFAULT_WORKER_COUNT))
    .option("--max-pages <number>", "Maximum pages to crawl", String(DEFAULT_MAX_PAGES))
    .option("--no-max-pages", "Do not apply a page limit; requires --time-limit-seconds")
    .option("--time-limit-seconds <number>", "Maximum run duration in seconds")
    .option("--allow-images <bool>", "Fetch images")
    .option("--exclude-pages-from-results <bool>", "Omit HTML page requests from saved run data")
    .option("--dedupe-requests <bool>", "Skip already-queued page and asset URLs")
    .option("--request-timeout <ms>", "Request timeout in ms", String(DEFAULT_REQUEST_TIMEOUT_MS))
    .option("--connect-timeout <ms>", "Connect timeout in ms", String(DEFAULT_CONNECT_TIMEOUT_MS))
    .option("--max-redirects <number>", "Maximum redirects", String(DEFAULT_MAX_REDIRECTS))
    .option("--max-retries <number>", "Maximum retries", String(DEFAULT_MAX_RETRIES))
    .action(function () {
      const bench = getBench(this);
      const input = templateInputFromOptions(this.opts().name, this);
      try {
        const created = bench.createTemplate(input);
        console.log(`Created template ${created.id}`);
      } catch (error) {
        if (error instanceof ValidationFailure) {
          console.error(error.message);
          process.exit(1);
        }
        throw error;
      }
    });

  templates
    .command("update")
    .description("Update a template")
    .argument("<id>", "Template id")
    .requiredOption("--name <name>", "Template name")
    .requiredOption("--url <url>", "Start URL")
    .option("--rps <number>", "Requests per second")
    .option("--workers <number>", "Concurrent request workers")
    .option("--max-pages <number>", "Maximum pages to crawl")
    .option("--no-max-pages", "Do not apply a page limit; requires --time-limit-seconds")
    .option("--time-limit-seconds <number>", "Maximum run duration in seconds")
    .option("--allow-images <bool>", "Fetch images")
    .option("--exclude-pages-from-results <bool>", "Omit HTML page requests from saved run data")
    .option("--dedupe-requests <bool>", "Skip already-queued page and asset URLs")
    .option("--request-timeout <ms>", "Request timeout in ms")
    .option("--connect-timeout <ms>", "Connect timeout in ms")
    .option("--max-redirects <number>", "Maximum redirects")
    .option("--max-retries <number>", "Maximum retries")
    .action(function (id: string) {
      const bench = getBench(this);
      const input = templateInputFromOptions(this.opts().name, this);
      try {
        const updated = bench.updateTemplate(id, input);
        console.log(`Updated template ${updated.id}`);
      } catch (error) {
        if (error instanceof ValidationFailure) {
          console.error(error.message);
          process.exit(1);
        }
        throw error;
      }
    });

  templates
    .command("duplicate")
    .description("Duplicate a template")
    .argument("<id>", "Template id")
    .action(function (id: string) {
      const bench = getBench(this);
      const duplicated = bench.duplicateTemplate(id);
      console.log(`Duplicated template ${duplicated.id}`);
    });

  templates
    .command("delete")
    .description("Delete a template")
    .argument("<id>", "Template id")
    .action(function (id: string) {
      const bench = getBench(this);
      if (!bench.deleteTemplate(id)) {
        console.error("Template not found");
        process.exit(1);
      }
      console.log("Deleted template");
    });

  const runs = program.command("run").description("Manage and execute runs");

  runs
    .command("start")
    .description("Start a run from a template or inline overrides")
    .requiredOption("--name <name>", "Run name")
    .option("--template <id>", "Template id")
    .option("--url <url>", "Override start URL")
    .option("--rps <number>", "Override RPS")
    .option("--workers <number>", "Override concurrent request workers")
    .option("--max-pages <number>", "Override max pages")
    .option("--no-max-pages", "Run without a page limit; requires --time-limit-seconds or a template time limit")
    .option("--time-limit-seconds <number>", "Override maximum run duration in seconds")
    .option("--allow-images <bool>", "Override image fetching")
    .option("--exclude-pages-from-results <bool>", "Override HTML page persistence in run data")
    .option("--dedupe-requests <bool>", "Override request deduplication")
    .option("--respect-robots <bool>", "Override robots.txt behavior")
    .option("--request-timeout <ms>", "Override request timeout")
    .option("--connect-timeout <ms>", "Override connect timeout")
    .option("--max-redirects <number>", "Override max redirects")
    .option("--max-retries <number>", "Override max retries")
    .action(async function () {
      const bench = getBench(this);
      const opts = this.opts();
      const overrides = parseOverrides(this);

      if (!opts.template && !overrides.startUrl && !opts.url) {
        console.error("Provide --template or --url for inline runs");
        process.exit(1);
      }

      try {
        const run = await bench.startRun({
          runName: opts.name,
          templateId: opts.template,
          overrides: opts.template ? overrides : { ...overrides, startUrl: overrides.startUrl ?? opts.url },
          listener: (event) => {
            if (event.type === "progress") {
              process.stdout.write(
                `\rPages: ${event.pagesFetched}/${event.pagesDiscovered} | Requests: ${event.requestsCompleted} | Errors: ${event.errors} | Queue: ${event.queueSize}   `,
              );
            }
          },
        });

        await waitForRun(bench, run.id);
        console.log("");
        const finished = bench.getRun(run.id);
        if (!finished) return;
        if (finished.status === "failed") {
          console.error(finished.errorSummary ?? "Run failed");
          process.exit(1);
        }
        printRunSummary(finished);
        if (finished.truncated) process.exitCode = 0;
      } catch (error) {
        if (error instanceof ValidationFailure || error instanceof StartFailure) {
          console.error(error.message);
          process.exit(1);
        }
        throw error;
      }
    });

  runs
    .command("list")
    .description("List runs")
    .option("--site <origin>", "Filter by site origin")
    .action(function () {
      const bench = getBench(this);
      const site = this.opts().site as string | undefined;
      for (const run of bench.listRuns(site)) {
        console.log(`${run.id}\t${run.name}\t${run.status}\t${run.startedAt}\t${run.siteOrigin}`);
      }
    });

  runs
    .command("show")
    .description("Show run details")
    .argument("<id>", "Run id")
    .action(function (id: string) {
      const bench = getBench(this);
      const run = bench.getRun(id);
      if (!run) {
        console.error("Run not found");
        process.exit(1);
      }
      printRunSummary(run);
    });

  runs
    .command("delete")
    .description("Delete a run")
    .argument("<id>", "Run id")
    .action(function (id: string) {
      const bench = getBench(this);
      if (!bench.deleteRun(id)) {
        console.error("Run not found");
        process.exit(1);
      }
      console.log("Deleted run");
    });
}

async function waitForRun(bench: SiteBench, runId: string) {
  while (true) {
    const run = bench.getRun(runId);
    if (!run) return;
    if (run.status === "completed" || run.status === "failed" || run.status === "stopped") return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
