import {
  PipelineCompositionOptions,
  StructurePlanResult,
  SectionDefinition,
  TechniqueStrategy,
  StyleIntent,
  StylePreset,
  TexturePlan,
  TextureProfile,
  VoiceArrangement
} from "../types.js";
import { selectVoiceArrangement } from "./structure-planning/voice-arrangement-selector.js";
import chordsJson from "../../motifs/chords.json" with { type: "json" };

const chords = chordsJson as Record<string, Record<string, string[][]>>;
// Note: texture-profiles.json removed per REFACTOR_PLAN.md Step 1-E
// Texture sequences now defined inline (see TEMPLATE_TEXTURE_SEQUENCE below)

/**
 * Base BPM values for tempo settings.
 * These are deliberately chosen to cover the typical range of game music:
 * - slow (90): Ballads, atmospheric tracks (e.g., sad scenes, character themes)
 * - medium (120): Most action and adventure music (4-on-the-floor electronic dance music standard)
 * - fast (150): High-energy battle themes and chase sequences
 * Each base value is jittered ±15 BPM per seed for variety without straying too far from the intended feel.
 */
const TEMPO_BASE: Record<PipelineCompositionOptions["tempo"], number> = {
  slow: 90,
  medium: 120,
  fast: 150
};

/**
 * Maps moods to motif tags — kept as a fallback when no axis coordinates are available.
 */
const MOOD_TAG_MAP: Record<PipelineCompositionOptions["mood"], string[]> = {
  upbeat: ["overworld_bright", "heroic"],
  sad: ["ending_sorrowful", "dark"],
  tense: ["final_battle_tense", "castle_majestic"],
  peaceful: ["town_peaceful", "simple"]
};

/**
 * 2-axis positions for each chord-progression tag in chords.json.
 * Used by selectChordTagsFromAxis to pick the best-matching tags without
 * relying on mood strings that only match a subset of keys.
 * Axes: calm (calmEnergetic) and melodic (percussiveMelodic), same sign convention.
 */
const TAG_AXIS_POSITION: Record<string, { calm: number; melodic: number }> = {
  // major-energetic
  heroic:             { calm:  0.5, melodic:  0.0 },
  overworld_bright:   { calm:  0.4, melodic:  0.2 },
  triumph:            { calm:  0.4, melodic:  0.0 },
  adventure:          { calm:  0.3, melodic:  0.0 },
  adventure_bright:   { calm:  0.5, melodic:  0.1 },
  upbeat_dance:       { calm:  0.4, melodic: -0.2 },
  heroic_fanfare:     { calm:  0.3, melodic:  0.0 },
  playful:            { calm:  0.0, melodic:  0.2 },
  // major-calm
  town_peaceful:      { calm: -0.3, melodic:  0.1 },
  simple:             { calm: -0.2, melodic:  0.0 },
  warm_bright:        { calm: -0.3, melodic:  0.2 },
  peaceful_flow:      { calm: -0.4, melodic:  0.2 },
  // minor-percussive
  final_battle_tense: { calm:  0.3, melodic: -0.5 },
  castle_majestic:    { calm:  0.0, melodic: -0.4 },
  tense_dark:         { calm:  0.1, melodic: -0.4 },
  dramatic_tension:   { calm:  0.2, melodic: -0.5 },
  dark_industrial:    { calm:  0.0, melodic: -0.5 },
  brooding_drama:     { calm: -0.2, melodic: -0.3 },
  dark:               { calm: -0.1, melodic: -0.2 },
  // minor-melodic
  ending_sorrowful:   { calm: -0.2, melodic:  0.2 },
  melancholy:         { calm: -0.3, melodic:  0.2 },
  wistful_journey:    { calm: -0.2, melodic:  0.3 },
  sorrowful_deep:     { calm: -0.3, melodic:  0.2 },
  minor_ballad:       { calm: -0.2, melodic:  0.3 },
  mysterious:         { calm: -0.1, melodic:  0.1 },
  epic_adventure:     { calm:  0.2, melodic:  0.0 },
};

/**
 * Selects the two chord-progression tags from keyData whose axis positions
 * are closest to the given axis. This replaces MOOD_TAG_MAP and guarantees
 * that the selected tags always exist in the current key, eliminating fallback.
 */
