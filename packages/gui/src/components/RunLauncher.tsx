import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import type { CrawlConfig, Template } from "@sitebench/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  | "maxPages"
  | "timeLimitSeconds"
  | "allowImages"
  | "respectRobots"
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
    maxPages: template.maxPages,
    timeLimitSeconds: template.timeLimitSeconds,
    allowImages: template.allowImages,
    respectRobots: template.respectRobots,
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
  if (currentMaxPages !== base.maxPages) overrides.maxPages = currentMaxPages;
  if (currentTimeLimitSeconds !== base.timeLimitSeconds) overrides.timeLimitSeconds = currentTimeLimitSeconds;
  if (current.allowImages !== base.allowImages) overrides.allowImages = current.allowImages;
  if (current.respectRobots !== base.respectRobots) overrides.respectRobots = current.respectRobots;
  if (current.requestTimeoutMs !== base.requestTimeoutMs) overrides.requestTimeoutMs = current.requestTimeoutMs;
  if (current.connectTimeoutMs !== base.connectTimeoutMs) overrides.connectTimeoutMs = current.connectTimeoutMs;
  if (current.maxRedirects !== base.maxRedirects) overrides.maxRedirects = current.maxRedirects;
  if (current.maxRetries !== base.maxRetries) overrides.maxRetries = current.maxRetries;
  return overrides;
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
          <CardTitle>Start run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Create a template first to configure crawl settings, then start measuring your site.
          </p>
          {onCreateTemplate && (
            <Button variant="outline" size="sm" onClick={onCreateTemplate}>
              Create template
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start run</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{selectedTemplate.name}</p>
                <p className="truncate text-xs text-muted-foreground">{selectedTemplate.startUrl}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onEditTemplate(selectedTemplate.id)}
                aria-label={`Edit template ${selectedTemplate.name}`}
              >
                <Pencil className="size-4" />
                Edit template
              </Button>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">RPS limit</dt>
                <dd className="font-medium">{selectedTemplate.rpsLimit}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Max pages</dt>
                <dd className="font-medium">{selectedTemplate.maxPages ?? "None"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Time limit</dt>
                <dd className="font-medium">
                  {selectedTemplate.timeLimitSeconds ? `${selectedTemplate.timeLimitSeconds}s` : "None"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Images</dt>
                <dd className="font-medium">{selectedTemplate.allowImages ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Robots.txt</dt>
                <dd className="font-medium">{selectedTemplate.respectRobots ? "Respected" : "Ignored"}</dd>
              </div>
            </dl>
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
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="run-show-overrides"
            checked={showOverrides}
            onCheckedChange={(checked) => setShowOverrides(checked === true)}
          />
          <Label htmlFor="run-show-overrides" className="font-normal">
            Override settings for this run only
          </Label>
        </div>

        {showOverrides && overrides && (
          <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              Only changed fields are sent as overrides. Unchanged values use the selected template.
            </p>
            <div className="space-y-2">
              <Label htmlFor="override-start-url">Start URL</Label>
              <Input
                id="override-start-url"
                name="startUrl"
                value={overrides.startUrl}
                onChange={(e) => setOverrides({ ...overrides, startUrl: e.target.value })}
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
                Fetch images and srcset candidates
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="override-respect-robots"
                checked={overrides.respectRobots}
                onCheckedChange={(checked) => setOverrides({ ...overrides, respectRobots: checked === true })}
              />
              <Label htmlFor="override-respect-robots" className="font-normal">
                Respect robots.txt
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
                />
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          disabled={!runName.trim() || !templateId || submitting}
          onClick={() => void handleStart()}
        >
          {submitting ? "Starting…" : "Start run"}
        </Button>
      </CardFooter>
    </Card>
  );
}
