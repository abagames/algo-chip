/**
 * Technique strategy derivation and application
 */

import type { PipelineCompositionOptions, StyleIntent, TechniqueStrategy } from "../../types.js";
import { randomFromSeed } from "./utilities.js";

/**
 * Derive technique strategy from mood and style intent
 */
export function deriveTechniqueStrategy(
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

/**
 * Add random jitter to technique probabilities
 */
function jitterTechnique(base: TechniqueStrategy, seed: number | undefined, salt: number): TechniqueStrategy {
  const clamp = (value: number) => Math.min(0.95, Math.max(0.05, value));
  const jitter = (offsetSalt: number) => (randomFromSeed(seed, salt + offsetSalt) - 0.5) * 0.2;
  return {
    echoProbability: clamp(base.echoProbability + jitter(1)),
    detuneProbability: clamp(base.detuneProbability + jitter(2)),
    fastArpeggioProbability: clamp(base.fastArpeggioProbability + jitter(3))
  };
}

/**
 * Apply style intent to technique strategy
 */
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
