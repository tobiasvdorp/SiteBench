import { GitCompareArrows, Star, X } from "lucide-react";
import type { Run } from "@sitebench/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RunSelectionBarProps = {
  runs: Run[];
  selectedRunIds: string[];
  baselineRunId: string | null;
  onRemoveRun: (runId: string) => void;
  onCompare: () => void;
  compact?: boolean;
};

function RunSelectionBar({
  runs,
  selectedRunIds,
  baselineRunId,
  onRemoveRun,
  onCompare,
  compact = false,
}: RunSelectionBarProps) {
  if (selectedRunIds.length === 0) return null;

  const selectedRuns = selectedRunIds
    .map((id) => runs.find((run) => run.id === id))
    .filter((run): run is Run => run !== undefined);

  return (
    <div
      className={cn(
        "surface-inset flex flex-col gap-3 p-3",
        { "sm:flex-row sm:items-end sm:justify-between": !compact },
      )}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
          {selectedRunIds.length} run{selectedRunIds.length === 1 ? "" : "s"} selected
        </div>
        <div className="flex flex-wrap gap-1.5">
          {selectedRuns.map((run) => {
            const isBaseline = run.id === baselineRunId;
            return (
              <span
                key={run.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  {
                    "border-warning/40 bg-warning/10 text-warning": isBaseline,
                    "border-border bg-secondary/60": !isBaseline,
                  },
                )}
              >
                {isBaseline && <Star className="size-3 fill-current" />}
                <span className="max-w-32 truncate">{run.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveRun(run.id)}
                  className="rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
                  aria-label={`Remove ${run.name} from selection`}
                >
                  <X className="size-3" />
                </button>
              </span>
            );
          })}
        </div>
      </div>

      <Button className="gap-2 glow-accent sm:self-end" onClick={onCompare}>
        <GitCompareArrows className="size-4" />
        Compare
      </Button>
    </div>
  );
}

export { RunSelectionBar };
