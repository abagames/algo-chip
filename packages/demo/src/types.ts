/**
 * Type definitions for the demo application.
 *
 * Re-exports core types from @algo-chip/core and defines demo-specific
 * types for sound effect playback, quantization, and timeline management.
 */

// ============================================================================
// Re-exported Core Types
// ============================================================================

export type {
  Channel,
  Command,
  Event as PlaybackEvent,
  CompositionOptions,
  PipelineResult,
  SEGenerationOptions,
  SEGenerationResult,
  SEType
} from "@algo-chip/core";

// ============================================================================
// Demo-Specific Types
// ============================================================================

/**
 * Active BGM timeline metadata.
 *
 * Tracks the currently playing background music timeline for SE quantization
 * and synchronization purposes.
 */
export interface ActiveTimeline {
  startTime: number;
  loop: boolean;
  meta: any; // Use PipelineResult['meta'] if needed
}

/**
 * SE playback quantization options.
 *
 * Configures how sound effects are aligned to the musical grid (beats/measures).
 * Supports loop-aware quantization for seamless looping compositions.
 */
export interface QuantizedSEOptions {
  /** Quantization grid: beat (quarter note), half (eighth note), measure, or custom subdivision */
  quantizeTo: "beat" | "half" | "measure" | { subdivision: number };
  /** Phase alignment: "next" = next grid point, "current" = current grid point, or absolute position */
  phase?: "next" | "current" | { measure: number; beat?: number };
  /** Additional beat offset after quantization */
  offsetBeats?: number;
  /** Whether to respect loop boundaries when quantizing */
  loopAware?: boolean;
}

/**
 * SE playback options.
 *
 * Controls BGM ducking, timing, and quantization for demo sound effects.
 */
export interface PlaySEOptions {
  /** BGM volume reduction in dB during SE playback (default: -6) */
  duckingDb?: number;
  /** Musical quantization settings */
  quantize?: QuantizedSEOptions;
  /** SE playback volume multiplier (default: 1.0, range: 0.0+) */
  volume?: number;
}
