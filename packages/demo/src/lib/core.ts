/**
 * Core library wrapper for demo application.
 *
 * Provides simplified interfaces to @algo-chip/core functionality:
 * - Composition generation (BGM)
 * - Sound effect (SE) generation
 * - Singleton SE generator for consistent results
 */

import type {
  CompositionOptions,
  PipelineResult,
  SEGenerationOptions,
  SEGenerationResult
} from "@algo-chip/core";

import { generateComposition, SEGenerator } from "@algo-chip/core";

// ============================================================================
// SE Generator Singleton
// ============================================================================

/** Singleton SE generator instance (lazy-initialized) */
let seGeneratorInstance: SEGenerator | null = null;

/**
 * Ensures SE generator is initialized and returns the singleton instance.
 *
 * Uses lazy initialization to defer SE template loading until first use.
 *
 * @returns Singleton SE generator instance
 */
function ensureSEGenerator(): SEGenerator {
  if (!seGeneratorInstance) {
    seGeneratorInstance = new SEGenerator();
  }
  return seGeneratorInstance;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generates a chiptune composition timeline using the core pipeline.
 *
 * This is a thin wrapper around @algo-chip/core's generateComposition function,
 * provided for consistency with demo naming conventions.
 *
 * @param options Composition options (two-axis style, length, overrides)
 * @returns Complete composition result with events and metadata
 */
export async function generateTimeline(options: CompositionOptions): Promise<PipelineResult> {
  return await generateComposition(options);
}

/**
 * Generates a sound effect using the singleton SE generator.
 *
 * Uses a singleton generator instance to ensure consistent template loading
 * and avoid redundant initialization overhead.
 *
 * @param options SE generation options (type, templateId, seed, startTime)
 * @returns SE generation result with events and metadata
 */
export async function generateSoundEffect(options: SEGenerationOptions): Promise<SEGenerationResult> {
  const generator = ensureSEGenerator();
  return generator.generateSE(options);
}