function selectChordTagsFromAxis(
  keyData: Record<string, string[][]>,
  axis: { calmEnergetic: number; percussiveMelodic: number }
): string[] {
  const availableTags = Object.keys(keyData).filter((t) => TAG_AXIS_POSITION[t]);
  if (!availableTags.length) return Object.keys(keyData);

  return availableTags
    .sort((a, b) => {
      const pa = TAG_AXIS_POSITION[a];
      const pb = TAG_AXIS_POSITION[b];
      const da = Math.hypot(pa.calm - axis.calmEnergetic, pa.melodic - axis.percussiveMelodic);
      const db = Math.hypot(pb.calm - axis.calmEnergetic, pb.melodic - axis.percussiveMelodic);
      return da - db;
    })
    .slice(0, 2);
}

/**
 * Key candidates for explicit major/minor mode.
 * Replaces KEY_CANDIDATES_PER_MOOD for key selection to decouple key from mood.
 */
const KEY_CANDIDATES_PER_MODE: Record<"major" | "minor", string[]> = {
  major: ["G_Major", "C_Major", "D_Major", "F_Major"],
  minor: ["E_Minor", "A_Minor", "D_Minor", "B_Minor", "C_Minor"]
};

const AVAILABLE_CHORD_KEYS = Object.keys(chords);

const SCALE_DEGREES: Record<string, number[]> = {
  G_Major: [0, 2, 4, 5, 7, 9, 11],
  E_Minor: [0, 2, 3, 5, 7, 8, 10],
  C_Major: [0, 2, 4, 5, 7, 9, 11],
  D_Major: [0, 2, 4, 5, 7, 9, 11],
  F_Major: [0, 2, 4, 5, 7, 9, 11],
  A_Minor: [0, 2, 3, 5, 7, 8, 10],
  D_Minor: [0, 2, 3, 5, 7, 8, 10],
  B_Minor: [0, 2, 3, 5, 7, 8, 10],
  C_Minor: [0, 2, 3, 5, 7, 8, 10],
};

const SECTION_TEMPLATE_POOL: Array<Array<{ id: string; measures: number }>> = [
  [
    { id: "Intro", measures: 1 },
    { id: "A", measures: 3 },
    { id: "B", measures: 2 },
    { id: "A", measures: 2 }
  ],
  [
    { id: "A", measures: 2 },
    { id: "B", measures: 2 },
    { id: "A", measures: 2 },
    { id: "C", measures: 2 }
  ],
  [
    { id: "Intro", measures: 2 },
    { id: "A", measures: 2 },
    { id: "Bridge", measures: 2 },
    { id: "A", measures: 2 }
  ],
  [
    { id: "A", measures: 4 },
    { id: "B", measures: 2 },
    { id: "C", measures: 2 }
  ]
];

const TEMPLATE_INDEX_BY_MOOD: Partial<Record<PipelineCompositionOptions["mood"], number[]>> = {
  tense: [0, 3],
  upbeat: [1, 2],
  sad: [2, 3],
  peaceful: [1, 2]
};

/**
 * Length-optimized section templates for specific measure counts (16, 32, 64).
 * Each (length, mood) entry holds multiple template candidates selected by seed.
 */
const SECTION_TEMPLATES_BY_LENGTH: Record<
  number,
  Record<PipelineCompositionOptions["mood"], Array<Array<{ id: string; measures: number }>>>
