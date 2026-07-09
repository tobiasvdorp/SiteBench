import type { ComparisonResult, CrawlConfig, ProgressEvent, RequestRecord, Run, Template, TemplateInput, ValidationError } from "@sitebench/core";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

export type ApiError = Error & { errors?: ValidationError[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; errors?: ValidationError[] };
    const error = new Error(body.message ?? `Request failed (${response.status})`) as ApiError;
    error.errors = body.errors;
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function getDefaults() {
  return request<CrawlConfig>("/api/defaults");
}

export function listTemplates() {
  return request<Template[]>("/api/templates");
}

export function createTemplate(input: TemplateInput) {
  return request<Template>("/api/templates", { method: "POST", body: JSON.stringify(input) });
}

export function updateTemplate(id: string, input: TemplateInput) {
  return request<Template>(`/api/templates/${id}`, { method: "PUT", body: JSON.stringify(input) });
}

export function duplicateTemplate(id: string) {
  return request<Template>(`/api/templates/${id}/duplicate`, { method: "POST" });
}

export function deleteTemplate(id: string) {
  return request<void>(`/api/templates/${id}`, { method: "DELETE" });
}

export function listRuns(site?: string) {
  const query = site ? `?site=${encodeURIComponent(site)}` : "";
  return request<Run[]>(`/api/runs${query}`);
}

export function getRun(id: string) {
  return request<Run>(`/api/runs/${id}`);
}

export function getRunRequests(id: string, options?: { resourceType?: import("@sitebench/core").ResourceType; limit?: number }) {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  if (options?.resourceType) params.set("resourceType", options.resourceType);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return request<RequestRecord[]>(`/api/runs/${id}/requests${query}`);
}

export function startRun(payload: {
  runName: string;
  templateId?: string;
  overrides?: Partial<CrawlConfig>;
}) {
  return request<Run>("/api/runs", { method: "POST", body: JSON.stringify(payload) });
}

export function stopRun(id: string) {
  return request<Run>(`/api/runs/${id}/stop`, { method: "POST" });
}

export function deleteRun(id: string) {
  return request<void>(`/api/runs/${id}`, { method: "DELETE" });
}

export function compare(siteOrigin: string, selections: { runId: string; visible?: boolean; color?: string; isBaseline?: boolean }[]) {
  return request<ComparisonResult>("/api/compare", {
    method: "POST",
    body: JSON.stringify({ siteOrigin, selections }),
  });
}

export function subscribeProgress(runId: string, onProgress: (event: ProgressEvent) => void) {
  const source = new EventSource(`${API_BASE}/api/runs/${runId}/progress`);
  source.onmessage = (message) => {
    const payload = JSON.parse(message.data) as ProgressEvent;
    onProgress(payload);
  };
  return () => source.close();
}

export function formatApiError(error: unknown): string {
  if (!(error instanceof Error)) return "Request failed";
  const apiError = error as ApiError;
  if (apiError.errors?.length) {
    return apiError.errors.map((entry) => `${entry.field}: ${entry.message}`).join("\n");
  }
  return apiError.message;
}
