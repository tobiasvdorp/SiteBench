import { describe, expect, it } from "vitest";
import { HttpMeasurer } from "./http-measurer.js";
import type { HttpTransport } from "./http-measurer.js";
import { emptyCrawlConfig } from "./validation.js";

describe("HttpMeasurer", () => {
  const config = {
    ...emptyCrawlConfig(),
    startUrl: "https://example.com",
    requestTimeoutMs: 1000,
    connectTimeoutMs: 500,
    maxRedirects: 2,
  };

  it("records timings and status from fixture transport", async () => {
    const transport: HttpTransport = async () => ({
      status: 200,
      headers: { "content-type": "text/html" },
      body: (async function* () {
        yield Buffer.from("<html></html>");
      })(),
    });

    const measurer = new HttpMeasurer(config, transport);
    const result = await measurer.measure("https://example.com", "page");
    expect(result.statusCode).toBe(200);
    expect(result.errorClass).toBeNull();
    expect(result.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.bodyText).toContain("html");
  });

  it("follows redirects up to maxRedirects", async () => {
    let calls = 0;
    const transport: HttpTransport = async () => {
      calls += 1;
      if (calls === 1) {
        return { status: 302, headers: { location: "https://example.com/final", "content-type": "" }, body: null };
      }
      return {
        status: 200,
        headers: { "content-type": "text/html", location: "" },
        body: (async function* () {
          yield Buffer.from("ok");
        })(),
      };
    };

    const measurer = new HttpMeasurer(config, transport);
    const result = await measurer.measure("https://example.com/start", "page");
    expect(result.statusCode).toBe(200);
    expect(result.redirectCount).toBe(1);
  });

  it("classifies timeout errors", async () => {
    const transport: HttpTransport = async () => {
      throw new Error("The operation was aborted due to timeout");
    };

    const measurer = new HttpMeasurer(config, transport);
    const result = await measurer.measure("https://example.com", "page");
    expect(result.errorClass).toBe("timeout");
  });

  it("discards image bodies after measurement", async () => {
    const transport: HttpTransport = async () => ({
      status: 200,
      headers: { "content-type": "image/png" },
      body: (async function* () {
        yield Buffer.from("binary");
      })(),
    });

    const measurer = new HttpMeasurer(config, transport);
    const result = await measurer.measure("https://example.com/a.png", "image");
    expect(result.byteCount).toBeGreaterThan(0);
    expect(result.bodyText).toBeNull();
  });
});
