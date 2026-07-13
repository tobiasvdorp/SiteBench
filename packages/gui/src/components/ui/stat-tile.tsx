import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Metric } from "@/components/ui/metric";

type StatTileProps = HTMLAttributes<HTMLDivElement> & {
  label: string;
  value: ReactNode;
  unit?: string;
  live?: boolean;
  accent?: boolean;
};

function StatTile({ label, value, unit, live, accent, className, ...props }: StatTileProps) {
  return (
    <div
      className={cn(
        "surface-inset relative overflow-hidden p-3 transition-colors",
        {
          "animate-pulse-glow border-live/30": live,
          "border-primary/20 bg-primary/5": accent,
        },
        className,
      )}
      {...props}
    >
      <div className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold leading-none">
        {typeof value === "string" || typeof value === "number" ? (
          <Metric unit={unit}>{value}</Metric>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

export { StatTile };
