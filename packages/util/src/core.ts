/**
 * Demo audio session API.
 *
 * Provides a high-level interface for generating compositions, managing BGM playback,
 * and triggering sound effects with quantization and ducking support.
 */

import {
  generateComposition,
  SEGenerator,
  AlgoChipSynthesizer,
} from "@algo-chip/core";

import type {
  ActiveTimeline,
  CompositionOptions,
  CreateSessionOptions,
  AudioSession,
  PlayBgmOptions,
  PlaySEOptions,
  PauseBgmOptions,
  ResumeBgmOptions,
  SePlaybackDefaults,
  TriggerSeOptions,
  PipelineResult,
  SynthPlayOptions,
  SEGenerationOptions,
  SEGenerationResult,
} from "./types.js";

import { SoundEffectController } from "./playback.js";

// Default configuration values

/** Default sound effect playback settings. */
const DEFAULT_SE_DEFAULTS: SePlaybackDefaults = {
  duckingDb: -6,
  volume: 1.0,
};

/** Default base path for AudioWorklet modules. */
const DEFAULT_WORKLET_BASE_PATH = "./worklets/";

/** Default sample rate for AudioContext (44.1 kHz). */
const DEFAULT_SAMPLE_RATE = 44_100;

/** Default lead time before audio starts (seconds). */
const DEFAULT_LEAD_TIME = 0.2;

/** Default lookahead window for scheduling (seconds). */
const DEFAULT_LOOKAHEAD = 0.1;

/**
 * Internal implementation of the AudioSession interface.
 *
 * Manages AudioContext lifecycle, BGM and SE synthesizers, playback state,
 * and provides high-level methods for composition generation, BGM control,
 * and sound effect triggering with quantization and ducking support.
 *
 * @internal
 */
class AudioSessionImpl implements AudioSession {
  private context: AudioContext | null;
  private readonly ownsContext: boolean;
  private readonly workletBasePath: string;
  private readonly gainNode: GainNode | null;

  private bgmSynth: AlgoChipSynthesizer | null = null;
  private seSynth: AlgoChipSynthesizer | null = null;
  private bgmGainBase = 1.0;
  private seGainBase = 1.0;

  private readonly seGenerator = new SEGenerator();
  private seDefaults: SePlaybackDefaults;
  private soundEffectController: SoundEffectController | null = null;

  private activeTimeline: ActiveTimeline | null = null;
  private lastBgm: PipelineResult | null = null;
  private bgmVolume: number;
  private pausedOffsetSeconds: number | null = null;
  private lastPlayOptions: PlayBgmOptions | null = null;

  /**
   * Creates a new AudioSessionImpl instance.
   *
   * @param options - Session configuration options.
   */
  constructor(private readonly options: CreateSessionOptions = {}) {
    if (options.audioContext) {
      this.context = options.audioContext;
      this.ownsContext = false;
    } else {
      this.context = null;
      this.ownsContext = true;
    }

    this.gainNode = options.gainNode ?? null;
    this.workletBasePath = options.workletBasePath ?? DEFAULT_WORKLET_BASE_PATH;
    this.seDefaults = {
      ...DEFAULT_SE_DEFAULTS,
      ...(options.seDefaults ?? {}),
    };
    this.bgmVolume = Math.max(0, options.bgmVolume ?? 1.0);
  }

  /**
   * Ensures the AudioContext and all synthesizers are initialized and ready.
   *
   * @returns The initialized AudioContext instance.
   * @throws Error if AudioContext initialization or worklet loading fails.
   */
  async ensureReady(): Promise<AudioContext> {
    const ctx = this.ensureContext(true);
    await this.ensureBgmSynth(ctx);
    await this.ensureSeSynth(ctx);
    await this.ensureSoundEffectController(ctx);
    return ctx;
  }

  /**
   * Generates a new background music composition.
   *
   * @param options - Composition generation options (mood, tempo, style, etc.).
   * @returns The generated composition result with events and metadata.
   */
  async generateBgm(options: CompositionOptions): Promise<PipelineResult> {
    const result = await generateComposition(options);
    this.lastBgm = result;
    return result;
  }

