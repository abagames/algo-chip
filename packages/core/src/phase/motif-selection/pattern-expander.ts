/**
 * Pattern expansion utilities for rhythm and melody-rhythm motifs
 */

import type { RhythmMotif, MelodyRhythmMotif } from "../../types.js";
import type { ExpandedRhythmStep, ExpandedMelodyRhythmStep } from "./types.js";

/**
 * Convert note value (2, 4, 8, 16) to beat duration
 */
export function convertToBeats(value: number): number {
  switch (value) {
    case 2:
      return 2; // 2分音符 = 2拍
    case 4:
      return 1; // 4分音符 = 1拍
    case 8:
      return 0.5; // 8分音符 = 0.5拍
    case 16:
      return 0.25; // 16分音符 = 0.25拍
    default:
      return 0.25;
  }
}

/**
 * Expand rhythm motif pattern into timestamped steps
 */
export function expandRhythmPattern(motif: RhythmMotif): ExpandedRhythmStep[] {
  const steps: ExpandedRhythmStep[] = motif.pattern.map((value) => ({
    durationBeats: convertToBeats(value)
  }));

  // Validate that pattern sum matches declared length
  const total = steps.reduce((sum, step) => sum + step.durationBeats, 0);
  const tolerance = 1e-6;
  if (Math.abs(total - motif.length) > tolerance) {
    throw new Error(
      `Rhythm motif ${motif.id} length mismatch. expected=${motif.length}, got=${total}`
    );
  }

  return steps;
}

/**
 * Expand melody-rhythm motif pattern into timestamped steps with rest/accent info
 */
export function expandMelodyRhythmPattern(motif: MelodyRhythmMotif): ExpandedMelodyRhythmStep[] {
  const steps: ExpandedMelodyRhythmStep[] = motif.pattern.map((entry) => ({
    durationBeats: convertToBeats(entry.value),
    rest: Boolean(entry.rest),
    accent: entry.accent
  }));
  const total = steps.reduce((sum, step) => sum + step.durationBeats, 0);
  const tolerance = 1e-6;
  if (Math.abs(total - motif.length) > tolerance) {
    throw new Error(
      `Melody rhythm motif ${motif.id} length mismatch. expected=${motif.length}, got=${total}`
    );
  }
  return steps;
}
