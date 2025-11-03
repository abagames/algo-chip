/**
 * Chord progression selection and manipulation
 */

import chords from "../../../motifs/chords.json" with { type: "json" };
import { shuffleArray } from "./utilities.js";

/**
 * Select chord progressions based on key and mood tags
 */
export function selectChordProgressions(
  key: string,
  moodTags: string[],
  seed: number | undefined
): string[][] {
  const keyData = (chords as any)[key];
  if (!keyData) {
    throw new Error(`No chord motifs for key ${key}`);
  }
  const matches: string[][] = [];
  for (const tag of moodTags) {
    if (Array.isArray(keyData[tag])) {
      matches.push(...keyData[tag]);
    }
  }
  const fallbackSources = matches.length ? matches : Object.values<string[][]>(keyData).flat();
  if (!fallbackSources.length) {
    throw new Error(`No chord progressions available for key ${key}`);
  }
  return shuffleArray(fallbackSources, seed, 100).map((progression) => [...progression]);
}

/**
 * Transpose chord by semitones
 */
export function transposeChord(chord: string, semitones: number): string {
  const rootMatch = chord.match(/^([A-G])(#|b)?(.*)$/);
  if (!rootMatch) return chord;

  const [, rootNote, accidental = "", suffix] = rootMatch;

  const NOTE_ORDER = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const NOTE_TO_INDEX: Record<string, number> = {
    C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4,
    F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11
  };

  const currentNote = rootNote + accidental;
  const currentIndex = NOTE_TO_INDEX[currentNote];
  if (currentIndex === undefined) return chord;

  const newIndex = (currentIndex + semitones + 12) % 12;
  const newRoot = NOTE_ORDER[newIndex];

  return newRoot + suffix;
}

/**
 * Toggle between minor and major
 */
export function toggleMinorMajor(chord: string): string {
  const match = chord.match(/^([A-G](?:#|b)?)(m?)(.*)$/);
  if (!match) return chord;

  const [, root, minor, rest] = match;

  // If minor, remove 'm'; if major, add 'm'
  if (minor === "m") {
    return root + rest;
  } else {
    return root + "m" + rest;
  }
}

/**
 * Get related chords (dominant, subdominant, parallel)
 */
export function getRelatedChords(baseChord: string): string[] {
  const related: string[] = [];

  // Fifth up (dominant)
  related.push(transposeChord(baseChord, 7));

  // Fourth up / Fifth down (subdominant)
  related.push(transposeChord(baseChord, 5));

  // Parallel key (major ↔ minor)
  related.push(toggleMinorMajor(baseChord));

  return related;
}

/**
 * Build limited chord progression (harmonically static)
 */
export function buildLimitedProgression(
  baseChord: string,
  rng: () => number
): string[] {
  const repetitions = 3 + Math.floor(rng() * 2); // 3-4 repetitions
  const progression: string[] = Array(repetitions).fill(baseChord);

  // 20% probability to add a related chord at the end
  if (rng() < 0.2) {
    const relatedChords = getRelatedChords(baseChord);
    const chosenRelated = relatedChords[Math.floor(rng() * relatedChords.length)];
    progression.push(chosenRelated);
  }

  return progression;
}
