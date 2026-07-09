import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export type CliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type RunCliOptions = {
  dbPath?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
};

export function runCli(args: string[], options: RunCliOptions = {}): Promise<CliResult> {
  const timeoutMs = options.timeoutMs ?? 60_000;

  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "tsx", "src/index.ts", ...args], {
      cwd: packageRoot,
      env: {
        ...process.env,
        NODE_OPTIONS: "--experimental-sqlite",
        ...(options.dbPath ? { SITEBENCH_DB: options.dbPath } : {}),
        ...options.env,
      },
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`CLI timed out after ${timeoutMs}ms\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

export function parseCreatedId(output: string, prefix: string) {
  const match = output.match(new RegExp(`${prefix}[_\\w-]+`));
  return match?.[0] ?? null;
}

export function parseRunListRow(output: string, runName: string) {
  const line = output
    .split("\n")
    .map((row) => row.trim())
    .find((row) => row.includes(`\t${runName}\t`));

  if (!line) return null;

  const [id, name, status] = line.split("\t");
  if (!id || !name || !status) return null;

  return { id, name, status };
}
