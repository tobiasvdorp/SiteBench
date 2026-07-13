import { useMemo, useState } from "react";
import type { RequestProgressItem, ResourceType, Run } from "@sitebench/core";
import { Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LiveIndicator } from "@/components/ui/live-indicator";
import { Metric } from "@/components/ui/metric";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type RunProgressState = {
  pagesFetched: number;
  pagesDiscovered: number;
  requestsCompleted: number;
  errors: number;
  queueSize: number;
};

type RequestFilter = "all" | ResourceType | "assets";

type Props = {
  run: Run | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: RunProgressState | null;
  recentRequests: RequestProgressItem[];
  onStop: () => void;
  stopping: boolean;
};

const RESOURCE_TYPES = ["page", "css", "js", "font", "image", "other"] as const;

const FILTER_OPTIONS: { value: RequestFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "page", label: "Pages" },
  { value: "assets", label: "Assets" },
  { value: "css", label: "CSS" },
  { value: "js", label: "JS" },
  { value: "font", label: "Fonts" },
  { value: "image", label: "Images" },
  { value: "other", label: "Other" },
];

function statusBadgeVariant(statusCode: number | null, errorClass: string | null) {
  if (errorClass) return "destructive" as const;
  if (statusCode === null) return "muted" as const;
  if (statusCode >= 200 && statusCode < 300) return "success" as const;
  if (statusCode >= 300 && statusCode < 400) return "outline" as const;
  return "destructive" as const;
}

function formatStatus(item: RequestProgressItem) {
  if (item.errorClass) return item.errorClass;
  if (item.statusCode !== null) return String(item.statusCode);
  return "—";
}

function formatLimit(value: number | null, suffix = "") {
  if (value === null) return "None";
  return `${value}${suffix}`;
}

function countByResourceType(requests: RequestProgressItem[]) {
  return Object.fromEntries(
    RESOURCE_TYPES.map((type) => [type, requests.filter((request) => request.resourceType === type).length]),
  ) as Record<ResourceType, number>;
}

function resourceTypeLabel(type: RequestProgressItem["resourceType"]) {
  if (type === "page") return "Page";
  if (type === "css") return "CSS";
  if (type === "js") return "JS";
  if (type === "font") return "Font";
  if (type === "image") return "Image";
  return "Other";
}

function matchesFilter(item: RequestProgressItem, filter: RequestFilter) {
  if (filter === "all") return true;
  if (filter === "assets") return item.resourceType !== "page";
  return item.resourceType === filter;
}

function emptyResourceTypeCounts(): Record<ResourceType, number> {
  return { page: 0, css: 0, js: 0, font: 0, image: 0, other: 0 };
}

