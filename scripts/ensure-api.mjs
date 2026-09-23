import { cpSync, existsSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src/server/api");
const dest = join(root, "src/app/api");
const pages = process.env.GITHUB_PAGES === "true";

if (pages) {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  console.log("ensure-api: skipped (GITHUB_PAGES static export)");
  process.exit(0);
}

if (!existsSync(src)) {
  console.warn("ensure-api: missing src/server/api");
  process.exit(0);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log("ensure-api: synced src/server/api -> src/app/api");
