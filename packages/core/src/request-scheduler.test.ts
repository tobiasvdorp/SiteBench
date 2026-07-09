import { describe, expect, it } from "vitest";
import { RequestScheduler } from "./request-scheduler.js";

describe("RequestScheduler", () => {
  it("spaces requests according to RPS limit", async () => {
    const scheduler = new RequestScheduler(5);
    const timestamps: number[] = [];

    for (let i = 0; i < 5; i++) {
      await scheduler.acquire();
      timestamps.push(Date.now());
    }

    for (let i = 1; i < timestamps.length; i++) {
      const delta = timestamps[i] - timestamps[i - 1];
      expect(delta).toBeGreaterThanOrEqual(150);
    }
  });
});
