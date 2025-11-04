/**
 * Style Profile Resolution System
 *
 * This module converts modern CompositionOptions (two-axis style coordinates) into
 * PipelineCompositionOptions (mood/tempo strings) used by the internal pipeline.
 * It serves as a bridge between the user-facing API and the simplified pipeline inputs.
 *
 * ## Why Two APIs?
 *
 * The system evolved from a simple mood/tempo string API to a more intuitive two-axis
 * coordinate system:
 *
 * ### Legacy API (Internal)
 * ```typescript
 * { mood: "upbeat", tempo: "fast", seed: 123 }
 * ```
 * - **Pros**: Simple, discrete categories easy to implement
 * - **Cons**: Limited expressiveness (only 4 moods × 3 tempos = 12 combinations),
 *   unintuitive mapping (what's the difference between "tense" and "sad"?)
 *
 * ### Two-Axis API (External)
 * ```typescript
 * { twoAxisStyle: { percussiveMelodic: -0.5, calmEnergetic: 0.8 } }
 * ```
 * - **Pros**: Continuous space (infinite combinations), intuitive axes (percussive↔melodic,
 *   calm↔energetic), matches music theory concepts
 * - **Cons**: Requires coordinate → category mapping for the existing pipeline
 *
 * ## Resolution Strategy
 *
 * Rather than rewrite the entire pipeline to use two-axis coordinates directly, we:
 * 1. Accept modern two-axis API externally (CompositionOptions)
 * 2. Map coordinates to discrete mood/tempo internally (two-axis-mapper.ts)
 * 3. Pass PipelineCompositionOptions through existing pipeline
 * 4. Store resolved profile in metadata for debugging/replay
 *
 * This provides:
 * - Clean external API (users never see "mood" or "tempo" strings)
 * - Stable internal implementation (pipeline code doesn't change)
 * - Gradual migration path (both APIs can coexist)
 *
 * ## Intent Randomization
 *
 * When randomizeUnsetIntent=true, unset StyleIntent flags are randomly set per seed.
 * This creates variety across generations while maintaining determinism:
 * - Seed 123 might enable textureFocus, disable loopCentric
 * - Seed 456 might disable textureFocus, enable loopCentric
 * - Same seed always produces same randomization
 *
 * This is useful for generating diverse variations when the user doesn't have strong
 * preferences about specific intent flags.
 *
 * ## Preset Inference
 *
 * If no explicit StylePreset is provided, the system can infer one from two-axis coordinates:
 * - Find the preset with closest Euclidean distance in 2D space
 * - Only match if distance < threshold (0.35) to avoid false matches
 * - Returns undefined if no close match (generic style)
 *
 * This allows:
 * - Named presets when user wants specific aesthetics ("minimalTechno")
 * - Coordinate-based generation when user wants custom styles
 * - Automatic preset detection for coordinate-based input
 */

import {
  type CompositionOptions,
  type PipelineCompositionOptions,
  type MoodSetting,
  type ResolvedStyleProfile,
  type StyleIntent,
  type StyleProfile,
  type StylePreset,
  type StyleOverrides,
  type TwoAxisStyle
} from "../types.js";
import {
  validateTwoAxisStyle,
  mapTwoAxisToStyleIntent,
  deriveTwoAxisTempo,
  inferTagsFromAxis
} from "./two-axis-mapper.js";
import { PRESET_TO_TWO_AXIS } from "./preset-to-axis.js";

/**
 * Resolution result containing pipeline format, resolved profile, and replay options.
 */
interface ResolveResult {
  pipeline: PipelineCompositionOptions;  // For pipeline consumption
  profile: ResolvedStyleProfile;         // For metadata/diagnostics
  replayOptions: CompositionOptions;     // For exact replay
}

type IntentKey = keyof StyleIntent;

const INTENT_KEYS: IntentKey[] = [
  "textureFocus",
  "loopCentric",
  "gradualBuild",
  "harmonicStatic",
  "percussiveLayering",
  "breakInsertion",
  "filterMotion",
  "syncopationBias",
  "atmosPad"
];

