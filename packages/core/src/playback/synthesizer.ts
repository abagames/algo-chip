/**
 * AlgoChip chiptune synthesizer implementation.
 *
 * This module provides authentic retro sound synthesis using AudioWorklet processors
 * that emulate classic 4-channel chiptune architecture:
 * - Two square wave channels (square1, square2) with adjustable duty cycle
 * - One triangle wave channel for bass
 * - One noise channel with configurable period and mode
 *
 * The synthesizer supports:
 * - Precise event scheduling with lookahead
 * - Pitch slides and portamento effects
 * - Noise instrument presets (kick, snare, hihat, etc.)
 * - Looping playback
 * - Event callbacks for real-time visualization
 */

import type { Event as PlaybackEvent, Channel } from "../types.js";

// ============================================================================
// Constants
// ============================================================================

/** Lookahead time for event scheduling in seconds */
const LOOKAHEAD_SECONDS = 0.1;
/** Interval for checking and scheduling events in milliseconds */
const SCHEDULE_INTERVAL_MS = 25;
/** Default lead time before playback starts in seconds */
const LEAD_TIME = 0.3;
/** Reference clock frequency in Hz (1.789773 MHz) */
const CHIP_BASE_CLOCK = 1_789_773;

/** Noise channel period lookup table (clock divider values) */
const NOISE_PERIOD_TABLE = [
  4, 8, 16, 32, 64, 96, 128, 160, 202, 254, 380, 508, 762, 1016, 2034, 4068,
];

/** Default noise filter cutoff when not specified by the event generator */
const DEFAULT_NOISE_CUTOFF_HZ = 5200;

/** MIDI note number for A4 (440 Hz) */
const MIDI_A4 = 69;
/** Frequency of A4 in Hz */
const FREQ_A4 = 440;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Converts MIDI note number to frequency in Hz.
 *
 * @param midi MIDI note number (0-127)
 * @returns Frequency in Hz
 */
function midiToFrequency(midi: number): number {
  return FREQ_A4 * Math.pow(2, (midi - MIDI_A4) / 12);
}

/**
 * Converts MIDI velocity to linear gain value.
 *
 * @param velocity MIDI velocity (0-127, defaults to 100)
 * @param scale Scaling factor (default 0.85 to avoid clipping)
 * @returns Linear gain value (0.0-1.0)
 */
function velocityToGain(velocity?: number, scale = 0.85): number {
  return Math.max(0, Math.min(1, ((velocity ?? 100) / 127) * scale));
}

/**
 * Builds a WaveShaper transfer curve approximating the NES APU non-linear DAC mixer.
 *
 * The NES uses separate resistor-ladder DACs for pulse and TND channel groups whose
 * combined response is non-linear: quiet signals are relatively louder (expansion)
 * and the combined headroom compresses slightly at high amplitudes.  A tanh curve
 * with k ≈ 0.55 closely matches that shape across the [0, 1] amplitude range.
 */
function makeNESMixerCurve(n = 256): Float32Array {
  const k = 0.55;
  const normFactor = Math.tanh(k);
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (2 * i) / (n - 1) - 1; // map index to [-1, 1]
    curve[i] = Math.tanh(x * k) / normFactor;
  }
  return curve;
}

// ============================================================================
// Type Definitions
// ============================================================================

/** Pitch slide/portamento parameters */
interface PitchSlide {
  targetFrequency: number;
  durationSeconds: number;
}

/** Data for pitched notes (square/triangle channels) */
interface PitchData {
  frequency: number;
  amplitude: number;
  duty?: number;
  detuneCents: number;
  slide?: PitchSlide | null;
}

/** Noise channel preset parameters */
interface NoisePreset {
  mode: "short" | "long";
  periodIndex: number;
  baseAmplitude: number;
  decaySeconds: number;
  releaseSeconds: number;
  cutoffHz: number;
}

/** Data for noise channel notes (drums/percussion) */
interface NoiseData {
  amplitude: number;
  decaySeconds: number;
  releaseSeconds: number;
  periodIndex: number;
  mode: "short" | "long";
  cutoffHz: number;
}

/** Options for synthesizer playback */
export interface SynthPlayOptions {
  startTime?: number;
  lookahead?: number;
  leadTime?: number;
  offset?: number;
  onEvent?: (event: PlaybackEvent, when: number) => void;
  volume?: number; // Playback volume multiplier (default: 1.0, range: 0.0+)
}

// ============================================================================
// Channel Classes
// ============================================================================

