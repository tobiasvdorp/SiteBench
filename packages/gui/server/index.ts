import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";
import {
  DEFAULT_CRAWL_CONFIG,
  SiteBench,
  ValidationFailure,
  StartFailure,
  type CrawlConfig,
  type RequestProgressItem,
  type TemplateInput,
} from "@sitebench/core";

const bench = new SiteBench({ dbPath: process.env.SITEBENCH_DB });

type ProgressPayload = {
  type: "progress";
  runId: string;
  pagesDiscovered: number;
  pagesFetched: number;
  requestsCompleted: number;
  errors: number;
  queueSize: number;
  recentRequests: RequestProgressItem[];
};

const progressByRun = new Map<string, ProgressPayload>();
const sseClients = new Map<string, Set<ServerResponse>>();

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function broadcastProgress(runId: string, payload: ProgressPayload) {
  progressByRun.set(runId, payload);
  const clients = sseClients.get(runId);
  if (!clients) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) client.write(data);
}

function templateInputFromBody(body: Record<string, unknown>): TemplateInput {
  return {
    name: String(body.name ?? ""),
    startUrl: String(body.startUrl ?? ""),
    rpsLimit: Number(body.rpsLimit ?? DEFAULT_CRAWL_CONFIG.rpsLimit),
    maxPages: body.maxPages === null ? null : Number(body.maxPages ?? DEFAULT_CRAWL_CONFIG.maxPages),
    timeLimitSeconds:
      body.timeLimitSeconds === null || body.timeLimitSeconds === undefined
        ? DEFAULT_CRAWL_CONFIG.timeLimitSeconds
        : Number(body.timeLimitSeconds),
    allowImages: Boolean(body.allowImages ?? DEFAULT_CRAWL_CONFIG.allowImages),
    excludePagesFromResults: Boolean(
      body.excludePagesFromResults ?? DEFAULT_CRAWL_CONFIG.excludePagesFromResults,
    ),
    respectRobots: true,
    requestTimeoutMs: Number(body.requestTimeoutMs ?? DEFAULT_CRAWL_CONFIG.requestTimeoutMs),
    connectTimeoutMs: Number(body.connectTimeoutMs ?? DEFAULT_CRAWL_CONFIG.connectTimeoutMs),
    maxRedirects: Number(body.maxRedirects ?? DEFAULT_CRAWL_CONFIG.maxRedirects),
    maxRetries: Number(body.maxRetries ?? DEFAULT_CRAWL_CONFIG.maxRetries),
  };
}

export function createApiServer() {
  return createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    try {
      if (req.method === "GET" && path === "/api/defaults") {
        sendJson(res, 200, DEFAULT_CRAWL_CONFIG);
        return;
      }

      if (req.method === "GET" && path === "/api/templates") {
        sendJson(res, 200, bench.listTemplates());
        return;
      }

      if (req.method === "POST" && path === "/api/templates") {
        const body = await readBody(req);
        const created = bench.createTemplate(templateInputFromBody(body));
        sendJson(res, 201, created);
        return;
      }

      if (req.method === "PUT" && path.startsWith("/api/templates/")) {
        const id = path.split("/").pop()!;
        const body = await readBody(req);
        const updated = bench.updateTemplate(id, templateInputFromBody(body));
        sendJson(res, 200, updated);
        return;
      }

      if (req.method === "POST" && path.match(/^\/api\/templates\/[^/]+\/duplicate$/)) {
        const id = path.split("/")[3];
        sendJson(res, 201, bench.duplicateTemplate(id));
        return;
      }

      if (req.method === "DELETE" && path.startsWith("/api/templates/")) {
        const id = path.split("/").pop()!;
        bench.deleteTemplate(id);
        sendJson(res, 204, null);
        return;
      }

      if (req.method === "GET" && path === "/api/runs") {
        const site = url.searchParams.get("site") ?? undefined;
        sendJson(res, 200, bench.listRuns(site));
        return;
      }

      if (req.method === "GET" && path.startsWith("/api/runs/") && path.endsWith("/progress")) {
        const runId = path.split("/")[3];
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write("\n");
        if (!sseClients.has(runId)) sseClients.set(runId, new Set());
        sseClients.get(runId)!.add(res);
        const existing = progressByRun.get(runId);
        if (existing) res.write(`data: ${JSON.stringify(existing)}\n\n`);
        req.on("close", () => {
          sseClients.get(runId)?.delete(res);
        });
        return;
      }

      if (req.method === "GET" && path.startsWith("/api/runs/") && path.endsWith("/requests")) {
        const runId = path.split("/")[3];
        const limit = Number(url.searchParams.get("limit") ?? 150);
        const resourceType = url.searchParams.get("resourceType") ?? undefined;
        sendJson(
          res,
          200,
          bench.getRunRequests(runId, {
            limit,
            resourceType: resourceType as import("@sitebench/core").ResourceType | undefined,
          }),
        );
        return;
      }

      if (req.method === "POST" && path.match(/^\/api\/runs\/[^/]+\/stop$/)) {
        const runId = path.split("/")[3];
        const stopped = bench.stopRun(runId);
        if (!stopped) {
          sendJson(res, 404, { message: "Run not found or not in progress" });
          return;
        }
        sendJson(res, 200, bench.getRun(runId));
        return;
      }

      if (req.method === "GET" && path.startsWith("/api/runs/")) {
        const id = path.split("/").pop()!;
        const run = bench.getRun(id);
        if (!run) {
          sendJson(res, 404, { message: "Run not found" });
          return;
        }
        sendJson(res, 200, run);
        return;
      }

      if (req.method === "POST" && path === "/api/runs") {
        const body = await readBody(req);
        const run = await bench.startRun({
          runName: String(body.runName ?? ""),
          templateId: body.templateId ? String(body.templateId) : undefined,
          overrides: body.overrides as Partial<CrawlConfig> | undefined,
          listener: (event) => {
            if (event.type === "progress") {
              broadcastProgress(event.runId, {
                type: "progress",
                runId: event.runId,
                pagesDiscovered: event.pagesDiscovered,
                pagesFetched: event.pagesFetched,
                requestsCompleted: event.requestsCompleted,
                errors: event.errors,
                queueSize: event.queueSize,
                recentRequests: event.recentRequests,
              });
            }
            if (event.type === "completed" || event.type === "failed") {
              progressByRun.delete(event.runId);
            }
          },
        });
        sendJson(res, 201, run);
        return;
      }

      if (req.method === "DELETE" && path.startsWith("/api/runs/")) {
        const id = path.split("/").pop()!;
        bench.deleteRun(id);
        sendJson(res, 204, null);
        return;
      }

      if (req.method === "POST" && path === "/api/compare") {
        const body = await readBody(req);
        const siteOrigin = String(body.siteOrigin ?? "");
        const selections = (body.selections as { runId: string; visible?: boolean; color?: string; isBaseline?: boolean }[]) ?? [];
        sendJson(res, 200, bench.compare(siteOrigin, selections));
        return;
      }

      sendJson(res, 404, { message: "Not found" });
    } catch (error) {
      if (error instanceof ValidationFailure || error instanceof StartFailure) {
        sendJson(res, 400, { message: error.message, errors: "errors" in error ? error.errors : undefined });
        return;
      }
      sendJson(res, 500, { message: error instanceof Error ? error.message : "Internal error" });
    }
  });
}

const port = Number(process.env.SITEBENCH_API_PORT ?? 8787);
createApiServer().listen(port, () => {
  console.log(`SiteBench API listening on http://localhost:${port}`);
});
