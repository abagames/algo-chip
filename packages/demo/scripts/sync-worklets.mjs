// Copies the canonical AudioWorklet sources from packages/core/worklets into
// the demo's public/ directory so Vite serves and bundles the same code that
// ships in the npm package. Runs automatically before `dev` and `build`.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "../../core/worklets");
const dst = join(__dirname, "../public/worklets");

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const entry of readdirSync(src, { withFileTypes: true })) {
  if (entry.isFile()) {
    copyFileSync(join(src, entry.name), join(dst, entry.name));
  }
}