/**
 * Base class for all audio channels.
 *
 * Handles communication with AudioWorklet processors via MessagePort,
 * converting event times to sample-accurate frame numbers.
 */
class BaseChannel {
  protected readonly port: MessagePort;
  protected readonly sampleRate: number;
  protected readonly nodeStartTime: number;

  constructor(
    protected readonly context: AudioContext,
    processorName: string,
    masterGain: GainNode
  ) {
    const node = new AudioWorkletNode(context, processorName);
    node.connect(masterGain);
    this.port = node.port;
    this.sampleRate = context.sampleRate;
    this.nodeStartTime = context.currentTime;
  }

  /**
   * Schedules a message to be processed by the AudioWorklet at a specific time.
   *
   * @param message Message data to send to the worklet
   * @param when Absolute time in seconds (AudioContext.currentTime)
   */
  scheduleMessage(message: Record<string, unknown>, when: number): void {
    const relativeSeconds = when - this.nodeStartTime;
    const sampleFrame = Math.max(
      0,
      Math.round(relativeSeconds * this.sampleRate)
    );
    this.port.postMessage({ ...message, sampleFrame });
  }

  /** Clears all scheduled events and stops sound output */
  stop(): void {
    this.port.postMessage({ type: "clear" });
  }
}

/**
 * Square wave channel implementation.
 *
 * Supports duty cycle control (12.5%, 25%, 50%), pitch slides,
 * and detuning effects. Used for melody and harmony.
 */
class SquareChannel extends BaseChannel {
  private currentDuty = 0.5;

  constructor(context: AudioContext, masterGain: GainNode) {
    super(context, "square-processor", masterGain);
  }

  noteOn(data: PitchData & { slide?: PitchSlide | null }, when: number): void {
    const detuneCents = data.detuneCents ?? 0;
    const detuneRatio = Math.pow(2, detuneCents / 1200);
    const payload: Record<string, unknown> = {
      type: "noteOn",
      frequency: data.frequency * detuneRatio,
      amplitude: data.amplitude ?? 0.8,
      duty: data.duty ?? this.currentDuty,
    };
    if (data.slide) {
      payload.slide = {
        targetFrequency: data.slide.targetFrequency,
        durationSamples: Math.round(
          (data.slide.durationSeconds ?? 0) * this.sampleRate
        ),
      };
    }
    this.scheduleMessage(payload, when);
  }

  noteOff(_: Record<string, unknown>, when: number): void {
    this.scheduleMessage({ type: "noteOff" }, when);
  }

  setParam(data: Record<string, unknown>, when: number): void {
    if (data.param === "duty") {
      this.currentDuty = Number(data.value ?? this.currentDuty);
    }
    if (data.param === "pitchBend" && typeof data.value === "number") {
      const targetFrequency = data.value > 0 ? midiToFrequency(data.value) : 0;
      const rampDuration = Number(data.rampDuration ?? 0);
      const curve = (data.curve as string) ?? "linear";
      this.scheduleMessage(
        {
          type: "setParam",
          param: "pitchBend",
          value: targetFrequency,
          rampDuration,
          curve,
        },
        when
      );
      return;
    }
    // Hardware sweep unit control.
    // param: "sweep", plus: enabled, period (0-7), shift (0-7), negate (boolean).
    // negate=false → pitch sweeps down; negate=true → pitch sweeps up.
    if (data.param === "sweep") {
      this.scheduleMessage(
        {
          type: "setSweep",
          enabled: data.enabled !== false,
          period: typeof data.period === "number" ? data.period : 0,
          shift: typeof data.shift === "number" ? data.shift : 0,
          negate: data.negate === true,
        },
        when
      );
      return;
    }
    this.scheduleMessage(
      { type: "setParam", param: data.param, value: data.value },
      when
    );
  }
}

/**
 * Triangle wave channel implementation.
 *
 * Fixed waveform (no duty cycle control), typically used for bass lines.
 * Supports pitch bends but not amplitude control (fixed volume on chiptune hardware).
 */
class TriangleChannel extends BaseChannel {
  constructor(context: AudioContext, masterGain: GainNode) {
    super(context, "triangle-processor", masterGain);
  }

  noteOn(data: PitchData, when: number): void {
    const payload = {
      type: "noteOn",
      frequency: data.frequency,
      amplitude: data.amplitude ?? 0.7,
    };
    this.scheduleMessage(payload, when);
  }

