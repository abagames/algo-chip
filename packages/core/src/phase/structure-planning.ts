import {
  PipelineCompositionOptions,
  StructurePlanResult,
  SectionDefinition,
  TechniqueStrategy,
  StyleIntent,
  StylePreset,
  TexturePlan,
  TextureProfile,
  VoiceArrangement,
  VoiceArrangementPreset
} from "../types.js";
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
 * Maps moods to motif tags for filtering chord progressions and melodies.
 * Tags are ordered by priority (first = preferred). This allows Phase 2 to select
 * motifs that match the emotional intent. For example, "upbeat" music prefers
 * "overworld_bright" progressions but can fall back to "heroic" if needed.
 * Tags come from the motif JSON library and were manually curated for each mood.
 */
const MOOD_TAG_MAP: Record<PipelineCompositionOptions["mood"], string[]> = {
  upbeat: ["overworld_bright", "heroic"],
  sad: ["ending_sorrowful", "dark"],
  tense: ["final_battle_tense", "castle_majestic"],
  peaceful: ["town_peaceful", "simple"]
};

/**
 * Default musical keys for each mood.
 * These key choices are based on common music theory associations and retro game music conventions:
 * - upbeat → G Major: Bright, cheerful (common in overworld themes)
 * - sad/tense → E Minor: Darker, more emotional (used in dramatic scenes)
 * - peaceful → C Major: Neutral, calm (simplest key, no accidentals)
 * These defaults can be overridden by seed-based selection if the preferred key lacks motifs.
 */
const DEFAULT_KEY_PER_MOOD: Record<PipelineCompositionOptions["mood"], string> = {
  upbeat: "G_Major",
  sad: "E_Minor",
  tense: "E_Minor",
  peaceful: "C_Major"
};

const AVAILABLE_CHORD_KEYS = Object.keys(chords);