> = {
  // 16 measures
  16: {
    upbeat: [
      [ { id: "A", measures: 8 }, { id: "B", measures: 8 } ],
      [ { id: "A", measures: 6 }, { id: "B", measures: 6 }, { id: "A", measures: 4 } ],
      [ { id: "Intro", measures: 4 }, { id: "A", measures: 8 }, { id: "Outro", measures: 4 } ],
    ],
    peaceful: [
      [ { id: "A", measures: 8 }, { id: "B", measures: 8 } ],
      [ { id: "A", measures: 12 }, { id: "B", measures: 4 } ],
      [ { id: "Intro", measures: 4 }, { id: "A", measures: 12 } ],
    ],
    tense: [
      [ { id: "A", measures: 8 }, { id: "B", measures: 8 } ],
      [ { id: "A", measures: 4 }, { id: "B", measures: 8 }, { id: "C", measures: 4 } ],
      [ { id: "A", measures: 10 }, { id: "B", measures: 6 } ],
    ],
    sad: [
      [ { id: "A", measures: 8 }, { id: "B", measures: 8 } ],
      [ { id: "Intro", measures: 4 }, { id: "A", measures: 12 } ],
      [ { id: "A", measures: 6 }, { id: "B", measures: 6 }, { id: "A", measures: 4 } ],
    ],
  },
  // 32 measures
  32: {
    upbeat: [
      [ { id: "A", measures: 8 }, { id: "B", measures: 8 }, { id: "C", measures: 8 }, { id: "D", measures: 8 } ],
      [ { id: "A", measures: 8 }, { id: "A", measures: 8 }, { id: "B", measures: 16 } ],
      [ { id: "Intro", measures: 4 }, { id: "A", measures: 10 }, { id: "B", measures: 10 }, { id: "A", measures: 8 } ],
    ],
    peaceful: [
      [ { id: "A", measures: 16 }, { id: "B", measures: 16 } ],
      [ { id: "A", measures: 12 }, { id: "B", measures: 12 }, { id: "A", measures: 8 } ],
      [ { id: "Intro", measures: 8 }, { id: "A", measures: 16 }, { id: "Outro", measures: 8 } ],
    ],
    tense: [
      [ { id: "A", measures: 8 }, { id: "B", measures: 8 }, { id: "A", measures: 8 }, { id: "C", measures: 8 } ],
      [ { id: "A", measures: 12 }, { id: "B", measures: 12 }, { id: "C", measures: 8 } ],
      [ { id: "Intro", measures: 4 }, { id: "A", measures: 14 }, { id: "B", measures: 14 } ],
    ],
    sad: [
      [ { id: "Intro", measures: 4 }, { id: "A", measures: 12 }, { id: "B", measures: 8 }, { id: "A", measures: 8 } ],
      [ { id: "A", measures: 16 }, { id: "B", measures: 16 } ],
      [ { id: "Intro", measures: 8 }, { id: "A", measures: 12 }, { id: "B", measures: 12 } ],
    ],
  },
  // 64 measures
  64: {
    upbeat: [
      [ { id: "A", measures: 16 }, { id: "B", measures: 16 }, { id: "C", measures: 16 }, { id: "D", measures: 16 } ],
      [ { id: "A", measures: 16 }, { id: "A", measures: 16 }, { id: "B", measures: 32 } ],
      [ { id: "Intro", measures: 8 }, { id: "A", measures: 20 }, { id: "B", measures: 20 }, { id: "A", measures: 16 } ],
    ],
    peaceful: [
      [ { id: "A", measures: 16 }, { id: "B", measures: 16 }, { id: "A", measures: 16 }, { id: "C", measures: 16 } ],
      [ { id: "A", measures: 32 }, { id: "B", measures: 32 } ],
      [ { id: "Intro", measures: 8 }, { id: "A", measures: 24 }, { id: "B", measures: 24 }, { id: "Outro", measures: 8 } ],
    ],
    tense: [
      [ { id: "Intro", measures: 8 }, { id: "A", measures: 16 }, { id: "B", measures: 16 }, { id: "C", measures: 12 }, { id: "A", measures: 12 } ],
      [ { id: "A", measures: 20 }, { id: "B", measures: 20 }, { id: "C", measures: 24 } ],
      [ { id: "Intro", measures: 8 }, { id: "A", measures: 28 }, { id: "B", measures: 28 } ],
    ],
    sad: [
      [ { id: "Intro", measures: 8 }, { id: "A", measures: 20 }, { id: "B", measures: 16 }, { id: "A", measures: 20 } ],
      [ { id: "A", measures: 32 }, { id: "B", measures: 32 } ],
      [ { id: "Intro", measures: 12 }, { id: "A", measures: 24 }, { id: "B", measures: 16 }, { id: "Outro", measures: 12 } ],
    ],
  },
};

const HOOK_TEMPLATES = new Set(["A"]);

const DEFAULT_TEXTURE: TextureProfile = "steady";
const DEFAULT_PHRASE_LENGTH = 1;

const STYLE_INTENT_BASE: StyleIntent = {
  textureFocus: 0,
  loopCentric: 0,
  gradualBuild: 0,
  harmonicStatic: 0,
  percussiveLayering: 0,
  breakInsertion: 0,
  filterMotion: 0,
  syncopationBias: 0,
  atmosPad: 0,
  lofiFeel: 0
};

