import { Copy, Layers, Trash2 } from "lucide-react";
import type { Template } from "@sitebench/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";

type TemplatesSidebarProps = {
  templates: Template[];
  onLoad: (template: Template) => void;
  onDuplicate: (templateId: string) => Promise<void>;
  onDelete: (templateId: string) => Promise<void>;
};

function formatTemplateSummary(template: Template) {
  const parts = [
    `${template.rpsLimit} RPS`,
    template.maxPages === null ? "no page limit" : `${template.maxPages} pages`,
    template.timeLimitSeconds === null ? "no time limit" : `${template.timeLimitSeconds}s`,
  ];
  return parts.join(" · ");
}

function TemplatesSidebar({ templates, onLoad, onDuplicate, onDelete }: TemplatesSidebarProps) {
  return (
    <Card className="animate-fade-in-up stagger-1 h-fit lg:sticky lg:top-24">
      <SectionHeader
        title="Templates"
        description="Saved presets you can load into the run settings."
        className="p-5 pb-0"
      />
      <CardContent className="space-y-2 pt-4">
        {templates.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-8" />}
            title="No templates yet"
            description="Configure run settings and save them as a template when you want to reuse them."
          />
        ) : (
          templates.map((template) => (
            <div
              key={template.id}
              className="space-y-2 rounded-lg border px-2.5 py-2 transition-all hover:border-primary/30 hover:bg-accent/30"
            >
              <div className="min-w-0">
                <div className="break-words text-sm font-medium leading-snug text-foreground">{template.name}</div>
                <div className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {formatTemplateSummary(template)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 flex-1 px-2 text-xs"
                  onClick={() => onLoad(template)}
                >
                  Load
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={`Duplicate template ${template.name}`}
                  onClick={() => void onDuplicate(template.id)}
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete template ${template.name}`}
                  onClick={() => void onDelete(template.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export { TemplatesSidebar };
