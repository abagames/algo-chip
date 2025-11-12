/**
 * Sound Effect (SE) playback controller with ducking and quantization.
 *
 * This module provides advanced SE playback features for integrating sound effects
 * with background music (BGM) playback:
 * - BGM ducking: Automatically reduces BGM volume when SE plays
 * - Quantization: Aligns SE playback to musical beats/measures
 * - Per-type gating: Prevents duplicate SEs of the same type within a quantized window
 *
 * The controller works in tandem with AlgoChipSynthesizer to provide seamless
 * audio mixing between BGM and SE tracks.
 */

import { AlgoChipSynthesizer } from "@algo-chip/core";
import type {
  ActiveTimeline,
  PlaySEOptions,
  QuantizedSEOptions,
  SEGenerationResult,
  SEType,
  PlaybackEvent
} from "./types.js";

type ChipSynthesizer = AlgoChipSynthesizer;

// ============================================================================
// Internal Types
// ============================================================================

/** Normalized SE options with required defaults */
interface NormalizedSEOptions extends Required<Pick<PlaySEOptions, "duckingDb" | "volume">> {
  quantize?: QuantizedSEOptions;
}

/** Pending SE job grouped by type */
interface ScheduledJob {
  result: SEGenerationResult;
  options: NormalizedSEOptions;
  targetTime: number;
  resolve: () => void;
  reject: (error: unknown) => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Default BGM volume reduction in dB during SE playback */
const DEFAULT_DUCKING_DB = -6;
/** Default SE playback volume multiplier */
const DEFAULT_VOLUME = 1.0;
/** Lead time (seconds) to schedule SE playback before quantized boundary */
const SCHEDULE_LEAD_SECONDS = 0.03;
/** Floating point tolerance for comparing quantized times */
const TIME_EPSILON = 1e-3;

// ============================================================================
// Sound Effect Controller
// ============================================================================

/**
 * Controller for managing sound effect playback with BGM integration.
 *
 * Features:
 * - Automatic BGM ducking with configurable dB reduction
 * - Musical quantization (beat/measure/subdivision alignment)
 * - Per-type gating to prevent duplicate SE triggers within a window
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
  private scheduledByType: Partial<Record<SEType, ScheduledJob>> = {};
  private nextTriggerTime: number | null = null;
  private flushHandle: number | null = null;

  constructor(
    private readonly context: AudioContext,
    private readonly seSynth: ChipSynthesizer,
    private readonly getTimeline: () => ActiveTimeline | null,
    private readonly bgmGain: GainNode,
    private readonly getBgmBaseVolume: () => number
  ) {}

  /**
   * Plays a sound effect with optional ducking and quantization.
   *
   * The request is stored until the next quantized boundary, at which
   * point all distinct SE types are triggered simultaneously.
   *
   * @param result SE generation result from SEGenerator
   * @param options Playback options (ducking, quantization)
   * @returns Promise that resolves when SE playback completes
   */
  async play(result: SEGenerationResult, options: PlaySEOptions = {}): Promise<void> {
    const normalized: NormalizedSEOptions = {
      duckingDb: options.duckingDb ?? DEFAULT_DUCKING_DB,
      volume: options.volume ?? DEFAULT_VOLUME,
      quantize: options.quantize
    };

    const seType = result.meta.type;
    if (this.scheduledByType[seType]) {
      // Skip scheduling when the same SE type is already pending
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const targetTime = this.determineTargetTime(normalized);
      const job: ScheduledJob = { result, options: normalized, targetTime, resolve, reject };
      this.scheduledByType[seType] = job;
      this.registerJob(job);
    });
  }

  /**
   * Resets BGM gain to base level, canceling any active ducking automation.
   *
   * Useful for stopping ducking when BGM stops or context changes.
   */
  resetDucking(): void {
    const now = this.context.currentTime;
    const gainParam = this.bgmGain.gain;
    const baseGain = this.getBgmBaseVolume();
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(baseGain, now);
  }

  /**
   * Cancels any pending quantized SE jobs and clears scheduled flush timers.
   *
   * Ensures no background SE playback occurs when the transport is stopped
   * or the page becomes inactive. Pending promises resolve immediately.
   */
  cancelPendingJobs(): void {
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle);
      this.flushHandle = null;
    }

    const jobs = Object.values(this.scheduledByType).filter(
      (job): job is ScheduledJob => job != null
    );
    for (const job of jobs) {
      job.resolve();
    }

    this.scheduledByType = {};
    this.nextTriggerTime = null;
  }

  /** Registers job for the next quantized trigger. */
  private registerJob(job: ScheduledJob): void {
    if (this.nextTriggerTime === null || job.targetTime < this.nextTriggerTime - TIME_EPSILON) {
      this.nextTriggerTime = job.targetTime;
      this.alignJobsTo(this.nextTriggerTime);
      this.scheduleFlush();
      return;
    }

    if (Math.abs(job.targetTime - this.nextTriggerTime) <= TIME_EPSILON) {
      job.targetTime = this.nextTriggerTime;
      return;
    }

    // Later quantization requests reuse existing trigger to keep map cleared per cycle
    job.targetTime = this.nextTriggerTime;
  }

  /** Aligns all pending jobs to a shared trigger time. */
  private alignJobsTo(triggerTime: number): void {
    for (const job of Object.values(this.scheduledByType)) {
      if (job) {
        job.targetTime = triggerTime;
      }
    }
  }

  /** Determines the next quantized start time for a job. */
  private determineTargetTime(options: NormalizedSEOptions): number {
    const ctx = this.context;
    const earliest = ctx.currentTime;
    let target = earliest;
    if (options.quantize) {
      const quantized = this.quantizeStart(options.quantize, earliest);
      if (quantized !== null) {
        target = quantized;
      }
    }
    if (target < ctx.currentTime + TIME_EPSILON) {
      target = ctx.currentTime + TIME_EPSILON;
    }
    return target;
  }

  /** Schedules flush to occur slightly before the quantized trigger. */
  private scheduleFlush(): void {
    if (this.nextTriggerTime === null) {
      return;
    }

    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle);
    }

    const now = this.context.currentTime;
    const callTime = this.nextTriggerTime - SCHEDULE_LEAD_SECONDS;
    const delayMs = Math.max(0, (callTime - now) * 1000);
    this.flushHandle = window.setTimeout(() => {
      this.flushHandle = null;
      this.flushScheduled();
    }, delayMs);
  }

  /** Plays all pending SEs at the quantized boundary and clears the cache. */
  private flushScheduled(): void {
    const triggerTime = this.nextTriggerTime;
    if (triggerTime === null) {
      return;
    }

    const jobs = Object.values(this.scheduledByType).filter((job): job is ScheduledJob => job != null);
    if (jobs.length === 0) {
      this.nextTriggerTime = null;
      return;
    }

    const ctx = this.context;
    const startTime = Math.max(triggerTime, ctx.currentTime + 0.005);
    const maxDuration = jobs.reduce((acc, job) => Math.max(acc, job.result.meta.duration), 0);
    const minDucking = jobs.reduce((acc, job) => Math.min(acc, job.options.duckingDb), DEFAULT_DUCKING_DB);
    const batchVolume = this.resolveBatchVolume(jobs);
    const mergedEvents = this.mergeScheduledEvents(jobs, batchVolume);

    this.applyDucking(minDucking, maxDuration, startTime);

    this.nextTriggerTime = null;
    this.scheduledByType = {};

    if (mergedEvents.length === 0) {
      jobs.forEach((job) => job.resolve());
      return;
    }

    const playbackPromise = this.seSynth.play(mergedEvents, {
      startTime,
      volume: batchVolume
    });

    void playbackPromise.then(
      () => {
        jobs.forEach((job) => job.resolve());
      },
      (error) => {
        jobs.forEach((job) => job.reject(error));
      }
    );
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
    
    let bpm: number;
    let startTime: number;
    let loopBeats: number;
    
    if (timeline) {
      // BGM is active: use timeline metadata
      bpm = timeline.meta.bpm;
      startTime = timeline.startTime;
      loopBeats = timeline.meta.loopInfo.totalBeats;
    } else if (options.fallbackTempo !== undefined && options.fallbackTempo > 0) {
      // No BGM but fallbackTempo specified: use it
      bpm = options.fallbackTempo;
      startTime = options.referenceTime ?? 0;
      loopBeats = 0; // No loop info when using fallback
    } else {
      // No BGM and no fallbackTempo: cannot quantize
      return null;
    }

    const beatDuration = 60 / bpm;
    const beatsPerMeasure = 4; // score.md assumes 4/4 backing

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
    if (quantizeTo === "half_beat") {
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
    // Use base BGM volume to prevent ducking accumulation when multiple SEs overlap
    const baseGain = this.getBgmBaseVolume();
    const linear = Math.pow(10, duckingDb / 20);
    const minimumGain = Math.max(0, baseGain * linear);
    const attackStart = Math.max(now, startTime - 0.005);
    const attackEnd = attackStart + 0.02;
    const sustainEnd = Math.max(attackEnd, startTime + durationSeconds);
    const releaseEnd = sustainEnd + Math.max(0.05, durationSeconds * 0.5);

    const gainParam = gainNode.gain;
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(gainParam.value, now);
    gainParam.setValueAtTime(gainParam.value, attackStart);
    gainParam.linearRampToValueAtTime(minimumGain, attackEnd);
    gainParam.linearRampToValueAtTime(baseGain, releaseEnd);
  }

  /** Determines the loudest requested volume for the batch. */
  private resolveBatchVolume(jobs: ScheduledJob[]): number {
    return jobs.reduce((acc, job) => Math.max(acc, job.options.volume), 0);
  }

  /**
   * Merges scheduled SE event lists into a single chronologically ordered array.
   * Scales individual job velocities so their relative volumes remain intact even
   * though the batch shares a single synth invocation.
   */
  private mergeScheduledEvents(jobs: ScheduledJob[], batchVolume: number): PlaybackEvent[] {
    const merged: PlaybackEvent[] = [];
    for (const job of jobs) {
      const ratio = this.resolveVolumeRatio(job.options.volume, batchVolume);
      for (const event of job.result.events) {
        merged.push(this.scaleEventForVolume(event, ratio));
      }
    }
    merged.sort((a, b) => a.time - b.time);
    return merged;
  }

  /** Returns the per-job gain ratio relative to the batch master volume. */
  private resolveVolumeRatio(jobVolume: number, batchVolume: number): number {
    if (batchVolume <= 0) {
      return 0;
    }
    const ratio = jobVolume / batchVolume;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return 0;
    }
    return Math.min(1, ratio);
  }

  /** Applies volume ratio to noteOn velocities while cloning the event object. */
  private scaleEventForVolume(event: PlaybackEvent, ratio: number): PlaybackEvent {
    const cloned: PlaybackEvent = {
      ...event,
      data: { ...event.data }
    };

    if (event.command === "noteOn" && typeof event.data.velocity === "number") {
      const scaled = event.data.velocity * ratio;
      cloned.data.velocity = Math.max(0, Math.min(127, scaled));
    }

    return cloned;
  }
}
