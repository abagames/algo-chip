/**
 * Sound Effect (SE) playback controller with ducking and quantization.
 *
 * This module provides advanced SE playback features for integrating sound effects
 * with background music (BGM) playback:
 * - BGM ducking: Automatically reduces BGM volume when SE plays
 * - Quantization: Aligns SE playback to musical beats/measures
 * - Queue management: Handles concurrent SE requests with ignore/cut/queue policies
 * - Cooldown intervals: Prevents rapid-fire SE spam
 *
 * The controller works in tandem with ChipSynthesizer to provide seamless
 * audio mixing between BGM and SE tracks.
 */

import { ChipSynthesizer } from "./synth.js";
import type {
  ActiveTimeline,
  PlaySEOptions,
  QuantizedSEOptions,
  SEGenerationResult
} from "./types.js";

// ============================================================================
// Internal Types
// ============================================================================

/** Normalized SE options with required defaults */
interface NormalizedSEOptions extends Required<Pick<PlaySEOptions, "duckingDb" | "mixOffset" | "minIntervalMs" | "overrideExisting" | "volume">> {
  quantize?: QuantizedSEOptions;
}

/** Queued SE playback job with promise callbacks */
interface QueueItem {
  result: SEGenerationResult;
  options: NormalizedSEOptions;
  resolve: () => void;
  reject: (error: unknown) => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Default BGM volume reduction in dB during SE playback */
const DEFAULT_DUCKING_DB = -6;
/** Default SE start offset from current time in seconds */
const DEFAULT_MIX_OFFSET = 0.05;
/** Default minimum interval between SE triggers in milliseconds */
const DEFAULT_MIN_INTERVAL_MS = 40;

// ============================================================================
// Sound Effect Controller
// ============================================================================

/**
 * Controller for managing sound effect playback with BGM integration.
 *
 * Features:
 * - Automatic BGM ducking with configurable dB reduction
 * - Musical quantization (beat/measure/subdivision alignment)
 * - Queue/override/ignore policies for concurrent SE requests
 * - Cooldown intervals to prevent SE spam
 * - Loop-aware quantization for seamless looping BGM
 *
 * Usage:
 * ```typescript
 * const controller = new SoundEffectController(
 *   audioContext,
 *   seSynth,
 *   () => activeTimeline,
 *   bgmGainNode
 * );
 * await controller.play(seResult, {
 *   duckingDb: -8,
 *   quantize: { quantizeTo: "beat", phase: "next" }
 * });
 * ```
 */
export class SoundEffectController {
  private readonly queue: QueueItem[] = [];
  private processing = false;
  private currentPlay: Promise<void> | null = null;
  private lastStartTime = 0;
  private readonly nominalGain: number;

  constructor(
    private readonly context: AudioContext,
    private readonly seSynth: ChipSynthesizer,
    private readonly getTimeline: () => ActiveTimeline | null,
    private readonly bgmGain: GainNode
  ) {
    this.nominalGain = bgmGain.gain.value;
  }

  /**
   * Plays a sound effect with optional ducking, quantization, and queuing.
   *
   * @param result SE generation result from SEGenerator
   * @param options Playback options (ducking, quantization, override policy)
   * @returns Promise that resolves when SE playback completes
   */
  async play(result: SEGenerationResult, options: PlaySEOptions = {}): Promise<void> {
    const normalized: NormalizedSEOptions = {
      duckingDb: options.duckingDb ?? DEFAULT_DUCKING_DB,
      mixOffset: options.mixOffset ?? DEFAULT_MIX_OFFSET,
      minIntervalMs: options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
      overrideExisting: options.overrideExisting ?? "ignore",
      volume: options.volume ?? 1.0,
      quantize: options.quantize
    };

    if (this.currentPlay || this.processing || this.queue.length > 0) {
      if (normalized.overrideExisting === "ignore") {
        return;
      }
      if (normalized.overrideExisting === "cut") {
        await this.stopCurrent();
        this.queue.length = 0;
      }
      // queue option falls through
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({ result, options: normalized, resolve, reject });
      void this.processQueue();
    });
  }

