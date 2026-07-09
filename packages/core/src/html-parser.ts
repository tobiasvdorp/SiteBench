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

const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
const MAX_CSS_DISCOVERED_URLS = 20;

function isSameOriginUrl(url: string, origin: string) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function addAsset(
  assets: Map<string, DiscoveredAsset>,
  rawUrl: string | undefined,
  pageUrl: string,
  origin: string,
  fallbackType: ResourceType,
  allowImages: boolean,
) {
  if (!rawUrl || rawUrl.startsWith("data:")) return;
  const normalized = normalizeUrl(rawUrl, pageUrl);
  if (!normalized || !isSameOriginUrl(normalized, origin)) return;

  const resourceType = fallbackType === "other" ? detectResourceType(normalized) : fallbackType;
  if (resourceType === "image" && !allowImages) return;

  assets.set(normalized, { url: normalized, resourceType });
}

export function extractPageLinks(html: string, pageUrl: string, origin: string): DiscoveredLink[] {
  const $ = loadCheerio(html);
  const links = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    const normalized = normalizeUrl(href, pageUrl);
    if (!normalized || !isSameOriginUrl(normalized, origin)) return;
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

  const add = (rawUrl: string | undefined, fallbackType: ResourceType) => {
    addAsset(assets, rawUrl, pageUrl, origin, fallbackType, allowImages);
  };

  $('link[rel="stylesheet"]').each((_, el) => add($(el).attr("href"), "css"));
  $("script[src]").each((_, el) => add($(el).attr("src"), "js"));

  $('link[rel="preload"], link[rel="modulepreload"]').each((_, el) => {
    const rel = ($(el).attr("rel") ?? "").toLowerCase();
    const as = ($(el).attr("as") ?? "").toLowerCase();
    if (rel === "modulepreload") {
      add($(el).attr("href"), "js");
      return;
    }
    if (as === "font") add($(el).attr("href"), "font");
    else if (as === "style") add($(el).attr("href"), "css");
    else if (as === "script") add($(el).attr("href"), "js");
  });

  if (allowImages) {
    $("img[src]").each((_, el) => add($(el).attr("src"), "image"));
    $("img[srcset], source[srcset]").each((_, el) => {
      const srcset = $(el).attr("srcset");
      if (!srcset) return;
      for (const part of srcset.split(",")) {
        const candidate = part.trim().split(/\s+/)[0];
        add(candidate, "image");
      }
    });
    $('link[rel="icon"], link[rel="apple-touch-icon"]').each((_, el) => add($(el).attr("href"), "image"));
  }

  return [...assets.values()];
}

export function extractCssAssetUrls(
  css: string,
  cssUrl: string,
  origin: string,
  allowImages: boolean,
  maxUrls = MAX_CSS_DISCOVERED_URLS,
): DiscoveredAsset[] {
  const assets = new Map<string, DiscoveredAsset>();
  let matches = 0;

  for (const match of css.matchAll(CSS_URL_PATTERN)) {
    if (matches >= maxUrls) break;
    matches += 1;
    const rawUrl = match[2]?.trim();
    if (!rawUrl) continue;
    addAsset(assets, rawUrl, cssUrl, origin, "other", allowImages);
  }

  return [...assets.values()];
}
