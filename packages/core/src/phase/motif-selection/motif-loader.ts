/**
 * Motif library loaders and constants
 */

import type {
  RhythmMotif,
  MelodyFragment,
  MelodyRhythmMotif,
  DrumPattern,
  BassPatternMotif,
  TransitionMotif,
  PipelineCompositionOptions,
  VoiceArrangementPreset
} from "../../types.js";

import rhythmMotifsJson from "../../../motifs/rhythm.json" with { type: "json" };
import melodyFragmentsJson from "../../../motifs/melody.json" with { type: "json" };
import melodyRhythmsJson from "../../../motifs/melody-rhythm.json" with { type: "json" };
import drumPatternsJson from "../../../motifs/drums.json" with { type: "json" };
import bassPatternsJson from "../../../motifs/bass-patterns.json" with { type: "json" };
import transitionsJson from "../../../motifs/transitions.json" with { type: "json" };

// ========================================
// Motif Libraries
// ========================================

const rhythmMotifs = rhythmMotifsJson;
const melodyFragments = melodyFragmentsJson;
const melodyRhythms = melodyRhythmsJson;
const drumPatterns = drumPatternsJson;
const bassPatternLibrary = bassPatternsJson;
const transitionPatternLibrary = transitionsJson;

export const rhythmList = rhythmMotifs as RhythmMotif[];
export const rhythmById = new Map(rhythmList.map((motif) => [motif.id, motif]));

export const melodyList = melodyFragments as MelodyFragment[];
export const melodyById = new Map(melodyList.map((fragment) => [fragment.id, fragment]));

export const melodyRhythmList = melodyRhythms as MelodyRhythmMotif[];
export const melodyRhythmById = new Map(melodyRhythmList.map((motif) => [motif.id, motif]));

export const drumList = drumPatterns as DrumPattern[];
export const drumById = new Map(drumList.map((pattern) => [pattern.id, pattern]));

export const bassPatternList = (bassPatternLibrary.patterns ?? []) as BassPatternMotif[];
export const bassPatternsByTexture = bassPatternList.reduce<Map<string, BassPatternMotif[]>>(
  (acc, motif) => {
    const list = acc.get(motif.texture) ?? [];
    list.push(motif);
    acc.set(motif.texture, list);
    return acc;
  },
  new Map()
);

export const transitionList = (transitionPatternLibrary.transitions ?? []) as TransitionMotif[];

// ========================================
// Default Patterns
// ========================================

export const DEFAULT_BASS_STEPS: BassPatternMotif["steps"] = [
  "root",
  "root",
  "fifth",
  "root",
  "fifth",
  "root",
  "fifth",
  "approach"
];

export const FALLBACK_BASS_PATTERN: BassPatternMotif = {
  id: "BP_FALLBACK_STEADY",
  texture: "steady",
  steps: DEFAULT_BASS_STEPS,
  tags: ["fallback"]
};

// ========================================
// Mood-based Tag Mappings
// ========================================

export const RHYTHM_PROPERTY_TAGS: Record<PipelineCompositionOptions["mood"], string[]> = {
  upbeat: ["straight", "syncopation"],
  sad: ["straight", "simple"],
  tense: ["syncopation", "accented"],
  peaceful: ["straight", "open"]
};

export const MELODY_MOOD_TAGS: Record<PipelineCompositionOptions["mood"], string[]> = {
  upbeat: ["bright", "ascending"],
  sad: ["dark", "descending"],
  tense: ["dark", "complex", "leaping"],
  peaceful: ["simple", "arch", "bright"]
};

export const MELODY_RHYTHM_TAGS: Record<PipelineCompositionOptions["mood"], string[]> = {
  upbeat: ["syncopated", "drive"],
  sad: ["legato", "rest_heavy"],
  tense: ["syncopated", "staccato"],
  peaceful: ["legato", "simple"]
};

// ========================================
// Arrangement-specific Rules
// ========================================

export const ARRANGEMENT_DRUM_RULES: Partial<
  Record<
    VoiceArrangementPreset,
    {
      preferBeatTags?: string[];
      preferFillTags?: string[];
      avoidTags?: string[];
      earlySparseMeasures?: number;
    }
  >
> = {
  dualBass: {
    preferBeatTags: ["percussive_layer", "syncopation"],
    preferFillTags: ["drum_fill", "build"]
  },
  bassLed: {
    preferBeatTags: ["four_on_floor", "drive"],
    preferFillTags: ["build"],
    earlySparseMeasures: 1
  },
  layeredBass: {
    preferBeatTags: ["four_on_floor", "loop_safe"],
    preferFillTags: ["drum_fill"]
  },
  minimal: {
    preferBeatTags: ["simple", "open"],
    preferFillTags: ["noise_fx"],
    avoidTags: ["build", "drive"],
    earlySparseMeasures: 2
  },
  breakLayered: {
    preferBeatTags: ["breakbeat", "percussive_layer", "grid16"],
    preferFillTags: ["break", "drum_fill", "breakbeat"],
    avoidTags: ["four_on_floor"]
  },
  lofiPadLead: {
    preferBeatTags: ["lofi", "rest_heavy", "swing_hint"],
    preferFillTags: ["noise_fx", "lofi"],
    avoidTags: ["breakbeat"],
    earlySparseMeasures: 2
  },
  retroPulse: {
    preferBeatTags: ["loop_safe", "grid16", "syncopation"],
    preferFillTags: ["build", "transition"],
    avoidTags: ["rest_heavy"]
  }
};

export const ARRANGEMENT_ACCOMP_RULES: Partial<
  Record<
    VoiceArrangementPreset,
    {
      density: number;
      sustainWholeMeasure?: boolean;
      velocityScale?: number;
      offbeatAccentBoost?: number;
    }
  >
> = {
  dualBass: {
    density: 0.85,
    velocityScale: 0.9,
    offbeatAccentBoost: 3
  },
  bassLed: {
    density: 0.6,
    sustainWholeMeasure: false,
    offbeatAccentBoost: 5
  },
  layeredBass: {
    density: 0.75,
    velocityScale: 0.95
  },
  minimal: {
    density: 0.5,
    sustainWholeMeasure: true,
    velocityScale: 0.8
  },
  breakLayered: {
    density: 0.95,
    velocityScale: 1.05,
    offbeatAccentBoost: 6
  },
  lofiPadLead: {
    density: 0.55,
    sustainWholeMeasure: true,
    velocityScale: 0.7
  },
  retroPulse: {
    density: 0.78,
    velocityScale: 0.95,
    offbeatAccentBoost: 2
  }
};

// ========================================
// RNG Configuration
// ========================================

export const RNG_SEED = 1337;

export function createRng(seed: number | undefined): () => number {
  let state = (seed ?? RNG_SEED) >>> 0;
  if (state === 0) {
    state = RNG_SEED;
  }
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/**
 * Create voice-specific RNG for deterministic variety within voices
 */
export function createVoiceRng(seed: number, voiceIndex: number): () => number {
  return createRng((seed ?? RNG_SEED) + voiceIndex * 100);
}