  /**
   * Resets BGM gain to nominal level, canceling any active ducking.
   *
   * Useful for stopping ducking when BGM stops or context changes.
   */
  resetDucking(): void {
    const now = this.context.currentTime;
    const gainParam = this.bgmGain.gain;
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(this.nominalGain, now);
  }

  /** Processes the SE queue, respecting override policies and timing constraints */
  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift()!;

        if (this.currentPlay) {
          if (job.options.overrideExisting === "cut") {
            await this.stopCurrent();
          } else if (job.options.overrideExisting === "queue") {
            await this.currentPlay.catch(() => {});
            this.currentPlay = null;
          } else {
            job.resolve();
            continue;
          }
        }

        const startTime = this.computeStartTime(job.result, job.options);
        this.applyDucking(job.options.duckingDb, job.result.meta.duration, startTime);

        this.currentPlay = this.seSynth.play(job.result.events, {
          startTime,
          loop: false,
          volume: job.options.volume
        });
        this.lastStartTime = startTime;
        try {
          await this.currentPlay;
          job.resolve();
        } catch (error) {
          job.reject(error);
        } finally {
          this.currentPlay = null;
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /** Stops the currently playing SE and resets ducking */
  private async stopCurrent(): Promise<void> {
    if (this.currentPlay) {
      this.seSynth.stop();
      const now = this.context.currentTime;
      try {
        await this.currentPlay;
      } catch {
        // Ignored: stop may reject existing playback promise
      } finally {
        this.currentPlay = null;
        if (this.lastStartTime > now) {
          this.lastStartTime = now;
        }
        this.resetDucking();
      }
    }
  }

  /**
   * Computes the final start time for SE playback.
   *
   * Applies cooldown interval, quantization, and mix offset to determine
   * when the SE should actually start playing.
   *
   * @param result SE generation result
   * @param options Normalized playback options
   * @returns Absolute start time in seconds
   */
  private computeStartTime(result: SEGenerationResult, options: NormalizedSEOptions): number {
    const ctx = this.context;
    const minIntervalSec = options.minIntervalMs / 1000;
    const earliestByInterval = this.lastStartTime + minIntervalSec;
    let earliest = Math.max(ctx.currentTime + options.mixOffset, earliestByInterval);

    if (options.quantize) {
      const quantized = this.quantizeStart(options.quantize, earliest);
      if (quantized !== null) {
        earliest = Math.max(earliest, quantized);
      }
    }

    // If quantization produced a time still within the cooldown, bump by multiples
    if (earliest < earliestByInterval) {
      const diff = earliestByInterval - earliest;
      earliest += diff;
    }

    // Account for the SE's intrinsic duration to keep ducking tail meaningful
    if (!Number.isFinite(earliest) || earliest < ctx.currentTime) {
      earliest = ctx.currentTime + options.mixOffset;
    }

    return earliest;
  }

  /**
   * Quantizes SE start time to musical grid (beat/measure/subdivision).
   *
   * Aligns SE playback with the BGM timeline based on quantization settings.
   * Supports loop-aware quantization for seamless looping compositions.
   *
   * @param options Quantization settings
   * @param earliest Earliest allowed start time
   * @returns Quantized start time or null if no timeline available
   */
  private quantizeStart(options: QuantizedSEOptions, earliest: number): number | null {
    const timeline = this.getTimeline();
    if (!timeline) {
      return null;
    }

    const { meta, startTime } = timeline;
    const beatDuration = 60 / meta.bpm;
    const beatsPerMeasure = 4; // score.md assumes 4/4 backing
    const loopBeats = meta.loopInfo.totalBeats;

    const stepBeats = this.resolveStepBeats(options.quantizeTo, beatsPerMeasure);
    if (stepBeats <= 0) {
      return null;
    }

    const earliestBeat = Math.max(0, (earliest - startTime) / beatDuration);
    let targetBeat = this.resolvePhaseBeat(options.phase ?? "next", earliestBeat, stepBeats, beatsPerMeasure);
    targetBeat += options.offsetBeats ?? 0;

    if (options.loopAware && loopBeats > 0) {
      while (targetBeat * beatDuration + startTime < earliest - 1e-3) {
        targetBeat += stepBeats;
      }
      const loopDurationBeats = loopBeats;
      if (targetBeat >= loopDurationBeats) {
        targetBeat = targetBeat % loopDurationBeats;
        // Ensure we schedule into the future
        const loopsAhead = Math.ceil((earliestBeat - targetBeat) / loopDurationBeats);
        targetBeat += loopsAhead * loopDurationBeats;
      }
    } else {
      const stepDuration = stepBeats * beatDuration;
      let candidate = startTime + targetBeat * beatDuration;
      while (candidate < earliest - 1e-3) {
        candidate += stepDuration;
        targetBeat += stepBeats;
      }
      return candidate;
    }

    return startTime + targetBeat * beatDuration;
  }

  /**
   * Resolves quantization step size in beats.
   *
   * @param quantizeTo Quantization target (beat/half/measure/subdivision)
   * @param beatsPerMeasure Number of beats per measure (typically 4)
   * @returns Step size in beats
   */
  private resolveStepBeats(
    quantizeTo: QuantizedSEOptions["quantizeTo"],
    beatsPerMeasure: number
  ): number {
    if (quantizeTo === "beat") {
      return 1;
    }
    if (quantizeTo === "half") {
      return 0.5;
    }
    if (quantizeTo === "measure") {
      return beatsPerMeasure;
    }
    if (typeof quantizeTo === "object" && quantizeTo.subdivision > 0) {
      return 1 / quantizeTo.subdivision;
    }
    return 0;
  }

  /**
   * Resolves target beat position based on phase setting.
   *
   * @param phase Phase specification (current/next/absolute)
   * @param currentBeat Current beat position
   * @param stepBeats Step size in beats
   * @param beatsPerMeasure Beats per measure
   * @returns Target beat position
   */
  private resolvePhaseBeat(
    phase: QuantizedSEOptions["phase"],
    currentBeat: number,
    stepBeats: number,
    beatsPerMeasure: number
  ): number {
    if (phase === "current") {
      const candidate = Math.floor(currentBeat / stepBeats) * stepBeats;
      if (candidate + 1e-6 < currentBeat) {
        return candidate + stepBeats;
      }
      return candidate;
    }
    if (phase === "next" || phase == null) {
      return Math.ceil((currentBeat - 1e-6) / stepBeats) * stepBeats;
    }
    const measure = Math.max(0, phase.measure);
    const beat = Math.max(0, phase.beat ?? 0);
    return measure * beatsPerMeasure + beat;
  }

  /**
   * Applies BGM ducking automation with attack/sustain/release envelope.
   *
   * Reduces BGM gain before SE starts, sustains during SE playback,
   * then gradually restores original gain level.
   *
   * @param duckingDb Volume reduction in dB (negative value)
   * @param durationSeconds SE duration in seconds
   * @param startTime SE start time in seconds
   */
  private applyDucking(duckingDb: number, durationSeconds: number, startTime: number): void {
    if (!Number.isFinite(duckingDb) || duckingDb >= 0) {
      return;
    }
    const gainNode = this.bgmGain;
    const now = this.context.currentTime;
    const linear = Math.pow(10, duckingDb / 20);
    const minimumGain = Math.max(0, this.nominalGain * linear);
    const attackStart = Math.max(now, startTime - 0.005);
    const attackEnd = attackStart + 0.02;
    const sustainEnd = Math.max(attackEnd, startTime + durationSeconds);
    const releaseEnd = sustainEnd + Math.max(0.05, durationSeconds * 0.5);

    const gainParam = gainNode.gain;
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(this.nominalGain, now);
    gainParam.setValueAtTime(this.nominalGain, attackStart);
    gainParam.linearRampToValueAtTime(minimumGain, attackEnd);
    gainParam.linearRampToValueAtTime(this.nominalGain, releaseEnd);
  }
}
