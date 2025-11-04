/**
 * Demo audio session API.
 *
 * Provides a high-level interface for generating compositions, managing BGM playback,
 * and triggering sound effects with quantization and ducking support.
 */

import {
  generateComposition,
  SEGenerator,
  AlgoChipSynthesizer
} from "@algo-chip/core";

import type {
  ActiveTimeline,
  CompositionOptions,
  CreateSessionOptions,
  AudioSession,
  PlayBgmOptions,
  SePlaybackDefaults,
  TriggerSeOptions,
  PipelineResult,
  SynthPlayOptions
} from "../types.js";

import { SoundEffectController } from "../playback.js";

// Default configuration values
const DEFAULT_SE_DEFAULTS: SePlaybackDefaults = {
  duckingDb: -6,
  volume: 1.0
};

const DEFAULT_WORKLET_BASE_PATH = "./worklets/";
const DEFAULT_SAMPLE_RATE = 44_100;
const DEFAULT_LEAD_TIME = 0.2;
const DEFAULT_LOOKAHEAD = 0.1;

class AudioSessionImpl implements AudioSession {
  private context: AudioContext | null;
  private readonly ownsContext: boolean;
  private readonly workletBasePath: string;

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

  constructor(private readonly options: CreateSessionOptions = {}) {
    if (options.audioContext) {
      this.context = options.audioContext;
      this.ownsContext = false;
    } else {
      this.context = null;
      this.ownsContext = true;
    }

    this.workletBasePath = options.workletBasePath ?? DEFAULT_WORKLET_BASE_PATH;
    this.seDefaults = {
      ...DEFAULT_SE_DEFAULTS,
      ...(options.seDefaults ?? {})
    };
    this.bgmVolume = Math.max(0, options.bgmVolume ?? 1.0);
  }

  async generateBgm(options: CompositionOptions): Promise<PipelineResult> {
    const result = await generateComposition(options);
    this.lastBgm = result;
    return result;
  }

  async playBgm(result: PipelineResult, options: PlayBgmOptions = {}): Promise<void> {
    const ctx = await this.ensureContext(true);
    await this.ensureBgmSynth(ctx);

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
      meta: result.meta
    };
    this.lastBgm = result;

    const synthOptions: SynthPlayOptions = {
      ...options,
      startTime,
      loop,
      offset,
      leadTime,
      lookahead,
      volume,
      onEvent: options.onEvent ?? undefined
    };

    // Launch playback without awaiting the long-running promise (looping = never resolves).
    void this.bgmSynth!.play(result.events, synthOptions).catch((error) => {
      console.error("BGM playback error:", error);
    });
  }

  stopBgm(): void {
    this.bgmSynth?.stop();
    this.seSynth?.stop();
    this.soundEffectController?.cancelPendingJobs();
    this.soundEffectController?.resetDucking();
    this.activeTimeline = null;
  }

  setBgmVolume(volume: number): void {
    const clamped = Math.max(0, volume);
    this.bgmVolume = clamped;
    if (this.bgmSynth && this.context) {
      const gainNode = this.bgmSynth.masterGain;
      gainNode.gain.setValueAtTime(this.bgmGainBase * clamped, this.context.currentTime);
    }
  }

  configureSeDefaults(defaults: Partial<SePlaybackDefaults>): void {
    const next: SePlaybackDefaults = {
      ...this.seDefaults,
      ...defaults
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

  async triggerSe(options: TriggerSeOptions): Promise<void> {
    const ctx = await this.ensureContext(true);
    await this.ensureBgmSynth(ctx);
    await this.ensureSeSynth(ctx);
    await this.ensureSoundEffectController(ctx);

    const generationResult = this.seGenerator.generateSE({
      type: options.type,
      seed: options.seed,
      templateId: options.templateId,
      baseFrequency: options.baseFrequency
    });

    const playOptions = {
      duckingDb: options.duckingDb ?? this.seDefaults.duckingDb,
      volume: Math.max(0, options.volume ?? this.seDefaults.volume),
      quantize: options.quantize ?? this.seDefaults.quantize
    };

    await this.soundEffectController!.play(generationResult, playOptions);
  }

  cancelScheduledSe(): void {
    this.soundEffectController?.cancelPendingJobs();
  }

  getActiveTimeline(): ActiveTimeline | null {
    return this.activeTimeline;
  }

  getAudioContext(): AudioContext | null {
    return this.context;
  }

  async resumeAudioContext(): Promise<void> {
    await this.ensureContext(true);
  }

  async suspendAudioContext(): Promise<void> {
    if (!this.context) return;
    if (this.context.state === "running") {
      await this.context.suspend();
    }
  }

  async close(): Promise<void> {
    this.stopBgm();
    this.cancelScheduledSe();
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
  }

  private async ensureContext(resume: boolean): Promise<AudioContext> {
    if (!this.context) {
      this.context = new AudioContext({
        sampleRate: DEFAULT_SAMPLE_RATE,
        latencyHint: "interactive"
      });
    }
    if (resume && this.context.state === "suspended") {
      await this.context.resume();
    }
    return this.context;
  }

  private async ensureBgmSynth(ctx: AudioContext): Promise<void> {
    if (this.bgmSynth) {
      return;
    }
    this.bgmSynth = new AlgoChipSynthesizer(ctx, { workletBasePath: this.workletBasePath });
    await this.bgmSynth.init();
    this.bgmGainBase = this.bgmSynth.masterGain.gain.value;
    // Apply current volume preference after init
    this.bgmSynth.masterGain.gain.setValueAtTime(
      this.bgmGainBase * this.bgmVolume,
      ctx.currentTime
    );
  }

  private async ensureSeSynth(ctx: AudioContext): Promise<void> {
    if (this.seSynth) {
      return;
    }
    this.seSynth = new AlgoChipSynthesizer(ctx, { workletBasePath: this.workletBasePath });
    await this.seSynth.init();
    this.seGainBase = this.seSynth.masterGain.gain.value;
    this.seSynth.masterGain.gain.setValueAtTime(
      this.seGainBase * this.seDefaults.volume,
      ctx.currentTime
    );
  }

  private async ensureSoundEffectController(ctx: AudioContext): Promise<void> {
    if (this.soundEffectController) {
      return;
    }
    if (!this.bgmSynth || !this.seSynth) {
      throw new Error("Sound effect controller requires both BGM and SE synthesizers.");
    }
    this.soundEffectController = new SoundEffectController(
      ctx,
      this.seSynth,
      () => this.activeTimeline,
      this.bgmSynth.masterGain
    );
  }
}

export function createAudioSession(options: CreateSessionOptions = {}): AudioSession {
  return new AudioSessionImpl(options);
}
