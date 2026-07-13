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
const DEFAULT_SRCSET_SLOT_WIDTH = 1280;
const DEFAULT_SRCSET_DPR = 1;

type SrcsetCandidate = {
  url: string;
  width: number | null;
  density: number | null;
};

function parseSrcset(srcset: string): SrcsetCandidate[] {
  const candidates: SrcsetCandidate[] = [];

  for (const part of srcset.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const pieces = trimmed.split(/\s+/);
    const url = pieces[0];
    if (!url) continue;

    let width: number | null = null;
    let density: number | null = null;
    for (const piece of pieces.slice(1)) {
      if (piece.endsWith("w")) width = Number(piece.slice(0, -1));
      else if (piece.endsWith("x")) density = Number(piece.slice(0, -1));
    }

    candidates.push({ url, width, density });
  }

  return candidates;
}

function pickSrcsetCandidate(
  candidates: SrcsetCandidate[],
  slotWidth = DEFAULT_SRCSET_SLOT_WIDTH,
  dpr = DEFAULT_SRCSET_DPR,
): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].url;

  const withWidth = candidates.filter((candidate) => candidate.width !== null);
  if (withWidth.length > 0) {
    const targetWidth = slotWidth * dpr;
    const sorted = [...withWidth].sort((a, b) => a.width! - b.width!);
    const match = sorted.find((candidate) => candidate.width! >= targetWidth);
    return (match ?? sorted[sorted.length - 1]).url;
  }

  const withDensity = candidates.filter((candidate) => candidate.density !== null);
  if (withDensity.length > 0) {
    const sorted = [...withDensity].sort((a, b) => a.density! - b.density!);
    const match = sorted.find((candidate) => candidate.density! >= dpr);
    return (match ?? sorted[sorted.length - 1]).url;
  }

  return candidates[0].url;
}

function addSrcsetAsset(
  assets: Map<string, DiscoveredAsset>,
  srcset: string | undefined,
  pageUrl: string,
  origin: string,
  allowImages: boolean,
) {
  if (!srcset) return;
  const picked = pickSrcsetCandidate(parseSrcset(srcset));
  if (!picked) return;
  addAsset(assets, picked, pageUrl, origin, "image", allowImages);
}

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
    $("picture").each((_, picture) => {
      const $picture = $(picture);
      const sources = $picture.find("source[srcset]").toArray();
      for (const source of sources) {
        const srcset = $(source).attr("srcset");
        if (!srcset) continue;
        const picked = pickSrcsetCandidate(parseSrcset(srcset));
        if (picked) {
          add(picked, "image");
          return;
        }
      }
      add($picture.find("img").attr("src"), "image");
    });

    $("img").each((_, el) => {
      if ($(el).parents("picture").length > 0) return;

      const srcset = $(el).attr("srcset");
      if (srcset) {
        addSrcsetAsset(assets, srcset, pageUrl, origin, allowImages);
        return;
      }

      add($(el).attr("src"), "image");
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
