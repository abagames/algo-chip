/**
 * Internal type definitions for motif selection phase
 */

import type {
  SectionDefinition,
  StyleIntent,
  StructurePlanResult,
  AbstractNote,
  DrumHit,
  SectionMotifPlan,
  BassPatternMotif,
  MelodyRhythmMotif,
  RhythmMotif,
  MelodyFragment,
} from "../../types.js";

/**
 * Expanded rhythm step with duration in beats
 */
export interface ExpandedRhythmStep {
  durationBeats: number;
}

/**
 * Expanded melody rhythm step with rest/accent info
 */
export interface ExpandedMelodyRhythmStep {
  durationBeats: number;
  rest: boolean;
  accent?: boolean;
}

/**
 * Bass step type for pattern generation
 */
export type BassStep = "root" | "fifth" | "lowFifth" | "octave" | "octaveHigh" | "approach" | "rest";

/**
 * Cached motifs for template-based selection
 */
export interface CachedMotifs {
  rhythm?: string;
  melody?: string;
  melodyRhythm?: string;
  drum?: string;
  bass?: BassPatternMotif;
}

/**
 * Hook motifs for recurring musical phrases
 */
export interface HookMotifs {
  rhythmId: string;
  melodyId: string;
  melodyRhythmId: string;
}

/**
 * Global context for motif selection across composition
 */
export interface MotifContext {
  rng: () => number;
  compositionBaseRegister: number;
  sectionById: Map<string, SectionDefinition>;
  styleIntent: StyleIntent;
  voiceArrangement: StructurePlanResult["voiceArrangement"];
  totalMeasures: number;

  // Used motif tracking
  usedMotifs: {
    rhythms: Set<string>;
    melodies: Set<string>;
    drums: Set<string>;
    melodyRhythms: Set<string>;
    bassPatterns: Set<string>;
    transitions: Set<string>;
  };

  // Caches
  caches: {
    template: Map<string, Map<string, CachedMotifs>>;
    hook: Map<string, Map<number, HookMotifs>>;
    bassPattern: Map<string, BassPatternMotif>;
  };

  // Last selected motifs (for variety/continuity)
  lastMotifs: {
    rhythm?: RhythmMotif;
    melodyFragment?: MelodyFragment;
    drumPatternId?: string;
    transitionId?: string;
  };

  // Usage statistics
  motifUsage: {
    rhythm: Record<string, number>;
    melody: Record<string, number>;
    drums: Record<string, number>;
    melodyRhythm: Record<string, number>;
    bass: Record<string, number>;
    transitions: Record<string, number>;
  };
}

/**
 * Context for phrase-level motif selection
 */
export interface PhraseContext {
  section: SectionDefinition;
  phraseMeasures: number;
  isFirstPhrase: boolean;
  phraseStartMeasureIndex: number;
  cachedHook: HookMotifs | undefined;
  baseRhythm: RhythmMotif;
  baseMelody: MelodyFragment;
  baseMelodyRhythm: MelodyRhythmMotif;
}

/**
 * Context for measure-level motif selection
 */
export interface MeasureContext {
  measureInSection: number;
  globalMeasureIndex: number;
  measureStartBeat: number;
  functionTag: string;
  requiredTags: string[];
  isHookMeasure: boolean;
  phraseOffset: number;
  rhythmMotif: RhythmMotif;
}

/**
 * Accumulated results for motif selection
 */
export interface MotifResults {
  melody: AbstractNote[];
  bass: AbstractNote[];
  accompanimentSeeds: AbstractNote[];
  drums: DrumHit[];
  sectionMotifPlan: SectionMotifPlan[];
}
