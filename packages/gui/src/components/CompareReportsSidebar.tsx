import { useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import type { Report } from "@sitebench/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/section-header";
import { cn } from "@/lib/utils";

type CompareReportsSidebarProps = {
  reports: Report[];
  activeReportId: string | null;
  canSave: boolean;
  onSelectReport: (report: Report) => void;
  onSaveReport: (name: string) => Promise<void>;
  onDeleteReport: (reportId: string) => Promise<void>;
};

function CompareReportsSidebar({
  reports,
  activeReportId,
  canSave,
  onSelectReport,
  onSaveReport,
  onDeleteReport,
}: CompareReportsSidebarProps) {
  const [saving, setSaving] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [reportName, setReportName] = useState("");

  const handleSave = async () => {
    const name = reportName.trim();
    if (!name) return;

    setSaving(true);
    try {
      await onSaveReport(name);
      setReportName("");
      setShowSaveForm(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="animate-fade-in-up stagger-1 h-fit lg:sticky lg:top-24">
      <SectionHeader
        title="Reports"
        description="Saved comparisons you can reopen later."
        action={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!canSave}
            onClick={() => setShowSaveForm((current) => !current)}
          >
            <Plus className="size-4" />
            Save
          </Button>
        }
        className="p-5 pb-0"
      />
      <CardContent className="space-y-3 pt-4">
        {showSaveForm && (
          <div className="space-y-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
            <Input
              value={reportName}
              onChange={(event) => setReportName(event.target.value)}
              placeholder="Report name"
              aria-label="Report name"
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                void handleSave();
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" disabled={!reportName.trim() || saving} onClick={() => void handleSave()}>
                {saving ? "Saving..." : "Save report"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowSaveForm(false);
                  setReportName("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {reports.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-8" />}
            title="No reports yet"
            description="Save the current comparison to create your first report."
          />
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <div
                key={report.id}
                className={cn(
                  "flex items-center gap-1 rounded-lg border px-2 py-1.5 transition-all hover:border-primary/30 hover:bg-accent/30",
                  {
                    "border-primary/40 bg-primary/5 ring-1 ring-primary/20": activeReportId === report.id,
                  },
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 px-1 py-0.5 text-left"
                  onClick={() => onSelectReport(report)}
                >
                  <div className="truncate font-medium leading-tight">{report.name}</div>
                  <div className="truncate text-[0.65rem] text-muted-foreground/80">
                    {report.runIds.length} run{report.runIds.length === 1 ? "" : "s"}
                    {" · "}
                    {new Date(report.updatedAt).toLocaleDateString()}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete report ${report.name}`}
                  onClick={() => void onDeleteReport(report.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { CompareReportsSidebar };
