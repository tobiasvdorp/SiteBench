import { load as loadCheerio } from "cheerio";
import { detectResourceType, normalizeUrl } from "./utils.js";
import type { ResourceType } from "./types.js";

export type DiscoveredLink = {
  url: string;
  resourceType: "page";
};

export type DiscoveredAsset = {
  url: string;
  resourceType: ResourceType;
};

export function extractPageLinks(html: string, pageUrl: string, origin: string): DiscoveredLink[] {
  const $ = loadCheerio(html);
  const links = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    const normalized = normalizeUrl(href, pageUrl);
    if (!normalized) return;
    try {
      if (new URL(normalized).origin !== origin) return;
    } catch {
      return;
    }
    links.add(normalized);
  });

  return [...links].map((url) => ({ url, resourceType: "page" as const }));
}

export function extractAssets(
  html: string,
  pageUrl: string,
  origin: string,
  allowImages: boolean,
): DiscoveredAsset[] {
  const $ = loadCheerio(html);
  const assets = new Map<string, DiscoveredAsset>();

  const addAsset = (rawUrl: string | undefined, fallbackType: ResourceType) => {
    if (!rawUrl || rawUrl.startsWith("data:")) return;
    const normalized = normalizeUrl(rawUrl, pageUrl);
    if (!normalized) return;
    try {
      if (new URL(normalized).origin !== origin) return;
    } catch {
      return;
    }
    const resourceType = fallbackType === "other" ? detectResourceType(normalized) : fallbackType;
    if (resourceType === "image" && !allowImages) return;
    assets.set(normalized, { url: normalized, resourceType });
  };

  $('link[rel="stylesheet"]').each((_, el) => addAsset($(el).attr("href"), "css"));
  $("script[src]").each((_, el) => addAsset($(el).attr("src"), "js"));
  $('link[rel="preload"][as="font"], link[rel="preload"][as="style"]').each((_, el) => {
    const as = $(el).attr("as");
    addAsset($(el).attr("href"), as === "font" ? "font" : "css");
  });

  if (allowImages) {
    $("img[src]").each((_, el) => addAsset($(el).attr("src"), "image"));
    $("img[srcset], source[srcset]").each((_, el) => {
      const srcset = $(el).attr("srcset");
      if (!srcset) return;
      for (const part of srcset.split(",")) {
        const candidate = part.trim().split(/\s+/)[0];
        addAsset(candidate, "image");
      }
    });
  }

  return [...assets.values()];
}
