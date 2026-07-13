import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Pencil, Play, Settings2 } from "lucide-react";
import type { CrawlConfig, Template } from "@sitebench/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  templates: Template[];
  onStart: (runName: string, templateId: string, overrides?: Partial<CrawlConfig>) => Promise<void>;
  onEditTemplate: (templateId: string) => void;
  onCreateTemplate?: () => void;
};

type OverrideFields = Pick<
  CrawlConfig,
  | "startUrl"
  | "rpsLimit"
  | "workerCount"
  | "maxPages"
  | "timeLimitSeconds"
  | "allowImages"
  | "excludePagesFromResults"
  | "requestTimeoutMs"
  | "connectTimeoutMs"
  | "maxRedirects"
  | "maxRetries"
>;

type OverrideFormFields = Omit<OverrideFields, "maxPages" | "timeLimitSeconds"> & {
  maxPages: string;
  timeLimitSeconds: string;
};

function templateToOverrides(template: Template): OverrideFields {
  return {
    startUrl: template.startUrl,
    rpsLimit: template.rpsLimit,
    workerCount: template.workerCount,
    maxPages: template.maxPages,
    timeLimitSeconds: template.timeLimitSeconds,
    allowImages: template.allowImages,
    excludePagesFromResults: template.excludePagesFromResults,
    requestTimeoutMs: template.requestTimeoutMs,
    connectTimeoutMs: template.connectTimeoutMs,
    maxRedirects: template.maxRedirects,
    maxRetries: template.maxRetries,
  };
}

function templateToOverrideForm(template: Template): OverrideFormFields {
  return {
    ...templateToOverrides(template),
    maxPages: template.maxPages === null ? "" : String(template.maxPages),
    timeLimitSeconds: template.timeLimitSeconds === null ? "" : String(template.timeLimitSeconds),
  };
}

function optionalNumber(value: string) {
  if (value.trim() === "") return null;
  return Number(value);
}

function diffOverrides(base: OverrideFields, current: OverrideFormFields): Partial<CrawlConfig> {
  const currentMaxPages = optionalNumber(current.maxPages);
  const currentTimeLimitSeconds = optionalNumber(current.timeLimitSeconds);
  const overrides: Partial<CrawlConfig> = {};
  if (current.startUrl !== base.startUrl) overrides.startUrl = current.startUrl;
  if (current.rpsLimit !== base.rpsLimit) overrides.rpsLimit = current.rpsLimit;
  if (current.workerCount !== base.workerCount) overrides.workerCount = current.workerCount;
  if (currentMaxPages !== base.maxPages) overrides.maxPages = currentMaxPages;
  if (currentTimeLimitSeconds !== base.timeLimitSeconds) overrides.timeLimitSeconds = currentTimeLimitSeconds;
  if (current.allowImages !== base.allowImages) overrides.allowImages = current.allowImages;
  if (current.excludePagesFromResults !== base.excludePagesFromResults) {
    overrides.excludePagesFromResults = current.excludePagesFromResults;
  }
  if (current.requestTimeoutMs !== base.requestTimeoutMs) overrides.requestTimeoutMs = current.requestTimeoutMs;
  if (current.connectTimeoutMs !== base.connectTimeoutMs) overrides.connectTimeoutMs = current.connectTimeoutMs;
  if (current.maxRedirects !== base.maxRedirects) overrides.maxRedirects = current.maxRedirects;
  if (current.maxRetries !== base.maxRetries) overrides.maxRetries = current.maxRetries;
  return overrides;
}

function formatTemplateConfigSummary(template: Template) {
  const parts = [
    `${template.rpsLimit} RPS`,
    `${template.workerCount} workers`,
    template.maxPages === null ? "no page limit" : `${template.maxPages} pages`,
    template.timeLimitSeconds === null ? "no time limit" : `${template.timeLimitSeconds}s`,
    template.allowImages ? "images" : "no images",
    template.excludePagesFromResults ? "assets only" : "all requests",
  ];
  return parts.join(" · ");
}

