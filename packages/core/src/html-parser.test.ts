import { describe, expect, it } from "vitest";
import { extractAssets, extractCssAssetUrls } from "./html-parser.js";

const origin = "https://example.com";
const pageUrl = "https://example.com/page";

describe("extractAssets", () => {
  const html = `
    <html>
      <head>
        <link rel="stylesheet" href="/style.css">
        <link rel="preload" href="/font.woff2" as="font">
        <link rel="preload" href="/bundle.js" as="script">
        <link rel="modulepreload" href="/module.js">
        <script src="/app.js"></script>
      </head>
      <body>
        <img src="/photo.jpg">
        <img srcset="/small.jpg 1x, /large.jpg 2x">
      </body>
    </html>
  `;

  it("discovers css, js, and font resources regardless of allowImages", () => {
    const assets = extractAssets(html, pageUrl, origin, false);
    const types = new Set(assets.map((asset) => asset.resourceType));

    expect(assets.some((asset) => asset.url.endsWith("/style.css") && asset.resourceType === "css")).toBe(true);
    expect(assets.some((asset) => asset.url.endsWith("/app.js") && asset.resourceType === "js")).toBe(true);
    expect(assets.some((asset) => asset.url.endsWith("/bundle.js") && asset.resourceType === "js")).toBe(true);
    expect(assets.some((asset) => asset.url.endsWith("/module.js") && asset.resourceType === "js")).toBe(true);
    expect(assets.some((asset) => asset.url.endsWith("/font.woff2") && asset.resourceType === "font")).toBe(true);
    expect(types.has("image")).toBe(false);
  });

  it("discovers images when allowImages is true", () => {
    const withoutImages = extractAssets(html, pageUrl, origin, false);
    const withImages = extractAssets(html, pageUrl, origin, true);

    expect(withoutImages.some((asset) => asset.resourceType === "image")).toBe(false);
    expect(withImages.some((asset) => asset.url.endsWith("/photo.jpg"))).toBe(true);
    expect(withImages.some((asset) => asset.url.endsWith("/small.jpg"))).toBe(true);
    expect(withImages.some((asset) => asset.url.endsWith("/large.jpg"))).toBe(false);
  });

  it("picks one width-based srcset candidate for a simulated viewport", () => {
    const srcsetHtml = `
      <img srcset="/640.jpg 640w, /1280.jpg 1280w, /1920.jpg 1920w">
    `;
    const assets = extractAssets(srcsetHtml, pageUrl, origin, true);
    const imageUrls = assets.filter((asset) => asset.resourceType === "image").map((asset) => asset.url);

    expect(imageUrls).toEqual(["https://example.com/1280.jpg"]);
  });

  it("prefers srcset over src on the same img element", () => {
    const htmlWithBoth = `
      <img src="/fallback.jpg" srcset="/small.jpg 1x, /large.jpg 2x">
    `;
    const assets = extractAssets(htmlWithBoth, pageUrl, origin, true);
    const imageUrls = assets.filter((asset) => asset.resourceType === "image").map((asset) => asset.url);

    expect(imageUrls).toEqual(["https://example.com/small.jpg"]);
  });

  it("loads one image from a picture element", () => {
    const pictureHtml = `
      <picture>
        <source srcset="/desktop.jpg 1280w, /desktop-2x.jpg 2560w">
        <source srcset="/mobile.jpg 640w">
        <img src="/fallback.jpg">
      </picture>
    `;
    const assets = extractAssets(pictureHtml, pageUrl, origin, true);
    const imageUrls = assets.filter((asset) => asset.resourceType === "image").map((asset) => asset.url);

    expect(imageUrls).toEqual(["https://example.com/desktop.jpg"]);
  });
});

describe("extractCssAssetUrls", () => {
  it("discovers font urls from css while respecting allowImages", () => {
    const css = '@font-face{font-family:"Fixture";src:url("/font.woff2") format("woff2")}';
    const cssUrl = "https://example.com/style.css";

    const withoutImages = extractCssAssetUrls(css, cssUrl, origin, false);
    const withImages = extractCssAssetUrls(
      `${css} .hero{background-image:url("/hero.jpg")}`,
      cssUrl,
      origin,
      true,
    );

    expect(withoutImages).toHaveLength(1);
    expect(withoutImages[0]?.resourceType).toBe("font");
    expect(withImages.some((asset) => asset.url.endsWith("/hero.jpg"))).toBe(true);
  });
});
