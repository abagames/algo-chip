/**
 * verify-lofi.ts
 *
 * Verifies that lofi-tagged motifs are actually selected when the two-axis
 * style is set to the lofi-leaning quadrant (calm+melodic).
 *
 * Usage:
 *   node --loader ts-node/esm scripts/verify-lofi.ts
 *   node --loader ts-node/esm scripts/verify-lofi.ts --assert
 *   node --loader ts-node/esm scripts/verify-lofi.ts --seeds=101,202,303,404,505,606,707,808
 *   node --loader ts-node/esm scripts/verify-lofi.ts --assert --min-lofi-rate=0.2
 *
 * In --assert mode exits with code 1 if lofi motif selection rates fall below thresholds.
 */

import { runPipeline } from "../packages/core/src/pipeline.js";
import { rhythmList, melodyList, melodyRhythmList } from "../packages/core/src/phase/motif-selection/motif-loader.js";

const LOFI_AXIS = { percussiveMelodic: 0.45, calmEnergetic: -0.75 };
const DEFAULT_SEEDS = [101, 202, 303, 404, 505, 606, 707, 808, 909, 1010];
const LOFI_TAGS = ["lofi", "swing_hint"];

// Pre-build sets of lofi motif IDs per category
const lofiRhythmIds = new Set(rhythmList.filter(m => LOFI_TAGS.some(t => m.tags.includes(t))).map(m => m.id));
const lofiMelodyIds = new Set(melodyList.filter(m => m.tags.includes("lofi")).map(m => m.id));
const lofiMelRhyIds = new Set(melodyRhythmList.filter(m => LOFI_TAGS.some(t => m.tags.includes(t))).map(m => m.id));

interface LofiRunResult {
  seed: number;
  voiceArrangement: string;
  lofiFeel: boolean;
  rhythm: { used: string[]; lofi: string[] };
  melody: { used: string[]; lofi: string[] };
  melRhy: { used: string[]; lofi: string[] };
}

function runSeed(seed: number): LofiRunResult {
  const result = runPipeline({ twoAxisStyle: LOFI_AXIS, seed, lengthInMeasures: 16 });
  const usage = result.diagnostics.motifUsage;

  const rhythmUsed = Object.keys(usage.rhythm);
  const melodyUsed = Object.keys(usage.melody);
  const melRhyUsed = Object.keys(usage.melodyRhythm);

  return {
    seed,
    voiceArrangement: result.meta.voiceArrangement.id,
    lofiFeel: result.meta.styleIntent.lofiFeel,
    rhythm: { used: rhythmUsed, lofi: rhythmUsed.filter(id => lofiRhythmIds.has(id)) },
    melody: { used: melodyUsed, lofi: melodyUsed.filter(id => lofiMelodyIds.has(id)) },
    melRhy: { used: melRhyUsed, lofi: melRhyUsed.filter(id => lofiMelRhyIds.has(id)) }
  };
}

function parseSeeds(argv: string[]): number[] {
  const arg = argv.find(a => a.startsWith("--seeds="));
  if (!arg) return DEFAULT_SEEDS;
  const parsed = arg.slice("--seeds=".length).split(",").map(s => parseInt(s.trim(), 10)).filter(n => isFinite(n));
  return parsed.length ? parsed : DEFAULT_SEEDS;
}

function parseNumericArg(argv: string[], name: string, def: number): number {
  const arg = argv.find(a => a.startsWith(`--${name}=`));
  if (!arg) return def;
  const v = parseFloat(arg.slice(`--${name}=`.length));
  return isFinite(v) ? v : def;
}

const argv = process.argv.slice(2);
const seeds = parseSeeds(argv);
const assertMode = argv.includes("--assert");
const minLofiRate = parseNumericArg(argv, "min-lofi-rate", 0.3);

// --- run ---
const runs = seeds.map(runSeed);