const STYLE_PRESET_MAP: Record<StylePreset, Partial<StyleIntent>> = {
  minimalTechno: {
    textureFocus: 1.0,
    loopCentric: 1.0,
    harmonicStatic: 1.0,
    percussiveLayering: 1.0,
    filterMotion: 1.0,
    syncopationBias: 1.0
  },
  progressiveHouse: {
    textureFocus: 1.0,
    loopCentric: 1.0,
    gradualBuild: 1.0,
    percussiveLayering: 1.0,
    breakInsertion: 1.0,
    filterMotion: 1.0,
    atmosPad: 1.0
  },
  retroLoopwave: {
    textureFocus: 1.0,
    loopCentric: 1.0,
    percussiveLayering: 1.0,
    filterMotion: 1.0,
    syncopationBias: 1.0
  },
  breakbeatJungle: {
    textureFocus: 1.0,
    percussiveLayering: 1.0,
    breakInsertion: 1.0,
    filterMotion: 1.0,
    syncopationBias: 1.0
  },
  lofiChillhop: {
    loopCentric: 1.0,
    harmonicStatic: 1.0,
    atmosPad: 1.0,
    textureFocus: 1.0
  }
};

interface Phase1Context {
  sections: SectionDefinition[];
  techniqueStrategy: TechniqueStrategy;
}

function createStyleIntent(): StyleIntent {
  return { ...STYLE_INTENT_BASE };
}

function mergeStyleIntent(base: StyleIntent, patch: Partial<StyleIntent> | undefined): StyleIntent {
  if (!patch) {
    return base;
  }
  const merged: StyleIntent = { ...base };
  for (const key of Object.keys(base) as Array<keyof StyleIntent>) {
    if (patch[key] !== undefined) {
      const v = patch[key];
      merged[key] = typeof v === "number" ? Math.max(0, Math.min(1, v)) : 0;
    }
  }
  return merged;
}

/**
 * Pre-compute styleIntent from options only (before sections are built).
 * This allows preset-driven flags like harmonicStatic to influence section building.
 */
function precomputeStyleIntent(options: PipelineCompositionOptions): Partial<StyleIntent> {
  let intent: Partial<StyleIntent> = {};

  // Apply axis-derived overrides first (lower priority)
  if (options.styleOverrides) {
    intent = { ...intent, ...options.styleOverrides };
  }

  // Apply preset last: preset wins over axis-mapping for pre-section decisions (e.g. harmonicStatic)
  if (options.stylePreset) {
    const presetPatch = STYLE_PRESET_MAP[options.stylePreset];
    if (presetPatch) {
      intent = { ...intent, ...presetPatch };
    }
  }

  return intent;
}

function resolveStyleIntent(options: PipelineCompositionOptions, sections: SectionDefinition[]): StyleIntent {
  let intent = createStyleIntent();
  // Preset is applied at the end (after structure inference and styleOverrides) so its
  // intent flags take priority over axis-mapping and structural auto-derivation.

  const totalMeasures = sections.reduce((sum, section) => sum + section.measures, 0);
  const sectionTemplateCounts = sections.reduce<Map<string, number>>((acc, section) => {
    acc.set(section.templateId, (acc.get(section.templateId) ?? 0) + 1);
    return acc;
  }, new Map());
  const hasRepeatedTemplate = Array.from(sectionTemplateCounts.values()).some((count) => count >= 2);
  const averageSectionLength = sections.length ? totalMeasures / sections.length : totalMeasures;

  if (hasRepeatedTemplate || averageSectionLength <= 4) {
    intent.loopCentric = 1.0;
  }

  if (options.tempo !== "slow" && totalMeasures >= 8) {
    intent.loopCentric = 1.0;
    intent.percussiveLayering = 1.0;
  }

  if (options.mood === "tense" || options.mood === "sad") {
    intent.textureFocus = 1.0;
  }

  if (options.mood === "peaceful") {
    intent.atmosPad = 1.0;
  }

  if (options.mood === "upbeat" || options.mood === "tense") {
    intent.syncopationBias = 1.0;
  }

  if (options.tempo === "fast") {
    intent.filterMotion = 1.0;
    intent.percussiveLayering = 1.0;
  }

  if (totalMeasures >= 12) {
    intent.gradualBuild = 1.0;
  }

  const uniqueChords = new Set<string>();
  const distinctProgressions = new Set<string>();
  let sectionsWithSingleChord = 0;
  for (const section of sections) {
    section.chordProgression.forEach((chord) => uniqueChords.add(chord));
    distinctProgressions.add(section.chordProgression.join("|"));
    const chordsInSection = new Set(section.chordProgression);
    if (chordsInSection.size <= 1) {
      sectionsWithSingleChord++;
    }
  }

  const allSectionsStatic = sections.length > 0 && sectionsWithSingleChord === sections.length;
  if (distinctProgressions.size <= 1 && (uniqueChords.size <= 2 || allSectionsStatic)) {
    intent.harmonicStatic = 1.0;
  }

  if (totalMeasures >= 8 && options.tempo !== "slow") {
    intent.breakInsertion = 1.0;
  }

  const inferredHarmonicStatic = intent.harmonicStatic;
  intent = mergeStyleIntent(intent, options.styleOverrides);

  // Only reset harmonicStatic when it was neither inferred nor explicitly provided via styleOverrides
  const wasExplicitlyProvided = options.styleOverrides && typeof options.styleOverrides.harmonicStatic === "number";
  if (inferredHarmonicStatic <= 0 && !wasExplicitlyProvided) {
    intent.harmonicStatic = 0;
  }

  // Preset applied last: wins over axis-mapping and structure inference.
  // This must come after the harmonicStatic guard so the guard cannot reset a preset flag.
  if (options.stylePreset) {
    const presetPatch = STYLE_PRESET_MAP[options.stylePreset];
    if (presetPatch) {
      intent = mergeStyleIntent(intent, presetPatch);
    }
  }

  return intent;
}

