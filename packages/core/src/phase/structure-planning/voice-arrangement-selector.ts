/**
 * Voice Arrangement Selection
 *
 * This module selects a Voice Arrangement preset using weighted random selection
 * based on style preferences. Voice Arrangements define how abstract musical roles
 * (melody, bass, accompaniment, pad) are mapped to physical channels (square1,
 * square2, triangle, noise).
 *
 * ## Why Weighted Selection?
 *
 * Different Voice Arrangements suit different musical styles:
 * - **standard**: Classic chiptune sound (melody on square1, bass on triangle) - works everywhere
 * - **minimal**: Sparse techno (bass on square1, pad on triangle) - only for minimal styles
 * - **breakLayered**: Dense jungle/drum & bass (dual bass) - requires high energy
 *
 * Weighted selection ensures:
 * - **Style coherence**: minimalTechno heavily favors "minimal" arrangement (weight: 5)
 *   while avoiding "standard" (weight: 2)
 * - **Variety within style**: Multiple valid arrangements per style prevent monotony
 * - **Fallback to standard**: When no style preset is specified, "standard" gets
 *   highest default weight (5) as the safest choice
 *
 * ## Weighted Random Algorithm
 *
 * Uses cumulative distribution function (CDF) for weighted selection:
 * 1. Calculate total weight: sum of all arrangement weights
 * 2. Generate random value in [0, 1) range
 * 3. Iterate through arrangements, accumulating normalized weights
 * 4. Return first arrangement where cumulative weight exceeds random value
 *
 * Example with weights {standard: 5, swapped: 4, minimal: 1}:
 * - Total weight = 10
 * - standard selected if rand < 0.5 (50% probability)
 * - swapped selected if 0.5 <= rand < 0.9 (40% probability)
 * - minimal selected if 0.9 <= rand < 1.0 (10% probability)
 *
 * ## Style-Specific Weight Overrides
 *
 * ARRANGEMENT_WEIGHTS_BY_STYLE provides style-specific overrides:
 * - minimalTechno: {minimal: 5, bassLed: 3, standard: 2} - avoids dense arrangements
 * - breakbeatJungle: {breakLayered: 5, dualBass: 3} - avoids minimal arrangements
 * - lofiChillhop: {lofiPadLead: 5, minimal: 3} - avoids aggressive arrangements
 *
 * These weights were tuned empirically based on which arrangements produce the
 * most aesthetically coherent results for each style.
 *
 * ## Seed Determinism
 *
 * The seed parameter ensures reproducibility:
 * - Same seed + same style → same arrangement every time
 * - Different seeds + same style → different arrangements with weighted probabilities
 * - randomFromSeed(seed, 100) uses salt=100 to avoid collision with other RNG calls
 */

import type { StylePreset, VoiceArrangement, VoiceArrangementPreset } from "../../types.js";
import { randomFromSeed } from "./utilities.js";
import {
  VOICE_ARRANGEMENTS,
  DEFAULT_ARRANGEMENT_WEIGHTS,
  ARRANGEMENT_WEIGHTS_BY_STYLE
} from "./voice-arrangements.js";

/**
 * Selects a Voice Arrangement using weighted random selection.
 *
 * If stylePreset is provided, merges style-specific weights with defaults.
 * Otherwise, uses DEFAULT_ARRANGEMENT_WEIGHTS (favoring "standard").
 *
 * The selection is deterministic (seed-driven) and uses cumulative probability
 * distribution to ensure weights are respected across many generations.
 *
 * @param seed - Random seed for deterministic selection (undefined = non-deterministic)
 * @param stylePreset - Style preset for weight overrides (undefined = use defaults)
 * @returns Selected Voice Arrangement definition with role-to-channel mappings
 */
export function selectVoiceArrangement(
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
