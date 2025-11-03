import type { TwoAxisStyle } from "../types.js";

/**
 * Converts legacy genre presets to two-axis parameters.
 * These values were derived by analyzing the StyleIntent flags
 * of each preset and mapping them to the 2D space.
 */
export const PRESET_TO_TWO_AXIS: Record<string, TwoAxisStyle> = {
  /**
   * Minimal Techno
   * - Percussive-leaning with moderate calm
   * - Features: harmonicStatic, textureFocus, loopCentric
   */
  "minimal-techno": {
    percussiveMelodic: -0.4,  // Percussive
    calmEnergetic: -0.3       // Calm-ish
  },

  /**
   * Progressive House
   * - Slightly percussive with high energy
   * - Features: gradualBuild, breakInsertion, atmosPad
   */
  "progressive-house": {
    percussiveMelodic: -0.45, // Moderately percussive
    calmEnergetic: 0.6        // High energy
  },

  /**
   * Retro Loopwave
   * - Melodic-leaning with moderate calm
   * - Features: loopCentric, textureFocus, filterMotion
   */
  "retro-loopwave": {
    percussiveMelodic: 0.3,   // Melodic-ish
    calmEnergetic: -0.2       // Calm-ish
  },

  /**
   * Breakbeat Jungle
   * - Very percussive with very high energy
   * - Features: percussiveLayering, syncopationBias, breakInsertion
   */
  "breakbeat-jungle": {
    percussiveMelodic: -0.7,  // Ultra percussive
    calmEnergetic: 0.7        // Ultra energetic
  },

  /**
   * Lofi Chillhop
   * - Melodic with strong calm
   * - Features: harmonicStatic, atmosPad, loopCentric, textureFocus
   */
  "lofi-chillhop": {
    percussiveMelodic: 0.5,   // Melodic
    calmEnergetic: -0.6       // Very calm
  }
};

/**
 * Helper function to get two-axis values from preset name
 */
export function presetToTwoAxis(preset: string): TwoAxisStyle {
  const axis = PRESET_TO_TWO_AXIS[preset];
  if (!axis) {
    throw new Error(`Unknown preset: ${preset}`);
  }
  return { ...axis };
}