  /**
   * Plays a background music composition.
   *
   * @param result - The composition result to play.
   * @param options - Playback options (loop, volume, offset, callbacks, etc.).
   */
  async playBgm(
    result: PipelineResult,
    options: PlayBgmOptions = {}
  ): Promise<void> {
    const ctx = await this.ensureReady();

    const loop = options.loop ?? true;
    const offset = Math.max(0, options.offset ?? 0);
    const leadTime = options.leadTime ?? DEFAULT_LEAD_TIME;
    const lookahead = options.lookahead ?? DEFAULT_LOOKAHEAD;
    const startTime = options.startTime ?? ctx.currentTime + leadTime;
    const timelineStart = startTime - offset;
    const volume = options.volume ?? this.bgmVolume;

    this.activeTimeline = {
      startTime: timelineStart,
      loop,
      meta: result.meta,
    };
    this.lastBgm = result;

    const synthOptions: SynthPlayOptions = {
      startTime,
      offset,
      leadTime,
      lookahead,
      volume,
      onEvent: options.onEvent ?? undefined,
    };

    const storedOptions: PlayBgmOptions = {
      ...options,
      loop,
      offset,
      leadTime,
      lookahead,
      volume,
      onEvent: synthOptions.onEvent,
    };
    delete storedOptions.startTime;
    this.lastPlayOptions = storedOptions;
    this.pausedOffsetSeconds = null;

    if (loop) {
      this.bgmSynth!.playLoop(result.events, synthOptions);
    } else {
      void this.bgmSynth!.play(result.events, synthOptions).catch((error) => {
        console.error("BGM playback error:", error);
      });
    }
  }

  /**
   * Stops the currently playing background music and resets ducking.
   */
  stopBgm(): void {
    this.bgmSynth?.stop();
    this.soundEffectController?.resetDucking();
    this.activeTimeline = null;
    this.pausedOffsetSeconds = null;
  }

  /**
   * Stops all audio playback (BGM and sound effects) and cancels scheduled SE.
   */
  stopAllAudio(): void {
    this.pauseBgm({ captureOffset: false });
    this.seSynth?.stop();
    this.cancelScheduledSe();
    this.pausedOffsetSeconds = null;
  }

  /**
   * Pauses background music playback.
   *
   * @param options - Pause options (whether to capture current offset).
   * @returns The offset in seconds where playback was paused, or null if not captured.
   */
  pauseBgm(options: PauseBgmOptions = {}): number | null {
    const { captureOffset = true } = options;

    if (captureOffset) {
      const timeline = this.activeTimeline;
      const ctx = this.context;
      if (timeline && ctx) {
        const elapsed = Math.max(0, ctx.currentTime - timeline.startTime);
        const totalDuration = timeline.meta?.loopInfo?.totalDuration ?? 0;
        const offset = totalDuration > 0 ? elapsed % totalDuration : elapsed;
        this.pausedOffsetSeconds = offset;
      } else {
        this.pausedOffsetSeconds = null;
      }
    }

    this.bgmSynth?.stop();
    this.soundEffectController?.resetDucking();
    this.activeTimeline = null;

    return this.pausedOffsetSeconds;
  }

  /**
   * Resumes previously paused background music.
   *
   * @param options - Resume options (can override offset).
   * @throws Error if no BGM is available to resume.
   */
  async resumeBgm(options: ResumeBgmOptions = {}): Promise<void> {
    const result = this.lastBgm;
    if (!result) {
      throw new Error("No background music available to resume.");
    }

    const { offsetSeconds, ...rest } = options;
    const offset =
      typeof offsetSeconds === "number"
        ? Math.max(0, offsetSeconds)
        : this.pausedOffsetSeconds ?? 0;
    this.pausedOffsetSeconds = null;

    const playOptions: PlayBgmOptions = {
      ...(this.lastPlayOptions ?? {}),
      ...rest,
    };
    delete playOptions.startTime;
    playOptions.offset = offset;

    await this.playBgm(result, playOptions);
  }

