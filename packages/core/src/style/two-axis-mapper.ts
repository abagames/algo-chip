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
     * percussiveLayering: Continuous strength based on percussive axis.
     * High values prefer drums with "percussive_layer", "four_on_floor" tags.
     */
    percussiveLayering: percussiveStrength,

    /**
     * syncopationBias: Continuous strength based on percussive axis.
     * High values prefer motifs with "syncopation" tags.
     */
    syncopationBias: percussiveStrength,

    /**
     * breakInsertion: Combined strength from both percussive and energetic axes.
     * Limited by the weaker of the two.
     */
    breakInsertion: Math.min(percussiveStrength, energyStrength),

    // ========================================
    // Melodic side (positive percussiveMelodic)
    // ========================================

    /**
     * harmonicStatic: Combined strength from melodic+calm or percussive+calm.
     * Takes the stronger of the two possible combinations.
     */
    harmonicStatic: Math.max(
      Math.min(melodicStrength, calmStrength),
      Math.min(percussiveStrength, calmStrength)
    ),

    /**
     * atmosPad: Maximum of melodic, calm, or energetic strength.
     */
    atmosPad: Math.max(melodicStrength, calmStrength, energyStrength),

    /**
     * filterMotion: Maximum of melodic or energetic strength.
     */
    filterMotion: Math.max(melodicStrength, energyStrength),

    // ========================================
    // Calm side (negative calmEnergetic)
    // ========================================

    /**
     * loopCentric: Continuous strength based on calm axis.
     */
    loopCentric: calmStrength,

    /**
     * textureFocus: Strong calm OR percussive+calm combination.
     * The combo condition requires less calm strength, so it is amplified.
     */
    textureFocus: Math.max(calmStrength, Math.min(percussiveStrength, calmStrength * 2)),

    // ========================================
    // Energetic side (positive calmEnergetic)
    // ========================================

    /**
     * gradualBuild: Continuous strength based on energetic axis.
     */
    gradualBuild: energyStrength,

    /**
     * lofiFeel: Combined strength requiring both calm and melodic.
     * Limited by the weaker of the two.
     */
    lofiFeel: Math.min(calmStrength, melodicStrength),
  };
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
 * Derives major/minor mode from two-axis coordinates.
 *
 * Rules (checked in order):
 * 1. Calm+melodic quadrant (lofi/ambient) → minor
 * 2. Strongly percussive + not strongly energetic → dark/tense minor
 * 3. Energetic (high positive calmEnergetic) → major
 * 4. Default → major
 *
 * Rule 2 threshold: calmEnergetic ≤ 0.3 keeps "percussive+high-energy" (e.g. progressive house
 * at calmEnergetic=0.6) in major while "percussive+moderate-energy" stays minor.
 */
export function deriveModeFromAxis(axis: TwoAxisStyle): "major" | "minor" {
  const { percussiveMelodic, calmEnergetic } = axis;
  // Calm+melodic quadrant (lofi/ambient) → minor
  if (calmEnergetic <= -0.3 && percussiveMelodic >= 0.2) return "minor";
  // Strongly percussive → dark/tense minor regardless of energy level
  // (consistent with old mood inference: percussiveMelodic ≤ -0.4 mapped to "tense")
  if (percussiveMelodic <= -0.4) return "minor";
  // Positive calmEnergetic with non-percussive axis → major
  if (calmEnergetic >= 0.3) return "major";
  return "major";
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
