/**
 * Bass Pattern Generation
 *
 * This module generates bass lines using a step-based pattern system. Unlike melody
 * (which uses scale degrees) or drums (which use instrument symbols), bass patterns
 * use symbolic "steps" that describe harmonic/rhythmic functions.
 *
 * ## Why Step-Based Bass Patterns?
 *
 * Bass lines in chiptune/game music typically follow predictable harmonic formulas:
 * - **Root-fifth alternation**: The most common pattern (root on downbeat, fifth on off-beat)
 * - **Octave jumps**: Add energy without changing harmony
 * - **Approach notes**: Chromatic approach to next chord root (smooth voice leading)
 * - **Rests**: Create rhythmic space and prevent muddiness
 *
 * Step-based patterns abstract these formulas:
 * - "root" → chord root (e.g., C for C major)
 * - "fifth" → perfect fifth above root (e.g., G for C major)
 * - "approach" → chromatic approach to next chord (e.g., B → C)
 * - "rest" → silence
 *
 * This allows a single pattern like ["root", "root", "fifth", "root", "fifth", "root",
 * "fifth", "approach"] to work across all keys and chords.
 *
 * ## Bass Pattern Caching
 *
 * The resolveBassPattern function caches patterns per section to create consistency:
 * - First measure of section selects and caches a pattern
 * - Subsequent measures in the same section reuse the cached pattern
 * - Final measure can substitute an "section_end" variant for better cadences
 *
 * This creates the root-fifth "walking bass" feel common in chiptune, where the
 * same rhythm repeats but the pitches change with the chord progression.
 *
 * ## Harmonic Static Mode
 *
 * When styleIntent.harmonicStatic is true (minimal techno, drone, lo-fi), the system
 * prefers "drone" or "static" bass patterns that repeat the root note with minimal
 * movement. This reinforces the static harmonic aesthetic.
 *
 * ## 8th Note Resolution
 *
 * Bass steps occur on 8th note boundaries (0.5 beat spacing), providing:
 * - Fast enough for "walking" movement (typical game music bass speed)
 * - Slow enough to avoid muddiness (low frequencies need time to decay)
 * - Compatible with 4-on-the-floor drums (kick on every beat = 1.0 beat spacing)
 */

import type { BassPatternMotif, AbstractNote, StructurePlanResult, SectionDefinition, StyleIntent } from "../../types.js";
import { chordRootToMidi, quantizeMidiToChord } from "../../musicUtils.js";
import { DEFAULT_BASS_STEPS, FALLBACK_BASS_PATTERN } from "./motif-loader.js";
import { selectBassPattern } from "./bass-selector.js";
import { resolveBassVelocity } from "./velocity-resolver.js";
import { establishesHook } from "../structure-planning.js";
import type { BassStep } from "./types.js";

/**
 * Converts a bass step symbol to MIDI pitch.
 *
 * Each step type represents a harmonic function relative to the current chord:
 *
 * - **root**: Chord root (most stable, typically on downbeats)
 * - **fifth**: Perfect fifth above root (second most stable, off-beat support)
 * - **lowFifth**: Fifth below root (darker, lower register alternative)
 * - **octave**: Root +12 semitones (adds brightness without changing harmony)
 * - **octaveHigh**: Root +19 semitones (dramatic register leap, rare)
 * - **approach**: Chromatic approach to next chord root (e.g., B→C, creates tension)
 * - **rest**: Returns null (caller skips note generation)
 *
 * ## Quantization Strategy
 *
 * All pitches are quantized to the current chord using quantizeMidiToChord. This ensures
 * bass notes are always consonant even if the step calculation produces a non-chord-tone
 * (e.g., "fifth" might initially calculate to F# in a C major chord, but quantization
 * snaps it to G, the actual fifth).
 *
 * ## Approach Note Logic
 *
 * The "approach" step uses nextChord to calculate a chromatic approach:
 * 1. Find the root of the next chord
 * 2. Subtract 1 semitone (chromatically approach from below)
 * 3. Quantize to the next chord (ensures approach note is consonant with destination)
 *
 * This creates smooth voice leading at chord changes (e.g., B approaching C at Cmaj chord change).
 *
 * @param step - Bass step symbol
 * @param chord - Current chord symbol
 * @param nextChord - Next chord symbol (used for "approach" calculation)
 * @param baseMidi - Reference MIDI note for the chord root (typically 40 = E2)
 * @returns MIDI pitch, or null for rests
 */
export function bassStepToMidi(
  step: BassStep,
  chord: string,
  nextChord: string,
  baseMidi: number
): number | null {
  switch (step) {
    case "root":
      return quantizeMidiToChord(baseMidi, chord);
    case "fifth":
      return quantizeMidiToChord(baseMidi + 7, chord);
    case "lowFifth":
      return quantizeMidiToChord(baseMidi - 5, chord);
    case "octave":
      return quantizeMidiToChord(baseMidi + 12, chord);
    case "octaveHigh":
      return quantizeMidiToChord(baseMidi + 19, chord);
    case "approach": {
      const nextRoot = chordRootToMidi(nextChord, baseMidi + 5);
      return quantizeMidiToChord(nextRoot - 1, nextChord);
    }
    case "rest":
      return null;
    default:
      return quantizeMidiToChord(baseMidi, chord);
  }
}

