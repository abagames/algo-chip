import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workletSrc = join(__dirname, "../worklets");
const coreSrc = join(__dirname, "../../dist/core");
const rootCoreDst = join(__dirname, "../../core");
const webCoreDst = join(__dirname, "../core");
const distWorkletDst = join(__dirname, "../dist/worklets");
const publicWorkletDst = join(__dirname, "../public/worklets");
const distCoreDst = join(__dirname, "../dist/core");
const publicCoreDst = join(__dirname, "../public/core");
const distWebCoreDst = join(__dirname, "../dist/web/core");

function clearDir(path) {
  rmSync(path, { recursive: true, force: true });
}

function copyRecursive(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, dstPath);
    } else {
      mkdirSync(dirname(dstPath), { recursive: true });
      copyFileSync(srcPath, dstPath);
    }
  }
}

clearDir(distWorkletDst);
clearDir(publicWorkletDst);
clearDir(rootCoreDst);
clearDir(webCoreDst);
clearDir(distCoreDst);
clearDir(publicCoreDst);
clearDir(distWebCoreDst);

copyRecursive(workletSrc, distWorkletDst);
copyRecursive(workletSrc, publicWorkletDst);
copyRecursive(coreSrc, rootCoreDst);
copyRecursive(coreSrc, webCoreDst);
copyRecursive(coreSrc, distCoreDst);
copyRecursive(coreSrc, distWebCoreDst);
