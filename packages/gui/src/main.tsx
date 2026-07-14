import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Copy, GitCompareArrows, Layers, Plus, Trash2 } from "lucide-react";
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
import { AppAlert, AppShell, type Tab } from "./components/app/AppShell";
import { ComparisonView } from "./components/ComparisonView";
import { RunDetailSheet, type RunProgressState } from "./components/RunDetailSheet";
import { RunHistory } from "./components/RunHistory";
import { RunLauncher } from "./components/RunLauncher";
import { RunSelectionBar } from "./components/RunSelectionBar";
import { TemplateForm } from "./components/TemplateForm";
import { getStoredBaseline, getStoredSelectedRunIds, setStoredBaseline, setStoredSelectedRunIds } from "./lib/comparison-preferences";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import "./styles.css";

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
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>(() => getStoredSelectedRunIds());
  const [baselineRunId, setBaselineRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stoppingRun, setStoppingRun] = useState(false);
  const runLauncherRef = useRef<HTMLDivElement>(null);

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
    setStoredSelectedRunIds(selectedRunIds);
    if (selectedRunIds.length === 0) setComparison(null);
  }, [selectedRunIds]);

  const restoreComparison = useCallback(async (runIds: string[]) => {
    if (runIds.length === 0) return;

    const firstRun = runs.find((run) => runIds.includes(run.id));
    if (!firstRun) return;

    const origin = firstRun.siteOrigin;
    const storedBaseline = getStoredBaseline(origin);
    const baselineId = storedBaseline && runIds.includes(storedBaseline) ? storedBaseline : null;
    if (baselineId) setBaselineRunId(baselineId);

    try {
      const result = await compare(
        origin,
        runIds.map((runId) => ({
          runId,
          visible: true,
          isBaseline: runId === baselineId,
          color: undefined,
        })),
      );
      setComparison(result);
    } catch (err) {
      setError(formatApiError(err));
    }
  }, [runs]);

  useEffect(() => {
    if (runs.length === 0) return;

    const validIds = selectedRunIds.filter((runId) => {
      const run = runs.find((entry) => entry.id === runId);
      return run && isComparableRun(run);
    });

    if (validIds.length !== selectedRunIds.length) {
      setSelectedRunIds(validIds);
      return;
    }

    if (tab !== "compare" || comparison || validIds.length === 0) return;
    void restoreComparison(validIds);
  }, [runs, selectedRunIds, tab, comparison, restoreComparison]);

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
    try {
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
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const handleRemoveFromSelection = (runId: string) => {
    setSelectedRunIds((current) => current.filter((id) => id !== runId));
    if (baselineRunId === runId) handleBaselineChange(null);
  };

  const scrollToRunLauncher = () => {
    navigateToTab("runs");
    requestAnimationFrame(() => {
      runLauncherRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const alerts = (
    <>
      {error && <AppAlert variant="error" message={error} onDismiss={() => setError(null)} />}
      {notice && <AppAlert variant="notice" message={notice} onDismiss={() => setNotice(null)} />}
    </>
  );

  return (
    <AppShell tab={tab} onNavigate={navigateToTab} onNewRun={scrollToRunLauncher} alerts={alerts}>
      <Tabs value={tab}>
        <TabsContent value="runs" className="mt-0 space-y-6">
          <div ref={runLauncherRef} className="animate-fade-in-up stagger-1">
            <RunLauncher
              templates={templates}
              onStart={handleStartRun}
              onEditTemplate={handleEditTemplate}
              onCreateTemplate={() => {
                setSelectedTemplateId(null);
                navigateToTab("templates");
              }}
            />
          </div>

          <div className="animate-fade-in-up stagger-2 space-y-4">
            <SectionHeader
              title="Run history"
              description="Click any run for details. Select completed or stopped runs to compare."
            />
            <RunHistory
              runs={runs}
              selectedRunIds={selectedRunIds}
              onSelectRun={(runId, checked) => {
                setSelectedRunIds((current) =>
                  checked ? [...current, runId] : current.filter((id) => id !== runId),
                );
              }}
              onOpenRun={handleOpenRunDetail}
              onDeleteRun={async (runId) => {
                await deleteRun(runId);
                if (detailRunId === runId) setDetailRunId(null);
                if (activeRunId === runId) setActiveRunId(null);
                handleRemoveFromSelection(runId);
                await refreshRuns();
              }}
              isComparableRun={isComparableRun}
              isLiveRunStatus={isLiveRunStatus}
            />
            <RunSelectionBar
              runs={runs}
              selectedRunIds={selectedRunIds}
              baselineRunId={baselineRunId}
              onBaselineChange={handleBaselineChange}
              onRemoveRun={handleRemoveFromSelection}
              onCompare={() => void handleCompare()}
            />
          </div>
        </TabsContent>

        <TabsContent value="compare" className="mt-0 space-y-6">
          {selectedRunIds.length > 0 ? (
            <RunSelectionBar
              runs={runs}
              selectedRunIds={selectedRunIds}
              baselineRunId={baselineRunId}
              onBaselineChange={handleBaselineChange}
              onRemoveRun={handleRemoveFromSelection}
              onCompare={() => void handleCompare()}
              compact
            />
          ) : (
            <EmptyState
              icon={<GitCompareArrows className="size-8" />}
              title="No runs selected"
              description="Select completed or stopped runs on the Runs tab, then compare their latency distributions."
              action={
                <Button variant="outline" onClick={() => navigateToTab("runs")}>
                  Go to Runs
                </Button>
              }
            />
          )}

          {comparison ? (
            <ComparisonView comparison={comparison} />
          ) : selectedRunIds.length > 0 ? (
            <Card>
              <CardContent className="py-8">
                <EmptyState
                  icon={<GitCompareArrows className="size-8" />}
                  title="Ready to compare"
                  description={`${selectedRunIds.length} run${selectedRunIds.length === 1 ? "" : "s"} selected. Click Compare to overlay latency distributions.`}
                  action={
                    <Button className="gap-2 glow-accent" onClick={() => void handleCompare()}>
                      <GitCompareArrows className="size-4" />
                      Compare selected
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="templates" className="mt-0">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <Card className="animate-fade-in-up stagger-1">
              <SectionHeader
                title="Templates"
                description="Reusable crawl presets for future runs."
                action={
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSelectedTemplateId(null)}>
                    <Plus className="size-4" />
                    New
                  </Button>
                }
                className="p-5 pb-0"
              />
              <CardContent className="space-y-2 pt-4">
                {templates.length === 0 ? (
                  <EmptyState
                    icon={<Layers className="size-8" />}
                    title="No templates yet"
                    description="Create a template to configure crawl settings."
                  />
                ) : (
                  templates.map((template) => (
                    <div
                      key={template.id}
                      className={cn(
                        "flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-all hover:border-primary/30 hover:bg-accent/30",
                        {
                          "border-primary/40 bg-primary/5 ring-1 ring-primary/20": selectedTemplateId === template.id,
                        },
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 px-1 py-0.5 text-left"
                        onClick={() => setSelectedTemplateId(template.id)}
                      >
                        <div className="truncate font-medium leading-tight">{template.name}</div>
                        <div className="truncate text-[0.65rem] text-muted-foreground/80">
                          {template.rpsLimit} RPS
                          {template.maxPages !== null && ` · ${template.maxPages} pages`}
                          {template.timeLimitSeconds !== null && ` · ${template.timeLimitSeconds}s`}
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0"
                        aria-label={`Duplicate template ${template.name}`}
                        onClick={async () => {
                          await duplicateTemplate(template.id);
                          await refreshTemplates();
                        }}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Delete template ${template.name}`}
                        onClick={async () => {
                          await deleteTemplate(template.id);
                          if (selectedTemplateId === template.id) setSelectedTemplateId(null);
                          await refreshTemplates();
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="animate-fade-in-up stagger-2">
              <TemplateForm defaults={defaults} template={selectedTemplate} onSave={handleSaveTemplate} />
            </div>
          </div>
        </TabsContent>
      </Tabs>

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
    </AppShell>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
