/**
 * Utility functions for motif selection
 */

import type { MidiNote, RhythmMotif } from "../../types.js";
import { expandRhythmPattern } from "./pattern-expander.js";

/**
 * Filter candidates to prefer those with at least one matching tag
 * Falls back to original pool if filtering reduces it below minRatio
 */
export function preferTagPresence<T extends { tags?: string[] }>(
  candidates: T[],
  tags: string[],
  minRatio: number = 0.4
): T[] {
  if (!tags.length) {
    return candidates;
  }
  const matched = candidates.filter((candidate) => {
    const sourceTags = candidate.tags ?? [];
    return tags.some((tag) => sourceTags.includes(tag));
  });

  // If filtering reduces pool too much (below minRatio), keep original pool
  // This prevents over-filtering that causes excessive motif repetition
  if (matched.length === 0) {
    return candidates;
  }
  if (candidates.length >= 4 && matched.length < candidates.length * minRatio) {
    return candidates;
  }

  return matched;
}

/**
 * Shuffle array using provided RNG
 */
export function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

/**
 * Bias candidates by moving tag-matched items to front
 * Uses targetRatio to control how many matched items appear first
 */
export function biasByTagPresence<T extends { tags?: string[] }>(
  candidates: T[],
  tags: string[],
  rng: () => number,
  targetRatio = 0.6
): T[] {
  if (!tags.length || candidates.length <= 1) {
    return candidates;
  }
  const matches = candidates.filter((candidate) => {
    const sourceTags = candidate.tags ?? [];
    return tags.some((tag) => sourceTags.includes(tag));
  });
  if (!matches.length || matches.length === candidates.length) {
    return candidates;
  }
  const others = candidates.filter((candidate) => !matches.includes(candidate));
  const shuffledMatches = shuffleWithRng(matches, rng);
  const shuffledOthers = shuffleWithRng(others, rng);
  const desiredMatchCount = Math.min(
    shuffledMatches.length,
    Math.max(1, Math.ceil(candidates.length * targetRatio))
  );
  const prioritizedMatches = shuffledMatches.slice(0, desiredMatchCount);
  const remainder = [...shuffledMatches.slice(desiredMatchCount), ...shuffledOthers];
  return [...prioritizedMatches, ...remainder];
}

/**
 * Pick random item from candidates, avoiding last used ID if possible
 */
export function pickWithAvoid<T extends { id?: string }>(
  candidates: T[],
  rng: () => number,
  avoidId?: string
): T {
  if (!candidates.length) {
    throw new Error("No candidates available for selection");
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  let choice = candidates[Math.floor(rng() * candidates.length)];
  if (avoidId && candidates.length > 1) {
    let attempts = 0;
    while (choice?.id === avoidId && attempts < 3) {
      choice = candidates[Math.floor(rng() * candidates.length)];
      attempts++;
    }
  }
  return choice;
}

/**
 * Prefer unused motifs over recently used ones
 */
export function preferUnused<T extends { id?: string }>(
  candidates: T[],
  used: Set<string>
): T[] {
  const unused = candidates.filter((c) => c.id && !used.has(c.id));
  return unused.length > 0 ? unused : candidates;
}

/**
 * Check if source has all specified tags
 */
export function hasAllTags(source: { tags: string[] }, tags: string[]): boolean {
  if (!tags.length) {
    return true;
  }
  return tags.every((tag) => source.tags.includes(tag));
}

/**
 * Check if beat position is on a strong beat (integer)
 */
export function isStrongBeat(beat: number): boolean {
  const epsilon = 1e-6;
  return Math.abs(beat % 1) < epsilon;
}

/**
 * Find melody note at given beat position
 */
export function findMelodyReference(beat: number, melody: MidiNote[]): MidiNote | undefined {
  return melody.find((note) => beat >= note.startBeat && beat < note.startBeat + note.durationBeats);
}

/**
 * Determine functional tag for measure position in structure
 */
export function functionalTagForMeasure(measure: number, totalMeasures: number): string {
  if (measure === 0) return "start";
  if (measure === totalMeasures - 1) return "end";
  return "middle";
}

/**
 * Check if rhythm motif can be successfully expanded
 */
export function isRhythmMotifConsistent(motif: RhythmMotif): boolean {
  try {
    expandRhythmPattern(motif);
    return true;
  } catch {
    return false;
  }
}