// --- aggregate ---
const seedsWithLofiRhythm = runs.filter(r => r.rhythm.lofi.length > 0).length;
const seedsWithLofiMelody = runs.filter(r => r.melody.lofi.length > 0).length;
const seedsWithLofiMelRhy = runs.filter(r => r.melRhy.lofi.length > 0).length;
const allLofiFeelTrue = runs.every(r => r.lofiFeel);

const allLofiRhythmIds = [...new Set(runs.flatMap(r => r.rhythm.lofi))].sort();
const allLofiMelodyIds = [...new Set(runs.flatMap(r => r.melody.lofi))].sort();
const allLofiMelRhyIds = [...new Set(runs.flatMap(r => r.melRhy.lofi))].sort();

// --- report ---
console.log("# Lofi Motif Verification Report");
console.log(`\nAxis: percussiveMelodic=${LOFI_AXIS.percussiveMelodic}, calmEnergetic=${LOFI_AXIS.calmEnergetic}`);
console.log(`Seeds: ${seeds.join(", ")}`);
console.log(`lofiFeel=true for all seeds: ${allLofiFeelTrue}`);

console.log(`\n| Category     | Seeds with lofi | Rate  | IDs selected |`);
console.log(`| ---          | ---:            | ---:  | ---          |`);
console.log(`| rhythm       | ${String(seedsWithLofiRhythm).padStart(15)} | ${(seedsWithLofiRhythm / seeds.length).toFixed(2).padStart(5)} | ${allLofiRhythmIds.join(", ") || "none"} |`);
console.log(`| melody       | ${String(seedsWithLofiMelody).padStart(15)} | ${(seedsWithLofiMelody / seeds.length).toFixed(2).padStart(5)} | ${allLofiMelodyIds.join(", ") || "none"} |`);
console.log(`| melodyRhythm | ${String(seedsWithLofiMelRhy).padStart(15)} | ${(seedsWithLofiMelRhy / seeds.length).toFixed(2).padStart(5)} | ${allLofiMelRhyIds.join(", ") || "none"} |`);

console.log("\n## Per-seed detail");
console.log("| Seed | Arrangement | lofiFeel | rhythm lofi | melody lofi | melRhy lofi |");
console.log("| ---: | ---         | ---      | ---         | ---         | ---         |");
for (const r of runs) {
  console.log(`| ${r.seed} | ${r.voiceArrangement} | ${r.lofiFeel} | ${r.rhythm.lofi.join(",") || "-"} | ${r.melody.lofi.join(",") || "-"} | ${r.melRhy.lofi.join(",") || "-"} |`);
}

// --- assert ---
if (assertMode) {
  const violations: string[] = [];

  if (!allLofiFeelTrue) {
    violations.push(`lofiFeel is not true for all seeds (check two-axis-mapper.ts)`);
  }

  const rhythmRate = seedsWithLofiRhythm / seeds.length;
  if (rhythmRate < minLofiRate) {
    violations.push(`rhythm lofi rate=${rhythmRate.toFixed(2)} < ${minLofiRate} (${seedsWithLofiRhythm}/${seeds.length} seeds)`);
  }

  const melodyRate = seedsWithLofiMelody / seeds.length;
  if (melodyRate < minLofiRate) {
    violations.push(`melody lofi rate=${melodyRate.toFixed(2)} < ${minLofiRate} (${seedsWithLofiMelody}/${seeds.length} seeds)`);
  }

  const melRhyRate = seedsWithLofiMelRhy / seeds.length;
  if (melRhyRate < minLofiRate) {
    violations.push(`melodyRhythm lofi rate=${melRhyRate.toFixed(2)} < ${minLofiRate} (${seedsWithLofiMelRhy}/${seeds.length} seeds)`);
  }

  if (violations.length === 0) {
    console.error(`\nAssert: all lofi checks passed (${seeds.length} seeds, min-lofi-rate=${minLofiRate}).`);
  } else {
    console.error(`\nAssert: ${violations.length} violation(s):`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
}
