import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const DEFAULT_DB_PATH = path.join(REPO_ROOT, "sitebench.db");