  /**
   * Sets the background music volume.
   *
   * @param volume - Volume level (0.0 or higher, where 1.0 is normal).
   */
  setBgmVolume(volume: number): void {
    const clamped = Math.max(0, volume);
    this.bgmVolume = clamped;
    if (this.bgmSynth && this.context) {
      const gainNode = this.bgmSynth.masterGain;
      gainNode.gain.setValueAtTime(
        this.bgmGainBase * clamped,
        this.context.currentTime
      );
    }
  }

  /**
   * Configures default settings for sound effect playback.
   *
   * @param defaults - Partial SE defaults to merge with current settings.
   */
  configureSeDefaults(defaults: Partial<SePlaybackDefaults>): void {
    const next: SePlaybackDefaults = {
      ...this.seDefaults,
      ...defaults,
    };
    if (defaults.volume !== undefined) {
      next.volume = Math.max(0, defaults.volume);
      if (this.seSynth && this.context) {
        this.seSynth.masterGain.gain.setValueAtTime(
          this.seGainBase * next.volume,
          this.context.currentTime
        );
      }
    }
    this.seDefaults = next;
  }

  /**
   * Generates a sound effect based on the provided options.
   *
   * @param options - SE generation options (type, seed, template, frequency).
   * @returns The generated sound effect result.
   */
  generateSe(options: SEGenerationOptions): SEGenerationResult {
    return this.seGenerator.generateSE(options);
  }

  /**
   * Plays a generated sound effect.
   *
   * @param result - The SE generation result to play.
   * @param options - Playback options (volume, ducking, quantization).
   */
  async playSe(
    result: SEGenerationResult,
    options: PlaySEOptions = {}
  ): Promise<void> {
    await this.ensureReady();

    const playOptions: PlaySEOptions = {
      duckingDb: options.duckingDb ?? this.seDefaults.duckingDb,
      volume: Math.max(0, options.volume ?? this.seDefaults.volume),
      quantize: options.quantize ?? this.seDefaults.quantize,
    };

    await this.soundEffectController!.play(result, playOptions);
  }

  /**
   * Generates and immediately plays a sound effect in one call.
   *
   * @param options - Combined generation and playback options.
   */
  async triggerSe(options: TriggerSeOptions): Promise<void> {
    const generationResult = this.generateSe({
      type: options.type,
      seed: options.seed,
      templateId: options.templateId,
      baseFrequency: options.baseFrequency,
    });

    await this.playSe(generationResult, {
      duckingDb: options.duckingDb,
      volume: options.volume,
      quantize: options.quantize,
    });
  }

  /**
   * Cancels all scheduled (quantized) sound effects that haven't started yet.
   */
  cancelScheduledSe(): void {
    this.soundEffectController?.cancelPendingJobs();
  }

  /**
   * Gets the currently active BGM timeline, if any.
   *
   * @returns The active timeline or null if no BGM is playing.
   */
  getActiveTimeline(): ActiveTimeline | null {
    return this.activeTimeline;
  }

  /**
   * Gets the underlying AudioContext instance.
   *
   * @returns The AudioContext or null if not yet created.
   */
  getAudioContext(): AudioContext | null {
    return this.context;
  }

  /**
   * Resumes the AudioContext if it is suspended.
   * Useful for responding to user gestures to enable audio playback.
   */
  resumeAudioContext(): void {
    this.ensureContext(true);
  }

  /**
   * Suspends the AudioContext to save resources when audio is not needed.
   */
  suspendAudioContext(): void {
    if (!this.context) return;
    if (this.context.state === "running") {
      this.context.suspend();
    }
  }

