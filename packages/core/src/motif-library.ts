import type {
  BassPatternMotif,
  DrumPattern,
  MelodyFragment,
  MelodyRhythmMotif,
  RhythmMotif,
  TransitionMotif
} from "./types.js";
import rhythmMotifsJson from "../motifs/rhythm.json" with { type: "json" };
import melodyFragmentsJson from "../motifs/melody.json" with { type: "json" };
import melodyRhythmsJson from "../motifs/melody-rhythm.json" with { type: "json" };
import drumPatternsJson from "../motifs/drums.json" with { type: "json" };
import bassPatternsJson from "../motifs/bass-patterns.json" with { type: "json" };
import transitionsJson from "../motifs/transitions.json" with { type: "json" };

export interface ExpandedRhythmStep {
  durationBeats: number;
}

export interface ExpandedMelodyRhythmStep {
  durationBeats: number;
  rest: boolean;
  accent?: boolean;
}

export const rhythmList = rhythmMotifsJson as RhythmMotif[];
export const rhythmById = new Map(rhythmList.map((motif) => [motif.id, motif]));
export const melodyList = melodyFragmentsJson as MelodyFragment[];
export const melodyById = new Map(melodyList.map((motif) => [motif.id, motif]));
export const melodyRhythmList = melodyRhythmsJson as MelodyRhythmMotif[];
export const melodyRhythmById = new Map(melodyRhythmList.map((motif) => [motif.id, motif]));
export const drumList = drumPatternsJson as DrumPattern[];
export const drumById = new Map(drumList.map((motif) => [motif.id, motif]));
export const bassPatternList = (bassPatternsJson.patterns ?? []) as BassPatternMotif[];
export const bassPatternsByTexture = bassPatternList.reduce<Map<string, BassPatternMotif[]>>(
  (result, motif) => {
    const motifs = result.get(motif.texture) ?? [];
    motifs.push(motif);
    result.set(motif.texture, motifs);
    return result;
  },
  new Map()
);
export const transitionList = (transitionsJson.transitions ?? []) as TransitionMotif[];

export function convertToBeats(value: number): number {
  switch (value) {
    case 2:
      return 2;
    case 4:
      return 1;
    case 8:
      return 0.5;
    case 16:
      return 0.25;
    default:
      return 0.25;
  }
}

export function expandRhythmPattern(motif: RhythmMotif): ExpandedRhythmStep[] {
  const steps = motif.pattern.map((entry) => ({
    durationBeats: convertToBeats(typeof entry === "number" ? entry : entry.value)
  }));
  assertPatternLength(motif.id, motif.length, steps);
  return steps;
}

export function expandMelodyRhythmPattern(
  motif: MelodyRhythmMotif
): ExpandedMelodyRhythmStep[] {
  const steps = motif.pattern.map((entry) => ({
    durationBeats: convertToBeats(entry.value),
    rest: Boolean(entry.rest),
    accent: entry.accent
  }));
  assertPatternLength(motif.id, motif.length, steps);
  return steps;
}

function assertPatternLength(
  id: string,
  expected: number,
  steps: Array<{ durationBeats: number }>
): void {
  const actual = steps.reduce((sum, step) => sum + step.durationBeats, 0);
  if (Math.abs(actual - expected) > 1e-6) {
    throw new Error(`${id} length mismatch. expected=${expected}, got=${actual}`);
  }
}
