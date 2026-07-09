import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFixtureServer, type FixtureServer } from "../../core/src/test-support/fixture-server.js";
import { parseCreatedId, parseRunListRow, runCli } from "./test-support/run-cli.js";

describe("run start CLI integration", () => {
  let fixture: FixtureServer;
  let dbDir: string;
  let dbPath: string;

  beforeAll(async () => {
    fixture = await startFixtureServer();
    dbDir = mkdtempSync(join(tmpdir(), "sitebench-cli-run-"));
    dbPath = join(dbDir, "test.db");
  });

  afterAll(async () => {
    await fixture.close();
    rmSync(dbDir, { recursive: true, force: true });
  });

  async function createFixtureTemplate(name = "Fixture") {
    const result = await runCli(
      [
        "template",
        "create",
        "--name",
        name,
        "--url",
        `${fixture.baseUrl}/`,
        "--respect-robots",
        "false",
        "--max-pages",
        "2",
        "--rps",
        "10",
      ],
      { dbPath },
    );

    expect(result.exitCode).toBe(0);

    const templateId = parseCreatedId(result.stdout, "tpl");
    if (!templateId) throw new Error(`Template id not found in: ${result.stdout}`);

    return templateId;
  }

  it("starts a run from a template and completes with summary output", async () => {
    const templateId = await createFixtureTemplate();
    const runName = "deploy-a";

    const result = await runCli(
      ["run", "start", "--name", runName, "--template", templateId],
      { dbPath, timeoutMs: 30_000 },
    );

    const combined = `${result.stdout}\n${result.stderr}`;
    expect(result.exitCode).toBe(0);
    expect(combined).toMatch(/Pages:\s+\d+\/\d+/);
    expect(combined).toMatch(/Requests:\s+\d+/);
    expect(combined).toMatch(/Status:\s+completed/);
    expect(combined).toMatch(/Requests:\s+\d+,\s+Errors:\s+\d+,\s+Pages:\s+\d+/);
    const summary = combined.match(/Requests:\s+(\d+),\s+Errors:\s+\d+,\s+Pages:\s+(\d+)/);
    expect(summary).not.toBeNull();
    expect(Number(summary![1])).toBeGreaterThan(Number(summary![2]));
    expect(combined).toMatch(/Percentiles \(ms\): p50=/);
  });

  it("persists run records for list and show commands", async () => {
    const templateId = await createFixtureTemplate("Persistence");
    const runName = "persist-run";

    const start = await runCli(
      ["run", "start", "--name", runName, "--template", templateId],
      { dbPath, timeoutMs: 30_000 },
    );
    expect(start.exitCode).toBe(0);

    const list = await runCli(["run", "list", "--site", fixture.baseUrl], { dbPath });
    expect(list.exitCode).toBe(0);

    const listed = parseRunListRow(list.stdout, runName);
    if (!listed) throw new Error(`Run not listed:\n${list.stdout}`);
    expect(listed.status).toBe("completed");

    const show = await runCli(["run", "show", listed.id], { dbPath });
    expect(show.exitCode).toBe(0);
    expect(show.stdout).toContain(`Run: ${runName}`);
    expect(show.stdout).toContain("Status: completed");
    expect(show.stdout).toMatch(/Requests:\s+[1-9]\d*,\s+Errors:\s+\d+,\s+Pages:\s+[1-9]\d*/);
    expect(show.stdout).toMatch(/Percentiles \(ms\): p50=/);
  });

  it("starts a run with inline URL overrides", async () => {
    const runName = "inline-override";

    const result = await runCli(
      [
        "run",
        "start",
        "--name",
        runName,
        "--url",
        `${fixture.baseUrl}/`,
        "--respect-robots",
        "false",
        "--max-pages",
        "2",
        "--rps",
        "10",
      ],
      { dbPath, timeoutMs: 30_000 },
    );

    const combined = `${result.stdout}\n${result.stderr}`;
    expect(result.exitCode).toBe(0);
    expect(combined).toMatch(/Status:\s+completed/);
    expect(combined).toMatch(/Percentiles \(ms\): p50=/);

    const list = await runCli(["run", "list", "--site", fixture.baseUrl], { dbPath });
    expect(list.exitCode).toBe(0);
    expect(parseRunListRow(list.stdout, runName)?.status).toBe("completed");
  });

  it("exits non-zero for validation failures", async () => {
    const missingSource = await runCli(["run", "start", "--name", "bad-run"], { dbPath });
    expect(missingSource.exitCode).toBe(1);
    expect(missingSource.stderr).toContain("Provide --template or --url");

    const invalidUrl = await runCli(
      ["run", "start", "--name", "bad-run", "--url", "not-a-url"],
      { dbPath },
    );
    expect(invalidUrl.exitCode).toBe(1);
    expect(invalidUrl.stderr).toMatch(/startUrl|URL/);
  });

  it("exits non-zero when the start URL is unreachable", async () => {
    const closedPort = fixture.port + 10_000;
    const unreachable = await runCli(
      [
        "run",
        "start",
        "--name",
        "unreachable",
        "--url",
        `http://127.0.0.1:${closedPort}/`,
        "--respect-robots",
        "false",
      ],
      { dbPath, timeoutMs: 15_000 },
    );

    expect(unreachable.exitCode).toBe(1);
    expect(unreachable.stderr.length).toBeGreaterThan(0);
  });
});
