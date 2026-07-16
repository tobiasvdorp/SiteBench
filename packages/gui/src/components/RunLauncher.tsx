import { useState } from "react";
import { Play, Save } from "lucide-react";
import type { CrawlConfig, ResourceType } from "@sitebench/core";
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
import {
  ASSET_RESOURCE_TYPES,
  formToCrawlConfig,
  isPageCrawlBehavior,
  PAGE_CRAWL_BEHAVIOR_DESCRIPTIONS,
  PAGE_CRAWL_BEHAVIOR_LABELS,
  PAGE_CRAWL_BEHAVIORS,
  toggleDedupeResourceType,
  type RunSettingsFormState,
} from "@/lib/run-settings-preferences";

const DEDUPE_TYPE_LABELS: Record<Exclude<ResourceType, "page">, string> = {
  css: "CSS",
  js: "JavaScript",
  font: "Fonts",
  image: "Images",
  other: "Other",
};

type Props = {
  settings: RunSettingsFormState;
  onSettingsChange: (settings: RunSettingsFormState) => void;
  onStart: (runName: string, config: CrawlConfig) => Promise<void>;
  onSaveAsTemplate: (name: string, config: CrawlConfig) => Promise<void>;
};

export function RunLauncher({ settings, onSettingsChange, onStart, onSaveAsTemplate }: Props) {
  const [runName, setRunName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  const updateSettings = (patch: Partial<RunSettingsFormState>) => {
    onSettingsChange({ ...settings, ...patch });
  };

  const handleStart = async () => {
    if (!runName.trim()) return;
    setSubmitting(true);
    try {
      await onStart(runName.trim(), formToCrawlConfig(settings));
      setRunName("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim();
    if (!name) return;

    setSavingTemplate(true);
    try {
      await onSaveAsTemplate(name, formToCrawlConfig(settings));
      setTemplateName("");
      setShowSaveForm(false);
    } finally {
      setSavingTemplate(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/40 bg-surface-elevated/50">
        <CardTitle className="flex items-center gap-2">
          <Play className="size-4 text-primary" />
          Start run
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
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

        <div className="space-y-2">
          <Label htmlFor="start-url">Start URL</Label>
          <Input
            id="start-url"
            name="startUrl"
            value={settings.startUrl}
            onChange={(e) => updateSettings({ startUrl: e.target.value })}
            className="font-mono text-xs"
          />
        </div>

        <div className="space-y-3">
          <div className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">Limits</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rps-limit">RPS limit</Label>
              <Input
                id="rps-limit"
                name="rpsLimit"
                type="number"
                min={1}
                value={settings.rpsLimit}
                onChange={(e) => updateSettings({ rpsLimit: Number(e.target.value) })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="worker-count">Workers</Label>
              <Input
                id="worker-count"
                name="workerCount"
                type="number"
                min={1}
                max={20}
                value={settings.workerCount}
                onChange={(e) => updateSettings({ workerCount: Number(e.target.value) })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-pages">Max pages</Label>
              <Input
                id="max-pages"
                name="maxPages"
                type="number"
                min={1}
                placeholder="No page limit"
                value={settings.maxPages}
                onChange={(e) => updateSettings({ maxPages: e.target.value })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time-limit">Time limit (seconds)</Label>
              <Input
                id="time-limit"
                name="timeLimitSeconds"
                type="number"
                min={1}
                placeholder="No time limit"
                value={settings.timeLimitSeconds}
                onChange={(e) => updateSettings({ timeLimitSeconds: e.target.value })}
                className="font-mono"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">Network</div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="allow-images"
              checked={settings.allowImages}
              onCheckedChange={(checked) => updateSettings({ allowImages: checked === true })}
            />
            <Label htmlFor="allow-images" className="font-normal">
              Fetch images
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="exclude-pages-from-results"
              checked={settings.excludePagesFromResults}
              onCheckedChange={(checked) => updateSettings({ excludePagesFromResults: checked === true })}
            />
            <Label htmlFor="exclude-pages-from-results" className="font-normal">
              Exclude HTML pages from saved run data
            </Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="page-crawl-behavior">Page crawl behavior</Label>
            <Select
              value={settings.pageCrawlBehavior}
              onValueChange={(value) => {
                if (!isPageCrawlBehavior(value)) return;
                updateSettings({ pageCrawlBehavior: value });
              }}
            >
              <SelectTrigger id="page-crawl-behavior" aria-label="Page crawl behavior">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_CRAWL_BEHAVIORS.map((behavior) => (
                  <SelectItem key={behavior} value={behavior}>
                    {PAGE_CRAWL_BEHAVIOR_LABELS[behavior]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {PAGE_CRAWL_BEHAVIOR_DESCRIPTIONS[settings.pageCrawlBehavior]}
            </p>
          </div>
          {settings.pageCrawlBehavior === "bounded-revisits" && (
            <div className="space-y-2">
              <Label htmlFor="max-page-visits">Max visits per page</Label>
              <Input
                id="max-page-visits"
                name="maxPageVisits"
                type="number"
                min={1}
                value={settings.maxPageVisits}
                onChange={(e) => updateSettings({ maxPageVisits: e.target.value })}
                className="font-mono"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Deduplicate assets</Label>
            <p className="text-sm text-muted-foreground">
              Skip asset URLs that were already queued for the selected types.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ASSET_RESOURCE_TYPES.map((type) => {
                const checked = settings.dedupeResourceTypes.includes(type);
                const id = `dedupe-${type}`;
                return (
                  <div key={type} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={checked}
                      onCheckedChange={(value) =>
                        updateSettings({
                          dedupeResourceTypes: toggleDedupeResourceType(
                            settings.dedupeResourceTypes,
                            type,
                            value === true,
                          ),
                        })
                      }
                    />
                    <Label htmlFor={id} className="font-normal">
                      {DEDUPE_TYPE_LABELS[type as Exclude<ResourceType, "page">]}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="request-timeout">Request timeout (ms)</Label>
              <Input
                id="request-timeout"
                name="requestTimeoutMs"
                type="number"
                min={1}
                value={settings.requestTimeoutMs}
                onChange={(e) => updateSettings({ requestTimeoutMs: Number(e.target.value) })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="connect-timeout">Connect timeout (ms)</Label>
              <Input
                id="connect-timeout"
                name="connectTimeoutMs"
                type="number"
                min={1}
                value={settings.connectTimeoutMs}
                onChange={(e) => updateSettings({ connectTimeoutMs: Number(e.target.value) })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-redirects">Max redirects</Label>
              <Input
                id="max-redirects"
                name="maxRedirects"
                type="number"
                min={0}
                value={settings.maxRedirects}
                onChange={(e) => updateSettings({ maxRedirects: Number(e.target.value) })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-retries">Max retries</Label>
              <Input
                id="max-retries"
                name="maxRetries"
                type="number"
                min={0}
                value={settings.maxRetries}
                onChange={(e) => updateSettings({ maxRetries: Number(e.target.value) })}
                className="font-mono"
              />
            </div>
          </div>
        </div>

        {showSaveForm && (
          <div className="space-y-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
            <Input
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Template name"
              aria-label="Template name"
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                void handleSaveTemplate();
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-1.5"
                disabled={!templateName.trim() || savingTemplate}
                onClick={() => void handleSaveTemplate()}
              >
                <Save className="size-3.5" />
                {savingTemplate ? "Saving…" : "Save template"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowSaveForm(false);
                  setTemplateName("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t border-border/40 bg-surface-elevated/30">
        <Button
          type="button"
          className="gap-2 glow-accent"
          disabled={!runName.trim() || submitting}
          onClick={() => void handleStart()}
        >
          <Play className="size-4" />
          {submitting ? "Starting…" : "Start run"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => setShowSaveForm((current) => !current)}
        >
          <Save className="size-4" />
          Save as template
        </Button>
      </CardFooter>
    </Card>
  );
}
