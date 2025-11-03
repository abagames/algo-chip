/**
 * Register (pitch range) resolution for melody
 */

import type {
  MoodSetting,
  TempoSetting,
  StylePreset,
  StyleIntent,
  SectionDefinition
} from "../../types.js";
import { createRng } from "./motif-loader.js";
import { establishesHook, repriseHook } from "../structure-planning.js";

export function resolveBaseRegisterForComposition(
  mood: MoodSetting,
  tempo: TempoSetting,
  stylePreset: StylePreset | undefined,
  styleIntent: StyleIntent,
  seed: number
): number {
  const DEFAULT_REGISTER = 72; // C5

  // Mood-based offsets: different moods naturally sit in different registers
  const moodBaseOffsets: Record<MoodSetting, number> = {
    upbeat: 0, // Bright → standard to high (C5 base)
    peaceful: -3, // Peaceful → slightly lower (A4 base)
    tense: -5, // Tense → lower (G4 base, heavier feel)
    sad: -2 // Sad → slightly lower (Bb4 base)
  };

  // Tempo-based offsets: faster tempos benefit from higher registers
  const tempoOffsets: Record<TempoSetting, number> = {
    slow: -2, // Slow → lower
    medium: 0, // Standard
    fast: 2 // Fast → higher (lighter, more agile)
  };

  const presetOffsets: Partial<Record<StylePreset, number>> = {
    minimalTechno: -4,
    progressiveHouse: 3,
    retroLoopwave: 2,
    breakbeatJungle: -2,
    lofiChillhop: -5
  };

  const intentAdjustments =
    (styleIntent.textureFocus ? 2 : 0) +
    (styleIntent.gradualBuild ? 1 : 0) +
    (styleIntent.loopCentric ? -1 : 0) +
    (styleIntent.atmosPad ? 2 : 0) +
    (styleIntent.percussiveLayering ? -2 : 0);

  const moodOffset = moodBaseOffsets[mood] ?? 0;
  const tempoOffset = tempoOffsets[tempo] ?? 0;
  const presetOffset = stylePreset ? (presetOffsets[stylePreset] ?? 0) : 0;

  // Add random variation ±3 semitones for song-to-song diversity
  const rng = createRng(seed);
  const randomVariation = Math.floor(rng() * 7) - 3; // -3 to +3

  const baseRegister =
    DEFAULT_REGISTER +
    moodOffset +
    tempoOffset +
    presetOffset +
    intentAdjustments +
    randomVariation;

  // Clamp to practical chiptune melody range: MIDI 63-78 (Eb4-F#5)
  return Math.max(63, Math.min(78, baseRegister));
}

export function resolveMelodyRegister(
  section: SectionDefinition | undefined,
  measureInSection: number,
  globalMeasureIndex: number,
  totalMeasures: number,
  styleIntent: StyleIntent,
  compositionBaseRegister: number // New parameter: base register for this composition
): number {
  // Use composition-specific base register instead of fixed DEFAULT_REGISTER
  if (!section) {
    return compositionBaseRegister;
  }

  const textureOffsets: Record<SectionDefinition["texture"], number> = {
    steady: 0,
    broken: -3,
    arpeggio: 4
  };

  const clampedMeasure = Math.max(0, measureInSection);
  let offset = textureOffsets[section.texture] ?? 0;

  if (styleIntent.textureFocus) {
    offset -= 4;
  }

  if (styleIntent.filterMotion) {
    offset += 1;
  }

  if (establishesHook(section) && clampedMeasure === 0) {
    offset += 3;
  }
  if (repriseHook(section) && clampedMeasure === 0) {
    offset -= 2;
  }

  if (styleIntent.gradualBuild) {
    // Global progressive build: register rises across entire track
    const globalProgress = globalMeasureIndex / Math.max(1, totalMeasures - 1);
    const buildAmount = Math.round(Math.pow(globalProgress, 0.7) * 8);
    offset += buildAmount;
  }

  const phraseProgress = section.measures > 0 ? clampedMeasure / section.measures : 0;
  if (phraseProgress >= 0.75) {
    offset -= 2;
  }

  const occurrenceDrop = Math.min(section.occurrenceIndex - 1, 2) * 2;
  offset -= occurrenceDrop;

  if (styleIntent.atmosPad) {
    offset -= 1;
  }

  const MIN_REGISTER = 60;
  const MAX_REGISTER = 84;
  const resolved = compositionBaseRegister + offset; // Use composition base register
  return Math.max(MIN_REGISTER, Math.min(MAX_REGISTER, resolved));
}