  /**
   * Closes the session and releases all resources.
   * If the AudioContext was created by this session, it will be closed.
   */
  async close(): Promise<void> {
    this.stopAllAudio();
    if (this.context && this.ownsContext) {
      await this.context.close().catch((error) => {
        console.warn("AudioContext close failed:", error);
      });
    }
    this.context = null;
    this.bgmSynth = null;
    this.seSynth = null;
    this.soundEffectController = null;
    this.activeTimeline = null;
    this.lastBgm = null;
    this.lastPlayOptions = null;
    this.pausedOffsetSeconds = null;
  }

  /**
   * Ensures an AudioContext exists and optionally resumes it.
   *
   * @param resume - Whether to resume the context if suspended.
   * @returns The AudioContext instance.
   * @throws Error if initialization or resume fails.
   */
  private ensureContext(resume: boolean): AudioContext {
    if (!this.context) {
      try {
        this.context = new AudioContext({
          sampleRate: DEFAULT_SAMPLE_RATE,
          latencyHint: "interactive",
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `AudioContext initialization failed. Ensure the page has a user interaction and autoplay is allowed. Cause: ${reason}`
        );
      }
    }
    if (resume && this.context.state === "suspended") {
      try {
        this.context.resume();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `AudioContext resume failed. Try resuming after a user gesture or check browser policies. Cause: ${reason}`
        );
      }
    }
    return this.context;
  }

  /**
   * Ensures the BGM synthesizer is initialized.
   *
   * @param ctx - The AudioContext to use.
   */
  private async ensureBgmSynth(ctx: AudioContext): Promise<void> {
    if (this.bgmSynth) {
      return;
    }
    this.bgmSynth = new AlgoChipSynthesizer(ctx, {
      workletBasePath: this.workletBasePath,
      gainNode: this.gainNode ?? undefined,
    });
    await this.bgmSynth.init();
    this.bgmGainBase = this.bgmSynth.masterGain.gain.value;
    // Apply current volume preference after init
    this.bgmSynth.masterGain.gain.setValueAtTime(
      this.bgmGainBase * this.bgmVolume,
      ctx.currentTime
    );
  }

  /**
   * Ensures the SE synthesizer is initialized.
   *
   * @param ctx - The AudioContext to use.
   */
  private async ensureSeSynth(ctx: AudioContext): Promise<void> {
    if (this.seSynth) {
      return;
    }
    this.seSynth = new AlgoChipSynthesizer(ctx, {
      workletBasePath: this.workletBasePath,
      gainNode: this.gainNode ?? undefined,
    });
    await this.seSynth.init();
    this.seGainBase = this.seSynth.masterGain.gain.value;
    this.seSynth.masterGain.gain.setValueAtTime(
      this.seGainBase * this.seDefaults.volume,
      ctx.currentTime
    );
  }

  /**
   * Ensures the sound effect controller is initialized.
   *
   * @param ctx - The AudioContext to use.
   * @throws Error if BGM or SE synthesizer is not yet initialized.
   */
  private async ensureSoundEffectController(ctx: AudioContext): Promise<void> {
    if (this.soundEffectController) {
      return;
    }
    if (!this.bgmSynth || !this.seSynth) {
      throw new Error(
        "Sound effect controller requires both BGM and SE synthesizers."
      );
    }
    this.soundEffectController = new SoundEffectController(
      ctx,
      this.seSynth,
      () => this.activeTimeline,
      this.bgmSynth.masterGain,
      () => {
        // Use the volume from the current playback session if available,
        // otherwise fall back to the default bgmVolume
        const effectiveVolume = this.lastPlayOptions?.volume ?? this.bgmVolume;
        return this.bgmGainBase * effectiveVolume;
      }
    );
  }
}

/**
 * Creates a new audio session for BGM generation and sound effect playback.
 *
 * @param options - Optional session configuration.
 * @returns An AudioSession instance.
 *
 * @example
 * ```typescript
 * const session = createAudioSession({ bgmVolume: 0.7 });
 * const bgm = await session.generateBgm({ mood: 0.5, tempo: 0.0 });
 * await session.playBgm(bgm);
 * ```
 */
export function createAudioSession(
  options: CreateSessionOptions = {}
): AudioSession {
  return new AudioSessionImpl(options);
}