function randomFromSeed(seed: number | undefined, salt: number): number {
  const base = (Math.imul(seed ?? 0, 1664525) + Math.imul(salt, 1013904223)) >>> 0;
  const value = (Math.imul(base, 22695477) + 1) >>> 0;
  return value / 0xffffffff;
}

function selectChordProgressions(
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
 * Transpose a chord by a given number of semitones.
 * @param chord - Original chord (e.g., "C", "Am", "F#7")
 * @param semitones - Number of semitones to transpose (positive = up, negative = down)
 * @returns Transposed chord string
 */
function transposeChord(chord: string, semitones: number): string {
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
 * Toggle chord between major and minor (parallel key).
 * @param chord - Original chord (e.g., "C", "Am")
 * @returns Chord with toggled quality
 */
function toggleMinorMajor(chord: string): string {
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
 * Get related chords for limited harmonic progression.
 * Returns chords that are musically close to the base chord.
 * @param baseChord - The root chord
 * @returns Array of 2-3 related chord options
 */
function getRelatedChords(baseChord: string): string[] {
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
 * Build a limited chord progression for harmonicStatic styles.
 * Repeats the base chord 3-4 times, with occasional movement to related chords.
 * @param baseChord - The primary chord
 * @param rng - Random number generator
 * @returns Chord progression array
 */
function buildLimitedProgression(
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

function buildSections(
  options: PipelineCompositionOptions,
  chordsPool: string[][],
  seed: number | undefined,
  precomputedIntent: Partial<StyleIntent>
): SectionDefinition[] {
  const targetMeasures = options.lengthInMeasures;

  // Use length-optimized template if available for this specific length
  let baseTemplate: Array<{ id: string; measures: number }>;

  if (targetMeasures in SECTION_TEMPLATES_BY_LENGTH) {
    const templates = SECTION_TEMPLATES_BY_LENGTH[targetMeasures][options.mood];
    const templateIndex = Math.floor(randomFromSeed(seed, 0x5EED) * templates.length) % templates.length;
    baseTemplate = templates[templateIndex].map(s => ({ ...s }));
  } else {
    // Fall back to existing logic for custom lengths
    baseTemplate = pickTemplateForMood(options.mood, seed);
  }

  const totalTemplateMeasures = baseTemplate.reduce((sum, section) => sum + section.measures, 0);
  let repeatedTemplate: { id: string; measures: number }[] = [];

  if (targetMeasures === totalTemplateMeasures) {
    repeatedTemplate = baseTemplate;
  } else if (targetMeasures > totalTemplateMeasures) {
    const loops = Math.floor(targetMeasures / totalTemplateMeasures);
    for (let i = 0; i < loops; i++) {
      repeatedTemplate = repeatedTemplate.concat(baseTemplate);
    }
    let remaining = targetMeasures - loops * totalTemplateMeasures;
    let idx = 0;
    while (remaining > 0) {
      const templateSection = baseTemplate[idx % baseTemplate.length];
      const clamp = Math.min(templateSection.measures, remaining);
      repeatedTemplate.push({ id: templateSection.id, measures: clamp });
      remaining -= clamp;
      idx++;
    }
  } else {
    let consumed = 0;
    for (const section of baseTemplate) {
      if (consumed + section.measures > targetMeasures) {
        const remaining = Math.max(targetMeasures - consumed, 0);
        if (remaining > 0) {
          repeatedTemplate.push({ id: section.id, measures: remaining });
        }
        break;
      }
      repeatedTemplate.push(section);
      consumed += section.measures;
    }
  }

  const sections: SectionDefinition[] = [];
  let measureCursor = 0;
  let chordIndex = 0;

  const randomizedProgressions = shuffleArray(chordsPool, seed, 200 + chordIndex);
  const occurrenceCounter = new Map<string, number>();

  const chordVariety = new Set<string>();
  for (const progression of randomizedProgressions) {
    progression.forEach((chord) => chordVariety.add(chord));
  }

  // Create RNG for limited progression generation
  const createLocalRng = (localSeed: number | undefined): (() => number) => {
    let state = (localSeed ?? 987654321) >>> 0;
    if (state === 0) state = 987654321;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
  };
  const rng = createLocalRng(seed);

  // Use limited progression for harmonicStatic styles
  const useHarmonicStatic = (precomputedIntent.harmonicStatic ?? 0) > 0.5;
  const useSingleChord = useHarmonicStatic && chordVariety.size <= 1;

  for (const section of repeatedTemplate) {
    let progression: string[];

    if (useSingleChord && randomizedProgressions.length > 0) {
      // Original behavior: single static chord
      progression = [randomizedProgressions[0][0]];
    } else if (useHarmonicStatic && chordsPool.length > 0) {
      // Use the tonic chord from the unshuffled pool so harmonicStatic sections
      // drone on the key's tonic rather than a randomly selected chord.
      const baseChord = chordsPool[0][0];
      progression = buildLimitedProgression(baseChord, rng);
    } else {
      // Normal progression
      progression = randomizedProgressions[chordIndex % randomizedProgressions.length];
    }
    const templateId = section.id;
    const occurrenceIndex = (occurrenceCounter.get(templateId) ?? 0) + 1;
    occurrenceCounter.set(templateId, occurrenceIndex);

    const texture = resolveTexture(templateId, occurrenceIndex, seed);

    sections.push({
      id: `${section.id}${sections.filter((s) => s.id.startsWith(section.id)).length + 1}`,
      startMeasure: measureCursor,
      measures: section.measures,
      chordProgression: progression,
      templateId,
      occurrenceIndex,
      texture
    });
    measureCursor += section.measures;
    // Increment chord index unless using single static chord
    if (!useSingleChord) {
      chordIndex++;
    }
  }

  return sections;
}

// Inline texture sequences (REFACTOR_PLAN.md Step 1-E: Scenario C - Hybrid approach)
// Moved from texture-profiles.json to enable 10% seed-driven variation for diversity
const TEMPLATE_TEXTURE_SEQUENCE: Record<string, TextureProfile[]> = {
  Intro: ["broken"],
  A: ["broken", "steady", "broken"],
  B: ["steady", "steady", "arpeggio"],
  Bridge: ["arpeggio", "steady"],
  C: ["steady", "arpeggio", "steady"]
};

const TEMPLATE_PHRASE_LENGTH: Record<string, number> = {
  Intro: 1,
  A: 2,
  B: 2,
  Bridge: 4,
  C: 2
};

// Arpeggio keep probabilities (first vs repeat occurrences)
const ARPEGGIO_KEEP_PROBABILITY = {
  firstOccurrence: 0.7,
  repeatOccurrence: 0.4
};

// Seed-driven variation probability (maintains diversity per VARIATION_RISK_ASSESSMENT.md)
const TEXTURE_VARIATION_PROBABILITY = 0.1;

function resolveTexture(
  templateId: string,
  occurrenceIndex: number,
  seed: number | undefined
): TextureProfile {
  const sequence = TEMPLATE_TEXTURE_SEQUENCE[templateId] ?? [DEFAULT_TEXTURE];
  const plannedTexture = sequence[(occurrenceIndex - 1) % sequence.length] ?? DEFAULT_TEXTURE;

  // Apply arpeggio probability fallback logic
  if (plannedTexture === "arpeggio") {
    const isFirstOccurrence = occurrenceIndex === 1;
    const seedSalt = templateId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const roll = randomFromSeed(seed, 1000 + seedSalt * 7 + occurrenceIndex * 13);
    const keepProbability = isFirstOccurrence
      ? ARPEGGIO_KEEP_PROBABILITY.firstOccurrence
      : ARPEGGIO_KEEP_PROBABILITY.repeatOccurrence;

    if (roll > keepProbability) {
      const fallback = sequence.find((candidate) => candidate !== "arpeggio") ?? DEFAULT_TEXTURE;
      return fallback;
    }
  }

  // Apply 10% seed-driven variation to maintain diversity (REFACTOR_PLAN.md Scenario C)
  const variationSalt = templateId.charCodeAt(0) * 100 + occurrenceIndex;
  const variationRoll = randomFromSeed(seed, 2000 + variationSalt);
  if (variationRoll < TEXTURE_VARIATION_PROBABILITY) {
    const allTextures: TextureProfile[] = ["steady", "broken", "arpeggio"];
    const alternatives = allTextures.filter((t) => t !== plannedTexture);
    const index = Math.floor(randomFromSeed(seed, 3000 + variationSalt) * alternatives.length);
    return alternatives[index] ?? plannedTexture;
  }

  return plannedTexture;
}

function resolvePhraseLength(templateId: string): number {
  return TEMPLATE_PHRASE_LENGTH[templateId] ?? DEFAULT_PHRASE_LENGTH;
}

// Helper functions for computed section properties (REFACTOR_PLAN.md Step 1-D)
export function getPhraseLengthForSection(section: { templateId: string }): number {
  return resolvePhraseLength(section.templateId);
}

export function establishesHook(section: { templateId: string; occurrenceIndex: number }): boolean {
  return section.occurrenceIndex === 1 && HOOK_TEMPLATES.has(section.templateId);
}

export function repriseHook(section: { templateId: string; occurrenceIndex: number }): boolean {
  return section.occurrenceIndex > 1 && HOOK_TEMPLATES.has(section.templateId);
}

function deriveTechniqueStrategy(
  mood: PipelineCompositionOptions["mood"],
  styleIntent: StyleIntent,
  seed: number | undefined
): TechniqueStrategy {
  let base: TechniqueStrategy;
  let salt = 50;
  switch (mood) {
    case "tense":
      base = { echoProbability: 0.5, detuneProbability: 0.3, fastArpeggioProbability: 0.4 };
      salt = 10;
      break;
    case "upbeat":
      base = { echoProbability: 0.4, detuneProbability: 0.2, fastArpeggioProbability: 0.2 };
      salt = 20;
      break;
    case "sad":
      base = { echoProbability: 0.6, detuneProbability: 0.1, fastArpeggioProbability: 0.1 };
      salt = 30;
      break;
    case "peaceful":
      base = { echoProbability: 0.5, detuneProbability: 0.05, fastArpeggioProbability: 0.05 };
      salt = 40;
      break;
    default:
      base = { echoProbability: 0.3, detuneProbability: 0.3, fastArpeggioProbability: 0.3 };
      break;
  }

  const styled = applyStyleIntentToTechnique(base, styleIntent);
  return jitterTechnique(styled, seed, salt);
}

function jitterTechnique(base: TechniqueStrategy, seed: number | undefined, salt: number): TechniqueStrategy {
  const clamp = (value: number) => Math.min(0.95, Math.max(0.05, value));
  const jitter = (offsetSalt: number) => (randomFromSeed(seed, salt + offsetSalt) - 0.5) * 0.2;
  return {
    echoProbability: clamp(base.echoProbability + jitter(1)),
    detuneProbability: clamp(base.detuneProbability + jitter(2)),
    fastArpeggioProbability: clamp(base.fastArpeggioProbability + jitter(3))
  };
}

function applyStyleIntentToTechnique(base: TechniqueStrategy, intent: StyleIntent): TechniqueStrategy {
  const result: TechniqueStrategy = { ...base };

  if (intent.textureFocus > 0.5) {
    result.fastArpeggioProbability = Math.max(0.05, result.fastArpeggioProbability * 0.6);
    result.echoProbability = Math.min(0.95, result.echoProbability + 0.05);
  }

  if (intent.loopCentric > 0.5) {
    result.detuneProbability = Math.max(0.05, result.detuneProbability * 0.8);
  }

  if (intent.gradualBuild > 0.5) {
    result.echoProbability = Math.min(0.95, result.echoProbability + 0.1);
  }

  if (intent.harmonicStatic > 0.5) {
    result.detuneProbability = Math.max(0.05, result.detuneProbability * 0.7);
  }

  if (intent.percussiveLayering > 0.5) {
    result.fastArpeggioProbability = Math.min(0.9, result.fastArpeggioProbability + 0.05);
  }

  if (intent.filterMotion > 0.5) {
    result.detuneProbability = Math.min(0.9, result.detuneProbability + 0.1);
  }

  if (intent.syncopationBias > 0.5) {
    result.echoProbability = Math.min(0.9, result.echoProbability + 0.05);
  }

  if (intent.atmosPad > 0.5) {
    result.echoProbability = Math.min(0.95, result.echoProbability + 0.08);
  }

  if (intent.breakInsertion > 0.5) {
    result.fastArpeggioProbability = Math.max(0.05, result.fastArpeggioProbability * 0.9);
  }

  return result;
}

export function planStructure(options: PipelineCompositionOptions): StructurePlanResult {
  const baseBpm = TEMPO_BASE[options.tempo];
  const bpmOffset = Math.round((randomFromSeed(options.seed, 1) - 0.5) * 30);
  const bpm = baseBpm + Math.max(-15, Math.min(15, bpmOffset));
  const key = resolveKey(options.mood, options.seed, options.mode);
  const scaleDegrees = SCALE_DEGREES[key];

  if (!scaleDegrees) {
    throw new Error(`Scale not defined for key ${key}`);
  }

  const chordTags = options.axis
    ? selectChordTagsFromAxis((chords as any)[key] as Record<string, string[][]>, options.axis)
    : MOOD_TAG_MAP[options.mood];
  const chordsPool = selectChordProgressions(key, chordTags, options.seed);
  const precomputedIntent = precomputeStyleIntent(options);
  const sections = buildSections(options, chordsPool, options.seed, precomputedIntent);
  const styleIntent = resolveStyleIntent(options, sections);
  const techniqueStrategy = deriveTechniqueStrategy(options.mood, styleIntent, options.seed);

  validateSectionLength(options.lengthInMeasures, sections);

  const voiceArrangement = selectVoiceArrangement(options.seed, options.stylePreset);

  return {
    bpm,
    key,
    scaleDegrees,
    sections,
    techniqueStrategy,
    styleIntent,
    voiceArrangement
  };
}

function pickTemplateForMood(mood: PipelineCompositionOptions["mood"], seed: number | undefined) {
  const candidates = TEMPLATE_INDEX_BY_MOOD[mood] ?? SECTION_TEMPLATE_POOL.map((_, index) => index);
  const index = candidates[Math.floor(randomFromSeed(seed, 60) * candidates.length)] ?? 0;
  return SECTION_TEMPLATE_POOL[index].map((segment) => ({ ...segment }));
}

function shuffleArray<T>(items: T[], seed: number | undefined, salt: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(randomFromSeed(seed, salt + i) * (i + 1));
    const temp = copy[i];
    copy[i] = copy[randomIndex];
    copy[randomIndex] = temp;
  }
  return copy;
}

function resolveKey(
  mood: PipelineCompositionOptions["mood"],
  seed: number | undefined,
  mode?: "major" | "minor"
): string {
  const pool = mode
    ? KEY_CANDIDATES_PER_MODE[mode]
    : (mood === "upbeat" || mood === "peaceful"
        ? KEY_CANDIDATES_PER_MODE.major
        : KEY_CANDIDATES_PER_MODE.minor);
  const candidates = pool.filter((k) => AVAILABLE_CHORD_KEYS.includes(k));
  if (candidates.length) {
    const index = Math.floor(randomFromSeed(seed, 0x1234) * candidates.length) % candidates.length;
    return candidates[index];
  }
  if (!AVAILABLE_CHORD_KEYS.length) {
    throw new Error("Chord library is empty");
  }
  const fallbackIndex = Math.floor(randomFromSeed(seed, 5) * AVAILABLE_CHORD_KEYS.length) % AVAILABLE_CHORD_KEYS.length;
  return AVAILABLE_CHORD_KEYS[fallbackIndex];
}

function validateSectionLength(target: number, sections: SectionDefinition[]) {
  const sum = sections.reduce((acc, s) => acc + s.measures, 0);
  if (sum !== target) {
    throw new Error(`Section length mismatch. expected=${target}, actual=${sum}`);
  }
}
