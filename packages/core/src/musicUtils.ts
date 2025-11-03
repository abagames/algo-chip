import { AbstractNote, DrumHit, Phase1Result } from "./types.js";

/**
 * Drum durations are deliberately short to emulate chiptune hardware constraints.
 * The noise channel is monophonic and must quickly switch between different drum sounds.
 * These durations prevent overlapping notes and give the percussive "chip" character:
 * - Kick (K): 1/16 note - Quick thud to avoid muddying the bass
 * - Snare (S): 1/16 note - Sharp crack without lingering
 * - Hi-hat (H): 1/32 note - Extremely short to simulate closed hi-hat
 * - Open hi-hat (O): 3/32 note - Slightly longer for "open" character
 * - Tom (T): 1/8 note - Longest for pitched drum effect
 * - Noise effect (N): 3/32 note - Special effects/crashes
 */
const DRUM_DURATION_BEATS: Record<DrumHit["instrument"], number> = {
  K: 0.25,
  S: 0.25,
  H: 0.125,
  O: 0.375,
  T: 0.5,
  N: 0.375
};

/**
 * Lookup table for fast conversion from note names to semitone offsets.
 * Supports both sharp and flat notation (enharmonic equivalents) because
 * chord notation uses both (#/b) depending on key (e.g., D# vs Eb),
 * musicians expect both notations to work interchangeably, and lookup
 * is faster than parsing/calculating on each call.
 */
const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11
};

/**
 * Chord intervals define the harmonic structure for accompaniment and melody quantization.
 * Intervals are semitone offsets from the root, stored as arrays for easy iteration.
 * This supports quantizing melody notes to chord tones (ensures harmony), generating
 * broken chords and arpeggios in Phase 3, and voice leading and consonance checking in Phase 2.
 *
 * Limited to common chords because chiptune music typically uses simple harmony
 * (hardware limitations inspired this), complex jazz chords would require 4+ note
 * polyphony (we only have 3 melodic channels), and retro game music rarely used extended chords.
 */
const DEFAULT_CHORD_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7],        // Major triad (C-E-G)
  m: [0, 3, 7],         // Minor triad (C-Eb-G)
  7: [0, 4, 7, 10],     // Dominant 7th (C-E-G-Bb)
  m7: [0, 3, 7, 10],    // Minor 7th (C-Eb-G-Bb)
  maj7: [0, 4, 7, 11],  // Major 7th (C-E-G-B)
  sus2: [0, 2, 7],      // Suspended 2nd (C-D-G) - removes 3rd for ambiguity
  sus4: [0, 5, 7],      // Suspended 4th (C-F-G) - tension/resolution
  dim: [0, 3, 6],       // Diminished (C-Eb-Gb) - for dramatic passages
  aug: [0, 4, 8]        // Augmented (C-E-G#) - for surreal/tense moments
};

/**
 * 4/4 time signature is hardcoded because the vast majority of game music uses 4/4
 * (simplifies loop alignment), variable time signatures would complicate beat <-> measure
 * conversion throughout pipeline, and could be parameterized in future but adds
 * complexity for minimal gain.
 */
export const BEATS_PER_MEASURE = 4;

/**
 * Converts a chord root (e.g., "C#", "Eb") to MIDI note number in a given octave.
 *
 * Chord symbols (like "Am7") must be converted to MIDI for bass line generation
 * (uses chord roots), accompaniment generation (uses chord tones), and melody
 * quantization (snaps to chord pitches). The baseOctaveMidi parameter allows
 * different voices to use different octaves: bass typically uses MIDI 36-48 (C2-C3)
 * while melody uses MIDI 60-84 (C4-C6), letting the same function serve both cases.
 *
 * @param root Chord root note name (e.g., "C#", "Eb")
 * @param baseOctaveMidi Reference MIDI note for octave placement
 * @returns MIDI note number in the same octave as baseOctaveMidi
 */
