import type { CrawlConfig, RunConfigSnapshot } from "@sitebench/core";

export function snapshotToCrawlConfig(snapshot: RunConfigSnapshot): CrawlConfig {
  const {
    templateId: _templateId,
    templateName: _templateName,
    runName: _runName,
    siteOrigin: _siteOrigin,
    ...config
  } = snapshot;
  return config;
}

export function getNextRerunName(runName: string, existingNames: readonly string[]) {
  const baseName = runName.replace(/\(\d+\)$/, "");
  const escapedBase = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedBase}(?:\\((\\d+)\\))?$`);

  let maxSuffix = 1;
  for (const name of existingNames) {
    const match = name.match(pattern);
    if (!match) continue;
    const suffix = match[1] ? Number(match[1]) : 1;
    if (suffix >= maxSuffix) maxSuffix = suffix + 1;
  }

  return `${baseName}(${maxSuffix})`;
}
