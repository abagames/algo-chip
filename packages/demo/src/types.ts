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
  SEType,
  SynthPlayOptions
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
  /** Quantization grid: beat (quarter note), half_beat (eighth note), measure, or custom subdivision */
  quantizeTo: "beat" | "half_beat" | "measure" | { subdivision: number };
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

/** Default SE playback settings for the session */
export interface SePlaybackDefaults {
  duckingDb: number;
  volume: number;
  quantize?: QuantizedSEOptions;
}

/** Options for triggering a sound effect through the session */
export interface TriggerSeOptions extends Omit<SEGenerationOptions, "startTime"> {
  quantize?: QuantizedSEOptions;
  duckingDb?: number;
  volume?: number;
}

/** Options for configuring the demo audio session */
export interface CreateSessionOptions {
  audioContext?: AudioContext;
  workletBasePath?: string;
  seDefaults?: Partial<SePlaybackDefaults>;
  bgmVolume?: number;
}

/** Playback options accepted by AudioSession.playBgm */
export type PlayBgmOptions = Partial<SynthPlayOptions>;

/** Public API surface for the demo audio session */
export interface AudioSession {
  generateBgm(options: CompositionOptions): Promise<PipelineResult>;
  playBgm(result: PipelineResult, options?: PlayBgmOptions): Promise<void>;
  stopBgm(): void;
  setBgmVolume(volume: number): void;
  configureSeDefaults(defaults: Partial<SePlaybackDefaults>): void;
  triggerSe(options: TriggerSeOptions): Promise<void>;
  cancelScheduledSe(): void;
  getActiveTimeline(): ActiveTimeline | null;
  getAudioContext(): AudioContext | null;
  resumeAudioContext(): Promise<void>;
  suspendAudioContext(): Promise<void>;
  close(): Promise<void>;
}
