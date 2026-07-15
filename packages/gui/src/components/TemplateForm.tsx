import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { CrawlConfig, Template, TemplateInput } from "@sitebench/core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeader } from "@/components/ui/section-header";

type Props = {
  defaults: CrawlConfig | null;
  template: Template | null;
  onSave: (input: TemplateInput, id?: string) => Promise<void>;
};

type TemplateFormState = Omit<TemplateInput, "maxPages" | "timeLimitSeconds" | "respectRobots"> & {
  maxPages: string;
  timeLimitSeconds: string;
};

function optionalNumber(value: string) {
  if (value.trim() === "") return null;
  return Number(value);
}

export function TemplateForm({ defaults, template, onSave }: Props) {
  const [form, setForm] = useState<TemplateFormState>({
    name: "",
    startUrl: "",
    rpsLimit: defaults?.rpsLimit ?? 2,
    workerCount: defaults?.workerCount ?? 1,
    maxPages: String(defaults?.maxPages ?? 50),
    timeLimitSeconds: defaults?.timeLimitSeconds ? String(defaults.timeLimitSeconds) : "",
    allowImages: defaults?.allowImages ?? false,
    excludePagesFromResults: defaults?.excludePagesFromResults ?? false,
    dedupeRequests: defaults?.dedupeRequests ?? true,
    requestTimeoutMs: defaults?.requestTimeoutMs ?? 30_000,
    connectTimeoutMs: defaults?.connectTimeoutMs ?? 10_000,
    maxRedirects: defaults?.maxRedirects ?? 5,
    maxRetries: defaults?.maxRetries ?? 2,
  });

  useEffect(() => {
    if (!template) {
      setForm((current) => ({
        ...current,
        name: "",
        startUrl: defaults?.startUrl ?? "https://example.com",
        maxPages: String(defaults?.maxPages ?? 50),
        timeLimitSeconds: defaults?.timeLimitSeconds ? String(defaults.timeLimitSeconds) : "",
      }));
      return;
    }
    setForm({
      name: template.name,
      startUrl: template.startUrl,
      rpsLimit: template.rpsLimit,
      workerCount: template.workerCount,
      maxPages: template.maxPages === null ? "" : String(template.maxPages),
      timeLimitSeconds: template.timeLimitSeconds === null ? "" : String(template.timeLimitSeconds),
      allowImages: template.allowImages,
      excludePagesFromResults: template.excludePagesFromResults,
      dedupeRequests: template.dedupeRequests,
      requestTimeoutMs: template.requestTimeoutMs,
      connectTimeoutMs: template.connectTimeoutMs,
      maxRedirects: template.maxRedirects,
      maxRetries: template.maxRetries,
    });
  }, [template, defaults]);

  return (
    <Card>
      <CardHeader className="border-b border-border/40 bg-surface-elevated/50">
        <SectionHeader
          title={template ? "Edit template" : "New template"}
          description="Configure crawl parameters for reusable measurement presets."
        />
      </CardHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(
            {
              ...form,
              maxPages: optionalNumber(form.maxPages),
              timeLimitSeconds: optionalNumber(form.timeLimitSeconds),
              respectRobots: true,
            },
            template?.id,
          );
        }}
      >
        <CardContent className="space-y-5 pt-5">
          <div className="space-y-2">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              name="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-start-url">Start URL</Label>
            <Input
              id="template-start-url"
              name="startUrl"
              value={form.startUrl}
              onChange={(e) => setForm({ ...form, startUrl: e.target.value })}
              required
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-3">
            <div className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">Limits</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="template-rps-limit">RPS limit</Label>
                <Input
                  id="template-rps-limit"
                  name="rpsLimit"
                  type="number"
                  min={1}
                  value={form.rpsLimit}
                  onChange={(e) => setForm({ ...form, rpsLimit: Number(e.target.value) })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-worker-count">Workers</Label>
                <Input
                  id="template-worker-count"
                  name="workerCount"
                  type="number"
                  min={1}
                  max={20}
                  value={form.workerCount}
                  onChange={(e) => setForm({ ...form, workerCount: Number(e.target.value) })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-max-pages">Max pages</Label>
                <Input
                  id="template-max-pages"
                  name="maxPages"
                  type="number"
                  min={1}
                  placeholder="No page limit"
                  value={form.maxPages}
                  onChange={(e) => setForm({ ...form, maxPages: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-time-limit">Time limit (seconds)</Label>
                <Input
                  id="template-time-limit"
                  name="timeLimitSeconds"
                  type="number"
                  min={1}
                  placeholder="No time limit"
                  value={form.timeLimitSeconds}
                  onChange={(e) => setForm({ ...form, timeLimitSeconds: e.target.value })}
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">Network</div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="template-allow-images"
                checked={form.allowImages}
                onCheckedChange={(checked) => setForm({ ...form, allowImages: checked === true })}
              />
              <Label htmlFor="template-allow-images" className="font-normal">
                Fetch images
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="template-exclude-pages-from-results"
                checked={form.excludePagesFromResults}
                onCheckedChange={(checked) =>
                  setForm({ ...form, excludePagesFromResults: checked === true })
                }
              />
              <Label htmlFor="template-exclude-pages-from-results" className="font-normal">
                Exclude HTML pages from saved run data
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="template-dedupe-requests"
                checked={form.dedupeRequests}
                onCheckedChange={(checked) => setForm({ ...form, dedupeRequests: checked === true })}
              />
              <Label htmlFor="template-dedupe-requests" className="font-normal">
                Deduplicate requests
              </Label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="template-request-timeout">Request timeout (ms)</Label>
                <Input
                  id="template-request-timeout"
                  name="requestTimeoutMs"
                  type="number"
                  value={form.requestTimeoutMs}
                  onChange={(e) => setForm({ ...form, requestTimeoutMs: Number(e.target.value) })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-connect-timeout">Connect timeout (ms)</Label>
                <Input
                  id="template-connect-timeout"
                  name="connectTimeoutMs"
                  type="number"
                  value={form.connectTimeoutMs}
                  onChange={(e) => setForm({ ...form, connectTimeoutMs: Number(e.target.value) })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-max-redirects">Max redirects</Label>
                <Input
                  id="template-max-redirects"
                  name="maxRedirects"
                  type="number"
                  min={0}
                  value={form.maxRedirects}
                  onChange={(e) => setForm({ ...form, maxRedirects: Number(e.target.value) })}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-max-retries">Max retries</Label>
                <Input
                  id="template-max-retries"
                  name="maxRetries"
                  type="number"
                  min={0}
                  value={form.maxRetries}
                  onChange={(e) => setForm({ ...form, maxRetries: Number(e.target.value) })}
                  className="font-mono"
                />
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t border-border/40 bg-surface-elevated/30">
          <Button type="submit" className="gap-2">
            <Save className="size-4" />
            Save template
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