  noteOff(_: Record<string, unknown>, when: number): void {
    this.scheduleMessage({ type: "noteOff" }, when);
  }

  setParam(data: Record<string, unknown>, when: number): void {
    if (data.param === "pitchBend" && typeof data.value === "number") {
      const targetFrequency = data.value > 0 ? midiToFrequency(data.value) : 0;
      const rampDuration = Number(data.rampDuration ?? 0);
      const curve = (data.curve as string) ?? "linear";
      this.scheduleMessage(
        {
          type: "setParam",
          param: "pitchBend",
          value: targetFrequency,
          rampDuration,
          curve,
        },
        when
      );
      return;
    }
    this.scheduleMessage(
      { type: "setParam", param: data.param, value: data.value },
      when
    );
  }
}

/**
 * Noise channel implementation.
 *
 * Generates pseudo-random noise for percussion sounds (kick, snare, hihat).
 * Supports two modes: "short" (high-frequency metallic) and "long" (low-frequency rumble).
 * Period control uses 16-bit LFSR (Linear Feedback Shift Register).
 */
class NoiseChannel extends BaseChannel {
  private periodIndex = 0;
  private mode: "short" | "long" = "short";

  constructor(context: AudioContext, masterGain: GainNode) {
    super(context, "noise-processor", masterGain);
  }

  noteOn(data: NoiseData & { periodIndex?: number }, when: number): void {
    const periodIndex = Math.max(
      0,
      Math.min(
        NOISE_PERIOD_TABLE.length - 1,
        data.periodIndex ?? this.periodIndex
      )
    );
    const periodCycles = NOISE_PERIOD_TABLE[periodIndex];
    const periodSeconds = (periodCycles * 16) / CHIP_BASE_CLOCK;
    const periodSamples = Math.max(
      1,
      Math.round(periodSeconds * this.sampleRate)
    );
    const decaySeconds = Math.max(0.001, data.decaySeconds ?? 0.12);
    const releaseSeconds = Math.max(0.001, data.releaseSeconds ?? 0.03);
    const decaySamples = Math.max(
      1,
      Math.round(decaySeconds * this.sampleRate)
    );
    const releaseSamples = Math.max(
      1,
      Math.round(releaseSeconds * this.sampleRate)
    );
    const amplitude = Math.max(0, Math.min(1, data.amplitude ?? 0.6));
    const mode = data.mode === "long" ? "long" : "short";
    const cutoffHz = Math.max(
      100,
      Math.min(this.sampleRate / 2, data.cutoffHz ?? 6000)
    );

    this.periodIndex = periodIndex;
    this.mode = mode;

    this.scheduleMessage(
      {
        type: "noteOn",
        mode,
        amplitude,
        periodSamples,
        decaySamples,
        releaseSamples,
        cutoffHz,
      },
      when
    );
  }

  noteOff(data: Record<string, unknown>, when: number): void {
    const releaseSeconds = Math.max(
      0.001,
      Number(data?.releaseSeconds ?? 0.03)
    );
    const releaseSamples = Math.max(
      1,
      Math.round(releaseSeconds * this.sampleRate)
    );
    this.scheduleMessage({ type: "noteOff", releaseSamples }, when);
  }

  setParam(data: Record<string, unknown>, when: number): void {
    if (!data || !data.param) {
      return;
    }
    if (data.param === "mode" && typeof data.value === "string") {
      this.mode = data.value === "long" ? "long" : "short";
      this.scheduleMessage({ type: "setParam", param: "mode", value: data.value }, when);
      return;
    }
    if (data.param === "periodIndex") {
      const index = Math.max(
        0,
        Math.min(NOISE_PERIOD_TABLE.length - 1, Number(data.value ?? this.periodIndex))
      );
      this.periodIndex = index;
      // Convert to samples so both worklet variants receive the same pre-computed value
      const periodCycles = NOISE_PERIOD_TABLE[index];
      const periodSeconds = (periodCycles * 16) / CHIP_BASE_CLOCK;
      const periodSamples = Math.max(1, Math.round(periodSeconds * this.sampleRate));
      this.scheduleMessage({ type: "setParam", param: "periodSamples", value: periodSamples }, when);
      return;
    }
    this.scheduleMessage(
      { type: "setParam", param: data.param, value: data.value },
      when
    );
  }
}

/** All four chiptune channels */
type ChannelInstances = {
  square1: SquareChannel;
  square2: SquareChannel;
  triangle: TriangleChannel;
  noise: NoiseChannel;
};

