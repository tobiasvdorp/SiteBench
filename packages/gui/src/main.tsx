import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AlertCircle, CheckCircle2, Gauge, Plus, Trash2 } from "lucide-react";
import {
  compare,
  createTemplate,
  deleteRun,
  deleteTemplate,
  duplicateTemplate,
  formatApiError,
  getDefaults,
  getRun,
  getRunRequests,
  listRuns,
  listTemplates,
  startRun,
  stopRun,
  subscribeProgress,
  updateTemplate,
} from "./lib/api";
import type { ComparisonResult, CrawlConfig, RequestProgressItem, Run, Template, TemplateInput } from "@sitebench/core";
import { ComparisonView } from "./components/ComparisonView";
import { RunDetailSheet, type RunProgressState } from "./components/RunDetailSheet";
import { TemplateForm } from "./components/TemplateForm";
import { RunLauncher } from "./components/RunLauncher";
import { getStoredBaseline, setStoredBaseline } from "./lib/comparison-preferences";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import "./styles.css";

type Tab = "runs" | "compare" | "templates";

const TAB_PATHS: Record<Tab, string> = {
  runs: "/runs",
  compare: "/compare",
  templates: "/templates",
};

function getTabFromPath(pathname: string): Tab {
  if (pathname === "/compare") return "compare";
  if (pathname === "/templates") return "templates";
  return "runs";
}

function isLiveRunStatus(status: Run["status"]) {
  return status === "running" || status === "pending";
}

function isComparableRun(run: Run) {
  if (!run.aggregates) return false;
  return run.status === "completed" || run.status === "stopped";
}

function getTruncationMessage(run: Run) {
  if (run.truncationReason === "time-limit") return "Time limit reached before the queue emptied.";
  if (run.truncationReason === "max-pages") return "Page limit reached before the queue emptied.";
  return "Crawl truncated before the queue emptied.";
}

