import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type MetricProps = HTMLAttributes<HTMLSpanElement> & {
  unit?: string;
};

function Metric({ className, unit, children, ...props }: MetricProps) {
  return (
    <span data-metric className={cn("font-mono tabular-nums tracking-tight", className)} {...props}>
      {children}
      {unit && <span className="ml-0.5 text-[0.85em] font-normal text-muted-foreground">{unit}</span>}
    </span>
  );
}

export { Metric };
