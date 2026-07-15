import type { ReactNode } from "react";
import { Activity, GitCompareArrows, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "runs" | "compare";

type AppShellProps = {
  tab: Tab;
  onNavigate: (tab: Tab) => void;
  onNewRun?: () => void;
  children: ReactNode;
  alerts?: ReactNode;
};

const NAV_ITEMS: { value: Tab; label: string; icon: typeof Activity }[] = [
  { value: "runs", label: "Runs", icon: Activity },
  { value: "compare", label: "Compare", icon: GitCompareArrows },
];

function AppShell({ tab, onNavigate, onNewRun, children, alerts }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border/60 bg-surface-overlay backdrop-blur-md lg:flex">
        <div className="flex flex-col gap-1 p-5">
          <div className="mb-6 flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 glow-accent">
              <Activity className="size-4 text-primary" strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">
                Site<span className="text-primary">Bench</span>
              </div>
              <div className="text-[0.6rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Telemetry
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = tab === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onNavigate(item.value)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    {
                      "bg-primary/10 text-primary shadow-[inset_2px_0_0_0_var(--primary)]": isActive,
                      "text-muted-foreground hover:bg-accent hover:text-foreground": !isActive,
                    },
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="size-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto border-t border-border/60 p-4">
          {onNewRun && (
            <Button className="w-full gap-2 glow-accent" onClick={onNewRun}>
              <Play className="size-4" />
              New run
            </Button>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:pl-56">
        <header className="sticky top-0 z-20 border-b border-border/60 bg-surface-overlay/80 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity className="size-5 text-primary" strokeWidth={2.5} />
              <span className="font-bold tracking-tight">
                Site<span className="text-primary">Bench</span>
              </span>
            </div>
            {onNewRun && (
              <Button size="sm" className="gap-1.5" onClick={onNewRun}>
                <Play className="size-3.5" />
                New run
              </Button>
            )}
          </div>
          <nav className="flex gap-1 overflow-x-auto px-4 pb-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = tab === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => onNavigate(item.value)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    {
                      "bg-primary/10 text-primary": isActive,
                      "text-muted-foreground hover:text-foreground": !isActive,
                    },
                  )}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl space-y-6">
            {alerts}
            <div className="animate-fade-in-up">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

type AppAlertProps = {
  variant: "error" | "notice";
  message: string;
  onDismiss: () => void;
};

function AppAlert({ variant, message, onDismiss }: AppAlertProps) {
  const isError = variant === "error";

  return (
    <div
      role="alert"
      className={cn(
        "animate-fade-in-up flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        {
          "border-destructive/40 bg-destructive/10 text-destructive-foreground": isError,
          "border-success/40 bg-success/10 text-success": !isError,
        },
      )}
    >
      <div className="min-w-0 flex-1">
        {message.split("\n").map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export { AppShell, AppAlert };
export type { Tab };