export function RunDetailSheet({
  run,
  open,
  onOpenChange,
  progress,
  recentRequests,
  onStop,
  stopping,
}: Props) {
  const [requestFilter, setRequestFilter] = useState<RequestFilter>("all");
  const isLive = run?.status === "running" || run?.status === "pending";
  const orderedRequests = [...recentRequests].reverse();
  const filteredRequests = useMemo(
    () => orderedRequests.filter((item) => matchesFilter(item, requestFilter)),
    [orderedRequests, requestFilter],
  );
  const liveResourceCounts = countByResourceType(recentRequests);
  const storedResourceCounts = run?.aggregates?.resourceTypeCounts ?? emptyResourceTypeCounts();
  const resourceCounts = isLive ? liveResourceCounts : storedResourceCounts;
  const aggregateProgress = run?.aggregates
    ? {
        pagesFetched: run.aggregates.pageCount,
        pagesDiscovered: run.aggregates.pageCount,
        requestsCompleted: run.aggregates.totalRequests,
        errors: run.aggregates.errorCount,
        queueSize: 0,
      }
    : null;
  const displayedProgress = progress ?? aggregateProgress;
  const assetCount =
    resourceCounts.css +
    resourceCounts.js +
    resourceCounts.font +
    resourceCounts.image +
    resourceCounts.other;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-xl" aria-describedby="run-detail-description">
        <SheetHeader className="border-b border-border/40 pb-4">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0 space-y-1">
              <SheetTitle className="truncate">{run?.name ?? "Run details"}</SheetTitle>
              <SheetDescription id="run-detail-description">
                {isLive ? "Live fetch activity for this run." : "Stored summary and recent request rows for this run."}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {run && (
          <div className="mt-4 flex min-h-0 flex-1 flex-col space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {isLive ? <LiveIndicator /> : <StatusBadge status={run.status} showLiveIndicator={false} />}
              <Badge variant={run.configSnapshot.allowImages ? "secondary" : "outline"}>
                Images {run.configSnapshot.allowImages ? "included" : "excluded"}
              </Badge>
              {run.configSnapshot.excludePagesFromResults && (
                <Badge variant="secondary">Pages excluded from results</Badge>
              )}
              <span className="font-mono text-xs text-muted-foreground">{run.siteOrigin}</span>
            </div>

            {displayedProgress && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatTile
                  label="Pages"
                  value={
                    isLive
                      ? `${displayedProgress.pagesFetched}/${displayedProgress.pagesDiscovered}`
                      : displayedProgress.pagesFetched
                  }
                  live={isLive}
                />
                <StatTile label="Requests" value={displayedProgress.requestsCompleted} live={isLive} />
                <StatTile label="Assets" value={assetCount} />
                <StatTile
                  label="Errors"
                  value={displayedProgress.errors}
                  accent={displayedProgress.errors > 0}
                />
              </div>
            )}

            {run.aggregates && !isLive && (
              <div className="grid grid-cols-3 gap-2">
                <StatTile label="p50" value={run.aggregates.p50.toFixed(1)} unit="ms" accent />
                <StatTile label="p90" value={run.aggregates.p90.toFixed(1)} unit="ms" />
                <StatTile label="p99" value={run.aggregates.p99.toFixed(1)} unit="ms" />
              </div>
            )}

            <div className="surface-inset grid gap-3 p-3 text-sm sm:grid-cols-2">
              <div>
                <div className="text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">Start URL</div>
                <div className="truncate font-mono text-xs font-medium" title={run.configSnapshot.startUrl}>
                  {run.configSnapshot.startUrl}
                </div>
              </div>
              <div>
                <div className="text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">Limits</div>
                <div className="font-mono text-xs font-medium">
                  {formatLimit(run.configSnapshot.maxPages)} pages · {formatLimit(run.configSnapshot.timeLimitSeconds, "s")}
                </div>
              </div>
              <div>
                <div className="text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">RPS limit</div>
                <Metric className="text-sm font-medium">{run.configSnapshot.rpsLimit}</Metric>
              </div>
              <div>
                <div className="text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">Workers</div>
                <Metric className="text-sm font-medium">{run.configSnapshot.workerCount}</Metric>
              </div>
              <div>
                <div className="text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">Timeout</div>
                <Metric className="text-sm font-medium" unit="ms">
                  {run.configSnapshot.requestTimeoutMs}
                </Metric>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {RESOURCE_TYPES.map((type) => {
                const count = resourceCounts[type];
                if (!count) return null;
                return (
                  <Badge key={type} variant="outline" className="font-mono">
                    {resourceTypeLabel(type)}: {count}
                  </Badge>
                );
              })}
            </div>

            {run.truncated && (
              <Badge variant="warning">
                {run.truncationReason === "time-limit" ? "Time limit reached" : "Page limit reached"}
              </Badge>
            )}

            {isLive && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-2 self-start"
                disabled={stopping}
                onClick={onStop}
                aria-label="Stop run"
              >
                <Square className="size-3.5 fill-current" />
                {stopping ? "Stopping…" : "Stop run"}
              </Button>
            )}

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
                  {isLive ? "Recent requests" : "Stored requests"}
                </h3>
                <div className="flex flex-wrap gap-1">
                  {FILTER_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={requestFilter === option.value ? "default" : "outline"}
                      className={cn("h-7 px-2 text-xs")}
                      onClick={() => setRequestFilter(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
              {filteredRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {orderedRequests.length === 0
                    ? isLive
                      ? "Waiting for fetch activity…"
                      : "No persisted request rows available for this run."
                    : "No requests match this filter in the loaded sample."}
                </p>
              ) : (
                <ScrollArea className="h-[min(50vh,28rem)] rounded-lg border border-border/40">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Status</TableHead>
                        <TableHead className="w-16">Type</TableHead>
                        <TableHead>URL</TableHead>
                        <TableHead className="w-20 text-right">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRequests.map((item, index) => (
                        <TableRow key={`${item.at}-${index}`}>
                          <TableCell>
                            <Badge variant={statusBadgeVariant(item.statusCode, item.errorClass)} title={item.errorMessage ?? undefined}>
                              {formatStatus(item)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {resourceTypeLabel(item.resourceType)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[12rem] truncate font-mono text-xs" title={item.url}>
                            {item.url}
                          </TableCell>
                          <TableCell className="text-right">
                            <Metric className="text-xs text-muted-foreground" unit="ms">
                              {item.totalMs.toFixed(0)}
                            </Metric>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
