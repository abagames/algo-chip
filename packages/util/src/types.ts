/**
 * Type definitions for the demo application.
 *
 * Re-exports core types from @algo-chip/core and defines demo-specific
 * types for sound effect playback, quantization, and timeline management.
 */

import type {
  Channel,
  Command,
  Event as PlaybackEvent,
  CompositionOptions,
  PipelineResult,
  SEGenerationOptions,
  SEGenerationResult,
  SEType,
  SynthPlayOptions,
} from "@algo-chip/core";

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
  SynthPlayOptions,
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
  /** Fallback BPM when no BGM timeline is active */
  fallbackTempo?: number;
  /** Optional start time reference when using fallbackTempo (defaults to 0) */
  referenceTime?: number;
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

/** Alias with camel-case naming for external consumers */
export type PlaySeOptions = PlaySEOptions;

/**
 * Default sound effect playback settings for the session.
 *
 * These defaults are applied when playSe() or triggerSe() are called
 * without explicit options.
 */
export interface SePlaybackDefaults {
  /** BGM volume reduction in dB during SE playback */
  duckingDb: number;
  /** SE playback volume multiplier */
  volume: number;
  /** Default quantization settings (if any) */
  quantize?: QuantizedSEOptions;
}

/**
 * Options for generating and playing a sound effect in one call.
 *
 * Combines SE generation options (type, seed, template) with playback
 * options (volume, ducking, quantization).
 */
export interface TriggerSeOptions
  extends Omit<SEGenerationOptions, "startTime">,
    PlaySEOptions {}

/**
 * Options for configuring an audio session.
 *
 * All options are optional. If not provided, the session will create
 * its own AudioContext and use default settings.
 */
export interface CreateSessionOptions {
  /** Existing AudioContext to use (if omitted, a new one will be created) */
  audioContext?: AudioContext;
  /** Existing GainNode to connect to (if omitted, connects to context destination) */
  gainNode?: GainNode;
  /** Base path for AudioWorklet modules (default: "./worklets/") */
  workletBasePath?: string;
  /** Default sound effect playback settings */
  seDefaults?: Partial<SePlaybackDefaults>;
  /** Initial background music volume (default: 1.0) */
  bgmVolume?: number;
}

/**
 * Options for playing background music.
 *
 * Extends synthesizer playback options with loop control.
 */
export type PlayBgmOptions = Partial<SynthPlayOptions> & {
  /** Whether to loop the composition (default: true) */
  loop?: boolean;
};

/** Options passed to pauseBgm */
export interface PauseBgmOptions {
  /** Whether to capture and store the current playback offset (default: true) */
  captureOffset?: boolean;
}

/** Options passed to resumeBgm */
export interface ResumeBgmOptions extends PlayBgmOptions {
  /** Explicit playback offset in seconds; defaults to captured pause offset */
  offsetSeconds?: number;
}

/**
 * Audio session for background music generation and sound effect playback.
 *
 * Provides a high-level interface for:
 * - Generating procedural chiptune compositions with two-axis style control
 * - Managing BGM playback with loop, pause/resume, and volume control
 * - Triggering sound effects with quantization and BGM ducking support
 * - Managing AudioContext lifecycle and resource cleanup
 *
 * @example Basic usage
 * ```typescript
 * const session = createAudioSession({ bgmVolume: 0.7 });
 *
 * // Generate and play BGM
 * const bgm = await session.generateBgm({
 *   twoAxisStyle: { percussiveMelodic: 0.5, calmEnergetic: 0.0 }
 * });
 * await session.playBgm(bgm, { loop: true });
 *
 * // Trigger sound effect
 * await session.triggerSe({
 *   type: "coin",
 *   quantize: { quantizeTo: "beat", phase: "next" }
 * });
 *
 * // Clean up
 * await session.close();
 * ```
 */
export interface AudioSession {
  /**
   * Generates a new background music composition.
   *
   * @param options - Composition generation options (style, length, seed).
   * @returns The generated composition result with events and metadata.
   */
  generateBgm(options: CompositionOptions): Promise<PipelineResult>;

  /**
   * Plays a background music composition.
   *
   * @param result - The composition result to play.
   * @param options - Playback options (loop, volume, offset, callbacks, etc.).
   */
  playBgm(result: PipelineResult, options?: PlayBgmOptions): Promise<void>;

  /**
   * Stops the currently playing background music and resets ducking.
   */
  stopBgm(): void;

  /**
   * Stops all audio playback (BGM and sound effects) and cancels scheduled SE.
   */
  stopAllAudio(): void;

  /**
   * Pauses background music playback.
   *
   * @param options - Pause options (whether to capture current offset).
   * @returns The offset in seconds where playback was paused, or null if not captured.
   */
  pauseBgm(options?: PauseBgmOptions): number | null;

  /**
   * Resumes previously paused background music.
   *
   * @param options - Resume options (can override offset).
   * @throws Error if no BGM is available to resume.
   */
  resumeBgm(options?: ResumeBgmOptions): Promise<void>;

  /**
   * Sets the background music volume.
   *
   * @param volume - Volume level (0.0 or higher, where 1.0 is normal).
   */
  setBgmVolume(volume: number): void;

  /**
   * Configures default settings for sound effect playback.
   *
   * @param defaults - Partial SE defaults to merge with current settings.
   */
  configureSeDefaults(defaults: Partial<SePlaybackDefaults>): void;

  /**
   * Generates a sound effect based on the provided options.
   *
   * @param options - SE generation options (type, seed, template, frequency).
   * @returns The generated sound effect result.
   */
  generateSe(options: SEGenerationOptions): SEGenerationResult;

  /**
   * Plays a generated sound effect.
   *
   * @param result - The SE generation result to play.
   * @param options - Playback options (volume, ducking, quantization).
   */
  playSe(result: SEGenerationResult, options?: PlaySEOptions): Promise<void>;

  /**
   * Generates and immediately plays a sound effect in one call.
   *
   * @param options - Combined generation and playback options.
   */
  triggerSe(options: TriggerSeOptions): Promise<void>;

  /**
   * Cancels all scheduled (quantized) sound effects that haven't started yet.
   */
  cancelScheduledSe(): void;

  /**
   * Gets the currently active BGM timeline, if any.
   *
   * @returns The active timeline or null if no BGM is playing.
   */
  getActiveTimeline(): ActiveTimeline | null;

  /**
   * Gets the underlying AudioContext instance.
   *
   * @returns The AudioContext or null if not yet created.
   */
  getAudioContext(): AudioContext | null;

  /**
   * Resumes the AudioContext if it is suspended.
   * Useful for responding to user gestures to enable audio playback.
   */
  resumeAudioContext(): void;

  /**
   * Suspends the AudioContext to save resources when audio is not needed.
   */
  suspendAudioContext(): void;

  /**
   * Closes the session and releases all resources.
   * If the AudioContext was created by this session, it will be closed.
   */
  close(): Promise<void>;
}