const DEFAULT_INTENT: StyleIntent = {
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

const DEFAULT_PROFILE: StyleProfile = {
  tempo: "medium",
  intent: { ...DEFAULT_INTENT },
  randomizeUnsetIntent: false
};

const PRESET_SLUG_TO_ENUM: Record<string, StylePreset> = {
  "minimal-techno": "minimalTechno",
  "progressive-house": "progressiveHouse",
  "retro-loopwave": "retroLoopwave",
  "breakbeat-jungle": "breakbeatJungle",
  "lofi-chillhop": "lofiChillhop"
};

const PRESET_MATCH_THRESHOLD = 0.35;

const DEFAULT_AXIS: TwoAxisStyle = {
  percussiveMelodic: 0,
  calmEnergetic: 0
};

function seedRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function ensureIntent(partial: Partial<StyleIntent>, rng: (() => number) | null, randomize: boolean): StyleIntent {
  const intent: StyleIntent = { ...DEFAULT_INTENT };
  for (const key of INTENT_KEYS) {
    const provided = partial[key];
    if (typeof provided === "boolean") {
      intent[key] = provided;
    } else if (randomize && rng) {
      intent[key] = rng() >= 0.5;
    } else {
      intent[key] = false;
    }
  }
  return intent;
}

function mergeProfile(base: StyleProfile, patch: StyleOverrides): StyleProfile {
  const intent: StyleIntent = { ...base.intent };
  if (patch.intent) {
    for (const key of INTENT_KEYS) {
      const value = patch.intent[key];
      if (typeof value === "boolean") {
        intent[key] = value;
      }
    }
  }

  return {
    tempo: patch.tempo ?? base.tempo,
    intent,
    randomizeUnsetIntent: patch.randomizeUnsetIntent ?? base.randomizeUnsetIntent
  };
}

function inferPresetFromAxis(axis: TwoAxisStyle): StylePreset | undefined {
  let bestKey: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [slug, presetAxis] of Object.entries(PRESET_TO_TWO_AXIS)) {
    const distance = Math.hypot(
      axis.percussiveMelodic - presetAxis.percussiveMelodic,
      axis.calmEnergetic - presetAxis.calmEnergetic
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestKey = slug;
    }
  }

  if (!bestKey || bestDistance > PRESET_MATCH_THRESHOLD) {
    return undefined;
  }

  return PRESET_SLUG_TO_ENUM[bestKey] ?? undefined;
}

/**
 * Resolves CompositionOptions into pipeline format + resolved profile + replay options.
 *
 * This is the main entry point for style resolution. It:
 * 1. Validates and defaults user input (length, seed, two-axis coordinates)
 * 2. Maps two-axis coordinates to StyleIntent flags
 * 3. Applies user overrides (if provided)
 * 4. Infers energy/mood tags for metadata
 * 5. Infers mood/tempo for the pipeline
 * 6. Optionally randomizes unset intent flags (if randomizeUnsetIntent=true)
 * 7. Packages results for pipeline consumption and metadata storage
 *
 * ## Input Validation and Defaults
 *
 * - **lengthInMeasures**: Truncate to integer, default to 32 if invalid
 * - **seed**: Truncate to integer, generate random if unspecified
 * - **twoAxisStyle**: Clamp to [-1, 1] range, default to {0, 0} if omitted
 *
 * ## Override Priority
 *
 * Overrides are applied in order:
 * 1. Two-axis mapping (base intent from coordinates)
 * 2. User overrides (explicit intent flag settings)
 * 3. Intent randomization (only for unset flags, if enabled)
 *
 * This allows users to:
 * - Rely on two-axis defaults (no overrides)
 * - Override specific flags while keeping others coordinate-driven
 * - Enable randomization for experimental variety
 *
 * @param options - Modern composition options with two-axis style
 * @returns Resolved context with pipeline format, profile, and replay options
 */
export function resolveGenerationContext(options: CompositionOptions): ResolveResult {
  const resolvedLength =
    typeof options.lengthInMeasures === "number" && options.lengthInMeasures > 0
      ? Math.trunc(options.lengthInMeasures)
      : 32;

  const resolvedSeed =
    typeof options.seed === "number" && Number.isFinite(options.seed)
      ? Math.trunc(options.seed)
      : Math.floor(Math.random() * 0xffffffff);

  const axisInput = options.twoAxisStyle ?? DEFAULT_AXIS;
  const axis = validateTwoAxisStyle(axisInput);

  let intent = mapTwoAxisToStyleIntent(axis);

  if (options.overrides?.intent) {
    for (const key of INTENT_KEYS) {
      const value = options.overrides.intent[key];
      if (typeof value === "boolean") {
        intent[key] = value;
      }
    }
  }

  const tempo = deriveTwoAxisTempo(axis);
  const inferredTags = inferTagsFromAxis(axis);
  const mood: MoodSetting = inferredTags.mood;

  let profile: StyleProfile = {
    tempo,
    intent,
    randomizeUnsetIntent: false
  };

  if (options.overrides) {
    profile = mergeProfile(profile, options.overrides);
  }

  const shouldRandomizeIntent = profile.randomizeUnsetIntent ?? false;
  const rng = shouldRandomizeIntent ? seedRandom(resolvedSeed) : null;
  const finalizedIntent = ensureIntent(profile.intent, rng, shouldRandomizeIntent);

  profile = {
    ...profile,
    intent: finalizedIntent,
    randomizeUnsetIntent: shouldRandomizeIntent
  };

  const pipelineOptions: PipelineCompositionOptions = {
    mood,
    tempo: profile.tempo ?? "medium",
    lengthInMeasures: resolvedLength,
    seed: resolvedSeed,
    stylePreset: inferPresetFromAxis(axis),
    styleOverrides: finalizedIntent
  };

  const resolvedProfile: ResolvedStyleProfile = {
    ...profile,
    tags: {
      mood: inferredTags.mood,
      energy: inferredTags.energy
    },
    twoAxisStyle: { ...axis }
  };

  const replayOptions: CompositionOptions = {
    lengthInMeasures: resolvedLength,
    seed: resolvedSeed,
    twoAxisStyle: { ...axis }
  };

  if (options.overrides) {
    replayOptions.overrides = JSON.parse(JSON.stringify(options.overrides));
  }

  return {
    pipeline: pipelineOptions,
    profile: resolvedProfile,
    replayOptions
  };
}
