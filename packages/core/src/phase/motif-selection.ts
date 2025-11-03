/**
 * Phase 2: Motif Selection
 *
 * This phase is responsible for selecting pre-composed motifs from the library and assembling
 * them into concrete musical tracks. It bridges the gap between abstract structure (Phase 1)
 * and physical channel realization (Phase 3).
 *
 * ## Why Motif-Based Architecture?
 *
 * The system uses pre-composed motifs rather than algorithmic generation because:
 * - **Quality control**: Hand-crafted motifs ensure musical coherence (algorithmic generation
 *   often produces awkward intervals or rhythms that sound "robotic")
 * - **Style consistency**: Motifs are tagged with mood/tempo/style metadata, allowing context-aware
 *   selection that matches the desired aesthetic
 * - **Variation management**: Motif libraries can be curated to avoid excessive repetition while
 *   maintaining recognizable themes (the "hook" system)
 * - **Rapid iteration**: Composers can improve output quality by adding/editing motifs without
 *   changing code
 *
 * ## Core Design Principles
 *
 * ### 1. Tag-Based Filtering with Fallback
 * Motif selection uses a multi-stage filtering pipeline:
 * - Primary filter: Mood/tempo/function tags (e.g., "upbeat", "start", "cadence")
 * - Secondary filter: Style intent tags (e.g., "loop_safe", "syncopation")
 * - Fallback: If filtering exhausts candidates, progressively relax constraints
 *
 * This prevents the system from getting "stuck" with no valid motifs while still preferring
 * contextually appropriate choices.
 *
 * ### 2. Hook Caching for Musical Identity
 * The first occurrence of "A" sections establishes a "hook" - a memorable melodic/rhythmic
 * pattern that defines the composition's identity. Subsequent "A" sections retrieve and vary
 * this cached hook, creating the A-A'-A'' structure common in game music.
 *
 * This is critical because:
 * - Purely random selection produces incoherent "salad" with no thematic unity
 * - Exact repetition becomes monotonous in looping game BGM
 * - Variation (using motif.variations[] links) balances familiarity and novelty
 *
 * ### 3. Voice Arrangement System Integration
 * Phase 2 generates abstract "role-based" tracks (melody, bass, accompaniment, pad) rather than
 * channel-specific tracks. This separation allows:
 * - The same melody to be played on square1 (standard) or square2 (swapped)
 * - Bass patterns to work on triangle (standard) or square channels (dualBass/minimal)
 * - Pad roles to generate sustained notes for lofi/atmospheric styles
 *
 * Phase 3 maps these abstract roles to physical channels based on the selected Voice Arrangement.
 *
 * ### 4. Functional Tagging for Phrase Boundaries
 * Melody-rhythm motifs are tagged with functional roles:
 * - "start": Establishes the phrase (typically on downbeat)
 * - "middle": Develops the phrase (fills interior measures)
 * - "end": Concludes the phrase (often includes "cadence" tag)
 * - "pickup": Anacrusis notes before downbeat
 *
 * This ensures phrases have proper "sentence structure" rather than arbitrary concatenation.
 *
 * ### 5. Accompaniment Seed Generation
 * Accompaniment tracks generate "seed notes" (whole note chords) that Phase 3 expands into
 * texture-specific patterns (arpeggios, broken chords, steady pads). This two-stage approach:
 * - Keeps Phase 2 focused on harmonic content rather than rhythmic detail
 * - Allows Phase 3 to apply texture dynamically based on section.texture
 * - Reduces motif library size (no need for texture-specific accompaniment motifs)
 *
 * ## Arrangement-Specific Rules
 *
 * Different Voice Arrangements have distinct preferences:
 * - **minimal**: Sparse drums (earlySparseMeasures: 2), low accompaniment density (0.5)
 * - **breakLayered**: Prefers "breakbeat" drums, avoids "four_on_floor", high density (0.95)
 * - **lofiPadLead**: Prefers "lofi" tags, "swing_hint", sustained accompaniment, soft velocity (0.7)
 *
 * These rules are encoded in ARRANGEMENT_DRUM_RULES and ARRANGEMENT_ACCOMP_RULES.
 *
 * ## Velocity Architecture
 *
 * Velocity (volume) is calculated hierarchically:
 * 1. Base velocity from texture/role (e.g., broken bass: 74, steady bass: 70)
 * 2. Accent boosts (downbeat: +6, strong beat: +3)
 * 3. Arrangement-specific scaling (minimal: 0.8×, breakLayered: 1.05×)
 * 4. Channel-specific adjustments in Phase 3 (bass: 0.7×, triangle: 0.75×)
 *
 * This multi-stage design keeps concerns separated while allowing cumulative adjustments.
 */

import {
  AbstractNote,
  LegacyCompositionOptions,
  Phase1Result,
  Phase2Result,
  MidiNote,
  SectionDefinition,
  SectionMotifPlan,
  MelodyRhythmMotif,
  MelodyRhythmStep,
  RhythmMotif,
  BassPatternMotif,
  TransitionMotif,
  TextureProfile,
  DrumHit,
  StyleIntent,
  MoodSetting,
  TempoSetting,
  StylePreset,
  VoiceArrangementPreset
} from "../types.js";
import {
  BEATS_PER_MEASURE,
  chordRootToMidi,
  ensureConsonantPitch,
  generateDrumHitsFromPattern,
  quantizeMidiToChord,
  resolveChordAtBeat,
  scaleDegreeToMidi
} from "../musicUtils.js";
import {
  VELOCITY_BASS_TEXTURE,
  VELOCITY_BASS_ACCENT,
  VELOCITY_MELODY,
  VELOCITY_ACCOMPANIMENT
} from "../constants/velocity-config.js";
import {
  getPhraseLengthForSection,
  establishesHook,
  repriseHook
} from "./structure-planning.js";
import rhythmMotifsJson from "../../motifs/rhythm.json" with { type: "json" };
import melodyFragmentsJson from "../../motifs/melody.json" with { type: "json" };
import melodyRhythmsJson from "../../motifs/melody-rhythm.json" with { type: "json" };
import drumPatternsJson from "../../motifs/drums.json" with { type: "json" };
import bassPatternsJson from "../../motifs/bass-patterns.json" with { type: "json" };
import transitionsJson from "../../motifs/transitions.json" with { type: "json" };

const rhythmMotifs = rhythmMotifsJson;
const melodyFragments = melodyFragmentsJson;
const melodyRhythms = melodyRhythmsJson;
const drumPatterns = drumPatternsJson;
const bassPatternLibrary = bassPatternsJson;
const transitionPatternLibrary = transitionsJson;

const rhythmList = rhythmMotifs as any as {
  id: string;
  length: number;
  pattern: number[];
  tags: string[];
  variations: string[];
}[];
const melodyList = melodyFragments as any as {
  id: string;
  pattern: number[];
  tags: string[];
}[];
const melodyById = new Map(melodyList.map((fragment) => [fragment.id, fragment]));
const melodyRhythmList = melodyRhythms as MelodyRhythmMotif[];
const melodyRhythmById = new Map(melodyRhythmList.map((motif) => [motif.id, motif]));
const drumList = drumPatterns as any as {
  id: string;
  length_beats: number;
  type: "beat" | "fill";
  pattern: string;
  tags?: string[];
}[];
const drumById = new Map(drumList.map((pattern) => [pattern.id, pattern]));
const bassPatternList = (bassPatternLibrary.patterns ?? []) as BassPatternMotif[];
const bassPatternsByTexture = bassPatternList.reduce<Map<string, BassPatternMotif[]>>((acc, motif) => {
  const list = acc.get(motif.texture) ?? [];
  list.push(motif);
  acc.set(motif.texture, list);
  return acc;
}, new Map());
const transitionList = (transitionPatternLibrary.transitions ?? []) as TransitionMotif[];
const DEFAULT_BASS_STEPS: BassPatternMotif["steps"] = [
  "root",
  "root",
  "fifth",
  "root",
  "fifth",
  "root",
  "fifth",
  "approach"
];
const FALLBACK_BASS_PATTERN: BassPatternMotif = {
  id: "BP_FALLBACK_STEADY",
  texture: "steady",
  steps: DEFAULT_BASS_STEPS,
  tags: ["fallback"]
};

/**
 * Mood-based rhythm property tags for motif filtering.
 *
 * These tags define the rhythmic "feel" appropriate for each mood:
 * - upbeat: Prefers "straight" for accessibility, allows "syncopation" for interest
 * - sad: Favors "straight" and "simple" to avoid excessive energy
 * - tense: Uses "syncopation" and "accented" for rhythmic tension
 * - peaceful: Prefers "straight" and "open" (sparse) for calm atmosphere
 *
 * The tag order represents priority (first = preferred). Selection algorithm
 * filters motifs by these tags first, then falls back if the pool is exhausted.
 */
const RHYTHM_PROPERTY_TAGS: Record<LegacyCompositionOptions["mood"], string[]> = {
  upbeat: ["straight", "syncopation"],
  sad: ["straight", "simple"],
  tense: ["syncopation", "accented"],
  peaceful: ["straight", "open"]
};

/**
 * Mood-based melody contour tags for scale-degree motif selection.
 *
 * These tags define melodic shape and register preferences:
 * - upbeat: "bright" (major-key feel), "ascending" (uplifting motion)
 * - sad: "dark" (minor-key feel), "descending" (falling motion)
 * - tense: "complex" (non-scalar leaps), "leaping" (wide intervals for drama)
 * - peaceful: "simple" (stepwise motion), "arch" (gentle rise-fall), "bright"
 *
 * Tags come from the melody.json motif library and were hand-curated for each motif.
 */
const MELODY_MOOD_TAGS: Record<LegacyCompositionOptions["mood"], string[]> = {
  upbeat: ["bright", "ascending"],
  sad: ["dark", "descending"],
  tense: ["dark", "complex", "leaping"],
  peaceful: ["simple", "arch", "bright"]
};

/**
 * Mood-based tags for melody-rhythm motif selection.
 *
 * These tags control the rhythmic articulation and phrasing:
 * - upbeat: "syncopated" (off-beat accents), "drive" (forward momentum)
 * - sad: "legato" (sustained notes), "rest_heavy" (breathing space)
 * - tense: "syncopated" (rhythmic instability), "staccato" (short, sharp notes)
 * - peaceful: "legato" (smooth connection), "simple" (uncomplicated rhythms)
 *
 * Melody-rhythm motifs combine pitch and duration, so these tags affect both
 * melodic contour and rhythmic feel simultaneously.
 */
const MELODY_RHYTHM_TAGS: Record<LegacyCompositionOptions["mood"], string[]> = {
  upbeat: ["syncopated", "drive"],
  sad: ["legato", "rest_heavy"],
  tense: ["syncopated", "staccato"],
  peaceful: ["legato", "simple"]
};