export function chordRootToMidi(root: string, baseOctaveMidi: number): number {
  const noteMatch = root.match(/^[A-G](#|b)?/i);
  if (!noteMatch) {
    // Graceful fallback instead of throwing - invalid chord symbols shouldn't crash generation
    return baseOctaveMidi;
  }
  const note = noteMatch[0].toUpperCase();
  const semitone = NOTE_TO_SEMITONE[note] ?? 0;
  // Extract octave from baseOctaveMidi and add semitone offset
  // This keeps the result in the same octave as the base reference
  const octaveBase = baseOctaveMidi - (baseOctaveMidi % 12);
  return octaveBase + semitone;
}

/**
 * Extracts chord intervals from a chord symbol (e.g., "Cmaj7" → [0, 4, 7, 11]).
 *
 * Chord symbols need to be decomposed into interval sets for arpeggio generation
 * (cycle through chord tones), broken chord patterns (select subset of tones),
 * and melody harmonization (ensure melody notes are consonant).
 *
 * Fallback logic handles unknown suffixes: tries exact match first (handles standard
 * suffixes), then checks if it starts with "m" (handles "m9", "m11", etc. as minor),
 * and defaults to major triad (safest harmonic fallback).
 *
 * @param chord Chord symbol (e.g., "Am7", "Cmaj7", "G")
 * @returns Array of semitone intervals from root [0, ...]
 */
export function getChordIntervals(chord: string): number[] {
  const match = chord.match(/^[A-G](?:#|b)?(.*)$/);
  const suffix = match?.[1] ?? "";
  if (suffix in DEFAULT_CHORD_INTERVALS) {
    return DEFAULT_CHORD_INTERVALS[suffix];
  }
  if (suffix.startsWith("m")) {
    // Treat "m9", "m11" etc. as minor triads for simplicity
    return DEFAULT_CHORD_INTERVALS.m;
  }
  // Major triad is the safest default (works with most melodies)
  return DEFAULT_CHORD_INTERVALS[""];
}

/**
 * Converts scale degree (1-7) to MIDI note number.
 *
 * Motif-based melody generation uses scale degrees (abstract) rather than MIDI (concrete)
 * because motifs are key-independent (same motif works in C major or D minor), it's easier
 * to ensure notes stay in-scale (no accidentals), and it's a natural representation for
 * musicians (think "do-re-mi" not "60-62-64").
 *
 * Supports negative/large degrees because motifs can specify intervals like -2 (below tonic)
 * or 15 (two octaves up), and the modulo math handles this gracefully. The octaveOffset
 * parameter allows Voice Arrangement presets to transpose bassAlt down an octave or melodyAlt
 * up an octave without regenerating motifs.
 *
 * @param degree Scale degree (1 = tonic, negative/large values supported)
 * @param scale Array of semitone intervals defining the scale
 * @param baseMidi Base MIDI note for the scale's tonic
 * @param octaveOffset Additional octave transposition (default 0)
 * @returns MIDI note number
 */
export function scaleDegreeToMidi(
  degree: number,
  scale: number[],
  baseMidi: number,
  octaveOffset = 0
): number {
  // Double-modulo handles negative degrees correctly
  // (degree - 1) because scale degrees are 1-indexed but arrays are 0-indexed
  const index = ((degree - 1) % scale.length + scale.length) % scale.length;
  // Floor division determines which octave the degree falls into
  const octave = Math.floor((degree - 1) / scale.length) + octaveOffset;
  const semitoneOffset = scale[index] + 12 * octave;
  return baseMidi + semitoneOffset;
}

/**
 * Parses a drum pattern string into timed DrumHit events.
 *
 * Drum motifs are stored as strings like "K---S---K---S---" because it's a compact
 * representation (16-char string vs array of objects), easy to visualize rhythm
 * (matches how musicians read drum tabs), and simple to hand-author in JSON motif library.
 *
 * Uses 16th note resolution as the standard grid for chiptune drums: fine enough for
 * hi-hat patterns and ghost notes, coarse enough to avoid timing jitter on retro
 * hardware, and matches the quantization of classic game music.
 *
 * @param pattern Drum pattern string (e.g., "K---S---K---S---")
 * @param startBeat Beat time to start the pattern
 * @param sectionId Section identifier for diagnostics
 * @returns Array of DrumHit events with timing and instrument
 */
export function generateDrumHitsFromPattern(
  pattern: string,
  startBeat: number,
  sectionId: string
): DrumHit[] {
  const hits: DrumHit[] = [];
  const beatResolution = 16; // 16th notes
  for (let idx = 0; idx < pattern.length; idx++) {
    const symbol = pattern[idx] as DrumHit["instrument"] | "-";
    if (symbol === "-") {
      continue;
    }
    // Maps pattern index to beat time on 16th note grid
    const stepBeat = startBeat + (idx / beatResolution) * BEATS_PER_MEASURE;
    hits.push({
      startBeat: stepBeat,
      durationBeats: DRUM_DURATION_BEATS[symbol] ?? 0.25,
      instrument: symbol,
      sectionId
    });
  }
  return hits;
}

/**
 * Resolves the current chord symbol at a given beat time.
 *
 * Many generation steps need to know "what chord am I in right now?" for bass generator
 * (uses chord roots), accompaniment (uses chord tones), and melody quantization (ensures harmony).
 *
 * Uses measure-based lookup: chord progressions are stored per-section with one chord per measure,
 * converting beat → measure → section → chord progression index. If a section has 4 measures but
 * the progression is only 2 chords long, we cycle through the progression to fill the section.
 *
 * @param phase1 Structure planning result with section definitions
 * @param beatTime Current beat time to resolve
 * @param beatsPerMeasure Beats per measure (default 4)
 * @returns Chord symbol at the given beat time
 */
export function resolveChordAtBeat(
  phase1: Phase1Result,
  beatTime: number,
  beatsPerMeasure = BEATS_PER_MEASURE
): string {
  const measureIndex = Math.floor(beatTime / beatsPerMeasure);
  const section = phase1.sections.find((candidate) => {
    return (
      measureIndex >= candidate.startMeasure &&
      measureIndex < candidate.startMeasure + candidate.measures
    );
  });
  if (!section) {
    // Graceful fallback to first chord instead of crashing
    // Can happen if timing calculations have rounding errors
    const fallback = phase1.sections[0];
    return fallback?.chordProgression[0] ?? "C";
  }
  const relativeMeasure = Math.max(0, measureIndex - section.startMeasure);
  // Allows short progressions to loop within longer sections
  return section.chordProgression[relativeMeasure % section.chordProgression.length];
}

/**
 * Converts frequency (Hz) to MIDI note number.
 *
 * Used for SE generation when baseFrequency option is specified in Hz.
 * Formula: MIDI = 69 + 12 * log2(freq / 440.0)
 * - 69 is MIDI number for A4 (440 Hz)
 * - 12 semitones per octave
 * - log2 converts frequency ratio to octaves
 *
 * @param freq Frequency in Hz (e.g., 440.0 for A4)
 * @returns MIDI note number (may be fractional)
 */
export function frequencyToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440.0);
}

/**
 * Converts frequency ratio to semitone interval.
 *
 * Used for pitch shift calculations in SE generation.
 * Formula: semitones = 12 * log2(ratio)
 * - Ratio of 2.0 = 12 semitones (one octave)
 * - Ratio of 1.5 = ~7 semitones (perfect fifth)
 *
 * @param ratio Frequency ratio (target / original)
 * @returns Semitone interval (may be fractional)
 */
export function frequencyToSemitones(ratio: number): number {
  return 12 * Math.log2(ratio);
}

/**
 * Converts MIDI note number to frequency (Hz).
 *
 * Inverse of frequencyToMidi, useful for verification and debugging.
 * Formula: freq = 440.0 * 2^((midi - 69) / 12)
 *
 * @param midi MIDI note number (e.g., 69 for A4)
 * @returns Frequency in Hz
 */
export function midiToFrequency(midi: number): number {
  return 440.0 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Helper for pitch class (mod 12) operations.
 * Pitch class operations appear frequently in consonance checking and interval analysis.
 * Positive modulo ensures correct behavior for negative inputs.
 */
function mod12(value: number): number {
  return (value % 12 + 12) % 12;
}

/**
 * Quantizes a MIDI note to the nearest chord tone.
 *
 * When generating accompaniment or correcting melody notes, we often need to
 * "snap" to the nearest chord tone to ensure harmonic coherence. Searches ±2 octaves
 * to find chord tones in different registers without straying too far from the original
 * pitch, limiting excessive octave jumps. Closest pitch wins to minimize melodic leaps
 * and preserve smooth voice leading.
 *
 * @param midi Original MIDI note to quantize
 * @param chord Chord symbol to quantize to
 * @returns Nearest chord tone MIDI note
 */
export function quantizeMidiToChord(midi: number, chord: string): number {
  const root = chordRootToMidi(chord, midi);
  const intervals = getChordIntervals(chord);
  let best = midi;
  let bestDiff = Infinity;
  for (const interval of intervals) {
    for (let octave = -2; octave <= 2; octave++) {
      const candidate = root + interval + octave * 12;
      const diff = Math.abs(candidate - midi);
      if (diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }
  }
  return best;
}

/**
 * Consonant intervals (semitones) used for voice leading.
 * Includes unison (0), minor/major thirds (3, 4), perfect fourth (5),
 * perfect fifth (7), and minor/major sixths (8, 9).
 * Excludes dissonant intervals like minor second (1), tritone (6), and major seventh (11).
 */
const CONSONANT_INTERVALS = new Set([0, 3, 4, 5, 7, 8, 9]);

/**
 * Ensures a MIDI note is consonant with both the chord and a reference melody note.
 *
 * Used for accompaniment generation where we need to avoid harsh dissonances between
 * melody and accompaniment. If no referenceMidi is provided, falls back to simple
 * chord quantization. Otherwise, uses a scoring system that balances three factors:
 *
 * 1. Interval penalty: Heavily penalizes dissonant intervals (seconds, sevenths, tritones)
 * 2. Proximity penalty: Prefers staying close to the original pitch (smooth voice leading)
 * 3. Spread penalty: Avoids extreme register separation from the reference note
 *
 * The weighted scoring allows the algorithm to make intelligent trade-offs: it will
 * accept a slightly larger leap if it avoids a dissonant interval, or move to a different
 * octave if the current register creates too much separation.
 *
 * @param midi Original MIDI note to adjust
 * @param chord Current chord symbol
 * @param referenceMidi Optional reference note (typically melody) to avoid dissonance with
 * @returns MIDI note that is both in the chord and consonant with the reference
 */
export function ensureConsonantPitch(
  midi: number,
  chord: string,
  referenceMidi?: number
): number {
  if (referenceMidi === undefined) {
    return quantizeMidiToChord(midi, chord);
  }
  const root = chordRootToMidi(chord, referenceMidi);
  const intervals = getChordIntervals(chord);
  let best = midi;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const interval of intervals) {
    for (let octave = -2; octave <= 2; octave++) {
      const candidate = root + interval + octave * 12;
      const intervalClass = mod12(candidate - referenceMidi);
      // Heavy penalty for dissonant intervals between candidate and reference
      const intervalPenalty = CONSONANT_INTERVALS.has(intervalClass) ? 0 : 10;
      // Prefer staying close to original pitch
      const proximityPenalty = Math.abs(candidate - midi) * 0.1;
      // Avoid extreme register separation
      const spreadPenalty = Math.abs(candidate - referenceMidi) * 0.05;
      const score = intervalPenalty + proximityPenalty + spreadPenalty;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
  }
  return best;
}
