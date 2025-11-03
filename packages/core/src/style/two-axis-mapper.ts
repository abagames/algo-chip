import type { MoodSetting, StyleIntent, TwoAxisStyle } from "../types.js";

/**
 * Validates and clamps two-axis values to valid range
 */
export function validateTwoAxisStyle(axis: TwoAxisStyle): TwoAxisStyle {
  return {
    percussiveMelodic: Math.max(-1.0, Math.min(1.0, axis.percussiveMelodic)),
    calmEnergetic: Math.max(-1.0, Math.min(1.0, axis.calmEnergetic))
  };
}

/**
 * Maps two-axis parameters to StyleIntent flags.
 * This function is the bridge between user-friendly 2D control
 * and the internal 9-flag StyleIntent system.
 *
 * @param axis - Two-axis style parameters
 * @returns StyleIntent with computed boolean flags
 */
export function mapTwoAxisToStyleIntent(axis: TwoAxisStyle): StyleIntent {
  const { percussiveMelodic, calmEnergetic } = axis;

  // Compute directional strengths (0~1)
  // These represent "how much" each direction is activated
  const percussiveStrength = Math.max(0, -percussiveMelodic); // strength when negative
  const melodicStrength = Math.max(0, percussiveMelodic);      // strength when positive
  const calmStrength = Math.max(0, -calmEnergetic);            // strength when negative
  const energyStrength = Math.max(0, calmEnergetic);           // strength when positive

  return {
    // ========================================
    // Percussive side (negative percussiveMelodic)
    // ========================================

    /**
     * percussiveLayering: Activates when percussive strength > 0.3
     * Effects: Prefers drums with "percussive_layer", "four_on_floor" tags
     *          Shortens noise release times
     */
    percussiveLayering: percussiveStrength > 0.3,

    /**
     * syncopationBias: Activates when percussive strength > 0.4
     * Effects: Prefers motifs with "syncopation" tags
     *          Increases rhythmic complexity
     */
    syncopationBias: percussiveStrength > 0.4,

    /**
     * breakInsertion: Requires both percussive AND energetic
     * Effects: Inserts breaks every 2 measures
     *          Adds noise FX transitions
     */
    breakInsertion: percussiveStrength > 0.35 && energyStrength > 0.4,

    // ========================================
    // Melodic side (positive percussiveMelodic)
    // ========================================

    /**
     * harmonicStatic: Requires melodic + calm
     * Effects: Enforces drone bass patterns
     *          Prefers "scalar", "stepwise", "static" melodies
     */
    harmonicStatic:
      (melodicStrength > 0.4 && calmStrength > 0.3) ||
      (percussiveStrength > 0.3 && calmStrength > 0.2),

    /**
     * atmosPad: Activates with melody OR strong calm
     * Effects: Increases portamento probability (0.4)
     *          Adds triangle pad gain profiles
     */
    atmosPad: melodicStrength > 0.3 || calmStrength > 0.5 || energyStrength > 0.55,

    /**
     * filterMotion: Melodic-focused filter sweeps
     * Effects: Adds duty cycle sweeps for timbral motion
     */
    filterMotion: melodicStrength > 0.3 || energyStrength > 0.5,

    // ========================================
    // Calm side (negative calmEnergetic)
    // ========================================

    /**
     * loopCentric: Activates with calm > 0.3
     * Effects: Prefers "loop_safe", "texture_loop" motifs
     *          Reduces velocity by 2
     *          Increases arpegggio sustain probability
     */
    loopCentric: calmStrength > 0.3,

    /**
     * textureFocus: Strong calm OR percussive+calm combination
     * Effects: Prefers "texture_loop", "straight", "simple" patterns
     *          Reduces melody velocity by 8
     *          Lowers melody register by 4
     */
    textureFocus: calmStrength > 0.4 || (percussiveStrength > 0.5 && calmStrength > 0.2),

    // ========================================
    // Energetic side (positive calmEnergetic)
    // ========================================

    /**
     * gradualBuild: Activates with energy > 0.4
     * Effects: Progressive velocity increase over track
     *          Progressive register rise
     *          Gain ramps on all channels
     *          Adds duty cycle build sweeps
     */
    gradualBuild: energyStrength > 0.4,
  };
}

