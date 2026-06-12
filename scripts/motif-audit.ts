import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BGM_MOTIF_FILES = [
  "bass-patterns.json",
  "chords.json",
  "drums.json",
  "melody-rhythm.json",
  "melody.json",
  "rhythm.json",
  "techniques.json",
  "transitions.json"
] as const;

type JsonObject = Record<string, unknown>;
type RhythmPatternEntry = number | { value: number };

export interface MotifIdOccurrence {
  id: string;
  file: string;
}

export interface RhythmLengthMismatch {
  id: string;
  declaredLength: number;
  actualLength: number;
}

export interface VariationIssue {
  id: string;
  variation: string;
  reason: "missing" | "self" | "duplicate";
}

export interface MelodyVariationCompatibilityIssue {
  id: string;
  variation: string;
  reason: "length" | "function" | "contour";
}

export interface ExactPatternOccurrence {
  id: string;
  context?: string;
  role?: string;
}

export interface ExactPatternGroup {
  pattern: unknown;
  occurrences: ExactPatternOccurrence[];
}

export type ExactPatternLibrary = "melody" | "melodyRhythm" | "drums" | "bass" | "chords";

export interface MotifAuditReport {
  fileCounts: Record<string, number>;
  totalIds: number;
  duplicateIds: MotifIdOccurrence[][];
  rhythmLengthMismatches: RhythmLengthMismatch[];
  rhythmVariationReferences: number;
  melodyVariationReferences: number;
  variationIssues: VariationIssue[];
  melodyVariationCompatibilityIssues: MelodyVariationCompatibilityIssue[];
  invalidRhythmPatterns: string[];
  exactPatternGroups: Record<ExactPatternLibrary, ExactPatternGroup[]>;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectIds(value: unknown, file: string, output: MotifIdOccurrence[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectIds(entry, file, output));
    return;
  }
  if (!isObject(value)) return;

  if (typeof value.id === "string") output.push({ id: value.id, file });
  Object.values(value).forEach((entry) => collectIds(entry, file, output));
}

function collectExactPatternGroups(
  entries: Array<{ pattern: unknown; occurrence: ExactPatternOccurrence }>
): ExactPatternGroup[] {
  const groups = new Map<string, ExactPatternGroup>();
  for (const entry of entries) {
    const signature = JSON.stringify(entry.pattern);
    const group = groups.get(signature) ?? { pattern: entry.pattern, occurrences: [] };
    group.occurrences.push(entry.occurrence);
    groups.set(signature, group);
  }
  return [...groups.values()]
    .filter((group) => group.occurrences.length > 1)
    .sort((left, right) => left.occurrences[0].id.localeCompare(right.occurrences[0].id));
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function motifPatternEntries(data: unknown, patternKey: "pattern" | "steps"): Array<{
  pattern: unknown;
  occurrence: ExactPatternOccurrence;
}> {
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    if (!isObject(entry) || typeof entry.id !== "string" || entry[patternKey] === undefined) return [];
    const role = typeof entry.type === "string"
      ? entry.type
      : typeof entry.texture === "string"
        ? entry.texture
        : undefined;
    return [{ pattern: entry[patternKey], occurrence: { id: entry.id, role } }];
  });
}

function chordPatternEntries(data: unknown): Array<{
  pattern: unknown;
  occurrence: ExactPatternOccurrence;
}> {
  if (!isObject(data)) return [];
  const entries: Array<{ pattern: unknown; occurrence: ExactPatternOccurrence }> = [];
  for (const [key, categories] of Object.entries(data)) {
    if (!isObject(categories)) continue;
    for (const [category, progressions] of Object.entries(categories)) {
      if (!Array.isArray(progressions)) continue;
      progressions.forEach((pattern, index) => entries.push({
        pattern,
        occurrence: {
          id: `${key}.${category}[${index}]`,
          context: `${key}/${category}`
        }
      }));
    }
  }
  return entries;
}

const MELODY_FUNCTION_TAGS = ["start", "middle", "end", "cadence", "pickup"];
const MELODY_CONTOUR_TAGS = [
  "ascending",
  "descending",
  "arch",
  "valley",
  "stepwise",
  "leaping",
  "static",
  "sequence",
  "neighbor",
  "complex"
];

function tags(value: unknown): string[] {
  if (!isObject(value) || !Array.isArray(value.tags)) return [];
  return value.tags.filter((tag): tag is string => typeof tag === "string");
}

function pattern(value: unknown): number[] {
  if (!isObject(value) || !Array.isArray(value.pattern)) return [];
  return value.pattern.filter((step): step is number => typeof step === "number");
}

function sharesAnyTag(left: unknown, right: unknown, tagSet: string[]): boolean {
  const leftTags = tags(left);
  const rightTags = tags(right);
  return tagSet.some((tag) => leftTags.includes(tag) && rightTags.includes(tag));
}

export function rhythmEntryToBeats(entry: unknown): number {
  const value = typeof entry === "number"
    ? entry
    : isObject(entry) && typeof entry.value === "number"
      ? entry.value
      : NaN;
  switch (value) {
    case 2: return 2;
    case 4: return 1;
    case 8: return 0.5;
    case 16: return 0.25;
    default: return NaN;
  }
}

