import { useEffect, useMemo, useState } from "react";
import type { RequestRecord, Run, SlowPagePatternConfidence } from "@sitebench/core";
import { analyzeSlowPages } from "@sitebench/core/slow-page-patterns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Metric } from "@/components/ui/metric";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getRunRequests } from "@/lib/api";

type Props = {
  run: Run;
  isLive: boolean;
};

function confidenceVariant(confidence: SlowPagePatternConfidence) {
  if (confidence === "high") return "destructive" as const;
  if (confidence === "medium") return "warning" as const;
  return "secondary" as const;
}

function formatBytes(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function headerEntries(headers: RequestRecord["responseHeaders"] | undefined) {
  return Object.entries(headers ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

function SlowPageDetails({ page }: { page: RequestRecord }) {
  const [open, setOpen] = useState(false);
  const headers = headerEntries(page.responseHeaders);

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen((value) => !value)}>
        <TableCell className="w-8">
          {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        </TableCell>
        <TableCell className="max-w-[10rem] truncate font-mono text-xs" title={page.url}>
          {page.url}
        </TableCell>
        <TableCell>
          <Badge variant={page.errorClass ? "destructive" : page.statusCode && page.statusCode >= 400 ? "destructive" : "success"}>
            {page.errorClass ?? page.statusCode ?? "—"}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <Metric className="text-xs font-medium text-destructive" unit="ms">
            {page.timings.totalMs.toFixed(0)}
          </Metric>
        </TableCell>
        <TableCell className="text-right">
          <Metric className="text-xs text-muted-foreground" unit="ms">
            {page.timings.ttfbMs?.toFixed(0) ?? "—"}
          </Metric>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={5} className="p-0">
            <div className="space-y-3 p-4 text-xs">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">TTFB</div>
                  <Metric unit="ms">{page.timings.ttfbMs?.toFixed(1) ?? "—"}</Metric>
                </div>
                <div>
                  <div className="text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">Total</div>
                  <Metric unit="ms">{page.timings.totalMs.toFixed(1)}</Metric>
                </div>
                <div>
                  <div className="text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">Size</div>
                  <div className="font-mono">{formatBytes(page.byteCount)}</div>
                </div>
                <div>
                  <div className="text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">Redirects</div>
                  <div className="font-mono">{page.redirectCount}</div>
                </div>
              </div>

              {page.contentType && (
                <div>
                  <div className="text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">Content-Type</div>
                  <div className="font-mono">{page.contentType}</div>
                </div>
              )}

              {page.errorMessage && (
                <div>
                  <div className="text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">Error</div>
                  <div className="font-mono text-destructive">{page.errorMessage}</div>
                </div>
              )}

              <div>
                <div className="mb-2 text-[0.6rem] font-medium uppercase tracking-widest text-muted-foreground">
                  Response headers {headers.length > 0 ? `(${headers.length})` : ""}
                </div>
                {headers.length === 0 ? (
                  <p className="text-muted-foreground">No headers stored for this request.</p>
                ) : (
                  <div className="max-h-48 overflow-auto rounded-md border border-border/40 bg-background/60">
                    <table className="w-full text-left">
                      <tbody>
                        {headers.map(([key, value]) => (
                          <tr key={key} className="border-b border-border/30 last:border-0">
                            <td className="px-3 py-1.5 align-top font-mono text-muted-foreground">{key}</td>
                            <td className="px-3 py-1.5 font-mono break-all">{String(value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function SlowPagesPanel({ run, isLive }: Props) {
  const [pages, setPages] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLive) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const loaded = await getRunRequests(run.id, { resourceType: "page" });
        if (!cancelled) setPages(loaded);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Failed to load pages");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [run.id, isLive]);

  const analysis = useMemo(() => analyzeSlowPages(pages), [pages]);

  if (isLive) {
    return (
      <p className="text-sm text-muted-foreground">
        Slow page analysis with headers is available after the run completes.
      </p>
    );
  }

  if (run.configSnapshot.excludePagesFromResults) {
    return (
      <p className="text-sm text-muted-foreground">
        This run excluded pages from stored results. Re-run without that option to analyze slow pages.
      </p>
    );
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading page requests…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (pages.length === 0) return <p className="text-sm text-muted-foreground">No page requests recorded for this run.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="surface-inset space-y-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">Slow threshold</span>
          <Badge variant="outline" className="font-mono">
            ≥ {analysis.thresholdMs.toFixed(0)} ms
          </Badge>
          <span className="text-xs text-muted-foreground">
            {analysis.slowPages.length} of {pages.length} pages
          </span>
        </div>

        {analysis.patterns.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[0.65rem] font-medium uppercase tracking-widest text-muted-foreground">
              Detected patterns
            </div>
            <div className="flex flex-wrap gap-2">
              {analysis.patterns.map((pattern) => (
                <div
                  key={`${pattern.dimension}:${pattern.value}`}
                  className="rounded-md border border-border/50 bg-background/70 px-2.5 py-1.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={confidenceVariant(pattern.confidence)} className="text-[0.65rem]">
                      {pattern.confidence}
                    </Badge>
                    <span className="text-xs font-medium">{pattern.label}</span>
                  </div>
                  <div className="mt-1 font-mono text-[0.65rem] text-muted-foreground">
                    {pattern.slowCount}/{pattern.totalCount} slow · {pattern.enrichment.toFixed(1)}× enriched · avg{" "}
                    {pattern.avgLatencyMs.toFixed(0)} ms
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : analysis.slowPages.length > 0 ? (
          <p className="text-xs text-muted-foreground">No strong shared patterns among slow pages.</p>
        ) : (
          <p className="text-xs text-muted-foreground">No pages exceeded the slow threshold for this run.</p>
        )}
      </div>

      {analysis.slowPages.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>URL</TableHead>
                <TableHead className="w-16">Status</TableHead>
                <TableHead className="w-20 text-right">Total</TableHead>
                <TableHead className="w-20 text-right">TTFB</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analysis.slowPages.map((page) => (
                <SlowPageDetails key={page.id} page={page} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