const SCALE_DEGREES: Record<string, number[]> = {
  G_Major: [0, 2, 4, 5, 7, 9, 11],
  E_Minor: [0, 2, 3, 5, 7, 8, 10],
  C_Major: [0, 2, 4, 5, 7, 9, 11]
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
 * These templates provide better structure for common composition lengths.
 */
const SECTION_TEMPLATES_BY_LENGTH: Record<
  number,
  Record<PipelineCompositionOptions["mood"], Array<{ id: string; measures: number }>>
> = {
  // 16 measures: Simple AB structure
  16: {
    upbeat: [
      { id: "A", measures: 8 },   // Intro/Verse
      { id: "B", measures: 8 }    // Chorus/Outro
    ],
    peaceful: [
      { id: "A", measures: 8 },
      { id: "B", measures: 8 }
    ],
    tense: [
      { id: "A", measures: 8 },
      { id: "B", measures: 8 }
    ],
    sad: [
      { id: "A", measures: 8 },
      { id: "B", measures: 8 }
    ]
  },
  // 32 measures: Balanced ABCD or AA-BB structure
  32: {
    upbeat: [
      { id: "A", measures: 8 },   // Intro/Verse A
      { id: "B", measures: 8 },   // Chorus A
      { id: "C", measures: 8 },   // Verse B/Bridge
      { id: "D", measures: 8 }    // Chorus B/Outro
    ],
    peaceful: [
      { id: "A", measures: 16 },  // Long section A
      { id: "B", measures: 16 }   // Long section B
    ],
    tense: [
      { id: "A", measures: 8 },
      { id: "B", measures: 8 },
      { id: "A", measures: 8 },
      { id: "C", measures: 8 }
    ],
    sad: [
      { id: "Intro", measures: 4 },
      { id: "A", measures: 12 },
      { id: "B", measures: 8 },
      { id: "A", measures: 8 }
    ]
  },
  // 64 measures: Complex development with longer sections
  64: {
    upbeat: [
      { id: "A", measures: 16 },  // Intro/Verse A
      { id: "B", measures: 16 },  // Chorus A
      { id: "C", measures: 16 },  // Verse B/Bridge
      { id: "D", measures: 16 }   // Chorus B/Outro
    ],
    peaceful: [
      { id: "A", measures: 16 },
      { id: "B", measures: 16 },
      { id: "A", measures: 16 },
      { id: "C", measures: 16 }
    ],
    tense: [
      { id: "Intro", measures: 8 },
      { id: "A", measures: 16 },
      { id: "B", measures: 16 },
      { id: "C", measures: 12 },
      { id: "A", measures: 12 }
    ],
    sad: [
      { id: "Intro", measures: 8 },
      { id: "A", measures: 20 },
      { id: "B", measures: 16 },
      { id: "A", measures: 20 }
    ]
  }
};

const HOOK_TEMPLATES = new Set(["A"]);

const DEFAULT_TEXTURE: TextureProfile = "steady";
const DEFAULT_PHRASE_LENGTH = 1;

const STYLE_INTENT_BASE: StyleIntent = {
  textureFocus: false,
  loopCentric: false,
  gradualBuild: false,
  harmonicStatic: false,
  percussiveLayering: false,
  breakInsertion: false,
  filterMotion: false,
  syncopationBias: false,
  atmosPad: false
};

const STYLE_PRESET_MAP: Record<StylePreset, Partial<StyleIntent>> = {
  minimalTechno: {
    textureFocus: true,
    loopCentric: true,
    harmonicStatic: true,
    percussiveLayering: true,
    filterMotion: true,
    syncopationBias: true
  },
  progressiveHouse: {
    textureFocus: true,
    loopCentric: true,
    gradualBuild: true,
    percussiveLayering: true,
    breakInsertion: true,
    filterMotion: true,
    atmosPad: true
  },
  retroLoopwave: {
    textureFocus: true,
    loopCentric: true,
    percussiveLayering: true,
    filterMotion: true,
    syncopationBias: true
  },
  breakbeatJungle: {
    textureFocus: true,
    percussiveLayering: true,
    breakInsertion: true,
    filterMotion: true,
    syncopationBias: true
  },
  lofiChillhop: {
    loopCentric: true,
    harmonicStatic: true,
    atmosPad: true,
    textureFocus: true
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
      merged[key] = Boolean(patch[key]);
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

  // Apply preset first
  if (options.stylePreset) {
    const presetPatch = STYLE_PRESET_MAP[options.stylePreset];
    if (presetPatch) {
      intent = { ...intent, ...presetPatch };
    }
  }

  // Apply user overrides
  if (options.styleOverrides) {
    intent = { ...intent, ...options.styleOverrides };
  }

  return intent;
}

function resolveStyleIntent(options: PipelineCompositionOptions, sections: SectionDefinition[]): StyleIntent {
  let intent = createStyleIntent();
  if (options.stylePreset) {
    const presetPatch = STYLE_PRESET_MAP[options.stylePreset];
    if (presetPatch) {
      intent = mergeStyleIntent(intent, presetPatch);
    }
  }

  const totalMeasures = sections.reduce((sum, section) => sum + section.measures, 0);
  const sectionTemplateCounts = sections.reduce<Map<string, number>>((acc, section) => {
    acc.set(section.templateId, (acc.get(section.templateId) ?? 0) + 1);
    return acc;
  }, new Map());
  const hasRepeatedTemplate = Array.from(sectionTemplateCounts.values()).some((count) => count >= 2);
  const averageSectionLength = sections.length ? totalMeasures / sections.length : totalMeasures;

  if (hasRepeatedTemplate || averageSectionLength <= 4) {
    intent.loopCentric = true;
  }

  if (options.tempo !== "slow" && totalMeasures >= 8) {
    intent.loopCentric = true;
    intent.percussiveLayering = true;
  }

  if (options.mood === "tense" || options.mood === "sad") {
    intent.textureFocus = true;
  }

  if (options.mood === "peaceful") {
    intent.atmosPad = true;
  }

  if (options.mood === "upbeat" || options.mood === "tense") {
    intent.syncopationBias = true;
  }

  if (options.tempo === "fast") {
    intent.filterMotion = true;
    intent.percussiveLayering = true;
  }

  if (totalMeasures >= 12) {
    intent.gradualBuild = true;
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
    intent.harmonicStatic = true;
  }

  if (totalMeasures >= 8 && options.tempo !== "slow") {
    intent.breakInsertion = true;
  }

  const inferredHarmonicStatic = intent.harmonicStatic;
  intent = mergeStyleIntent(intent, options.styleOverrides);

  // Only override harmonicStatic if it wasn't explicitly provided in styleOverrides
  const wasExplicitlyProvided = options.styleOverrides && typeof options.styleOverrides.harmonicStatic === "boolean";
  if (!inferredHarmonicStatic && !wasExplicitlyProvided) {
    intent.harmonicStatic = false;
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
    // Use optimized template for 16, 32, or 64 measures
    baseTemplate = SECTION_TEMPLATES_BY_LENGTH[targetMeasures][options.mood].map(s => ({ ...s }));
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
  const useHarmonicStatic = precomputedIntent.harmonicStatic === true;
  const useSingleChord = useHarmonicStatic && chordVariety.size <= 1;

  for (const section of repeatedTemplate) {
    let progression: string[];

    if (useSingleChord && randomizedProgressions.length > 0) {
      // Original behavior: single static chord
      progression = [randomizedProgressions[0][0]];
    } else if (useHarmonicStatic && randomizedProgressions.length > 0) {
      // New behavior: limited progression with occasional related chords
      const baseChord = randomizedProgressions[chordIndex % randomizedProgressions.length][0];
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

  if (intent.textureFocus) {
    result.fastArpeggioProbability = Math.max(0.05, result.fastArpeggioProbability * 0.6);
    result.echoProbability = Math.min(0.95, result.echoProbability + 0.05);
  }

  if (intent.loopCentric) {
    result.detuneProbability = Math.max(0.05, result.detuneProbability * 0.8);
  }

  if (intent.gradualBuild) {
    result.echoProbability = Math.min(0.95, result.echoProbability + 0.1);
  }

  if (intent.harmonicStatic) {
    result.detuneProbability = Math.max(0.05, result.detuneProbability * 0.7);
  }

  if (intent.percussiveLayering) {
    result.fastArpeggioProbability = Math.min(0.9, result.fastArpeggioProbability + 0.05);
  }

  if (intent.filterMotion) {
    result.detuneProbability = Math.min(0.9, result.detuneProbability + 0.1);
  }

  if (intent.syncopationBias) {
    result.echoProbability = Math.min(0.9, result.echoProbability + 0.05);
  }

  if (intent.atmosPad) {
    result.echoProbability = Math.min(0.95, result.echoProbability + 0.08);
  }

  if (intent.breakInsertion) {
    result.fastArpeggioProbability = Math.max(0.05, result.fastArpeggioProbability * 0.9);
  }

  return result;
}

// ========================================
// Voice Arrangement Definitions
// ========================================

const VOICE_ARRANGEMENTS: Record<VoiceArrangementPreset, VoiceArrangement> = {
  standard: {
    id: "standard",
    description: "Classic melody + accompaniment + bass",
    voices: [
      { role: "melody", channel: "square1", priority: 1.0, octaveOffset: 0 },
      { role: "accompaniment", channel: "square2", priority: 1.0, octaveOffset: 0 },
      { role: "bass", channel: "triangle", priority: 1.0, octaveOffset: 0 }
    ]
  },

  swapped: {
    id: "swapped",
    description: "Swapped square channels for tonal variety",
    voices: [
      { role: "melody", channel: "square2", priority: 1.0, octaveOffset: 0 },
      { role: "accompaniment", channel: "square1", priority: 1.0, octaveOffset: 0 },
      { role: "bass", channel: "triangle", priority: 1.0, octaveOffset: 0 }
    ]
  },

  dualBass: {
    id: "dualBass",
    description: "Melody with dual bass (thick low end)",
    voices: [
      { role: "melody", channel: "square1", priority: 1.0, octaveOffset: 0 },
      { role: "bass", channel: "square2", priority: 1.0, octaveOffset: 0, seedOffset: 0 },
      { role: "bassAlt", channel: "triangle", priority: 0.7, octaveOffset: -1, seedOffset: 100 }
    ]
  },

  bassLed: {
    id: "bassLed",
    description: "Bass-focused with sparse melodic decoration",
    voices: [
      { role: "bass", channel: "triangle", priority: 1.0, octaveOffset: -1, seedOffset: 0 },
      { role: "bassAlt", channel: "square2", priority: 0.8, octaveOffset: 0, seedOffset: 200 },
      { role: "melody", channel: "square1", priority: 0.3, octaveOffset: 0 }
    ]
  },

  layeredBass: {
    id: "layeredBass",
    description: "Layered bass with complementary square/triangle movement",
    voices: [
      { role: "bass", channel: "square1", priority: 1.0, octaveOffset: 0, seedOffset: 0 },
      { role: "bassAlt", channel: "triangle", priority: 0.85, octaveOffset: 0, seedOffset: 160 },
      { role: "melody", channel: "square2", priority: 1.0, octaveOffset: 0 }
    ]
  },

  minimal: {
    id: "minimal",
    description: "Minimal techno: bass + sparse pad only",
    voices: [
      { role: "bass", channel: "square1", priority: 1.0, octaveOffset: 0 },
      { role: "pad", channel: "triangle", priority: 0.4, octaveOffset: 0 }
    ]
  },

  breakLayered: {
    id: "breakLayered",
    description: "Breakbeat layering: dual bass pressure with agile lead",
    voices: [
      { role: "bass", channel: "square1", priority: 1.0, octaveOffset: 0, seedOffset: 0 },
      { role: "bassAlt", channel: "triangle", priority: 0.95, octaveOffset: -1, seedOffset: 140 },
      { role: "melody", channel: "square2", priority: 0.85, octaveOffset: 0, seedOffset: 240 }
    ]
  },

  lofiPadLead: {
    id: "lofiPadLead",
    description: "Lo-fi pad-first texture with gentle lead flourishes",
    voices: [
      { role: "pad", channel: "triangle", priority: 0.9, octaveOffset: -1 },
      { role: "accompaniment", channel: "square2", priority: 1.0, octaveOffset: -1, seedOffset: 60 },
      { role: "melody", channel: "square1", priority: 0.45, octaveOffset: 0, seedOffset: 180 }
    ]
  },

  retroPulse: {
    id: "retroPulse",
    description: "Retro loopwave pulse arpeggios with anchored bass",
    voices: [
      { role: "melody", channel: "square1", priority: 1.0, octaveOffset: 0, seedOffset: 80 },
      { role: "accompaniment", channel: "square2", priority: 0.85, octaveOffset: 0, seedOffset: 140 },
      { role: "bass", channel: "triangle", priority: 0.9, octaveOffset: -1, seedOffset: 40 }
    ]
  }
};

/**
 * Style-aware arrangement weights
 */
const ARRANGEMENT_WEIGHTS_BY_STYLE: Record<StylePreset, Partial<Record<VoiceArrangementPreset, number>>> = {
  minimalTechno: {
    standard: 2,
    minimal: 5,
    bassLed: 3,
    dualBass: 2,
    swapped: 1,
    layeredBass: 1
  },
  progressiveHouse: {
    standard: 4,
    swapped: 3,
    layeredBass: 3,
    dualBass: 2,
    bassLed: 1,
    minimal: 0
  },
  retroLoopwave: {
    standard: 2,
    swapped: 3,
    retroPulse: 5,
    layeredBass: 1,
    minimal: 0,
    bassLed: 1
  },
  breakbeatJungle: {
    breakLayered: 5,
    dualBass: 3,
    layeredBass: 2,
    bassLed: 2,
    standard: 1,
    swapped: 1,
    minimal: 0
  },
  lofiChillhop: {
    lofiPadLead: 5,
    minimal: 3,
    standard: 2,
    swapped: 1,
    bassLed: 1,
    layeredBass: 0,
    dualBass: 1
  }
};

const DEFAULT_ARRANGEMENT_WEIGHTS: Record<VoiceArrangementPreset, number> = {
  standard: 5,
  swapped: 4,
  dualBass: 2,
  bassLed: 2,
  layeredBass: 2,
  minimal: 1,
  breakLayered: 1,
  lofiPadLead: 1,
  retroPulse: 2
};

/**
 * Select voice arrangement based on seed and style
 */
function selectVoiceArrangement(
  seed: number | undefined,
  stylePreset: StylePreset | undefined
): VoiceArrangement {
  const weights = stylePreset
    ? { ...DEFAULT_ARRANGEMENT_WEIGHTS, ...ARRANGEMENT_WEIGHTS_BY_STYLE[stylePreset] }
    : DEFAULT_ARRANGEMENT_WEIGHTS;

  const entries = Object.entries(weights) as [VoiceArrangementPreset, number][];
  const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);

  const rand = randomFromSeed(seed, 100);
  let cumulative = 0;

  for (const [preset, weight] of entries) {
    cumulative += weight / totalWeight;
    if (rand < cumulative) {
      return VOICE_ARRANGEMENTS[preset];
    }
  }

  return VOICE_ARRANGEMENTS.standard;
}

export function planStructure(options: PipelineCompositionOptions): StructurePlanResult {
  const baseBpm = TEMPO_BASE[options.tempo];
  const bpmOffset = Math.round((randomFromSeed(options.seed, 1) - 0.5) * 30);
  const bpm = baseBpm + Math.max(-15, Math.min(15, bpmOffset));
  const moodTags = MOOD_TAG_MAP[options.mood];
  const key = resolveKey(options.mood, options.seed);
  const scaleDegrees = SCALE_DEGREES[key];

  if (!scaleDegrees) {
    throw new Error(`Scale not defined for key ${key}`);
  }

  const chordsPool = selectChordProgressions(key, moodTags, options.seed);
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

function resolveKey(mood: PipelineCompositionOptions["mood"], seed: number | undefined): string {
  const preferred = DEFAULT_KEY_PER_MOOD[mood];
  if (preferred && AVAILABLE_CHORD_KEYS.includes(preferred)) {
    return preferred;
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