// ============================================================================
// Main Synthesizer Class
// ============================================================================

/**
 * Tracks which AudioContexts have already loaded the required worklet modules.
 * Key: AudioContext instance, Value: Set of loaded module file names.
 */
const loadedWorklets = new WeakMap<BaseAudioContext, Set<string>>();

/**
 * AlgoChip chiptune synthesizer.
 *
 * Orchestrates all four audio channels, handles event scheduling with
 * precise timing, supports looping playback, and provides real-time
 * event callbacks for visualization.
 *
 * Usage:
 * ```typescript
 * const synth = new AlgoChipSynthesizer(audioContext);
 * await synth.init();
 * await synth.play(oneShotEvents);
 * synth.playLoop(loopingEvents, { onEvent: handleEvent });
 * ```
 */
export class AlgoChipSynthesizer {
  private static readonly BASE_GAIN = 0.16; // Default master gain value
  private readonly masterGainNode: GainNode;
  private readonly destination: AudioNode;
  private readonly workletBasePath: string;
  private channels!: ChannelInstances;
  private events: PlaybackEvent[] = [];
  private eventIndex = 0;
  private lookahead = LOOKAHEAD_SECONDS;
  private leadTime = LEAD_TIME;
  private intervalHandle: number | null = null;
  private startTime = 0;
  private lastEventTime = 0;
  private completionResolver: (() => void) | null = null;
  private loopEnabled = false;
  private eventCallback: ((event: PlaybackEvent, when: number) => void) | null =
    null;

  constructor(
    private readonly context: AudioContext,
    options: { workletBasePath?: string; gainNode?: GainNode } = {}
  ) {
    // Always create our own masterGainNode for independent volume control
    this.masterGainNode = context.createGain();
    this.masterGainNode.gain.value = AlgoChipSynthesizer.BASE_GAIN;
    // Save destination; full processing chain (WaveShaper → dcBlocker) is wired in init()
    this.destination = options.gainNode ?? context.destination;
    this.workletBasePath = options.workletBasePath ?? "./worklets/";
  }