export function auditMotifs(repoRoot = process.cwd()): MotifAuditReport {
  const motifsDir = join(repoRoot, "packages", "core", "motifs");
  const ids: MotifIdOccurrence[] = [];
  const fileCounts: Record<string, number> = {};

  for (const file of BGM_MOTIF_FILES) {
    const data = readJson(join(motifsDir, file));
    const before = ids.length;
    collectIds(data, file, ids);
    fileCounts[file] = ids.length - before;
  }

  const occurrences = new Map<string, MotifIdOccurrence[]>();
  ids.forEach((entry) => occurrences.set(entry.id, [...(occurrences.get(entry.id) ?? []), entry]));
  const duplicateIds = [...occurrences.values()].filter((entries) => entries.length > 1);

  const rhythmData = readJson(join(motifsDir, "rhythm.json")) as JsonObject[];
  const rhythmIds = new Set(rhythmData.map((motif) => motif.id).filter((id): id is string => typeof id === "string"));
  const rhythmLengthMismatches: RhythmLengthMismatch[] = [];
  const variationIssues: VariationIssue[] = [];
  const invalidRhythmPatterns: string[] = [];
  let rhythmVariationReferences = 0;

  for (const motif of rhythmData) {
    const id = typeof motif.id === "string" ? motif.id : "<missing-id>";
    const pattern = motif.pattern;
    if (!Array.isArray(pattern) || pattern.length === 0) {
      invalidRhythmPatterns.push(id);
    } else {
      const beats = (pattern as RhythmPatternEntry[]).map(rhythmEntryToBeats);
      if (beats.some((value) => !Number.isFinite(value))) {
        invalidRhythmPatterns.push(id);
      } else {
        const actualLength = beats.reduce((sum, value) => sum + value, 0);
        if (typeof motif.length !== "number" || Math.abs(actualLength - motif.length) > 1e-6) {
          rhythmLengthMismatches.push({
            id,
            declaredLength: typeof motif.length === "number" ? motif.length : NaN,
            actualLength
          });
        }
      }
    }

    const seen = new Set<string>();
    const variations = Array.isArray(motif.variations) ? motif.variations : [];
    rhythmVariationReferences += variations.length;
    for (const variation of variations) {
      if (typeof variation !== "string") continue;
      if (variation === id) variationIssues.push({ id, variation, reason: "self" });
      if (seen.has(variation)) variationIssues.push({ id, variation, reason: "duplicate" });
      if (!rhythmIds.has(variation)) variationIssues.push({ id, variation, reason: "missing" });
      seen.add(variation);
    }
  }

  const melodyData = readJson(join(motifsDir, "melody.json"));
  const melodyEntries = Array.isArray(melodyData) ? melodyData.filter(isObject) : [];
  const melodyIds = new Set(melodyEntries.map((motif) => motif.id).filter((id): id is string => typeof id === "string"));
  const melodyById = new Map(melodyEntries
    .filter((motif): motif is JsonObject & { id: string } => typeof motif.id === "string")
    .map((motif) => [motif.id, motif]));
  const melodyVariationCompatibilityIssues: MelodyVariationCompatibilityIssue[] = [];
  let melodyVariationReferences = 0;

  for (const motif of melodyEntries) {
    const id = typeof motif.id === "string" ? motif.id : "<missing-id>";
    const seen = new Set<string>();
    const variations = Array.isArray(motif.variations) ? motif.variations : [];
    melodyVariationReferences += variations.length;
    for (const variation of variations) {
      if (typeof variation !== "string") continue;
      if (variation === id) variationIssues.push({ id, variation, reason: "self" });
      if (seen.has(variation)) variationIssues.push({ id, variation, reason: "duplicate" });
      if (!melodyIds.has(variation)) {
        variationIssues.push({ id, variation, reason: "missing" });
        seen.add(variation);
        continue;
      }
      const target = melodyById.get(variation);
      if (pattern(motif).length !== pattern(target).length) {
        melodyVariationCompatibilityIssues.push({ id, variation, reason: "length" });
      }
      if (!sharesAnyTag(motif, target, MELODY_FUNCTION_TAGS)) {
        melodyVariationCompatibilityIssues.push({ id, variation, reason: "function" });
      }
      if (!sharesAnyTag(motif, target, MELODY_CONTOUR_TAGS)) {
        melodyVariationCompatibilityIssues.push({ id, variation, reason: "contour" });
      }
      seen.add(variation);
    }
  }

  const melodyRhythmData = readJson(join(motifsDir, "melody-rhythm.json"));
  const drumsData = readJson(join(motifsDir, "drums.json"));
  const bassData = readJson(join(motifsDir, "bass-patterns.json"));
  const chordsData = readJson(join(motifsDir, "chords.json"));
  const bassPatterns = isObject(bassData) ? bassData.patterns : undefined;
  const exactPatternGroups: MotifAuditReport["exactPatternGroups"] = {
    melody: collectExactPatternGroups(motifPatternEntries(melodyData, "pattern")),
    melodyRhythm: collectExactPatternGroups(motifPatternEntries(melodyRhythmData, "pattern")),
    drums: collectExactPatternGroups(motifPatternEntries(drumsData, "pattern")),
    bass: collectExactPatternGroups(motifPatternEntries(bassPatterns, "steps")),
    chords: collectExactPatternGroups(chordPatternEntries(chordsData))
  };

  return {
    fileCounts,
    totalIds: ids.length,
    duplicateIds,
    rhythmLengthMismatches,
    rhythmVariationReferences,
    melodyVariationReferences,
    variationIssues,
    melodyVariationCompatibilityIssues,
    invalidRhythmPatterns,
    exactPatternGroups
  };
}

function printReport(report: MotifAuditReport): void {
  console.log(JSON.stringify(report, null, 2));
  const issueCount = report.duplicateIds.length
    + report.rhythmLengthMismatches.length
    + report.variationIssues.length
    + report.melodyVariationCompatibilityIssues.length
    + report.invalidRhythmPatterns.length;
  if (issueCount > 0) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  printReport(auditMotifs(dirname(dirname(fileURLToPath(import.meta.url)))));
}
