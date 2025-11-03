/**
 * Texture profile resolution
 */

import type { TextureProfile } from "../../types.js";
import { randomFromSeed } from "./utilities.js";
import {
  TEMPLATE_TEXTURE_SEQUENCE,
  ARPEGGIO_KEEP_PROBABILITY,
  TEXTURE_VARIATION_PROBABILITY
} from "./constants.js";

const DEFAULT_TEXTURE: TextureProfile = "steady";

/**
 * Resolve texture profile for section based on template and occurrence
 */
export function resolveTexture(
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
