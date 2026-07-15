import { useState } from "react";
import { Button } from "@/components/ui/button";

type ReportChangesBarProps = {
  reportName: string;
  onSave: () => Promise<void>;
  onDiscard: () => void;
};

function ReportChangesBar({ reportName, onSave, onDiscard }: ReportChangesBarProps) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Unsaved changes to <span className="font-medium text-foreground">{reportName}</span>
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={saving} onClick={onDiscard}>
          Discard
        </Button>
        <Button size="sm" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

export { ReportChangesBar };