const rhythmById = new Map(rhythmList.map((motif) => [motif.id, motif]));

/**
 * Arrangement-specific drum pattern preferences.
 *
 * Each Voice Arrangement has distinct drum aesthetics that match its musical character:
 *
 * - **dualBass**: Heavy bass-focused arrangements benefit from "percussive_layer" drums
 *   (kick + snare layering) and "syncopation" for rhythmic interest. Fills should "build"
 *   energy to complement the thick low-end.
 *
 * - **bassLed**: Bass is the lead voice, so drums should provide "drive" with "four_on_floor"
 *   consistency. Use "earlySparseMeasures: 1" to let the bass establish itself before drums enter.
 *
 * - **layeredBass**: Two bass layers (square + triangle) require drum patterns that don't
 *   compete. Prefer "loop_safe" (minimal variation) and "four_on_floor" (predictable pulse).
 *
 * - **minimal**: Techno-inspired minimalism needs "simple" drums with "open" space. Avoid
 *   "build" and "drive" tags (too busy). Use "noise_fx" fills. "earlySparseMeasures: 2"
 *   creates slow-building intro.
 *
 * - **breakLayered**: Breakbeat/jungle style demands "breakbeat" rhythms (syncopated kick/snare),
 *   "percussive_layer", and "grid16" (16th note hi-hats). Explicitly avoid "four_on_floor".
 *
 * - **lofiPadLead**: Lo-fi aesthetic prefers "lofi" drums (imperfect, laid-back), "rest_heavy"
 *   (breathing space), and "swing_hint" (humanized timing). Avoid aggressive "breakbeat".
 *
 * - **retroPulse**: Retro synth-wave style uses "loop_safe" (repetitive by design), "grid16"
 *   (crisp hi-hats), and "syncopation" for pulse arpeggios. Fills should "build" tension.
 *
 * The earlySparseMeasures parameter delays full drum introduction, allowing other voices to
 * establish the musical context first (common in bass-led or ambient arrangements).
 */