function App() {
  const [tab, setTab] = useState<Tab>(() => getTabFromPath(window.location.pathname));
  const [defaults, setDefaults] = useState<CrawlConfig | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [detailRunId, setDetailRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState<RunProgressState | null>(null);
  const [recentRequests, setRecentRequests] = useState<RequestProgressItem[]>([]);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [baselineRunId, setBaselineRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stoppingRun, setStoppingRun] = useState(false);

  useEffect(() => {
    if (window.location.pathname === "/") {
      window.history.replaceState(null, "", TAB_PATHS.runs);
    }

    const handlePopState = () => setTab(getTabFromPath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateToTab = useCallback((nextTab: Tab) => {
    setTab(nextTab);
    const nextPath = TAB_PATHS[nextTab];
    if (window.location.pathname === nextPath) return;
    window.history.pushState(null, "", nextPath);
  }, []);

  const refreshTemplates = useCallback(async () => {
    setTemplates(await listTemplates());
  }, []);

  const refreshRuns = useCallback(async () => {
    setRuns(await listRuns());
  }, []);

  useEffect(() => {
    void (async () => {
      setDefaults(await getDefaults());
      await refreshTemplates();
      await refreshRuns();
    })();
  }, [refreshTemplates, refreshRuns]);

  useEffect(() => {
    if (activeRunId) return;
    const running = runs.find((run) => run.status === "running");
    if (!running) return;
    setActiveRunId(running.id);
  }, [runs, activeRunId]);

  const detailRun = useMemo(
    () => runs.find((run) => run.id === detailRunId) ?? null,
    [runs, detailRunId],
  );

  useEffect(() => {
    if (!detailRunId) return;
    const run = runs.find((entry) => entry.id === detailRunId);
    if (!run || !isLiveRunStatus(run.status)) return;

    return subscribeProgress(detailRunId, (event) => {
      if (event.type !== "progress") return;
      setProgress({
        pagesFetched: event.pagesFetched,
        pagesDiscovered: event.pagesDiscovered,
        requestsCompleted: event.requestsCompleted,
        errors: event.errors,
        queueSize: event.queueSize,
      });
      setRecentRequests(event.recentRequests ?? []);
    });
  }, [detailRunId, runs]);

  useEffect(() => {
    if (!detailRunId) return;
    const run = runs.find((entry) => entry.id === detailRunId);
    if (!run || isLiveRunStatus(run.status)) return;

    setProgress(null);
    void (async () => {
      const requests = await getRunRequests(detailRunId, { limit: 150 });
      setRecentRequests(
        requests.map((request) => ({
          url: request.url,
          resourceType: request.resourceType,
          statusCode: request.statusCode,
          errorClass: request.errorClass,
          errorMessage: request.errorMessage,
          totalMs: request.timings.totalMs,
          at: request.createdAt,
        })),
      );
    })();
  }, [detailRunId, runs]);

  useEffect(() => {
    if (!activeRunId) return;
    const interval = setInterval(async () => {
      const run = await getRun(activeRunId);
      if (run.status !== "completed" && run.status !== "failed" && run.status !== "stopped") return;

      setActiveRunId(null);
      if (detailRunId === activeRunId) {
        setProgress(null);
      }
      await refreshRuns();

      if (run.status === "failed") {
        setNotice(null);
        setError(run.errorSummary ?? "Run failed");
        return;
      }

      setError(null);
      const warnings: string[] = [];
      if (run.truncated) warnings.push(getTruncationMessage(run));
      if (run.status === "stopped") warnings.push("Run was stopped before completion.");
      setNotice(warnings.length > 0 ? warnings.join(" ") : `Run "${run.name}" completed.`);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeRunId, detailRunId, refreshRuns]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const siteOrigin = useMemo(() => {
    const first = runs.find((r) => selectedRunIds.includes(r.id));
    return (
      first?.siteOrigin
      ?? runs[0]?.siteOrigin
      ?? (templates[0]?.startUrl ? new URL(templates[0].startUrl).origin : "")
    );
  }, [runs, selectedRunIds, templates]);

  useEffect(() => {
    if (!siteOrigin) return;
    const stored = getStoredBaseline(siteOrigin);
    if (!stored) return;
    if (selectedRunIds.includes(stored) || runs.some((run) => run.id === stored)) {
      setBaselineRunId(stored);
    }
  }, [siteOrigin, selectedRunIds, runs, tab]);

  const handleSaveTemplate = async (input: TemplateInput, id?: string) => {
    setError(null);
    try {
      if (id) await updateTemplate(id, input);
      else await createTemplate(input);
      await refreshTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    }
  };

  const handleEditTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    navigateToTab("templates");
  };

  const handleStartRun = async (runName: string, templateId: string, overrides?: Partial<CrawlConfig>) => {
    setError(null);
    setNotice(null);
    try {
      const run = await startRun({
        runName,
        templateId,
        overrides: overrides && Object.keys(overrides).length > 0 ? overrides : undefined,
      });
      setActiveRunId(run.id);
      setDetailRunId(run.id);
      setProgress({ pagesFetched: 0, pagesDiscovered: 0, requestsCompleted: 0, errors: 0, queueSize: 0 });
      setRecentRequests([]);
      navigateToTab("runs");
      await refreshRuns();
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const handleStopRun = async () => {
    const runId = detailRunId ?? activeRunId;
    if (!runId) return;
    setStoppingRun(true);
    setError(null);
    try {
      await stopRun(runId);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setStoppingRun(false);
    }
  };

  const handleOpenRunDetail = (run: Run) => {
    setDetailRunId(run.id);
    setProgress(null);
    setRecentRequests([]);
  };

  const handleBaselineChange = (runId: string | null) => {
    setBaselineRunId(runId);
    if (siteOrigin) setStoredBaseline(siteOrigin, runId);
  };

  const handleCompare = async () => {
    if (!siteOrigin || selectedRunIds.length === 0) return;
    if (baselineRunId) setStoredBaseline(siteOrigin, baselineRunId);
    const result = await compare(
      siteOrigin,
      selectedRunIds.map((runId) => ({
        runId,
        visible: true,
        isBaseline: runId === baselineRunId,
        color: undefined,
      })),
    );
    setComparison(result);
    navigateToTab("compare");
  };

  const statusVariant = (status: Run["status"]) => {
    if (status === "completed") return "secondary" as const;
    if (status === "running") return "default" as const;
    if (status === "failed") return "destructive" as const;
    return "muted" as const;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Gauge className="size-6 text-primary" />
              <h1 className="text-2xl font-semibold tracking-tight">SiteBench</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Measure HTTP performance, compare runs, and tune templates as needed
            </p>
          </div>
        </header>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>
              {error.split("\n").map((line, index) => (
                <div key={index}>{line}</div>
              ))}
            </AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert variant="success">
            <CheckCircle2 className="size-4" />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <Tabs value={tab} onValueChange={(value) => navigateToTab(value as Tab)}>
          <TabsList>
            <TabsTrigger value="runs">Runs</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="runs" className="mt-6 space-y-6">
            <RunLauncher
              templates={templates}
              onStart={handleStartRun}
              onEditTemplate={handleEditTemplate}
              onCreateTemplate={() => {
                setSelectedTemplateId(null);
                navigateToTab("templates");
              }}
            />

            <Card>
              <CardHeader>
                <CardTitle>Run history</CardTitle>
                <CardDescription>
                  Click any run for details. Use the checkboxes to compare completed or stopped runs with stored data.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Select</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Pages</TableHead>
                      <TableHead>Requests</TableHead>
                      <TableHead>p50</TableHead>
                      <TableHead className="w-20">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                          No runs yet. Start a run to measure your site.
                        </TableCell>
                      </TableRow>
                    ) : (
                      runs.map((run) => {
                        const selectable = isComparableRun(run);
                        return (
                          <TableRow
                            key={run.id}
                            className="cursor-pointer hover:bg-accent/50"
                            onClick={() => handleOpenRunDetail(run)}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              handleOpenRunDetail(run);
                            }}
                            tabIndex={0}
                            aria-label={`View details for run ${run.name}`}
                          >
                            <TableCell onClick={(event) => event.stopPropagation()}>
                              <Checkbox
                                id={`run-select-${run.id}`}
                                checked={selectedRunIds.includes(run.id)}
                                disabled={!selectable}
                                aria-label={
                                  selectable
                                    ? `Select run ${run.name} for comparison`
                                    : `Run ${run.name} cannot be compared yet`
                                }
                                onCheckedChange={(checked) => {
                                  setSelectedRunIds((current) =>
                                    checked === true
                                      ? [...current, run.id]
                                      : current.filter((id) => id !== run.id),
                                  );
                                }}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{run.name}</TableCell>
                            <TableCell>
                              <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {run.truncated && <Badge variant="warning">Truncated</Badge>}
                                {run.status === "stopped" && <Badge variant="muted">Stopped</Badge>}
                                {run.status === "failed" && run.errorSummary && (
                                  <Badge variant="destructive" title={run.errorSummary}>
                                    {run.errorSummary}
                                  </Badge>
                                )}
                                {!run.truncated && run.status !== "stopped" && run.status !== "failed" && !isLiveRunStatus(run.status) && (
                                  <span className="text-muted-foreground">—</span>
                                )}
                                {isLiveRunStatus(run.status) && (
                                  <Badge variant="outline" className="text-primary">
                                    Live
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(run.startedAt).toLocaleString()}
                            </TableCell>
                            <TableCell>{run.aggregates?.pageCount ?? "—"}</TableCell>
                            <TableCell>{run.aggregates?.totalRequests ?? "—"}</TableCell>
                            <TableCell>
                              {run.aggregates ? `${run.aggregates.p50.toFixed(1)} ms` : "—"}
                            </TableCell>
                            <TableCell onClick={(event) => event.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                aria-label={`Delete run ${run.name}`}
                                onClick={async () => {
                                  await deleteRun(run.id);
                                  if (detailRunId === run.id) setDetailRunId(null);
                                  if (activeRunId === run.id) setActiveRunId(null);
                                  await refreshRuns();
                                }}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                  <div className="space-y-2 sm:w-64">
                    <Label htmlFor="baseline-run">Baseline</Label>
                    <Select
                      value={baselineRunId ?? "none"}
                      onValueChange={(value) => handleBaselineChange(value === "none" ? null : value)}
                    >
                      <SelectTrigger id="baseline-run">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {selectedRunIds.map((id) => {
                          const run = runs.find((r) => r.id === id);
                          return (
                            <SelectItem key={id} value={id}>
                              {run?.name ?? id}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button disabled={selectedRunIds.length === 0} onClick={() => void handleCompare()}>
                    Compare selected
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="compare" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Select runs to compare</CardTitle>
                <CardDescription>
                  Completed and manually stopped runs with stored results can be compared.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Select</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pages</TableHead>
                      <TableHead>Requests</TableHead>
                      <TableHead>Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          No runs yet. Start a run before comparing.
                        </TableCell>
                      </TableRow>
                    ) : (
                      runs.map((run) => {
                        const selectable = isComparableRun(run);
                        return (
                          <TableRow key={run.id}>
                            <TableCell>
                              <Checkbox
                                id={`compare-select-${run.id}`}
                                checked={selectedRunIds.includes(run.id)}
                                disabled={!selectable}
                                aria-label={
                                  selectable
                                    ? `Select run ${run.name} for comparison`
                                    : `Run ${run.name} cannot be compared yet`
                                }
                                onCheckedChange={(checked) => {
                                  setSelectedRunIds((current) =>
                                    checked === true
                                      ? [...current, run.id]
                                      : current.filter((id) => id !== run.id),
                                  );
                                }}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{run.name}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
                                {!selectable && (
                                  <span className="text-xs text-muted-foreground">
                                    {run.aggregates ? "Not selectable" : "No stored results"}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{run.aggregates?.pageCount ?? "—"}</TableCell>
                            <TableCell>{run.aggregates?.totalRequests ?? "—"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(run.startedAt).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                  <div className="space-y-2 sm:w-64">
                    <Label htmlFor="compare-baseline-run">Baseline</Label>
                    <Select
                      value={baselineRunId ?? "none"}
                      onValueChange={(value) => handleBaselineChange(value === "none" ? null : value)}
                    >
                      <SelectTrigger id="compare-baseline-run">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {selectedRunIds.map((id) => {
                          const run = runs.find((r) => r.id === id);
                          return (
                            <SelectItem key={id} value={id}>
                              {run?.name ?? id}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button disabled={selectedRunIds.length === 0} onClick={() => void handleCompare()}>
                    Compare selected
                  </Button>
                </div>
              </CardContent>
            </Card>

            {comparison ? (
              <ComparisonView comparison={comparison} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Comparison</CardTitle>
                  <CardDescription>Overlay latency distributions across named runs.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                    <p>No comparison loaded yet.</p>
                    <p className="text-sm">Select runs above and click Compare selected.</p>
                    <Button variant="outline" onClick={() => navigateToTab("runs")}>
                      Go to Runs
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle>Templates</CardTitle>
                    <CardDescription>
                      Reusable crawl presets. Edit here when tuning configuration for future runs.
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSelectedTemplateId(null)}>
                    <Plus className="size-4" />
                    New
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {templates.length === 0 ? (
                    <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                      No templates yet. Create one to configure crawl settings.
                    </div>
                  ) : (
                    templates.map((template) => (
                      <div key={template.id} className="space-y-2">
                        <button
                          type="button"
                          className={cn(
                            "w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/50",
                            { "border-primary bg-primary/5 ring-2 ring-primary/30": selectedTemplateId === template.id },
                          )}
                          onClick={() => setSelectedTemplateId(template.id)}
                        >
                          <div className="font-medium">{template.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{template.startUrl}</div>
                        </button>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              await duplicateTemplate(template.id);
                              await refreshTemplates();
                            }}
                          >
                            Duplicate
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={async () => {
                              await deleteTemplate(template.id);
                              if (selectedTemplateId === template.id) setSelectedTemplateId(null);
                              await refreshTemplates();
                            }}
                          >
                            <Trash2 className="size-4" />
                            Delete
                          </Button>
                        </div>
                        <Separator />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
              <TemplateForm
                defaults={defaults}
                template={selectedTemplate}
                onSave={handleSaveTemplate}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <RunDetailSheet
        run={detailRun}
        open={detailRunId !== null}
        onOpenChange={(open) => {
          if (open) return;
          setDetailRunId(null);
          setProgress(null);
          setRecentRequests([]);
        }}
        progress={progress}
        recentRequests={recentRequests}
        onStop={() => void handleStopRun()}
        stopping={stoppingRun}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
