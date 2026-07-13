import { cn } from "@/lib/utils";

type LiveIndicatorProps = {
  className?: string;
  label?: string;
};

function LiveIndicator({ className, label = "Live" }: LiveIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-live/30 bg-live/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-widest text-live",
        className,
      )}
    >
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-live-dot rounded-full bg-live" />
        <span className="relative inline-flex size-1.5 rounded-full bg-live" />
      </span>
      {label}
    </span>
  );
}

export { LiveIndicator };
