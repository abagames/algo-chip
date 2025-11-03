import { CompositionOptions, LegacyCompositionOptions, PipelineResult, ResolvedStyleProfile } from "./types.js";
import { planStructure } from "./phase/structure-planning.js";
import { selectMotifs } from "./phase/motif-selection.js";
import { realizeEvents } from "./phase/event-realization.js";
import { applyTechniques } from "./phase/techniques-postprocess.js";
import { finalizeTimeline } from "./phase/timeline-finalization.js";
import { resolveGenerationContext } from "./style/profile-resolver.js";

/**
 * Runs the five-phase composition pipeline to generate chiptune music.
 *
 * The pipeline is split into five distinct phases to achieve separation of concerns,
 * testability, reproducibility, and maintainability. Each phase focuses on one level
 * of abstraction, allowing independent testing and deterministic output given the same seed.
 * Musical logic is organized by its purpose rather than by physical channel assignment.
 *
 * The five phases transform abstract musical intent into concrete audio events:
 * - Phase 1 (Structure Planning): Defines the macro structure (BPM, key, sections, chords)
 * - Phase 2 (Motif Selection): Selects motifs for melody, bass, drums based on structure
 * - Phase 3 (Event Realization): Maps abstract tracks to physical channels
 * - Phase 4 (Techniques Postprocess): Adds timbral decoration (duty sweeps, effects)
 * - Phase 5 (Timeline Finalization): Converts to time-sorted event list for playback
 *
 * @param options Composition options with two-axis style coordinates or overrides
 * @returns Complete composition result with events, diagnostics, and metadata
 */
export function runPipeline(options: CompositionOptions): PipelineResult {
  // Convert modern TwoAxisStyle API to legacy format for backward compatibility.
  // This allows the pipeline to use simpler mood/tempo/seed parameters internally
  // while exposing the more intuitive two-axis coordinate system externally.
  const { legacy, profile, replayOptions } = resolveOptions(options);

  // Phase execution is strictly sequential because each phase depends on the previous.
  // Phase 1 must determine BPM before Phase 2 can select tempo-appropriate motifs.
  const structurePlan = planStructure(legacy);

  // Motif selection happens after structure planning so tag-based filtering
  // can use the resolved mood, tempo, and section templates.
  const motifSelection = selectMotifs(legacy, structurePlan);

  // Event realization maps abstract musical roles to physical channels.
  // This separation allows the same melody to be rendered on different channels
  // based on the Voice Arrangement preset (standard, swapped, dualBass, etc.).
  const eventRealization = realizeEvents(legacy, structurePlan, motifSelection);

  // Techniques are applied after basic notes are generated so they can
  // scan the complete note timeline and make context-aware decisions
  // (e.g., duty sweeps only on sustained notes, gain automation across sections).
  const techniquesApplied = applyTechniques(eventRealization, structurePlan.styleIntent);

  // Timeline finalization is the last step because it converts beat-time to
  // absolute seconds, which requires knowing the final BPM and validating loop integrity.
  const finalTimeline = finalizeTimeline(
    structurePlan,
    techniquesApplied.events,
    eventRealization.diagnostics,
    motifSelection.motifUsage,
    motifSelection.sectionMotifPlan
  );

  // Loop info is calculated here (not in Phase 5) because it's metadata about
  // the composition as a whole, not part of the event timeline itself.
  const BEATS_PER_MEASURE = 4;
  const totalBeats = legacy.lengthInMeasures * BEATS_PER_MEASURE;
  const totalDuration = (totalBeats / structurePlan.bpm) * 60;

  return {
    events: finalTimeline.events,
    diagnostics: finalTimeline.diagnostics,
    meta: {
      bpm: structurePlan.bpm,
      key: structurePlan.key,
      seed: legacy.seed,
      mood: legacy.mood,
      tempo: legacy.tempo,
      lengthInMeasures: legacy.lengthInMeasures,
      styleIntent: structurePlan.styleIntent,
      voiceArrangement: structurePlan.voiceArrangement,
      profile,
      replayOptions,
      loopInfo: {
        loopStartBeat: 0,
        loopEndBeat: totalBeats,
        loopStartTime: 0,
        loopEndTime: totalDuration,
        totalBeats,
        totalDuration
      }
    }
  };
}

/**
 * Main API entry point for composition generation.
 *
 * This async wrapper exists for future extensibility, allowing pre/post-processing
 * steps to be added without breaking the API. It enables future parallel motif loading
 * or analysis tasks and maintains consistency with Web Audio APIs which are inherently
 * async. Currently synchronous, but the Promise return type prepares for future async operations.
 *
 * @param options Composition options with two-axis style coordinates or overrides
 * @returns Promise resolving to complete composition result
 */
export async function generateComposition(options: CompositionOptions): Promise<PipelineResult> {
  return runPipeline(options);
}

/**
 * Resolves modern CompositionOptions to legacy format.
 *
 * The system evolved from a simple mood/tempo/seed API to a two-axis coordinate system.
 * Rather than rewrite the entire pipeline, we convert the modern API to the legacy format
 * at the entry point. This provides a clean external API (two-axis coordinates are more
 * intuitive than mood strings), stable internal implementation (pipeline code doesn't need
 * to change), and a gradual migration path (both APIs can coexist during refactoring).
 *
 * @param options Modern composition options
 * @returns Legacy options, resolved profile, and replay options for result metadata
 */
function resolveOptions(options: CompositionOptions): {
  legacy: LegacyCompositionOptions;
  profile: ResolvedStyleProfile;
  replayOptions: CompositionOptions;
} {
  return resolveGenerationContext(options);
}
