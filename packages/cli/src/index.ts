#!/usr/bin/env node
import { Command } from "commander";
import {
  DEFAULT_CRAWL_CONFIG,
  DEFAULT_MAX_PAGES,
  DEFAULT_RPS_LIMIT,
  SiteBench,
  StartFailure,
  ValidationFailure,
  type CrawlConfig,
  type TemplateInput,
} from "@sitebench/core";
import { createCli } from "./commands.js";

const program = new Command();

program
  .name("sitebench")
  .description("Local HTTP performance measurement and comparison")
  .option("--db <path>", "SQLite database path", process.env.SITEBENCH_DB)
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    const bench = new SiteBench({ dbPath: opts.db });
    thisCommand.setOptionValue("bench", bench);
  })
  .hook("postAction", (thisCommand) => {
    const bench = thisCommand.getOptionValue("bench") as SiteBench | undefined;
    bench?.close();
  });

createCli(program);

program.parseAsync(process.argv).catch((error) => {
  if (error instanceof ValidationFailure || error instanceof StartFailure) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

export { DEFAULT_CRAWL_CONFIG, DEFAULT_MAX_PAGES, DEFAULT_RPS_LIMIT };
export type { CrawlConfig, TemplateInput };
