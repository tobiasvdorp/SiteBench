import { Trash2 } from "lucide-react";
import type { Run } from "@sitebench/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Metric } from "@/components/ui/metric";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

type RunHistoryProps = {
  runs: Run[];
  selectedRunIds: string[];
  onSelectRun: (runId: string, checked: boolean) => void;
  onOpenRun: (run: Run) => void;
  onDeleteRun: (runId: string) => void;
  isComparableRun: (run: Run) => boolean;
  isLiveRunStatus: (status: Run["status"]) => boolean;
};

function getTruncationMessage(run: Run) {
  if (run.truncationReason === "time-limit") return "Time limit";
  if (run.truncationReason === "max-pages") return "Page limit";
  return "Truncated";
}

function RunHistory({
  runs,
  selectedRunIds,
  onSelectRun,
  onOpenRun,
  onDeleteRun,
  isComparableRun,
  isLiveRunStatus,
}: RunHistoryProps) {
  if (runs.length === 0) {
    return (
      <EmptyState
        title="No runs yet"
        description="Start a run to measure HTTP performance on your site."
      />
    );
  }

  return (
    <div className="space-y-1">
      {runs.map((run, index) => {
        const selectable = isComparableRun(run);
        const isSelected = selectedRunIds.includes(run.id);
        const isLive = isLiveRunStatus(run.status);

        return (
          <div
            key={run.id}
            className={cn(
              "group animate-fade-in-up surface-panel flex cursor-pointer items-center gap-3 px-3 py-3 transition-all hover:border-primary/20 hover:bg-accent/30",
              {
                "border-primary/30 bg-primary/5": isSelected,
                "animate-pulse-glow border-live/20": isLive,
              },
              `stagger-${Math.min(index + 1, 5)}`,
            )}
            onClick={() => onOpenRun(run)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onOpenRun(run);
            }}
            tabIndex={0}
            role="button"
            aria-label={`View details for run ${run.name}`}
          >
            <div
              className="shrink-0"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Checkbox
                id={`run-select-${run.id}`}
                checked={isSelected}
                disabled={!selectable}
                aria-label={
                  selectable
                    ? `Select run ${run.name} for comparison`
                    : `Run ${run.name} cannot be compared yet`
                }
                onCheckedChange={(checked) => onSelectRun(run.id, checked === true)}
              />
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{run.name}</span>
                <StatusBadge status={run.status} />
                {run.truncated && <Badge variant="warning">{getTruncationMessage(run)}</Badge>}
                {run.status === "stopped" && <Badge variant="muted">Stopped</Badge>}
                {run.status === "failed" && run.errorSummary && (
                  <Badge variant="destructive" title={run.errorSummary} className="max-w-40 truncate">
                    {run.errorSummary}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{new Date(run.startedAt).toLocaleString()}</span>
                {run.aggregates && (
                  <>
                    <span>
                      <Metric>{run.aggregates.pageCount}</Metric> pages
                    </span>
                    <span>
                      <Metric>{run.aggregates.totalRequests}</Metric> requests
                      {typeof run.aggregates.uniqueRequests === "number" &&
                        run.aggregates.uniqueRequests < run.aggregates.totalRequests && (
                        <>
                          {" "}
                          (<Metric>{run.aggregates.uniqueRequests}</Metric> unique)
                        </>
                      )}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="hidden shrink-0 sm:block">
              {run.aggregates ? (
                <Metric className="text-xs text-muted-foreground" unit="ms">
                  {run.aggregates.p50.toFixed(1)}
                </Metric>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>

            <div
              className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(event) => event.stopPropagation()}
            >
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Delete run ${run.name}`}
                onClick={() => onDeleteRun(run.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { RunHistory };