const ARRANGEMENT_DRUM_RULES: Partial<Record<VoiceArrangementPreset, {
  preferBeatTags?: string[];
  preferFillTags?: string[];
  avoidTags?: string[];
  earlySparseMeasures?: number;
}>> = {
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

/**
 * Arrangement-specific accompaniment generation rules.
 *
 * Accompaniment (harmony/pad layer) must adapt to each arrangement's voice balance:
 *
 * - **density**: Probability that a beat gets an accompaniment chord (0.0-1.0)
 *   - High density (0.95): breakLayered - fills space with aggressive harmony
 *   - Medium density (0.75-0.85): dualBass, layeredBass - balanced support
 *   - Low density (0.5-0.6): minimal, lofiPadLead - sparse, ambient pads
 *
 * - **sustainWholeMeasure**: If true, generates whole-note chords (sustained pads)
 *   rather than beat-by-beat seeds. Used for minimal and lofiPadLead to create
 *   atmospheric texture without rhythmic competition.
 *
 * - **velocityScale**: Multiplier applied to base accompaniment velocity
 *   - >1.0 (breakLayered: 1.05): Emphasize harmony in dense arrangements
 *   - <1.0 (minimal: 0.8, lofiPadLead: 0.7): Soften pads to background role
 *
 * - **offbeatAccentBoost**: Extra velocity (+dB) for off-beat chord hits
 *   - High boost (breakLayered: 6, bassLed: 5): Syncopated harmony accents
 *   - Low boost (retroPulse: 2, dualBass: 3): Subtle off-beat emphasis
 *   - No boost (minimal, lofiPadLead): Sustained pads have no rhythmic accents
 *
 * These parameters interact with Phase 3's texture expansion (arpeggio/broken/steady)
 * and Phase 4's gain automation to create the final accompaniment character.
 */
const ARRANGEMENT_ACCOMP_RULES: Partial<Record<VoiceArrangementPreset, {
  density: number;
  sustainWholeMeasure?: boolean;
  velocityScale?: number;
  offbeatAccentBoost?: number;
}>> = {
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

/**
 * Filters candidates by tag presence, with fallback to prevent over-filtering.
 *
 * This is the core tag-based filtering strategy used throughout motif selection.
 * It attempts to narrow candidates to those matching desired tags, but falls back
 * to the full pool if filtering would exhaust diversity.
 *
 * ## Why Fallback Logic?
 *
 * Without fallback, multiple sequential filters can reduce the candidate pool to
 * just 1-2 motifs, causing:
 * - Excessive repetition (same motif every section)
 * - Ignoring other important constraints (e.g., functional tags like "start"/"end")
 * - Brittle behavior when motif library is small or tags are sparse
 *
 * ## Fallback Conditions
 *
 * Returns original pool if:
 * 1. No matching candidates found (matched.length === 0)
 * 2. Filtering reduces pool below minRatio threshold (default 40%)
 *    - Only applies if original pool has ≥4 candidates (small pools aren't filtered)
 *
 * @param candidates - Original candidate pool
 * @param tags - Desired tags (ANY match accepted, not ALL)
 * @param minRatio - Minimum ratio of matched/original to avoid fallback (default 0.4)
 * @returns Filtered candidates, or original pool if fallback triggered
 */
function preferTagPresence<T extends { tags?: string[] }>(
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

function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
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
 * Reorders candidates to bias selection toward tag-matched items without hard filtering.
 *
 * Unlike preferTagPresence (which filters out non-matching), this function keeps all
 * candidates but rearranges them to make tagged items appear first. This is used for
 * "soft preference" where tags guide selection but don't enforce hard constraints.
 *
 * ## Why Biasing Instead of Filtering?
 *
 * Some style preferences should influence but not mandate motif choice:
 * - harmonicStatic prefers "scalar"/"stepwise" melodies but can accept "leaping" if needed
 * - gradualBuild prefers "ascending" contours but can use "arch" or "mixed"
 *
 * Hard filtering (preferTagPresence) would eliminate valid alternatives, while biasing
 * increases the probability of preferred tags without removing fallback options.
 *
 * ## Algorithm
 *
 * 1. Partition candidates into matches (have desired tags) and others (don't have tags)
 * 2. Shuffle each partition independently (for seed-driven variety within each group)
 * 3. Take targetRatio (default 60%) of matches and place them first
 * 4. Append remaining matches and all others
 *
 * Result: Random selection from biased array will pick matches ~60% of the time,
 * others ~40% of the time (assuming equal partition sizes).
 *
 * @param candidates - Original candidate pool
 * @param tags - Desired tags (ANY match)
 * @param rng - Seeded random number generator
 * @param targetRatio - Desired proportion of matches in prioritized group (default 0.6)
 * @returns Reordered candidates with matches biased toward front
 */
function biasByTagPresence<T extends { tags?: string[] }>(
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

const RNG_SEED = 1337;

function createRng(seed: number | undefined): () => number {
  let state = (seed ?? RNG_SEED) >>> 0;
  if (state === 0) {
    state = RNG_SEED;
  }
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function pickWithAvoid<T extends { id?: string }>(
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

function hasAllTags(source: { tags: string[] }, tags: string[]): boolean {
  if (!tags.length) {
    return true;
  }
  return tags.every((tag) => source.tags.includes(tag));
}

function isStrongBeat(beat: number): boolean {
  const epsilon = 1e-6;
  return Math.abs(beat % 1) < epsilon;
}

function findMelodyReference(
  beat: number,
  melody: MidiNote[]
): MidiNote | undefined {
  return melody.find((note) => beat >= note.startBeat && beat < note.startBeat + note.durationBeats);
}

function functionalTagForMeasure(measure: number, totalMeasures: number): string {
  if (measure === 0) return "start";
  if (measure === totalMeasures - 1) return "end";
  return "middle";
}

function isRhythmMotifConsistent(motif: RhythmMotif): boolean {
  try {
    expandRhythmPattern(motif);
    return true;
  } catch {
    return false;
  }
}

function selectRhythmMotif(
  options: LegacyCompositionOptions,
  styleIntent: StyleIntent,
  functionTag: string,
  last: (typeof rhythmList)[number] | undefined,
  requiredTags: string[],
  rng: () => number,
  used: Set<string>
) {
  const safeRhythms = rhythmList.filter(isRhythmMotifConsistent);
  const propertyTags = RHYTHM_PROPERTY_TAGS[options.mood] ?? [];
  const filterByTags = (source: typeof rhythmList, tags: string[]) =>
    source.filter((motif) => tags.some((tag) => motif.tags.includes(tag)));

  const requiredPool = safeRhythms.filter((motif) => hasAllTags(motif, requiredTags));
  let candidates = safeRhythms.filter((motif) => motif.tags.includes(functionTag));
  const propertyFiltered = filterByTags(candidates, propertyTags);
  if (propertyFiltered.length) {
    candidates = propertyFiltered;
  } else {
    const fallback = filterByTags(safeRhythms, propertyTags);
    if (fallback.length) {
      candidates = fallback;
    }
  }

  if (styleIntent.loopCentric) {
    candidates = preferTagPresence(candidates, ["loop_safe", "texture_loop"]);
  }

  if (styleIntent.textureFocus) {
    candidates = preferTagPresence(candidates, ["texture_loop", "straight", "simple", "grid16"]);
  }

  if (styleIntent.percussiveLayering) {
    candidates = preferTagPresence(candidates, ["grid16", "percussive_layer"]);
  }

  if (styleIntent.syncopationBias) {
    candidates = preferTagPresence(candidates, ["syncopation"]);
  }
  if (!candidates.length) {
    candidates = safeRhythms;
  }

  if (requiredTags.length) {
    const requiredFiltered = candidates.filter((motif) => hasAllTags(motif, requiredTags));
    if (requiredFiltered.length) {
      candidates = requiredFiltered;
    } else if (requiredPool.length) {
      candidates = requiredPool;
    }
  }

  if (last?.variations?.length) {
    const variationCandidates = last.variations
      .map((id) => rhythmById.get(id))
      .filter((motif): motif is (typeof rhythmList)[number] => Boolean(motif));
    if (variationCandidates.length && rng() < 0.5) {
      const variationPool = preferUnused(variationCandidates, used);
      return pickWithAvoid(variationPool, rng, last.id);
    }
  }
  const pool = preferUnused(candidates, used);
  return pickWithAvoid(pool, rng, last?.id);
}

function selectMelodyFragment(
  options: LegacyCompositionOptions,
  styleIntent: StyleIntent,
  requiredTags: string[],
  rng: () => number,
  lastFragment: (typeof melodyList)[number] | undefined,
  used: Set<string>
): (typeof melodyList)[number] {
  const moodTags = MELODY_MOOD_TAGS[options.mood] ?? [];
  let candidates = melodyList.filter((fragment) => moodTags.some((tag) => fragment.tags.includes(tag)));
  if (requiredTags.length) {
    const requiredFiltered = candidates.filter((fragment) => hasAllTags(fragment, requiredTags));
    if (requiredFiltered.length) {
      candidates = requiredFiltered;
    } else {
      const globalFallback = melodyList.filter((fragment) => hasAllTags(fragment, requiredTags));
      if (globalFallback.length) {
        candidates = globalFallback;
      }
    }
  }
  if (!candidates.length) {
    candidates = melodyList;
  }

  if (styleIntent.textureFocus) {
    candidates = preferTagPresence(candidates, ["texture_loop", "ostinato", "loop_safe", "short", "static"]);
  }

  if (styleIntent.harmonicStatic) {
    candidates = biasByTagPresence(candidates, ["scalar", "stepwise", "static"], rng, 0.6);
  }

  if (styleIntent.gradualBuild) {
    candidates = preferTagPresence(candidates, ["ascending"]);
  }

  const pool = preferUnused(candidates, used);
  return pickWithAvoid(pool, rng, lastFragment?.id);
}

function selectMelodyRhythmMotif(
  options: LegacyCompositionOptions,
  styleIntent: StyleIntent,
  functionTag: string,
  totalBeats: number,
  requiredTags: string[],
  rng: () => number,
  lastId: string | undefined,
  used: Set<string>
): MelodyRhythmMotif {
  const tolerance = 1e-6;
  const moodTags = MELODY_RHYTHM_TAGS[options.mood] ?? [];
  let candidates = melodyRhythmList.filter((motif) => Math.abs(motif.length - totalBeats) < tolerance);
  if (!candidates.length) {
    throw new Error(`No melody rhythm motifs of length ${totalBeats}`);
  }
  let filtered = candidates.filter((motif) => motif.tags.includes(functionTag));
  if (!filtered.length) {
    filtered = candidates;
  }
  let moodFiltered = filtered.filter((motif) => moodTags.some((tag) => motif.tags.includes(tag)));
  if (!moodFiltered.length) {
    moodFiltered = filtered;
  }

  if (styleIntent.loopCentric) {
    moodFiltered = preferTagPresence(moodFiltered, ["loop_safe", "texture_loop"]);
  }

  if (styleIntent.textureFocus) {
    moodFiltered = preferTagPresence(moodFiltered, ["texture_loop", "grid16", "simple"]);
  }

  if (styleIntent.syncopationBias) {
    moodFiltered = preferTagPresence(moodFiltered, ["syncopated", "drive"]);
  }

  if (requiredTags.length) {
    const requiredFiltered = moodFiltered.filter((motif) => hasAllTags(motif, requiredTags));
    if (requiredFiltered.length) {
      moodFiltered = requiredFiltered;
    }
  }

  moodFiltered = filterHumanizedMelodyRhythms(moodFiltered, totalBeats);

  const pool = preferUnused(moodFiltered, used);
  return pickWithAvoid(pool, rng, lastId);
}

function resolveMelodyVelocity(
  section: Phase1Result["sections"][number],
  measureInSection: number,
  globalMeasureIndex: number,
  totalMeasures: number,
  styleIntent: StyleIntent
): number {
  const baseByTexture: Record<string, number> = {
    broken: 90,
    steady: 86,
    arpeggio: 92
  };
  let base = baseByTexture[section.texture] ?? 88;
  const downbeatBoost = measureInSection === 0 ? 6 : 0;
  const cadenceLift = section.measures - measureInSection <= 1 ? 4 : 0;
  if (styleIntent.textureFocus) {
    base -= 8;
  }
  if (styleIntent.gradualBuild) {
    // Global progressive build: velocity increases across entire track
    const globalProgress = totalMeasures > 1 ? globalMeasureIndex / Math.max(1, totalMeasures - 1) : 0;
    const clamped = Math.min(1, Math.max(0, globalProgress));
    const exponent = totalMeasures <= 16 ? 0.6 : totalMeasures <= 32 ? 0.75 : 0.9;
    const shaped = Math.pow(clamped, exponent);
    const maxBoost = totalMeasures <= 16 ? 14 : totalMeasures <= 32 ? 18 : 20;
    const buildAmount = Math.floor(shaped * maxBoost);
    base += buildAmount;
  }
  if (styleIntent.loopCentric) {
    base = Math.max(60, base - 2);
  }
  return Math.min(110, Math.max(58, base + downbeatBoost + cadenceLift));
}

/**
 * Determines the base register (MIDI note) for the entire composition based on mood, tempo, and seed.
 * This adds variation so that different songs use different octave ranges, enhancing diversity.
 * 
 * @param mood - The mood setting (upbeat, peaceful, tense, sad)
 * @param tempo - The tempo setting (slow, medium, fast)
 * @param seed - Random seed for deterministic variation
 * @returns Base MIDI register for the composition (typically 63-78, Eb4-F#5)
 */
function resolveBaseRegisterForComposition(
  mood: MoodSetting,
  tempo: TempoSetting,
  stylePreset: StylePreset | undefined,
  styleIntent: StyleIntent,
  seed: number
): number {
  const DEFAULT_REGISTER = 72; // C5

  // Mood-based offsets: different moods naturally sit in different registers
  const moodBaseOffsets: Record<MoodSetting, number> = {
    upbeat: 0,      // Bright → standard to high (C5 base)
    peaceful: -3,   // Peaceful → slightly lower (A4 base)
    tense: -5,      // Tense → lower (G4 base, heavier feel)
    sad: -2         // Sad → slightly lower (Bb4 base)
  };

  // Tempo-based offsets: faster tempos benefit from higher registers
  const tempoOffsets: Record<TempoSetting, number> = {
    slow: -2,       // Slow → lower
    medium: 0,      // Standard
    fast: 2         // Fast → higher (lighter, more agile)
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

function resolveMelodyRegister(
  section: SectionDefinition | undefined,
  measureInSection: number,
  globalMeasureIndex: number,
  totalMeasures: number,
  styleIntent: StyleIntent,
  compositionBaseRegister: number  // New parameter: base register for this composition
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
  const resolved = compositionBaseRegister + offset;  // Use composition base register
  return Math.max(MIN_REGISTER, Math.min(MAX_REGISTER, resolved));
}

function maybeAddPickupNote(
  melody: AbstractNote[],
  measureStartBeat: number,
  baseMelody: (typeof melodyList)[number],
  sectionId: string
) {
  if (measureStartBeat <= 0) {
    return;
  }
  const pickupStart = measureStartBeat - 0.25;
  if (pickupStart < 0) {
    return;
  }
  const pattern = baseMelody.pattern;
  const degree = pattern[pattern.length - 1] ?? pattern[0] ?? 1;
  melody.push({
    channelRole: "melody",
    startBeat: pickupStart,
    durationBeats: 0.25,
    degree,
    velocity: VELOCITY_MELODY.PICKUP_BASE,
    sectionId
  });
}

function resolveTailDegreeVariant(
  baseDegree: number,
  melodyPattern: number[],
  styleIntent: StyleIntent,
  rng: () => number
): number {
  if (!melodyPattern.length) {
    return baseDegree;
  }
  const tailDegrees = [melodyPattern[melodyPattern.length - 1]];
  const neighbor = tailDegrees[0] + (styleIntent.textureFocus ? 2 : 1);
  const fall = tailDegrees[0] - (styleIntent.loopCentric ? 1 : 2);
  const options = new Set<number>([baseDegree, tailDegrees[0], neighbor, fall]);
  const ordered = Array.from(options);
  return ordered[Math.floor(rng() * ordered.length)];
}

function pickRhythmVariation(
  base: (typeof rhythmList)[number],
  functionTag: string,
  requiredTags: string[],
  rng: () => number,
  used: Set<string>
): (typeof rhythmList)[number] | undefined {
  const variationIds = base.variations ?? [];
  if (!variationIds.length) {
    return undefined;
  }
  const variations = variationIds
    .map((id) => rhythmById.get(id))
    .filter((motif): motif is (typeof rhythmList)[number] => Boolean(motif))
    .filter((motif) => motif.tags.includes(functionTag) && hasAllTags(motif, requiredTags));
  if (!variations.length) {
    return undefined;
  }
  const pool = preferUnused(variations, used);
  return pickWithAvoid(pool, rng, base.id);
}

type BassStep = "root" | "fifth" | "lowFifth" | "octave" | "octaveHigh" | "approach" | "rest";

function buildBassPattern(
  section: Phase1Result["sections"][number],
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

function resolveBassPattern(
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

function selectBassPattern(
  texture: TextureProfile,
  styleIntent: StyleIntent,
  rng: () => number,
  used: Set<string>,
  requiredTags: string[],
  avoidId?: string
): BassPatternMotif | undefined {
  let candidates = bassPatternsByTexture.get(texture) ?? [];
  if (!candidates.length && texture !== "steady") {
    candidates = bassPatternsByTexture.get("steady") ?? [];
  }
  if (!candidates.length) {
    return undefined;
  }
  if (styleIntent.loopCentric || styleIntent.harmonicStatic) {
    candidates = preferTagPresence(candidates, ["loop_safe"]);
  }
  if (styleIntent.syncopationBias) {
    candidates = preferTagPresence(candidates, ["syncopated"]);
  }
  if (styleIntent.textureFocus) {
    candidates = preferTagPresence(candidates, ["default"]);
  }
  if (styleIntent.percussiveLayering) {
    candidates = preferTagPresence(candidates, ["percussive_layer", "four_on_floor"]);
  }
  if (styleIntent.percussiveLayering && styleIntent.syncopationBias && styleIntent.breakInsertion) {
    candidates = preferTagPresence(candidates, ["breakbeat", "variation"], 0.2);
  }
  if (styleIntent.atmosPad && styleIntent.loopCentric) {
    candidates = preferTagPresence(candidates, ["lofi", "rest_heavy"], 0.25);
  }
  if (styleIntent.harmonicStatic) {
    candidates = biasByTagPresence(candidates, ["drone", "static"], rng, 0.65);
  }
  if (requiredTags.length) {
    const tagged = candidates.filter((motif) =>
      requiredTags.every((tag) => (motif.tags ?? []).includes(tag))
    );
    if (tagged.length) {
      candidates = tagged;
    }
  }
  if (!candidates.length) {
    return undefined;
  }
  const pool = preferUnused(candidates, used);
  return pickWithAvoid(pool, rng, avoidId);
}

/**
 * Merges transition drum hits with existing drum hits, avoiding collisions.
 * If a transition hit would collide with an existing hit (within 1/16 beat),
 * it is offset by the minimum safe gap to prevent noise channel conflicts.
 */
function mergeTransitionHits(existingHits: DrumHit[], transitionHits: DrumHit[]): DrumHit[] {
  const COLLISION_THRESHOLD = 1 / 16; // Same as NOISE_STACK_OFFSET in event-realization.ts
  const merged: DrumHit[] = [];

  for (const hit of transitionHits) {
    let adjustedBeat = hit.startBeat;
    let attempts = 0;
    const maxAttempts = 4; // Try up to 4 offsets (1/16, 2/16, 3/16, 4/16 beats)

    // Check for collision with existing hits
    while (attempts < maxAttempts) {
      const hasCollision = existingHits.some(
        (existing) => Math.abs(existing.startBeat - adjustedBeat) < COLLISION_THRESHOLD
      );

      if (!hasCollision) {
        break; // No collision, use this timing
      }

      // Collision detected, offset by one step
      attempts++;
      adjustedBeat = hit.startBeat + (attempts * COLLISION_THRESHOLD);
    }

    // Add the hit with adjusted timing (or original if no collision)
    merged.push({
      ...hit,
      startBeat: adjustedBeat
    });
  }

  return merged;
}

function maybeGenerateTransition(
  section: SectionDefinition,
  measureStartBeat: number,
  isLastSection: boolean,
  rng: () => number,
  lastTransitionId: string | undefined,
  used: Set<string>,
  styleIntent: StyleIntent,
  globalMeasureIndex: number,
  totalMeasures: number
): { motifId: string; hits: DrumHit[] } | undefined {
  if (!transitionList.length) {
    return undefined;
  }

  const requiredTags = ["transition", "section_end"];
  if (isLastSection) {
    requiredTags.push("loop_out");
  }

  let candidates = transitionList.filter((motif) => motif.length_beats <= BEATS_PER_MEASURE);
  if (!candidates.length) {
    candidates = transitionList;
  }

  const progress = totalMeasures > 1 ? globalMeasureIndex / Math.max(1, totalMeasures - 1) : 0;
  const priorityTags: string[] = [];
  if (styleIntent.gradualBuild) {
    if (progress < 0.4) {
      priorityTags.push("build");
    } else if (progress < 0.8) {
      priorityTags.push("drum_fill");
    } else {
      priorityTags.push("loop_out");
    }
  }
  if (styleIntent.breakInsertion && progress >= 0.5) {
    priorityTags.push("noise_fx");
  }
  if (styleIntent.percussiveLayering) {
    priorityTags.push("drum_fill");
  }

  if (priorityTags.length) {
    candidates = preferTagPresence(candidates, priorityTags, 0.2);
  }

  if (requiredTags.length) {
    const filtered = candidates.filter((motif) => hasAllTags(motif, requiredTags));
    if (filtered.length) {
      candidates = filtered;
    }
  }

  if (!candidates.length) {
    return undefined;
  }

  const pool = preferUnused(candidates, used);
  const motif = pickWithAvoid(pool, rng, lastTransitionId);
  if (!motif) {
    return undefined;
  }

  const offset =
    motif.length_beats >= BEATS_PER_MEASURE
      ? measureStartBeat
      : measureStartBeat + Math.max(0, BEATS_PER_MEASURE - motif.length_beats);
  const hits = generateDrumHitsFromPattern(motif.pattern, offset, section.id);
  return { motifId: motif.id, hits };
}

function resolveBassVelocity(section: Phase1Result["sections"][number], step: number): number {
  const base = (VELOCITY_BASS_TEXTURE as Record<string, number>)[section.texture] ?? VELOCITY_BASS_TEXTURE.default;
  if (step === 0) {
    return base + VELOCITY_BASS_ACCENT.DOWNBEAT_BOOST;
  }
  if (step % 4 === 0) {
    return base + VELOCITY_BASS_ACCENT.STRONG_BEAT_BOOST;
  }
  return base;
}

function bassStepToMidi(step: BassStep, chord: string, nextChord: string, baseMidi: number): number | null {
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
 * Expand rhythm motif pattern into beat durations
 * (Similar to expandMelodyRhythmPattern)
 */
interface ExpandedRhythmStep {
  durationBeats: number;
}

function expandRhythmPattern(motif: RhythmMotif): ExpandedRhythmStep[] {
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
 * Resolve accompaniment degree based on texture and position
 */
function resolveAccompanimentDegree(
  texture: TextureProfile,
  degreeIndex: number,
  beatInMeasure: number
): number {
  if (texture === "steady") {
    // Alternate between root and fifth every 2 beats
    const chordDegrees = [1, 5];
    return chordDegrees[Math.floor(beatInMeasure / 2) % chordDegrees.length];
  } else {
    // Cycle through chord tones for broken/arpeggio textures
    const chordDegrees = [1, 3, 5, 7];
    return chordDegrees[degreeIndex % chordDegrees.length];
  }
}

/**
 * Resolve accompaniment velocity with accent on downbeat
 */
function resolveAccompanimentVelocity(
  functionTag: string,
  beatInMeasure: number
): number {
  const baseVelocity = 58;
  const accent = functionTag === "start" && beatInMeasure === 0 ? 6 : 0;
  return baseVelocity + accent;
}

function buildAccompanimentSeeds(
  section: Phase1Result["sections"][number],
  measureStartBeat: number,
  rhythmMotif: RhythmMotif,
  baseMelody: (typeof melodyList)[number],
  functionTag: string,
  arrangementId: VoiceArrangementPreset,
  rng: () => number
): AbstractNote[] {
  const seeds: AbstractNote[] = [];

  // Expand rhythm motif pattern to get beat durations
  const expandedPattern = expandRhythmPattern(rhythmMotif);

  let beatCursor = 0;
  let degreeIndex = 0;

  // Generate accompaniment notes based on rhythm motif pattern
  const arrangementRule = ARRANGEMENT_ACCOMP_RULES[arrangementId];

  for (let patternIndex = 0; patternIndex < expandedPattern.length; patternIndex++) {
    const step = expandedPattern[patternIndex];
    // Stop at measure boundary (4 beats)
    if (beatCursor >= BEATS_PER_MEASURE) break;

    // Calculate remaining beats in measure
    const remainingBeats = BEATS_PER_MEASURE - beatCursor;
    const actualDuration = Math.min(step.durationBeats, remainingBeats);

    // Resolve degree based on texture
    const degree = resolveAccompanimentDegree(
      section.texture,
      degreeIndex,
      beatCursor
    );

    // Resolve velocity with accent
    const velocity = resolveAccompanimentVelocity(functionTag, beatCursor);

    const isOffbeat = (beatCursor % 1) > 1e-6;
    let noteVelocity = resolveAccompanimentVelocity(functionTag, beatCursor);
    if (arrangementRule?.velocityScale) {
      noteVelocity = Math.round(noteVelocity * arrangementRule.velocityScale);
    }
    if (isOffbeat && arrangementRule?.offbeatAccentBoost) {
      noteVelocity += arrangementRule.offbeatAccentBoost;
    }

    // Density control per arrangement: probabilistic skip
    if (arrangementRule?.density !== undefined && arrangementRule.density < 1) {
      const keepProbability = Math.max(0, Math.min(1, arrangementRule.density));
      if (rng() > keepProbability) {
        beatCursor += actualDuration;
        degreeIndex++;
        continue;
      }
    }

    seeds.push({
      channelRole: "accompaniment",
      startBeat: measureStartBeat + beatCursor,
      durationBeats: actualDuration,
      degree,
      velocity: noteVelocity,
      sectionId: section.id
    });

    beatCursor += actualDuration;
    degreeIndex++;

    // Stop if we've reached the measure boundary
    if (beatCursor >= BEATS_PER_MEASURE) break;
  }

  // Mirror hook motion on pickups by echoing the first pitch one beat before the section
  if (
    functionTag === "start" &&
    establishesHook(section) &&
    baseMelody.pattern.length &&
    measureStartBeat >= 0.5 &&
    !(arrangementRule?.density !== undefined && arrangementRule.density < 0.5)
  ) {
    const degree = baseMelody.pattern[0];
    seeds.push({
      channelRole: "accompaniment",
      startBeat: Math.max(0, measureStartBeat - 0.5),
      durationBeats: 0.5,
      degree,
      velocity: VELOCITY_ACCOMPANIMENT.EARLY_START,
      sectionId: section.id
    });
  }

  if (arrangementRule?.sustainWholeMeasure && seeds.length) {
    // Collapse into a single sustained note per measure for pad-like arrangements
    const collapsedDegree = seeds[0].degree;
    const collapsedVelocity = Math.max(
      VELOCITY_ACCOMPANIMENT.PAD_MIN,
      Math.round(seeds.reduce((sum, note) => sum + note.velocity, 0) / seeds.length)
    );
    return [
      {
        channelRole: "accompaniment",
        startBeat: measureStartBeat,
        durationBeats: BEATS_PER_MEASURE,
        degree: collapsedDegree,
        velocity: collapsedVelocity,
        sectionId: section.id
      }
    ];
  }

  return seeds;
}

interface ExpandedMelodyRhythmStep {
  durationBeats: number;
  rest: boolean;
  accent?: boolean;
}

function expandMelodyRhythmPattern(motif: MelodyRhythmMotif): ExpandedMelodyRhythmStep[] {
  const steps: ExpandedMelodyRhythmStep[] = motif.pattern.map((entry) => ({
    durationBeats: convertToBeats(entry.value),
    rest: Boolean(entry.rest),
    accent: entry.accent
  }));
  const total = steps.reduce((sum, step) => sum + step.durationBeats, 0);
  const tolerance = 1e-6;
  if (Math.abs(total - motif.length) > tolerance) {
    throw new Error(`Melody rhythm motif ${motif.id} length mismatch. expected=${motif.length}, got=${total}`);
  }
  return steps;
}

function motifPassesHumanization(motif: MelodyRhythmMotif, totalBeats: number): boolean {
  const pattern = motif.pattern ?? [];
  if (!pattern.length) {
    return false;
  }

  const restRequirement = totalBeats >= 4 ? 0.25 : 0;
  let accumulatedRest = 0;
  let hasLongNote = false;
  let continuousShortBeats = 0;

  for (const step of pattern) {
    const duration = convertToBeats(step.value);
    if (step.rest) {
      accumulatedRest += duration;
      continuousShortBeats = 0;
      continue;
    }

    if (duration >= 0.5) {
      hasLongNote = true;
      continuousShortBeats = 0;
      continue;
    }

    continuousShortBeats += duration;
    if (continuousShortBeats > 1 + 1e-6) {
      return false;
    }
  }

  if (accumulatedRest >= restRequirement) {
    return true;
  }

  return hasLongNote;
}

function filterHumanizedMelodyRhythms(
  candidates: MelodyRhythmMotif[],
  totalBeats: number
): MelodyRhythmMotif[] {
  const filtered = candidates.filter((motif) => motifPassesHumanization(motif, totalBeats));
  return filtered.length ? filtered : candidates;
}

// Unified cache structure (refactored per REFACTOR_PLAN.md Step 1-C)
interface CachedMotifs {
  rhythm?: string;
  melody?: string;
  melodyRhythm?: string;
  drum?: string;
  bass?: BassPatternMotif;
}

// Hook motif cache structure (REFACTORING_ROADMAP.md P1-1)
interface HookMotifs {
  rhythmId: string;
  melodyId: string;
  melodyRhythmId: string;
}

/**
 * Context for motif selection process (REFACTORING_ROADMAP.md P2-1)
 * Consolidates all state used throughout selectMotifsLegacy
 */
interface MotifContext {
  rng: () => number;
  compositionBaseRegister: number;
  sectionById: Map<string, SectionDefinition>;
  styleIntent: StyleIntent;
  voiceArrangement: Phase1Result["voiceArrangement"];
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
    rhythm?: (typeof rhythmList)[number];
    melodyFragment?: (typeof melodyList)[number];
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
 * Intermediate results accumulated during motif selection
 */
interface MotifResults {
  melody: AbstractNote[];
  bass: AbstractNote[];
  accompanimentSeeds: AbstractNote[];
  drums: DrumHit[];
  sectionMotifPlan: SectionMotifPlan[];
}

function getOrCreateTemplateCache(
  templateCache: Map<string, Map<string, CachedMotifs>>,
  templateId: string,
  cacheKey: string
): CachedMotifs {
  if (!templateCache.has(templateId)) {
    templateCache.set(templateId, new Map());
  }
  const templateMap = templateCache.get(templateId)!;
  if (!templateMap.has(cacheKey)) {
    templateMap.set(cacheKey, {});
  }
  return templateMap.get(cacheKey)!;
}

/**
 * Get hook motifs for a specific template and occurrence index.
 * Implements occurrence-based variation strategy (REFACTORING_ROADMAP.md P1-1).
 *
 * Strategy:
 * - First 3 occurrences (index 0-2): Cache unique hooks per occurrence
 * - 4th+ occurrences: Randomly select from cached hooks for variety
 *
 * @param hookCache - Map of templateId to occurrence-indexed hooks
 * @param templateId - Section template identifier
 * @param occurrenceIndex - Zero-based occurrence count for this template
 * @param rng - Random number generator
 * @returns Cached hook motifs, or undefined if not yet established
 */
function getHookForOccurrence(
  hookCache: Map<string, Map<number, HookMotifs>>,
  templateId: string,
  occurrenceIndex: number,
  rng: () => number
): HookMotifs | undefined {
  const occurrenceMap = hookCache.get(templateId);
  if (!occurrenceMap || occurrenceMap.size === 0) {
    return undefined;
  }

  // Always return the hook established at occurrence 1 (the canonical hook)
  // This maintains the core hook identity across all reprises
  return occurrenceMap.get(1);
}

/**
 * Store hook motifs for a specific template and occurrence index.
 *
 * @param hookCache - Map of templateId to occurrence-indexed hooks
 * @param templateId - Section template identifier
 * @param occurrenceIndex - Zero-based occurrence count for this template
 * @param hook - Hook motifs to cache
 */
function setHookForOccurrence(
  hookCache: Map<string, Map<number, HookMotifs>>,
  templateId: string,
  occurrenceIndex: number,
  hook: HookMotifs
): void {
  if (!hookCache.has(templateId)) {
    hookCache.set(templateId, new Map());
  }
  const occurrenceMap = hookCache.get(templateId)!;

  // Only store the hook established at occurrence 1 (the canonical hook)
  // Per spec: establishesHook returns true when occurrenceIndex === 1
  if (occurrenceIndex === 1) {
    occurrenceMap.set(occurrenceIndex, hook);
  }
}

/**
 * Initialize context for motif selection (REFACTORING_ROADMAP.md P2-1)
 */
function initializeMotifContext(
  options: LegacyCompositionOptions,
  phase1: Phase1Result
): MotifContext {
  const rng = createRng(options.seed);
  const compositionSeed = options.seed ?? Date.now();
  const compositionBaseRegister = resolveBaseRegisterForComposition(
    options.mood,
    options.tempo,
    options.stylePreset,
    phase1.styleIntent,
    compositionSeed
  );

  return {
    rng,
    compositionBaseRegister,
    sectionById: new Map(phase1.sections.map((section) => [section.id, section])),
    styleIntent: phase1.styleIntent,
    voiceArrangement: phase1.voiceArrangement,
    totalMeasures: options.lengthInMeasures,

    usedMotifs: {
      rhythms: new Set<string>(),
      melodies: new Set<string>(),
      drums: new Set<string>(),
      melodyRhythms: new Set<string>(),
      bassPatterns: new Set<string>(),
      transitions: new Set<string>()
    },

    caches: {
      template: new Map<string, Map<string, CachedMotifs>>(),
      hook: new Map<string, Map<number, HookMotifs>>(),
      bassPattern: new Map<string, BassPatternMotif>()
    },

    lastMotifs: {},

    motifUsage: {
      rhythm: {} as Record<string, number>,
      melody: {} as Record<string, number>,
      drums: {} as Record<string, number>,
      melodyRhythm: {} as Record<string, number>,
      bass: {} as Record<string, number>,
      transitions: {} as Record<string, number>
    }
  };
}

/**
 * Context for processing a single phrase within a section.
 * Extracted from selectMotifsLegacy for P2-1 refactoring.
 */
interface PhraseContext {
  section: SectionDefinition;
  phraseMeasures: number;
  isFirstPhrase: boolean;
  phraseStartMeasureIndex: number;
  cachedHook: HookMotifs | undefined;
  baseRhythm: (typeof rhythmList)[number];
  baseMelody: (typeof melodyList)[number];
  baseMelodyRhythm: MelodyRhythmMotif;
}

/**
 * Context for processing a single measure within a phrase.
 * Extracted from selectMotifsLegacy for P2-1 refactoring.
 */
interface MeasureContext {
  measureInSection: number;
  globalMeasureIndex: number;
  measureStartBeat: number;
  functionTag: string;
  requiredTags: string[];
  isHookMeasure: boolean;
  phraseOffset: number;
  rhythmMotif: (typeof rhythmList)[number];
}

/**
 * Process all phrases in a section, generating motifs for melody, bass, accompaniment, and drums.
 * Part of P2-1 refactoring: extracted from selectMotifsLegacy.
 * 
 * @param section - Section to process
 * @param phase1 - Phase 1 result containing structure and harmony
 * @param context - Motif selection context
 * @param results - Accumulated results (mutated)
 */
function processSectionPhrases(
  section: SectionDefinition,
  phase1: Phase1Result,
  options: LegacyCompositionOptions,
  context: MotifContext,
  results: MotifResults
): void {
  const sectionStartBeat = section.startMeasure * BEATS_PER_MEASURE;
  const phraseLength = Math.max(1, getPhraseLengthForSection(section));

  let measure = 0;
  while (measure < section.measures) {
    const phraseMeasures = Math.min(phraseLength, section.measures - measure);
    const isFirstPhrase = measure === 0;
    const phraseStartMeasureIndex = section.startMeasure + measure;

    const phraseContext = createPhraseContext(
      section,
      phase1,
      options,
      phraseMeasures,
      isFirstPhrase,
      phraseStartMeasureIndex,
      context,
      results
    );

    processSinglePhrase(phraseContext, phase1, options, context, results);

    measure += phraseMeasures;
  }
}

/**
 * Create phrase context for a single phrase iteration.
 * Handles hook caching and base motif selection.
 */
function createPhraseContext(
  section: SectionDefinition,
  phase1: Phase1Result,
  options: LegacyCompositionOptions,
  phraseMeasures: number,
  isFirstPhrase: boolean,
  phraseStartMeasureIndex: number,
  context: MotifContext,
  results: MotifResults
): PhraseContext {
  const cachedHook = getHookForOccurrence(
    context.caches.hook,
    section.templateId,
    section.occurrenceIndex,
    context.rng
  );

  const baseFunctionTag = functionalTagForMeasure(0, section.measures);
  const baseRequiredTags: string[] = [];
  if (phraseStartMeasureIndex === context.totalMeasures - 1) {
    baseRequiredTags.push("loop_safe");
  } else if (phraseStartMeasureIndex === context.totalMeasures - 2 && !(repriseHook(section) && isFirstPhrase)) {
    baseRequiredTags.push("cadence");
  }

  let baseRhythm: (typeof rhythmList)[number] | undefined;
  let baseMelody: (typeof melodyList)[number] | undefined;
  let baseMelodyRhythm: MelodyRhythmMotif | undefined;

  const rhythmKey = cacheKey(baseFunctionTag, baseRequiredTags);
  const melodyKey = cacheKey(baseFunctionTag, baseRequiredTags);
  const cache = getOrCreateTemplateCache(context.caches.template, section.templateId, rhythmKey);

  // Retrieve from hook cache if reprising
  if (repriseHook(section) && isFirstPhrase && cachedHook) {
    const hookRhythm = rhythmById.get(cachedHook.rhythmId);
    const hookMelody = melodyById.get(cachedHook.melodyId);
    if (hookRhythm) {
      baseRhythm = hookRhythm;
    }
    if (hookMelody) {
      baseMelody = hookMelody;
    }
  }

  // Select base rhythm
  if (!baseRhythm) {
    const cachedRhythmId = cache.rhythm;
    baseRhythm = cachedRhythmId ? rhythmById.get(cachedRhythmId) : undefined;
    if (!baseRhythm) {
      baseRhythm = selectRhythmMotif(
        options,
        context.styleIntent,
        baseFunctionTag,
        context.lastMotifs.rhythm,
        baseRequiredTags,
        context.rng,
        context.usedMotifs.rhythms
      );
      cache.rhythm = baseRhythm.id;
    }
  }

  // Select base melody
  if (!baseMelody) {
    const cachedMelodyId = cache.melody;
    baseMelody = cachedMelodyId ? melodyById.get(cachedMelodyId) : undefined;
    if (!baseMelody) {
      baseMelody = selectMelodyFragment(
        options,
        context.styleIntent,
        baseRequiredTags,
        context.rng,
        context.lastMotifs.melodyFragment,
        context.usedMotifs.melodies
      );
      cache.melody = baseMelody.id;
    }
  }

  // Select melody rhythm
  if (repriseHook(section) && isFirstPhrase && cachedHook) {
    const hookMelodyRhythm = melodyRhythmById.get(cachedHook.melodyRhythmId);
    if (hookMelodyRhythm) {
      baseMelodyRhythm = hookMelodyRhythm;
    }
  }
  if (!baseMelodyRhythm) {
    const cachedMelodyRhythmId = cache.melodyRhythm;
    baseMelodyRhythm = cachedMelodyRhythmId ? melodyRhythmById.get(cachedMelodyRhythmId) : undefined;
    if (!baseMelodyRhythm) {
      baseMelodyRhythm = selectMelodyRhythmMotif(
        options,
        context.styleIntent,
        baseFunctionTag,
        phraseMeasures * BEATS_PER_MEASURE,
        baseRequiredTags,
        context.rng,
        undefined,
        context.usedMotifs.melodyRhythms
      );
      cache.melodyRhythm = baseMelodyRhythm.id;
    }
  }

  // Establish hook if needed
  if (establishesHook(section) && isFirstPhrase) {
    setHookForOccurrence(context.caches.hook, section.templateId, section.occurrenceIndex, {
      rhythmId: baseRhythm.id,
      melodyId: baseMelody.id,
      melodyRhythmId: baseMelodyRhythm.id
    });
  }

  context.usedMotifs.rhythms.add(baseRhythm.id);
  context.usedMotifs.melodies.add(baseMelody.id);
  context.usedMotifs.melodyRhythms.add(baseMelodyRhythm.id);

  // Track usage count for diagnostics
  context.motifUsage.melodyRhythm[baseMelodyRhythm.id] =
    (context.motifUsage.melodyRhythm[baseMelodyRhythm.id] ?? 0) + 1;

  // Record section motif plan on first phrase
  if (isFirstPhrase) {
    results.sectionMotifPlan.push({
      sectionId: section.id,
      templateId: section.templateId,
      occurrenceIndex: section.occurrenceIndex,
      primaryRhythm: baseRhythm.id,
      primaryMelody: baseMelody.id,
      primaryMelodyRhythm: baseMelodyRhythm.id,
      reprisesHook:
        repriseHook(section) && Boolean(cachedHook) &&
        cachedHook?.rhythmId === baseRhythm.id &&
        cachedHook?.melodyId === baseMelody.id &&
        cachedHook?.melodyRhythmId === baseMelodyRhythm.id
    });
  }

  return {
    section,
    phraseMeasures,
    isFirstPhrase,
    phraseStartMeasureIndex,
    cachedHook,
    baseRhythm,
    baseMelody,
    baseMelodyRhythm
  };
}

/**
 * Process a single phrase, iterating over its measures.
 * Part of P2-1 refactoring: extracted from selectMotifsLegacy.
 */
function processSinglePhrase(
  phraseContext: PhraseContext,
  phase1: Phase1Result,
  options: LegacyCompositionOptions,
  context: MotifContext,
  results: MotifResults
): void {
  const { section, phraseMeasures, isFirstPhrase, baseMelody, baseMelodyRhythm } = phraseContext;
  const sectionStartBeat = section.startMeasure * BEATS_PER_MEASURE;
  
  const expandedMelodyRhythm = expandMelodyRhythmPattern(baseMelodyRhythm);
  let phraseBeatCursor = 0;
  let phraseStepIndex = 0;
  let melodyDegreeCursor = 0;

  for (let phraseOffset = 0; phraseOffset < phraseMeasures; phraseOffset++) {
    const measureContext = createMeasureContext(
      phraseContext,
      phraseOffset,
      options,
      context
    );

    // Add pickup note if first phrase and first measure
    if (isFirstPhrase && phraseOffset === 0) {
      maybeAddPickupNote(results.melody, measureContext.measureStartBeat, baseMelody, section.id);
    }

    // Generate melody for this measure
    generateMelodyForMeasure(
      measureContext,
      expandedMelodyRhythm,
      baseMelody,
      section,
      context,
      results.melody,
      { phraseBeatCursor, phraseStepIndex, melodyDegreeCursor }
    );

    // Update cursors after melody generation
    const measureBeatLimit = (phraseOffset + 1) * BEATS_PER_MEASURE;
    while (phraseStepIndex < expandedMelodyRhythm.length && phraseBeatCursor < measureBeatLimit) {
      const step = expandedMelodyRhythm[phraseStepIndex];
      if (!step.rest) {
        melodyDegreeCursor++;
      }
      phraseBeatCursor += step.durationBeats;
      phraseStepIndex++;
    }

    // Generate bass for this measure
    generateBassForMeasure(measureContext, phase1, section, context, results.bass);

    // Generate accompaniment for this measure
    generateAccompanimentForMeasure(
      measureContext,
      baseMelody,
      section,
      context,
      results.accompanimentSeeds
    );

    // Generate drums for this measure
    generateDrumsForMeasure(
      measureContext,
      section,
      context,
      results.drums
    );

    // Update last motifs
    context.lastMotifs.rhythm = measureContext.rhythmMotif;
    context.lastMotifs.melodyFragment = baseMelody;
  }
}

/**
 * Create measure context for processing a single measure.
 * Handles rhythm selection with variation logic.
 */
function createMeasureContext(
  phraseContext: PhraseContext,
  phraseOffset: number,
  options: LegacyCompositionOptions,
  context: MotifContext
): MeasureContext {
  const { section, isFirstPhrase, baseRhythm } = phraseContext;
  const measureInSection = phraseContext.phraseStartMeasureIndex - section.startMeasure + phraseOffset;
  const globalMeasureIndex = section.startMeasure + measureInSection;
  const measureStartBeat = section.startMeasure * BEATS_PER_MEASURE + measureInSection * BEATS_PER_MEASURE;
  
  const functionTag = functionalTagForMeasure(measureInSection, section.measures);
  const requiredTags: string[] = [];
  const isHookMeasure = repriseHook(section) && measureInSection === 0;
  
  if (globalMeasureIndex === context.totalMeasures - 1) {
    requiredTags.push("loop_safe");
  } else if (globalMeasureIndex === context.totalMeasures - 2 && !isHookMeasure) {
    requiredTags.push("cadence");
  }

  const measureKey = cacheKey(functionTag, requiredTags);
  const measureCache = getOrCreateTemplateCache(context.caches.template, section.templateId, measureKey);

  // Control variation vs exact repetition using sectionRepeatBias
  // Higher bias = more repetition, lower bias = more variation
  const repeatBias = options.sectionRepeatBias ?? 0.3;
  const shouldVaryByPosition = phraseOffset > 0 || !isFirstPhrase || section.occurrenceIndex > 1;
  const preferVariation =
    !repriseHook(section) &&
    shouldVaryByPosition &&
    context.rng() > repeatBias;
  
  let rhythmMotif = measureCache.rhythm ? rhythmById.get(measureCache.rhythm) : undefined;
  
  if (!rhythmMotif) {
    if (preferVariation) {
      rhythmMotif = pickRhythmVariation(baseRhythm, functionTag, requiredTags, context.rng, context.usedMotifs.rhythms) ?? baseRhythm;
    } else {
      rhythmMotif = baseRhythm;
    }
  } else if (preferVariation && rhythmMotif.id === baseRhythm.id) {
    const variation = pickRhythmVariation(baseRhythm, functionTag, requiredTags, context.rng, context.usedMotifs.rhythms);
    if (variation) {
      rhythmMotif = variation;
    }
  }
  
  if (!rhythmMotif.tags.includes(functionTag) || !hasAllTags(rhythmMotif, requiredTags)) {
    rhythmMotif = selectRhythmMotif(
      options,
      context.styleIntent,
      functionTag,
      baseRhythm,
      requiredTags,
      context.rng,
      context.usedMotifs.rhythms
    );
  }
  
  measureCache.rhythm = rhythmMotif.id;
  context.motifUsage.rhythm[rhythmMotif.id] = (context.motifUsage.rhythm[rhythmMotif.id] ?? 0) + 1;
  context.usedMotifs.rhythms.add(rhythmMotif.id);

  return {
    measureInSection,
    globalMeasureIndex,
    measureStartBeat,
    functionTag,
    requiredTags,
    isHookMeasure,
    phraseOffset,
    rhythmMotif
  };
}

/**
 * Generate melody notes for a single measure.
 * Part of P2-1 refactoring: extracted from selectMotifsLegacy.
 */
function generateMelodyForMeasure(
  measureContext: MeasureContext,
  expandedMelodyRhythm: ExpandedMelodyRhythmStep[],
  baseMelody: (typeof melodyList)[number],
  section: SectionDefinition,
  context: MotifContext,
  melodyOutput: AbstractNote[],
  cursors: { phraseBeatCursor: number; phraseStepIndex: number; melodyDegreeCursor: number }
): void {
  const { measureStartBeat, measureInSection, globalMeasureIndex, phraseOffset } = measureContext;
  const measureBeatLimit = (phraseOffset + 1) * BEATS_PER_MEASURE;
  
  while (cursors.phraseStepIndex < expandedMelodyRhythm.length && cursors.phraseBeatCursor < measureBeatLimit) {
    const step = expandedMelodyRhythm[cursors.phraseStepIndex];
    const localStart = cursors.phraseBeatCursor - phraseOffset * BEATS_PER_MEASURE;
    
    if (!step.rest) {
      let degree = baseMelody.pattern[cursors.melodyDegreeCursor % baseMelody.pattern.length];
      const isTailStep = cursors.phraseStepIndex === expandedMelodyRhythm.length - 1;
      
      if (isTailStep && (section.occurrenceIndex > 1 || measureInSection > 0) && !repriseHook(section)) {
        degree = resolveTailDegreeVariant(degree, baseMelody.pattern, context.styleIntent, context.rng);
      }
      
      let velocity = resolveMelodyVelocity(
        section,
        measureInSection,
        globalMeasureIndex,
        context.totalMeasures,
        context.styleIntent
      );
      
      melodyOutput.push({
        channelRole: "melody",
        startBeat: measureStartBeat + localStart,
        durationBeats: step.durationBeats,
        degree,
        velocity,
        sectionId: section.id
      });
      
      cursors.melodyDegreeCursor++;
    }
    
    cursors.phraseBeatCursor += step.durationBeats;
    cursors.phraseStepIndex++;
  }
}

/**
 * Generate bass notes for a single measure.
 * Part of P2-1 refactoring: extracted from selectMotifsLegacy.
 */
function generateBassForMeasure(
  measureContext: MeasureContext,
  phase1: Phase1Result,
  section: SectionDefinition,
  context: MotifContext,
  bassOutput: AbstractNote[]
): void {
  const { measureStartBeat, measureInSection } = measureContext;
  
  let bassPattern = context.caches.bassPattern.get(section.id);
  if (!bassPattern) {
    bassPattern = resolveBassPattern(
      section,
      measureInSection,
      context.rng,
      context.usedMotifs.bassPatterns,
      context.caches.bassPattern,
      context.styleIntent
    );
    context.caches.bassPattern.set(section.id, bassPattern);
  }
  
  const currentChord = resolveChordAtBeat(phase1, measureStartBeat);
  const nextChord = resolveChordAtBeat(phase1, measureStartBeat + BEATS_PER_MEASURE);
  
  bassOutput.push(
    ...buildBassPattern(
      section,
      measureStartBeat,
      currentChord,
      nextChord,
      bassPattern
    )
  );
}

/**
 * Generate accompaniment seeds for a single measure.
 * Part of P2-1 refactoring: extracted from selectMotifsLegacy.
 */
function generateAccompanimentForMeasure(
  measureContext: MeasureContext,
  baseMelody: (typeof melodyList)[number],
  section: SectionDefinition,
  context: MotifContext,
  accompanimentOutput: AbstractNote[]
): void {
  const { measureStartBeat, rhythmMotif, functionTag } = measureContext;
  
  accompanimentOutput.push(
    ...buildAccompanimentSeeds(
      section,
      measureStartBeat,
      rhythmMotif,
      baseMelody,
      functionTag,
      context.voiceArrangement.id,
      context.rng
    )
  );
}

/**
 * Generate drum hits for a single measure.
 * Part of P2-1 refactoring: extracted from selectMotifsLegacy.
 */
function generateDrumsForMeasure(
  measureContext: MeasureContext,
  section: SectionDefinition,
  context: MotifContext,
  drumsOutput: DrumHit[]
): void {
  const { measureStartBeat, measureInSection, requiredTags } = measureContext;
  
  const isSectionFinalMeasure = measureInSection === section.measures - 1;
  const shouldForceFill =
    isSectionFinalMeasure || (section.measures > 2 && measureInSection === section.measures - 2);
  
  const drumKey = cacheKey(`${measureInSection}:${shouldForceFill ? "fill" : "beat"}`, requiredTags);
  const drumCache = getOrCreateTemplateCache(context.caches.template, section.templateId, drumKey);
  
  let drumPattern = drumCache.drum ? drumById.get(drumCache.drum) : undefined;
  
  if (!drumPattern) {
    drumPattern = selectDrumPattern(
      measureInSection,
      section.measures,
      requiredTags,
      context.rng,
      context.lastMotifs.drumPatternId,
      context.usedMotifs.drums,
      shouldForceFill,
      context.styleIntent,
      context.voiceArrangement.id
    );
    if (drumPattern) {
      drumCache.drum = drumPattern.id;
    }
  }
  
  if (drumPattern) {
    context.motifUsage.drums[drumPattern.id] = (context.motifUsage.drums[drumPattern.id] ?? 0) + 1;
    context.usedMotifs.drums.add(drumPattern.id);
    drumsOutput.push(...generateDrumHitsFromPattern(drumPattern.pattern, measureStartBeat, section.id));
    context.lastMotifs.drumPatternId = drumPattern.id;
  }
  
  // Handle transitions at section end
  if (isSectionFinalMeasure) {
    const isLastSection = section.id === context.sectionById.get(Array.from(context.sectionById.keys()).pop()!)?.id;
    const transitionResult = maybeGenerateTransition(
      section,
      measureStartBeat,
      isLastSection,
      context.rng,
      context.lastMotifs.transitionId,
      context.usedMotifs.transitions,
      context.styleIntent,
      section.startMeasure + measureInSection,
      context.totalMeasures
    );
    
    if (transitionResult) {
      context.motifUsage.transitions[transitionResult.motifId] =
        (context.motifUsage.transitions[transitionResult.motifId] ?? 0) + 1;
      context.usedMotifs.transitions.add(transitionResult.motifId);
      drumsOutput.push(...mergeTransitionHits(drumsOutput, transitionResult.hits));
      context.lastMotifs.transitionId = transitionResult.motifId;
    }
  }
}

/**
 * Convert melody AbstractNotes to MidiNotes with chord quantization.
 * Part of P2-1 refactoring: extracted from selectMotifsLegacy.
 */
function convertMelodyToMidi(
  melody: AbstractNote[],
  phase1: Phase1Result,
  context: MotifContext
): MidiNote[] {
  return melody.map((note) => {
    const section = context.sectionById.get(note.sectionId);
    const measureIndex = Math.floor(note.startBeat / BEATS_PER_MEASURE);
    const measureInSection = section ? measureIndex - section.startMeasure : 0;
    const baseRegister = resolveMelodyRegister(
      section,
      measureInSection,
      measureIndex,
      context.totalMeasures,
      context.styleIntent,
      context.compositionBaseRegister
    );
    const baseMidi = scaleDegreeToMidi(note.degree, phase1.scaleDegrees, baseRegister);
    const chord = resolveChordAtBeat(phase1, note.startBeat);
    const midi = isStrongBeat(note.startBeat)
      ? quantizeMidiToChord(baseMidi, chord)
      : ensureConsonantPitch(baseMidi, chord);
    return { ...note, midi };
  });
}

/**
 * Convert accompaniment AbstractNotes to MidiNotes with consonant pitch adjustment.
 * Part of P2-1 refactoring: extracted from selectMotifsLegacy.
 */
function convertAccompanimentToMidi(
  accompanimentSeeds: AbstractNote[],
  phase1: Phase1Result,
  melodyMidi: MidiNote[]
): MidiNote[] {
  return accompanimentSeeds.map((note) => {
    const baseMidi = scaleDegreeToMidi(note.degree, phase1.scaleDegrees, 67);
    const chord = resolveChordAtBeat(phase1, note.startBeat);
    const reference = findMelodyReference(note.startBeat, melodyMidi);
    const midi = ensureConsonantPitch(baseMidi, chord, reference?.midi);
    return { ...note, midi };
  });
}

/**
 * Convert bass AbstractNotes to MidiNotes with chord quantization.
 * Part of P2-1 refactoring: extracted from selectMotifsLegacy.
 */
function convertBassToMidi(
  bass: AbstractNote[],
  phase1: Phase1Result
): MidiNote[] {
  return bass.map((note) => {
    const midiOverride = (note as any).midiOverride as number | undefined;
    const base = midiOverride ?? scaleDegreeToMidi(note.degree, phase1.scaleDegrees, 52, -1);
    const chord = resolveChordAtBeat(phase1, note.startBeat);
    const midi = quantizeMidiToChord(base, chord);
    return { ...note, midi };
  });
}

/**
 * Legacy Phase2 implementation for standard/swapped arrangements
 * Preserves backwards compatibility
 */
function selectMotifsLegacy(options: LegacyCompositionOptions, phase1: Phase1Result): {
  melody: MidiNote[];
  bass: MidiNote[];
  accompanimentSeeds: MidiNote[];
  drums: DrumHit[];
  motifUsage: Phase2Result["motifUsage"];
  sectionMotifPlan: SectionMotifPlan[];
} {
  // Initialize context (P2-1 refactoring: extracted from original implementation)
  const context = initializeMotifContext(options, phase1);
  
  // Initialize results accumulator
  const results: MotifResults = {
    melody: [],
    bass: [],
    accompanimentSeeds: [],
    drums: [],
    sectionMotifPlan: []
  };

  // Process all sections (P2-1 refactoring: Section → Phrase → Measure hierarchy)
  for (const section of phase1.sections) {
    processSectionPhrases(section, phase1, options, context, results);
  }

  // Convert AbstractNotes to MidiNotes (P2-1 refactoring: extracted conversion logic)
  const melodyMidi = convertMelodyToMidi(results.melody, phase1, context);
  const bassMidi = convertBassToMidi(results.bass, phase1);
  const accompanimentMidi = convertAccompanimentToMidi(results.accompanimentSeeds, phase1, melodyMidi);

  return {
    melody: melodyMidi,
    bass: bassMidi,
    accompanimentSeeds: accompanimentMidi,
    drums: results.drums,
    motifUsage: context.motifUsage,
    sectionMotifPlan: results.sectionMotifPlan
  };
}

/**
 * New Phase2 implementation with voice arrangement support
 */
export function selectMotifs(options: LegacyCompositionOptions, phase1: Phase1Result): Phase2Result {
  const { voiceArrangement } = phase1;
  const baseSeed = options.seed ?? RNG_SEED;
  const legacy = selectMotifsLegacy(options, phase1);

  // For standard/swapped arrangements, use legacy implementation
  if (voiceArrangement.id === "standard" || voiceArrangement.id === "swapped") {
    return {
      tracks: [
        { role: "melody", notes: legacy.melody },
        { role: "bass", notes: legacy.bass },
        { role: "accompaniment", notes: legacy.accompanimentSeeds }
      ],
      drums: legacy.drums,
      motifUsage: legacy.motifUsage,
      sectionMotifPlan: legacy.sectionMotifPlan
    };
  }

  // New arrangements: generate tracks based on voice roles
  const tracks: Phase2Result["tracks"] = [];

  // Process each voice in the arrangement
  for (const voice of voiceArrangement.voices) {
    let abstractNotes: AbstractNote[];

    switch (voice.role) {
      case "bass":
      case "bassAlt":
        abstractNotes = generateBassTrackForVoice(
          voice.role,
          voice.priority,
          voice.octaveOffset ?? 0,
          voice.seedOffset ?? 0,
          options,
          phase1
        );
        break;

      case "pad":
        abstractNotes = generatePadTrackForVoice(
          voice.priority,
          options,
          phase1,
          baseSeed + (voice.seedOffset ?? 0)
        );
        break;

      case "melody":
      case "melodyAlt":
      case "accompaniment":
        // For minimal arrangement without melody, skip
        if (voice.role === "melody" && voiceArrangement.id === "minimal") {
          continue;
        }
        // Reuse legacy results to preserve motif usage history
        if (voice.role === "melody") {
          abstractNotes = legacy.melody;
        } else {
          abstractNotes = legacy.accompanimentSeeds;
        }
        break;

      default:
        abstractNotes = [];
    }

    // Convert AbstractNote to MidiNote
    const midiNotes: MidiNote[] = abstractNotes.map((note) => {
      let midi: number;
      let velocity = note.velocity;

      // Handle bass with midiOverride
      if ((note.channelRole === "bass" || voice.role === "bass" || voice.role === "bassAlt") &&
          (note as any).midiOverride !== undefined) {
        midi = (note as any).midiOverride;
      } else {
        // Handle melody/accompaniment/pad with scale conversion
        const measureIndex = Math.floor(note.startBeat / BEATS_PER_MEASURE);
        const baseRegister = voice.role === "melody" || voice.role === "melodyAlt" ? 72 : 67;
        const baseMidi = scaleDegreeToMidi(note.degree, phase1.scaleDegrees, baseRegister);
        const chord = resolveChordAtBeat(phase1, note.startBeat);
        midi = quantizeMidiToChord(baseMidi, chord);

        // Apply octaveOffset for non-bass roles (e.g., bassLed arrangement)
        if (voice.octaveOffset) {
          midi += voice.octaveOffset * 12;
        }
      }

      // Layered bass now splits square (foundation) and triangle (accent). Tame their
      // combined energy while keeping the triangle layer lighter and slightly higher.
      if (voiceArrangement.id === "layeredBass") {
        if (voice.role === "bass") {
          velocity = Math.max(28, Math.round(velocity * 0.65));
        } else if (voice.role === "bassAlt") {
          velocity = Math.max(22, Math.round(velocity * 0.5));
        }
      }

      return { ...note, midi, velocity };
    });

    if (midiNotes.length > 0) {
      tracks.push({ role: voice.role, notes: midiNotes });
    }
  }

  return {
    tracks,
    drums: legacy.drums,
    motifUsage: legacy.motifUsage,
    sectionMotifPlan: legacy.sectionMotifPlan
  };
}

function convertToBeats(value: number): number {
  switch (value) {
    case 2:
      return 2;    // 2分音符 = 2拍
    case 4:
      return 1;    // 4分音符 = 1拍
    case 8:
      return 0.5;  // 8分音符 = 0.5拍
    case 16:
      return 0.25; // 16分音符 = 0.25拍
    default:
      return 0.25;
  }
}

function selectDrumPattern(
  measureIndex: number,
  totalMeasures: number,
  requiredTags: string[],
  rng: () => number,
  lastPatternId: string | undefined,
  used: Set<string>,
  forceFill: boolean,
  styleIntent: StyleIntent,
  arrangementId: VoiceArrangementPreset
) {
  const arrangementRule = ARRANGEMENT_DRUM_RULES[arrangementId];
  if (!forceFill && arrangementRule?.earlySparseMeasures && measureIndex < arrangementRule.earlySparseMeasures) {
    if (rng() < 0.3) {
      return undefined;
    }
  }

  // gradualBuild: progressive layer control
  if (styleIntent.gradualBuild && totalMeasures >= 8) {
    const progress = measureIndex / Math.max(1, totalMeasures - 1);
    const earlyThreshold = Math.min(0.35, 6 / Math.max(1, totalMeasures));
    const midThreshold = Math.min(0.7, 14 / Math.max(1, totalMeasures));
    if (progress < earlyThreshold) {
      if (rng() < 0.75) {
        return undefined;
      }
    } else if (progress < midThreshold) {
      if (rng() < 0.35) {
        return undefined;
      }
    }
  }

  const fillEvery = styleIntent.breakInsertion ? 2 : 4;
  const cycleFill = fillEvery > 0 && totalMeasures >= fillEvery && (measureIndex + 1) % fillEvery === 0;
  const isFill = forceFill || cycleFill;
  let candidates = drumList.filter((pattern) =>
    isFill ? pattern.type === "fill" : pattern.type === "beat"
  );
  const fitsMeasure = candidates.filter((pattern) => pattern.length_beats <= BEATS_PER_MEASURE);
  if (fitsMeasure.length) {
    candidates = fitsMeasure;
  }
  if (requiredTags.length) {
    const filtered = candidates.filter((pattern) => {
      const tags = (pattern as any).tags as string[] | undefined;
      return tags ? requiredTags.every((tag) => tags.includes(tag)) : false;
    });
    if (filtered.length) {
      candidates = filtered;
    }
  }
  if (!candidates.length) {
    candidates = drumList.filter((pattern) => (isFill ? pattern.type === "fill" : pattern.type === "beat"));
  }
  if (!candidates.length) {
    candidates = drumList;
  }
  const prefersBreakbeatFocus =
    styleIntent.percussiveLayering &&
    styleIntent.syncopationBias &&
    styleIntent.breakInsertion &&
    !styleIntent.loopCentric;
  const prefersLofiGroove =
    styleIntent.atmosPad &&
    styleIntent.loopCentric &&
    styleIntent.harmonicStatic;
  const prefersRetroPulse =
    styleIntent.loopCentric &&
    styleIntent.textureFocus &&
    styleIntent.percussiveLayering;

  if (!isFill) {
    if (styleIntent.loopCentric) {
      candidates = preferTagPresence(candidates, ["loop_safe"]);
    }
    if (styleIntent.syncopationBias) {
      const syncTags = prefersBreakbeatFocus ? ["breakbeat", "syncopation", "grid16"] : ["syncopation"];
      candidates = preferTagPresence(candidates, syncTags);
    }
    if (styleIntent.textureFocus) {
      candidates = preferTagPresence(candidates, ["texture_loop", "straight", "grid16"]);
    }
    if (styleIntent.percussiveLayering) {
      const percussiveTags = prefersBreakbeatFocus
        ? ["breakbeat", "percussive_layer", "grid16"]
        : ["percussive_layer", "four_on_floor"];
      candidates = preferTagPresence(candidates, percussiveTags);
    }
    if (prefersLofiGroove) {
      candidates = preferTagPresence(candidates, ["lofi", "rest_heavy", "swing_hint"], 0.3);
    }
    if (prefersRetroPulse) {
      candidates = preferTagPresence(candidates, ["loop_safe", "grid16", "texture_loop"], 0.25);
    }
    if (arrangementRule?.preferBeatTags?.length) {
      candidates = preferTagPresence(candidates, arrangementRule.preferBeatTags, 0.25);
    }
  } else {
    if (arrangementRule?.preferFillTags?.length) {
      candidates = preferTagPresence(candidates, arrangementRule.preferFillTags, 0.25);
    }
  }
  if (prefersBreakbeatFocus) {
    candidates = preferTagPresence(candidates, ["breakbeat", "grid16"], 0.2);
  }
  if (arrangementRule?.avoidTags?.length) {
    const filtered = candidates.filter((pattern) => {
      const tags = (pattern as any).tags as string[] | undefined;
      if (!tags) return true;
      return !arrangementRule.avoidTags!.some((tag) => tags.includes(tag));
    });
    if (filtered.length) {
      candidates = filtered;
    }
  }
  const pool = preferUnused(candidates, used);
  return pickWithAvoid(pool, rng, lastPatternId);
}

function preferUnused<T extends { id?: string }>(candidates: T[], used: Set<string>): T[] {
  if (!candidates.length) {
    return candidates;
  }
  const unused = candidates.filter((entry) => (entry.id ? !used.has(entry.id) : true));
  return unused.length ? unused : candidates;
}

function cacheKey(functionTag: string, requiredTags: string[]): string {
  if (!requiredTags.length) {
    return functionTag;
  }
  const tags = [...requiredTags].sort();
  return `${functionTag}:${tags.join("|")}`;
}

// ========================================
// Voice Arrangement Helper Functions
// ========================================

/**
 * Create RNG with offset for voice variation
 */
function createVoiceRng(baseSeed: number | undefined, seedOffset: number): () => number {
  const effectiveSeed = ((baseSeed ?? RNG_SEED) + seedOffset) >>> 0;
  return createRng(effectiveSeed);
}

/**
 * Check if a voice should generate a note in this measure (probability-based density)
 */
function shouldGenerateForVoice(
  priority: number,
  measureInSection: number,
  totalMeasures: number,
  styleIntent: StyleIntent,
  rng: () => number
): boolean {
  // Always generate if priority is 1.0
  if (priority >= 1.0) {
    return true;
  }

  // For gradualBuild style, increase density over time
  if (styleIntent.gradualBuild) {
    const progress = measureInSection / Math.max(1, totalMeasures - 1);
    const adjustedPriority = Math.min(1.0, priority + progress * 0.3);
    return rng() < adjustedPriority;
  }

  // Default: probabilistic based on priority
  return rng() < priority;
}

/**
 * Modified buildBassPattern to accept custom baseMidi
 */
function buildBassPatternWithBaseMidi(
  section: Phase1Result["sections"][number],
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
 * Generate bass track for a voice (reuses existing logic)
 */
function generateBassTrackForVoice(
  role: "bass" | "bassAlt",
  priority: number,
  octaveOffset: number,
  seedOffset: number,
  options: LegacyCompositionOptions,
  phase1: Phase1Result
): AbstractNote[] {
  const bassNotes: AbstractNote[] = [];
  const styleIntent = phase1.styleIntent;
  const baseSeed = options.seed ?? RNG_SEED;
  const voiceRng = createVoiceRng(baseSeed, seedOffset);
  const usedBassPatterns = new Set<string>();
  const bassPatternCache = new Map<string, BassPatternMotif>();

  const octaveOffsetSemitones = octaveOffset * 12;
  const baseBassMidi = 40 + octaveOffsetSemitones;

  for (const section of phase1.sections) {
    const sectionStartBeat = section.startMeasure * BEATS_PER_MEASURE;

    for (let measure = 0; measure < section.measures; measure++) {
      // Density check: should this voice play in this measure?
      if (!shouldGenerateForVoice(priority, measure, section.measures, styleIntent, voiceRng)) {
        continue;
      }

      const measureStartBeat = sectionStartBeat + measure * BEATS_PER_MEASURE;

      // Reuse existing bass pattern resolution logic
      const bassPattern = resolveBassPattern(
        section,
        measure,
        voiceRng,
        usedBassPatterns,
        bassPatternCache,
        styleIntent,
        role === "bassAlt"
          ? { enforceDroneStatic: false, preferredTags: ["drone", "accent"] }
          : undefined
      );

      // Build bass notes with adjusted base MIDI
      const chord = resolveChordAtBeat(phase1, measureStartBeat);
      const nextChord = resolveChordAtBeat(phase1, measureStartBeat + BEATS_PER_MEASURE);

      const patternNotes = buildBassPatternWithBaseMidi(
        section,
        measureStartBeat,
        chord,
        nextChord,
        bassPattern,
        baseBassMidi,
        octaveOffset
      );

      bassNotes.push(...patternNotes);
    }
  }

  return bassNotes;
}

/**
 * Generate pad track (long sustained notes from accompaniment seeds)
 */
function generatePadTrackForVoice(
  priority: number,
  options: LegacyCompositionOptions,
  phase1: Phase1Result,
  baseSeed: number
): AbstractNote[] {
  const voiceRng = createRng(baseSeed);
  const padNotes: AbstractNote[] = [];

  for (const section of phase1.sections) {
    const sectionStartBeat = section.startMeasure * BEATS_PER_MEASURE;

    for (let measure = 0; measure < section.measures; measure++) {
      if (!shouldGenerateForVoice(priority, measure, section.measures, phase1.styleIntent, voiceRng)) {
        continue;
      }

      const measureStartBeat = sectionStartBeat + measure * BEATS_PER_MEASURE;

      // Generate one long pad note per measure (root or fifth)
      const degree = (measure % 2 === 0) ? 1 : 5;
      padNotes.push({
        channelRole: "accompaniment",
        startBeat: measureStartBeat,
        durationBeats: BEATS_PER_MEASURE,
        degree,
        velocity: VELOCITY_ACCOMPANIMENT.PAD_MIN,
        sectionId: section.id
      });
    }
  }

  return padNotes;
}

// Note: Old helper functions (ensureTemplateCache, lookupRhythmFromCache, lookupMelodyFromCache)
// removed per REFACTOR_PLAN.md Step 1-C - replaced by getOrCreateTemplateCache above