/**
 * Derives expression parameters (melody contour, drum density, velocity curve)
 * from two-axis style.
 *
 * @param axis - Two-axis style parameters
 * @returns Expression parameters for StyleProfile
 */
export function deriveTwoAxisExpression(axis: TwoAxisStyle): {
  melodyContour: "ascending" | "stepwise" | "mixed";
  drumDensity: "low" | "medium" | "high";
  velocityCurve: "soft" | "balanced" | "aggressive";
} {
  const { percussiveMelodic, calmEnergetic } = axis;

  // ========================================
  // Melody Contour
  // ========================================
  let melodyContour: "ascending" | "stepwise" | "mixed" = "mixed";

  if (percussiveMelodic > 0.5 && calmEnergetic > 0.3) {
    // Melodic + energetic → ascending melodies
    melodyContour = "ascending";
  } else if (percussiveMelodic > 0.4) {
    // Melodic → stepwise movement
    melodyContour = "stepwise";
  }
  // else: mixed (default)

  // ========================================
  // Drum Density
  // ========================================
  // Influenced by: -percussiveMelodic (more percussive = denser)
  //                +calmEnergetic * 0.5 (more energy = denser)
  const rhythmBias = -percussiveMelodic + calmEnergetic * 0.5;
  let drumDensity: "low" | "medium" | "high" = "medium";

  if (rhythmBias > 0.6) {
    drumDensity = "high";   // Very percussive or very energetic
  } else if (rhythmBias < -0.4) {
    drumDensity = "low";    // Very melodic and calm
  }

  // ========================================
  // Velocity Curve
  // ========================================
  let velocityCurve: "soft" | "balanced" | "aggressive" = "balanced";

  if (calmEnergetic > 0.5) {
    velocityCurve = "aggressive";  // High energy → loud dynamics
  } else if (calmEnergetic < -0.5) {
    velocityCurve = "soft";        // Very calm → gentle dynamics
  }

  return { melodyContour, drumDensity, velocityCurve };
}

/**
 * Derives BPM bias from energy axis.
 * This adjusts the base BPM by ±20 based on energy level.
 *
 * @param axis - Two-axis style parameters
 * @returns BPM adjustment (-20 to +20)
 *
 * Example:
 * - calmEnergetic = -1.0 → BPM bias = -20 (slower)
 * - calmEnergetic =  0.0 → BPM bias = 0 (no change)
 * - calmEnergetic = +1.0 → BPM bias = +20 (faster)
 */
export function deriveTwoAxisBpmBias(axis: TwoAxisStyle): number {
  return axis.calmEnergetic * 20;
}

/**
 * Derives tempo setting (slow/medium/fast) from energy axis.
 *
 * @param axis - Two-axis style parameters
 * @returns Tempo setting
 */
export function deriveTwoAxisTempo(axis: TwoAxisStyle): "slow" | "medium" | "fast" {
  if (axis.calmEnergetic < -0.4) return "slow";
  if (axis.calmEnergetic > 0.4) return "fast";
  return "medium";
}

/**
 * Infers StyleTags from two-axis parameters for metadata/diagnostics.
 * These tags are stored in PipelineResult.meta for reference.
 *
 * @param axis - Two-axis style parameters
 * @returns Inferred style tags
 */
export function inferTagsFromAxis(axis: TwoAxisStyle): {
  energy: "low" | "medium" | "high";
  mood: MoodSetting;
} {
  const { percussiveMelodic, calmEnergetic } = axis;

  // Energy tag
  let energy: "low" | "medium" | "high" = "medium";
  if (calmEnergetic > 0.4) energy = "high";
  if (calmEnergetic < -0.4) energy = "low";

  // Mood inference (heuristic)
  let mood: MoodSetting = "upbeat";

  if (calmEnergetic <= -0.5) {
    mood = "peaceful";
  } else if (percussiveMelodic <= -0.4) {
    mood = "tense";
  } else if (percussiveMelodic >= 0.4) {
    mood = "sad";
  } else if (calmEnergetic >= 0.4) {
    mood = "upbeat";
  }

  return { energy, mood };
}
