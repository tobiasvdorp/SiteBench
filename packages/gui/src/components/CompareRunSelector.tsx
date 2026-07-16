import { useEffect, useRef, useState } from "react";
import { ChevronDown, Star } from "lucide-react";
import type { Run } from "@sitebench/core";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChartResourceFilter } from "@/lib/comparison-preferences";
import { CHART_RESOURCE_FILTER_OPTIONS } from "@/lib/comparison-utils";
import { cn } from "@/lib/utils";

type CompareRunSelectorProps = {
  runs: Run[];
  selectedRunIds: string[];
  baselineRunId: string | null;
  resourceFilter: ChartResourceFilter;
  uniqueRequests: boolean;
  isComparableRun: (run: Run) => boolean;
  onSelectedRunIdsChange: (runIds: string[]) => void;
  onBaselineChange: (runId: string) => void;
  onResourceFilterChange: (filter: ChartResourceFilter) => void;
  onUniqueRequestsChange: (uniqueOnly: boolean) => void;
};

function CompareRunSelector({
  runs,
  selectedRunIds,
  baselineRunId,
  resourceFilter,
  uniqueRequests,
  isComparableRun,
  onSelectedRunIdsChange,
  onBaselineChange,
  onResourceFilterChange,
  onUniqueRequestsChange,
}: CompareRunSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const selectedRuns = selectedRunIds
    .map((id) => runs.find((run) => run.id === id))
    .filter((run): run is Run => run !== undefined);

  const compareLabel =
    selectedRunIds.length === 0
      ? "Select runs to compare"
      : `${selectedRunIds.length} run${selectedRunIds.length === 1 ? "" : "s"} selected`;

  const handleToggleRun = (runId: string, checked: boolean) => {
    if (checked) {
      onSelectedRunIdsChange([...selectedRunIds, runId]);
      if (!baselineRunId) onBaselineChange(runId);
      return;
    }

    const next = selectedRunIds.filter((id) => id !== runId);
    onSelectedRunIdsChange(next);
    if (baselineRunId !== runId) return;
    if (next.length === 0) return;
    onBaselineChange(next[0]);
  };

  return (
    <div className="surface-inset flex flex-col gap-4 p-4 sm:flex-row sm:flex-wrap sm:items-end">
      <div ref={containerRef} className="relative w-full min-w-0 space-y-1 sm:min-w-96 sm:flex-[2]">
        <Label className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
          Compare runs
        </Label>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background/60 px-3 text-sm shadow-sm transition-colors hover:bg-accent/30"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="truncate">{compareLabel}</span>
          <ChevronDown
            className={cn("size-4 shrink-0 opacity-50 transition-transform", {
              "rotate-180": open,
            })}
          />
        </button>
        {open && (
          <div
            className="absolute top-full z-50 mt-1 max-h-72 min-w-full w-max max-w-[min(100vw-2rem,42rem)] overflow-y-auto rounded-lg border bg-popover p-2 shadow-lg"
            role="listbox"
            aria-label="Runs to compare"
          >
            {runs.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">No runs available</p>
            ) : (
              runs.map((run) => {
                const selectable = isComparableRun(run);
                const checked = selectedRunIds.includes(run.id);

                return (
                  <div
                    key={run.id}
                    className={cn("flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/50", {
                      "opacity-50": !selectable,
                    })}
                  >
                    <Checkbox
                      id={`compare-run-${run.id}`}
                      checked={checked}
                      disabled={!selectable}
                      onCheckedChange={(value) => handleToggleRun(run.id, value === true)}
                      aria-label={`Compare run ${run.name}`}
                    />
                    <Label
                      htmlFor={`compare-run-${run.id}`}
                      className={cn("min-w-0 flex-1 font-normal", {
                        "cursor-pointer": selectable,
                        "cursor-not-allowed": !selectable,
                      })}
                    >
                      <span className="block break-words">{run.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(run.startedAt).toLocaleString()}
                        {!selectable && " · Not comparable"}
                      </span>
                    </Label>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className="space-y-1 sm:min-w-56 sm:flex-1">
        <Label className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
          Baseline
        </Label>
        <Select
          value={baselineRunId ?? undefined}
          onValueChange={onBaselineChange}
          disabled={selectedRunIds.length === 0}
        >
          <SelectTrigger aria-label="Baseline run">
            <SelectValue placeholder="Select baseline" />
          </SelectTrigger>
          <SelectContent>
            {selectedRuns.map((run) => (
              <SelectItem key={run.id} value={run.id}>
                <span className="inline-flex items-center gap-1.5">
                  <Star className="size-3.5" />
                  {run.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1 sm:w-40">
        <Label className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
          Request type
        </Label>
        <Select value={resourceFilter} onValueChange={(value) => onResourceFilterChange(value as ChartResourceFilter)}>
          <SelectTrigger aria-label="Chart resource filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CHART_RESOURCE_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex h-9 items-center gap-2 self-end">
        <Checkbox
          id="compare-unique-requests"
          checked={uniqueRequests}
          onCheckedChange={(checked) => onUniqueRequestsChange(checked === true)}
        />
        <Label htmlFor="compare-unique-requests" className="font-normal">
          Unique requests
        </Label>
      </div>
    </div>
  );
}

export { CompareRunSelector };