/**
 * Build bass pattern with default MIDI calculation
 */
export function buildBassPattern(
  section: StructurePlanResult["sections"][number],
  measureStartBeat: number,
  chord: string,
  nextChord: string,
  motif: BassPatternMotif
): Array<AbstractNote & { midiOverride: number }> {
  const steps = motif.steps?.length ? motif.steps : DEFAULT_BASS_STEPS;
  const notes: Array<AbstractNote & { midiOverride: number }> = [];
  const baseMidi = chordRootToMidi(chord, 40);
  const nextChordName = nextChord ?? chord;

  for (let step = 0; step < steps.length; step++) {
    const startBeat = measureStartBeat + step * 0.5;
    const midi = bassStepToMidi(steps[step], chord, nextChordName, baseMidi);

    // Skip rest steps
    if (midi === null) {
      continue;
    }

    notes.push({
      channelRole: "bass",
      startBeat,
      durationBeats: 0.5,
      degree: 0,
      velocity: resolveBassVelocity(section, step),
      sectionId: section.id,
      midiOverride: midi
    });
  }

  return notes;
}

/**
 * Build bass pattern with explicit baseMidi
 */
export function buildBassPatternWithBaseMidi(
  section: StructurePlanResult["sections"][number],
  measureStartBeat: number,
  chord: string,
  nextChord: string,
  motif: BassPatternMotif,
  baseMidi: number,
  octaveOffset: number = 0
): Array<AbstractNote & { midiOverride: number }> {
  const steps = motif.steps?.length ? motif.steps : DEFAULT_BASS_STEPS;
  const notes: Array<AbstractNote & { midiOverride: number }> = [];
  const nextChordName = nextChord ?? chord;

  for (let step = 0; step < steps.length; step++) {
    const startBeat = measureStartBeat + step * 0.5;
    const midi = bassStepToMidi(steps[step], chord, nextChordName, baseMidi);

    // Skip rest steps
    if (midi === null) {
      continue;
    }

    notes.push({
      channelRole: "bass",
      startBeat,
      durationBeats: 0.5,
      degree: 0,
      velocity: resolveBassVelocity(section, step),
      sectionId: section.id,
      midiOverride: midi
    });
  }

  return notes;
}

/**
 * Resolve bass pattern for a measure with caching
 */
export function resolveBassPattern(
  section: SectionDefinition,
  measureInSection: number,
  rng: () => number,
  used: Set<string>,
  cache: Map<string, BassPatternMotif>,
  styleIntent: StyleIntent,
  options?: { enforceDroneStatic?: boolean; preferredTags?: string[] }
): BassPatternMotif {
  const enforceDroneStatic = options?.enforceDroneStatic ?? true;
  const preferredTags = options?.preferredTags ?? [];
  const isFinalMeasure = measureInSection === section.measures - 1;
  const cached = cache.get(section.id);
  if (cached) {
    if (isFinalMeasure && !(cached.tags ?? []).includes("section_end")) {
      const endPattern = selectBassPattern(
        section.texture,
        styleIntent,
        rng,
        used,
        ["section_end"],
        cached.id
      );
      if (endPattern) {
        used.add(endPattern.id);
        return endPattern;
      }
    }
    return cached;
  }

  // harmonicStatic: enforce drone bass for minimal techno aesthetic
  if (styleIntent.harmonicStatic) {
    if (!enforceDroneStatic && preferredTags.length) {
      const preferredPattern = selectBassPattern(
        section.texture,
        styleIntent,
        rng,
        used,
        preferredTags,
        undefined
      );
      if (preferredPattern) {
        cache.set(section.id, preferredPattern);
        used.add(preferredPattern.id);
        return preferredPattern;
      }
    }

    const dronePattern = selectBassPattern(
      section.texture,
      styleIntent,
      rng,
      used,
      ["drone", "static"],
      undefined
    );
    if (dronePattern && enforceDroneStatic) {
      cache.set(section.id, dronePattern);
      used.add(dronePattern.id);
      return dronePattern;
    }
  }

  const initialTags = establishesHook(section) ? ["pickup"] : [];
  const basePattern =
    selectBassPattern(section.texture, styleIntent, rng, used, initialTags, undefined) ??
    selectBassPattern(section.texture, styleIntent, rng, used, [], undefined) ??
    FALLBACK_BASS_PATTERN;
  cache.set(section.id, basePattern);
  used.add(basePattern.id);

  if (isFinalMeasure && !(basePattern.tags ?? []).includes("section_end")) {
    const endPattern = selectBassPattern(
      section.texture,
      styleIntent,
      rng,
      used,
      ["section_end"],
      basePattern.id
    );
    if (endPattern) {
      used.add(endPattern.id);
      return endPattern;
    }
  }

  return basePattern;
}
