import type { Run } from "@sitebench/core";
import { Badge } from "@/components/ui/badge";
import { LiveIndicator } from "@/components/ui/live-indicator";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: Run["status"];
  className?: string;
  showLiveIndicator?: boolean;
};

function statusVariant(status: Run["status"]) {
  if (status === "completed") return "success" as const;
  if (status === "running") return "live" as const;
  if (status === "failed") return "destructive" as const;
  if (status === "stopped") return "muted" as const;
  return "outline" as const;
}

function StatusBadge({ status, className, showLiveIndicator = true }: StatusBadgeProps) {
  const isLive = status === "running" || status === "pending";

  if (isLive && showLiveIndicator) {
    return <LiveIndicator className={className} label={status === "pending" ? "Pending" : "Running"} />;
  }

  return (
    <Badge variant={statusVariant(status)} className={cn("capitalize", className)}>
      {status}
    </Badge>
  );
}

export { StatusBadge };