export function RunLauncher({ templates, onStart, onEditTemplate, onCreateTemplate }: Props) {
  const [runName, setRunName] = useState("");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [showOverrides, setShowOverrides] = useState(false);
  const [overrides, setOverrides] = useState<OverrideFormFields | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templates, templateId],
  );

  useEffect(() => {
    if (templates.length === 0) return;
    if (templates.some((template) => template.id === templateId)) return;
    setTemplateId(templates[0].id);
  }, [templates, templateId]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setOverrides(templateToOverrideForm(selectedTemplate));
  }, [selectedTemplate]);

  const handleStart = async () => {
    if (!runName.trim() || !templateId || !selectedTemplate || !overrides) return;
    setSubmitting(true);
    try {
      const payloadOverrides = showOverrides ? diffOverrides(templateToOverrides(selectedTemplate), overrides) : undefined;
      await onStart(runName.trim(), templateId, payloadOverrides);
      setRunName("");
      setShowOverrides(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (templates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="size-4 text-primary" />
            Start run
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No templates configured"
            description="Create a template first to configure crawl settings, then start measuring your site."
            action={
              onCreateTemplate && (
                <Button variant="outline" size="sm" onClick={onCreateTemplate}>
                  Create template
                </Button>
              )
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/40 bg-surface-elevated/50">
        <CardTitle className="flex items-center gap-2">
          <Play className="size-4 text-primary" />
          Start run
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="space-y-2">
          <Label htmlFor="run-template">Template</Label>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger id="run-template">
              <SelectValue placeholder="Select a template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedTemplate && (
          <div className="surface-inset px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium leading-tight">{selectedTemplate.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{selectedTemplate.startUrl}</p>
                <p className="text-[0.65rem] text-muted-foreground/80">
                  {formatTemplateConfigSummary(selectedTemplate)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => onEditTemplate(selectedTemplate.id)}
                aria-label={`Edit template ${selectedTemplate.name}`}
              >
                <Pencil className="size-3.5" />
                Edit
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="run-name">Run name</Label>
          <Input
            id="run-name"
            name="runName"
            value={runName}
            onChange={(e) => setRunName(e.target.value)}
            placeholder="e.g. deploy-2026-07-09"
            className="font-mono"
          />
        </div>

        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-accent/30"
          onClick={() => setShowOverrides((current) => !current)}
        >
          <Settings2 className="size-4 text-muted-foreground" />
          <span className="flex-1 text-left">Override settings for this run only</span>
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform", {
              "rotate-180": showOverrides,
            })}
          />
        </button>

        {showOverrides && overrides && (
          <div className="space-y-4 surface-inset p-4">
            <p className="text-xs text-muted-foreground">
              Only changed fields are sent as overrides. Unchanged values use the selected template.
            </p>
            <div className="space-y-2">
              <Label htmlFor="override-start-url">Start URL</Label>
              <Input
                id="override-start-url"
                name="startUrl"
                value={overrides.startUrl}
                onChange={(e) => setOverrides({ ...overrides, startUrl: e.target.value })}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="override-rps-limit">RPS limit</Label>
                <Input
                  id="override-rps-limit"
                  name="rpsLimit"
                  type="number"
                  min={1}
                  value={overrides.rpsLimit}
                  onChange={(e) => setOverrides({ ...overrides, rpsLimit: Number(e.target.value) })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="override-worker-count">Workers</Label>
                <Input
                  id="override-worker-count"
                  name="workerCount"
                  type="number"
                  min={1}
                  max={20}
                  value={overrides.workerCount}
                  onChange={(e) => setOverrides({ ...overrides, workerCount: Number(e.target.value) })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="override-max-pages">Max pages</Label>
                <Input
                  id="override-max-pages"
                  name="maxPages"
                  type="number"
                  min={1}
                  placeholder="No page limit"
                  value={overrides.maxPages}
                  onChange={(e) => setOverrides({ ...overrides, maxPages: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="override-time-limit">Time limit (seconds)</Label>
                <Input
                  id="override-time-limit"
                  name="timeLimitSeconds"
                  type="number"
                  min={1}
                  placeholder="No time limit"
                  value={overrides.timeLimitSeconds}
                  onChange={(e) => setOverrides({ ...overrides, timeLimitSeconds: e.target.value })}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="override-allow-images"
                checked={overrides.allowImages}
                onCheckedChange={(checked) => setOverrides({ ...overrides, allowImages: checked === true })}
              />
              <Label htmlFor="override-allow-images" className="font-normal">
                Fetch images
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="override-exclude-pages-from-results"
                checked={overrides.excludePagesFromResults}
                onCheckedChange={(checked) =>
                  setOverrides({ ...overrides, excludePagesFromResults: checked === true })
                }
              />
              <Label htmlFor="override-exclude-pages-from-results" className="font-normal">
                Exclude HTML pages from saved run data
              </Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="override-request-timeout">Request timeout (ms)</Label>
                <Input
                  id="override-request-timeout"
                  name="requestTimeoutMs"
                  type="number"
                  min={1}
                  value={overrides.requestTimeoutMs}
                  onChange={(e) => setOverrides({ ...overrides, requestTimeoutMs: Number(e.target.value) })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="override-connect-timeout">Connect timeout (ms)</Label>
                <Input
                  id="override-connect-timeout"
                  name="connectTimeoutMs"
                  type="number"
                  min={1}
                  value={overrides.connectTimeoutMs}
                  onChange={(e) => setOverrides({ ...overrides, connectTimeoutMs: Number(e.target.value) })}
                  className="font-mono"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="override-max-redirects">Max redirects</Label>
                <Input
                  id="override-max-redirects"
                  name="maxRedirects"
                  type="number"
                  min={0}
                  value={overrides.maxRedirects}
                  onChange={(e) => setOverrides({ ...overrides, maxRedirects: Number(e.target.value) })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="override-max-retries">Max retries</Label>
                <Input
                  id="override-max-retries"
                  name="maxRetries"
                  type="number"
                  min={0}
                  value={overrides.maxRetries}
                  onChange={(e) => setOverrides({ ...overrides, maxRetries: Number(e.target.value) })}
                  className="font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t border-border/40 bg-surface-elevated/30">
        <Button
          type="button"
          className="gap-2 glow-accent"
          disabled={!runName.trim() || !templateId || submitting}
          onClick={() => void handleStart()}
        >
          <Play className="size-4" />
          {submitting ? "Starting…" : "Start run"}
        </Button>
      </CardFooter>
    </Card>
  );
}
