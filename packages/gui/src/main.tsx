import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Copy, GitCompareArrows, Layers, Plus, Trash2 } from "lucide-react";
import {
  compare,
  createReport,
  createTemplate,
  deleteRun,
  deleteReport,
  deleteTemplate,
  duplicateTemplate,
  formatApiError,
  getDefaults,
  getRun,
  getRunRequests,
  listReports,
  listRuns,
  listTemplates,
  startRun,
  stopRun,
  subscribeProgress,
  updateReport,
  updateTemplate,
} from "./lib/api";
import type { ComparisonResult, CrawlConfig, Report, RequestProgressItem, Run, Template, TemplateInput } from "@sitebench/core";
import { AppAlert, AppShell, type Tab } from "./components/app/AppShell";
import { CompareReportsSidebar } from "./components/CompareReportsSidebar";
import { CompareRunSelector } from "./components/CompareRunSelector";
import { ComparisonView } from "./components/ComparisonView";
import { ReportChangesBar } from "./components/ReportChangesBar";
import { RunDetailSheet, type RunProgressState } from "./components/RunDetailSheet";
import { RunHistory } from "./components/RunHistory";
import { RunLauncher } from "./components/RunLauncher";
import { RunSelectionBar } from "./components/RunSelectionBar";
import { TemplateForm } from "./components/TemplateForm";
import {
  getStoredBaseline,
  getStoredChartResourceFilter,
  getStoredSelectedRunIds,
  getStoredUniqueRequests,
  setStoredBaseline,
  setStoredChartResourceFilter,
  setStoredSelectedRunIds,
  setStoredUniqueRequests,
  type ChartResourceFilter,
} from "./lib/comparison-preferences";
import { resolveBaselineRunId, reportMatchesComparisonState } from "./lib/comparison-utils";
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
  const [reports, setReports] = useState<Report[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>(() => getStoredSelectedRunIds());
  const [baselineRunId, setBaselineRunId] = useState<string | null>(null);
  const [resourceFilter, setResourceFilter] = useState<ChartResourceFilter>(() => getStoredChartResourceFilter());
  const [uniqueRequests, setUniqueRequests] = useState(() => getStoredUniqueRequests());
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

  const refreshReports = useCallback(async (origin?: string) => {
    setReports(await listReports(origin));
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
    void refreshReports(siteOrigin || undefined);
  }, [siteOrigin, refreshReports]);

  useEffect(() => {
    setStoredSelectedRunIds(selectedRunIds);
    if (selectedRunIds.length === 0) setComparison(null);
  }, [selectedRunIds]);

  const activeReport = useMemo(
    () => reports.find((entry) => entry.id === activeReportId) ?? null,
    [reports, activeReportId],
  );

  const reportIsDirty = useMemo(() => {
    if (!activeReport) return false;
    return !reportMatchesComparisonState(activeReport, selectedRunIds, baselineRunId, resourceFilter);
  }, [activeReport, selectedRunIds, baselineRunId, resourceFilter]);

  const refreshComparison = useCallback(async (runIds: string[], effectiveBaseline: string | null) => {
    if (runIds.length === 0 || !effectiveBaseline) {
      setComparison(null);
      return;
    }

    const firstRun = runs.find((run) => runIds.includes(run.id));
    if (!firstRun) return;

    try {
      const result = await compare(
        firstRun.siteOrigin,
        runIds.map((runId) => ({
          runId,
          visible: true,
          isBaseline: runId === effectiveBaseline,
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

    if (validIds.length === 0) {
      if (baselineRunId !== null) setBaselineRunId(null);
      setComparison(null);
      return;
    }

    const stored = siteOrigin ? getStoredBaseline(siteOrigin) : null;
    const effectiveBaseline = resolveBaselineRunId(validIds, baselineRunId ?? stored);
    if (!effectiveBaseline) return;

    if (effectiveBaseline !== baselineRunId) {
      setBaselineRunId(effectiveBaseline);
      if (siteOrigin) setStoredBaseline(siteOrigin, effectiveBaseline);
      return;
    }

    if (tab !== "compare") return;
    void refreshComparison(validIds, effectiveBaseline);
  }, [runs, selectedRunIds, baselineRunId, siteOrigin, tab, refreshComparison]);

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

  const handleBaselineChange = (runId: string) => {
    setBaselineRunId(runId);
    if (siteOrigin) setStoredBaseline(siteOrigin, runId);
  };

  const handleResourceFilterChange = (filter: ChartResourceFilter) => {
    setResourceFilter(filter);
    setStoredChartResourceFilter(filter);
  };

  const handleUniqueRequestsChange = (uniqueOnly: boolean) => {
    setUniqueRequests(uniqueOnly);
    setStoredUniqueRequests(uniqueOnly);
  };

  const handleCompare = () => {
    navigateToTab("compare");
  };

  const handleLoadReport = (report: Report) => {
    setActiveReportId(report.id);
    setSelectedRunIds(report.runIds);
    setBaselineRunId(report.baselineRunId);
    if (report.baselineRunId && report.siteOrigin) setStoredBaseline(report.siteOrigin, report.baselineRunId);
    setResourceFilter(report.resourceFilter);
    setStoredChartResourceFilter(report.resourceFilter);
    navigateToTab("compare");
  };

  const handleSaveReport = async (name: string) => {
    if (!siteOrigin || selectedRunIds.length === 0 || !baselineRunId) return;

    setError(null);
    try {
      const report = await createReport({
        name,
        siteOrigin,
        runIds: selectedRunIds,
        baselineRunId,
        resourceFilter,
      });
      await refreshReports(siteOrigin || undefined);
      setActiveReportId(report.id);
      setNotice(`Report "${report.name}" saved.`);
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const handleUpdateReport = async () => {
    if (!activeReport || !siteOrigin || selectedRunIds.length === 0 || !baselineRunId) return;

    setError(null);
    try {
      await updateReport(activeReport.id, {
        name: activeReport.name,
        siteOrigin,
        runIds: selectedRunIds,
        baselineRunId,
        resourceFilter,
      });
      await refreshReports(siteOrigin || undefined);
      setNotice(`Report "${activeReport.name}" updated.`);
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const handleDiscardReportChanges = () => {
    if (!activeReport) return;
    handleLoadReport(activeReport);
  };

  const handleDeleteReport = async (reportId: string) => {
    setError(null);
    try {
      await deleteReport(reportId);
      if (activeReportId === reportId) setActiveReportId(null);
      await refreshReports(siteOrigin || undefined);
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const handleRemoveFromSelection = (runId: string) => {
    setSelectedRunIds((current) => current.filter((id) => id !== runId));
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
              onRemoveRun={handleRemoveFromSelection}
              onCompare={() => void handleCompare()}
            />
          </div>
        </TabsContent>

        <TabsContent value="compare" className="mt-0">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            <CompareReportsSidebar
              reports={reports}
              activeReportId={activeReportId}
              canSave={!activeReportId && selectedRunIds.length > 0 && baselineRunId !== null}
              onSelectReport={handleLoadReport}
              onSaveReport={handleSaveReport}
              onDeleteReport={handleDeleteReport}
            />

            <div className="space-y-6">
              <CompareRunSelector
                runs={runs}
                selectedRunIds={selectedRunIds}
                baselineRunId={baselineRunId}
                resourceFilter={resourceFilter}
                uniqueRequests={uniqueRequests}
                isComparableRun={isComparableRun}
                onSelectedRunIdsChange={setSelectedRunIds}
                onBaselineChange={handleBaselineChange}
                onResourceFilterChange={handleResourceFilterChange}
                onUniqueRequestsChange={handleUniqueRequestsChange}
              />

              {reportIsDirty && activeReport && (
                <ReportChangesBar
                  reportName={activeReport.name}
                  onSave={handleUpdateReport}
                  onDiscard={handleDiscardReportChanges}
                />
              )}

              {comparison ? (
                <ComparisonView
                  comparison={comparison}
                  baselineRunId={baselineRunId}
                  resourceFilter={resourceFilter}
                  uniqueRequests={uniqueRequests}
                />
              ) : selectedRunIds.length === 0 ? (
                <EmptyState
                  icon={<GitCompareArrows className="size-8" />}
                  title="No runs selected"
                  description="Select completed or stopped runs above to compare their latency distributions."
                />
              ) : null}
            </div>
          </div>
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