  /**
   * Initializes the synthesizer by loading AudioWorklet processors.
   *
   * Must be called once before playback. Loads the square, triangle,
   * and noise processor modules (if not already loaded for this context)
   * and creates channel instances.
   */
  async init(): Promise<void> {
    const ctx = this.context;
    const basePath = this.workletBasePath;

    // Get or create the set of loaded modules for this context
    let loaded = loadedWorklets.get(ctx);
    if (!loaded) {
      loaded = new Set<string>();
      loadedWorklets.set(ctx, loaded);
    }

    const loadModule = async (fileName: string): Promise<void> => {
      // Skip if already loaded for this context
      if (loaded!.has(fileName)) {
        return;
      }

      const url = `${basePath}${fileName}`;
      try {
        await ctx.audioWorklet.addModule(url);
        loaded!.add(fileName);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to load AudioWorklet "${fileName}" from "${url}". ` +
            `Verify that the processor file is hosted and workletBasePath is correct. Cause: ${reason}`
        );
      }
    };

    await loadModule("square-processor.js");
    await loadModule("triangle-processor.js");
    await loadModule("noise-processor.js");

    this.channels = {
      square1: new SquareChannel(ctx, this.masterGainNode),
      square2: new SquareChannel(ctx, this.masterGainNode),
      triangle: new TriangleChannel(ctx, this.masterGainNode),
      noise: new NoiseChannel(ctx, this.masterGainNode),
    };

    // Build NES-accurate post-processing chain:
    //   masterGain → nesWaveShaper → dcBlocker → destination
    //
    // nesWaveShaper approximates the non-linear resistor-ladder DAC of the NES APU:
    //   quiet signals get a slight boost (expansion) and loud combined signals are
    //   gently compressed, matching the tanh-like transfer curve (k ≈ 0.55).
    //
    // dcBlocker is a highpass at 20 Hz matching the NES output capacitor's RC cutoff
    //   (~16 Hz), which removes DC offset and adds the characteristic tight sub-bass roll-off.
    const nesWaveShaper = ctx.createWaveShaper();
    nesWaveShaper.curve = makeNESMixerCurve();
    nesWaveShaper.oversample = "none";

    const dcBlocker = ctx.createBiquadFilter();
    dcBlocker.type = "highpass";
    dcBlocker.frequency.value = 20;
    dcBlocker.Q.value = 0.707;

    this.masterGainNode.connect(nesWaveShaper);
    nesWaveShaper.connect(dcBlocker);
    dcBlocker.connect(this.destination);
  }

  /** Returns the master gain node for external ducking/mixing control */
  get masterGain(): GainNode {
    return this.masterGainNode;
  }

  /**
   * Stops playback and clears all scheduled events.
   *
   * Stops the scheduling loop, clears all channel queues, and resolves
   * the playback promise.
   */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    Object.values(this.channels).forEach((channel) => channel.stop());
    if (this.completionResolver) {
      this.completionResolver();
      this.completionResolver = null;
    }
  }

  /**
   * Plays the provided events one time and resolves when playback ends.
   *
   * Use this for finite SE/BGM renders that should signal completion. For
   * looping playback, call {@link playLoop} instead so the caller is not
   * blocked by a never-resolving promise.
   */
  play(events: PlaybackEvent[], options: SynthPlayOptions = {}): Promise<void> {
    this.preparePlayback(events, options, false);
    return new Promise<void>((resolve) => {
      this.completionResolver = resolve;
      this.startScheduler();
    });
  }

  /**
   * Starts looping playback of the provided events.
   *
   * Returns immediately after scheduling begins; call {@link stop} to halt
   * the loop. This keeps the async contract simple for callers that want
   * background music playback without awaiting.
   */
  playLoop(events: PlaybackEvent[], options: SynthPlayOptions = {}): void {
    this.preparePlayback(events, options, true);
    this.completionResolver = null;
    this.startScheduler();
  }

  /** Common setup shared by play() and playLoop(). */
  private preparePlayback(
    events: PlaybackEvent[],
    options: SynthPlayOptions,
    loop: boolean
  ): void {
    this.stop();
    this.events = events ?? [];
    this.lookahead = options.lookahead ?? LOOKAHEAD_SECONDS;
    this.leadTime = options.leadTime ?? LEAD_TIME;
    this.loopEnabled = loop;
    this.eventCallback = options.onEvent ?? null;

    // Apply volume multiplier (default: 1.0)
    const volume = options.volume ?? 1.0;
    this.masterGainNode.gain.value = AlgoChipSynthesizer.BASE_GAIN * volume;

    const totalDuration = this.events.length
      ? this.events[this.events.length - 1]!.time
      : 0;
    let offset = Math.max(0, options.offset ?? 0);
    if (offset > 0) {
      if (loop && totalDuration > 0) {
        offset = offset % totalDuration;
      } else {
        offset = Math.min(offset, totalDuration);
      }
    }

    const contextStart = this.context.currentTime;
    const baseStart = options.startTime ?? contextStart + this.leadTime;
    this.startTime = baseStart - offset;
    this.lastEventTime = totalDuration;
    this.eventIndex = this.resolveEventIndex(offset);
  }

  /** Launches the scheduling interval and immediately runs an initial tick. */
  private startScheduler(): void {
    const scheduleStep = () => this.tick();
    this.intervalHandle = window.setInterval(
      scheduleStep,
      SCHEDULE_INTERVAL_MS
    );
    scheduleStep();
  }

  /** Determines the event index that should be scheduled after applying an offset */
  private resolveEventIndex(offset: number): number {
    if (offset <= 0) {
      return 0;
    }
    const tolerance = 1e-3;
    for (let i = 0; i < this.events.length; i += 1) {
      const event = this.events[i]!;
      if (event.time + tolerance >= offset) {
        return i;
      }
    }
    return this.events.length;
  }

  /**
   * Scheduling tick function (called periodically).
   *
   * Checks for events within the lookahead window and dispatches them
   * to appropriate channels. Handles looping by resetting event index.
   */
  private tick(): void {
    const ctxTime = this.context.currentTime;
    const cutoff = ctxTime + this.lookahead;

    while (this.eventIndex < this.events.length) {
      const event = this.events[this.eventIndex]!;
      const eventTime = this.startTime + event.time;
      if (eventTime <= cutoff) {
        this.dispatchEvent(event, eventTime);
        this.eventIndex += 1;
      } else {
        break;
      }
    }

    if (this.loopEnabled && this.eventIndex >= this.events.length) {
      this.startTime += this.lastEventTime;
      this.eventIndex = 0;
    }

    if (!this.loopEnabled) {
      const completionTime = this.startTime + this.lastEventTime + 1;
      if (this.eventIndex >= this.events.length && ctxTime >= completionTime) {
        this.stop();
      }
    }
  }

  /**
   * Dispatches a single event to the appropriate channel.
   *
   * Routes noteOn, noteOff, and setParam commands to the correct channel
   * (square1/2, triangle, or noise) and invokes the event callback if registered.
   *
   * @param event Playback event to dispatch
   * @param when Absolute time to schedule the event
   */
  private dispatchEvent(event: PlaybackEvent, when: number): void {
    const data = event.data ?? {};

    // Notify callback if registered
    if (this.eventCallback) {
      this.eventCallback(event, when);
    }

    switch (event.channel) {
      case "square1":
      case "square2":
        if (event.command === "noteOn") {
          this.channels[event.channel].noteOn(this.mapPitchData(data), when);
        } else if (event.command === "noteOff") {
          this.channels[event.channel].noteOff(data, when);
        } else if (event.command === "setParam") {
          this.channels[event.channel].setParam(data, when);
        }
        break;
      case "triangle":
        if (event.command === "noteOn") {
          this.channels.triangle.noteOn(this.mapPitchData(data), when);
        } else if (event.command === "noteOff") {
          this.channels.triangle.noteOff(data, when);
        } else if (event.command === "setParam") {
          this.channels.triangle.setParam(data, when);
        }
        break;
      case "noise":
        if (event.command === "noteOn") {
          this.channels.noise.noteOn(this.mapNoiseData(data), when);
        } else if (event.command === "noteOff") {
          this.channels.noise.noteOff(data, when);
        } else if (event.command === "setParam") {
          this.channels.noise.setParam(data, when);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Maps event data to PitchData for square/triangle channels.
   *
   * Converts MIDI note numbers to frequencies, applies velocity scaling,
   * and extracts pitch slide parameters if present.
   *
   * @param data Event data object
   * @returns Formatted pitch data for channel noteOn
   */
  private mapPitchData(data: Record<string, unknown>): PitchData {
    const midi = Number(data.midi ?? 60);
    const detuneCents = Number(data.detuneCents ?? 0);
    let slide: PitchSlide | null = null;
    const slideData = data.slide as Record<string, unknown> | undefined;
    if (slideData) {
      if (typeof slideData.targetMidi === "number") {
        slide = {
          targetFrequency: midiToFrequency(slideData.targetMidi),
          durationSeconds: Number(slideData.durationSeconds ?? 0),
        };
      } else if (typeof slideData.targetFrequency === "number") {
        slide = {
          targetFrequency: slideData.targetFrequency,
          durationSeconds: Number(slideData.durationSeconds ?? 0),
        };
      }
    }

    return {
      frequency: midiToFrequency(midi),
      amplitude: velocityToGain(
        typeof data.velocity === "number" ? data.velocity : undefined
      ),
      duty: typeof data.duty === "number" ? data.duty : undefined,
      detuneCents,
      slide,
    };
  }

  /**
   * Maps event data to NoiseData for the noise channel.
   *
   * Applies instrument presets (K/S/H/O/T), scales amplitude by velocity,
   * and extracts envelope/filter parameters.
   *
   * @param data Event data object
   * @returns Formatted noise data for channel noteOn
   */
  private mapNoiseData(data: Record<string, unknown>): NoiseData {
    const velocity = typeof data.velocity === "number" ? data.velocity : 100;
    const velocityGain = Math.max(0, Math.min(1, velocity / 127));
    const amplitude = Math.min(
      1,
      Math.max(
        0,
        (typeof data.amplitude === "number" ? data.amplitude : 0.6) * velocityGain
      )
    );
    const decaySeconds =
      typeof data.decaySeconds === "number" ? data.decaySeconds : 0.14;
    const releaseSeconds =
      typeof data.releaseSeconds === "number" ? data.releaseSeconds : 0.03;
    const periodIndex =
      typeof data.periodIndex === "number"
        ? data.periodIndex
        : typeof data.clockDivider === "number"
        ? data.clockDivider
        : typeof data.period === "number"
        ? data.period
        : 3;
    const mode = (
      typeof data.mode === "string"
        ? data.mode
        : typeof data.noiseMode === "string"
        ? data.noiseMode
        : "short"
    ) as "short" | "long";
    const cutoffHz =
      typeof data.cutoffHz === "number" ? data.cutoffHz : DEFAULT_NOISE_CUTOFF_HZ;

    return {
      amplitude,
      decaySeconds,
      releaseSeconds,
      periodIndex,
      mode,
      cutoffHz,
    };
  }
}
