/**
 * Sound Effect (SE) Generation System
 *
 * This module generates chiptune sound effects using a template-based approach.
 * Unlike BGM (which uses motif-based composition), SE generation samples parameters
 * from predefined ranges to create one-shot sound events.
 *
 * ## Why Template-Based SE Generation?
 *
 * Sound effects require different design constraints than music:
 * - **Short duration**: SEs are 0.02-1.2 seconds (vs BGM's multi-minute compositions)
 * - **Parameter variety**: Same SE type needs multiple variations (e.g., different jump pitches)
 * - **Tight timing**: SE must trigger precisely on game events without rhythmic quantization
 * - **Isolated playback**: SEs don't need harmonic relationships with BGM
 *
 * Templates define parameter ranges (pitch, duration, envelope) that are sampled at
 * generation time, creating variety without hand-authoring hundreds of discrete SE motifs.
 *
 * ## SE Types and Template Architecture
 *
 * 10 SE types with 2 template variations each (20 templates total):
 * - **jump**: Rising pitch sweep (exponential curve)
 * - **coin**: 2-3 note ascending arpeggio
 * - **explosion**: Noise burst + descending bass sweep
 * - **hit**: Short descending arpeggio (damage sound)
 * - **powerup**: 4-note ascending arpeggio
 * - **laser**: Fast descending sweep
 * - **select**: Short single tone (menu selection)
 * - **click**: Very short high-pitched tone
 * - **synth**: Sustained tone with duty cycle variation
 * - **tone**: Basic single tone
 *
 * Each template specifies:
 * - Channel usage (square1, square2, triangle, noise)
 * - Duration range (min/max in seconds)
 * - Pitch ranges (start/end for sweeps, or fixed pitch)
 * - Envelope type (percussive vs sustained)
 * - Optional note sequences (arpeggios)
 * - Optional pitch sweep configuration
 *
 * ## Seed-Driven Reproducibility
 *
 * Like BGM generation, SE generation is deterministic:
 * - Same seed → same parameter sampling → identical SE
 * - Allows "replay" of exact SE variations for debugging or user favorites
 * - Uses linear congruential generator (LCG) matching BGM's RNG
 *
 * ## Parameter Concretization
 *
 * Template ranges are sampled to concrete values:
 * - **Duration**: Sample from [minDur, maxDur] range
 * - **Pitch**: Sample MIDI note from {min, max} range (discrete)
 * - **Velocity**: Sample from velocity range (quantized to MIDI 0-127)
 * - **Duty cycle**: Sample from continuous range or discrete options
 * - **Envelope**: Fixed per template (percussive or sustained)
 *
 * This generates infinite SE variations from a small template library.
 */

import type { Event, Channel } from "../types.js";
import type { SEType, SETemplate, SEGenerationOptions, SEGenerationResult } from "./seTypes.js";
import { loadSETemplates } from "./seTemplates.js";
import { midiToFrequency, frequencyToSemitones } from "../musicUtils.js";

/**
 * Seeded random number generator using Linear Congruential Generator (LCG).
 *
 * Uses the same algorithm as BGM generation for consistency:
 * - Multiplier: 1664525 (from Numerical Recipes)
 * - Increment: 1013904223
 * - Modulus: 2^32 (implicit via unsigned 32-bit overflow)
 *
 * @param seed - Initial seed value (0 is replaced with 1 to avoid degenerate case)
 * @returns Function that returns next random value in [0, 1)
 */
function seedRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) {
    state = 1;
  }
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export class SEGenerator {
  private templates: SETemplate[];

  constructor() {
    this.templates = loadSETemplates();
  }

  /**
   * Generates a sound effect based on type and optional template selection.
   *
   * The generation process:
   * 1. Select template (specific templateId or random from type)
   * 2. Sample parameters from template ranges (duration, pitch, velocity, etc.)
   * 3. Generate event list (noteOn/noteOff pairs with sampled parameters)
   * 4. Return events + metadata for playback
   *
   * @param options - SE generation options (type, seed, templateId, startTime)
   * @returns SE result with events, metadata, and replay options
   */
  generateSE(options: SEGenerationOptions): SEGenerationResult {
    const seed = options.seed ?? Math.floor(Math.random() * 1e9);
    const rng = seedRandom(seed);

    // 1. テンプレート選択
    const template = this.selectTemplate(options, rng);

    // 2. パラメータ具体化
    const params = this.concretizeParameters(template, rng, options.baseFrequency);

    // 3. イベントリスト生成
    const events = this.generateEvents(template, params, options.startTime ?? 0.0);

    const replayOptions: SEGenerationOptions = {
      type: options.type,
      seed,
      startTime: options.startTime ?? 0.0
    };
    if (options.templateId) {
      replayOptions.templateId = options.templateId;
    }
    if (options.baseFrequency !== undefined) {
      replayOptions.baseFrequency = options.baseFrequency;
    }

    return {
      events,
      meta: {
        type: options.type,
        templateId: template.id,
        seed,
        duration: params.duration,
        channels: template.channels,
        replayOptions
      }
    };
  }

  private selectTemplate(options: SEGenerationOptions, rng: () => number): SETemplate {
    // templateId が指定されていれば強制選択
    if (options.templateId) {
      const template = this.templates.find(t => t.id === options.templateId);
      if (!template) throw new Error(`Template not found: ${options.templateId}`);
      return template;
    }

    // type に合致するテンプレートからランダム選択
    const candidates = this.templates.filter(t => t.type === options.type);
    if (candidates.length === 0) {
      throw new Error(`No templates found for type: ${options.type}`);
    }
    return candidates[Math.floor(rng() * candidates.length)];
  }

  private concretizeParameters(template: SETemplate, rng: () => number, baseFrequency?: number) {
    const [minDur, maxDur] = template.durationRange;
    const duration = minDur + rng() * (maxDur - minDur);

    const channelParams: Record<Channel, any> = {} as any;

    // Calculate pitch shift if baseFrequency is provided
    // Pattern A: Shift all pitches to align the reference pitch with baseFrequency
    let pitchShift = 0;
    if (baseFrequency !== undefined) {
      pitchShift = this.calculatePitchShift(template, baseFrequency);
    }

    for (const ch of template.channels) {
      const tplParams = template.channelParams[ch];
      if (!tplParams) continue;
      const baseVelocityRange: [number, number] = tplParams.velocityRange
        ? tplParams.velocityRange
        : ch === "noise"
          ? [88, 118]
          : [96, 122];
      const sampledVelocity = Math.round(
        Math.max(1, Math.min(127, this.sampleFloatRange(baseVelocityRange, rng)))
      );

      // Apply pitch shift to sampled pitches
      const sampledPitchStart = tplParams.pitchStart
        ? this.samplePitchRange(tplParams.pitchStart, rng)
        : undefined;
      const sampledPitchEnd = tplParams.pitchEnd
        ? this.samplePitchRange(tplParams.pitchEnd, rng)
        : undefined;

      channelParams[ch] = {
        pitchStart: sampledPitchStart !== undefined
          ? this.clampMidi(sampledPitchStart + pitchShift)
          : undefined,
        pitchEnd: sampledPitchEnd !== undefined
          ? this.clampMidi(sampledPitchEnd + pitchShift)
          : undefined,
        dutyCycle: tplParams.dutyCycleRange
          ? this.sampleFloatRange([tplParams.dutyCycleRange.min, tplParams.dutyCycleRange.max], rng)
          : tplParams.dutyCycle
            ? tplParams.dutyCycle[Math.floor(rng() * tplParams.dutyCycle.length)]
            : undefined,
        noiseMode: tplParams.noiseMode,
        envelope: tplParams.envelope,
        velocity: sampledVelocity,
        releaseSeconds: tplParams.releaseRange
          ? this.sampleFloatRange(tplParams.releaseRange, rng)
          : undefined
      };

      if (template.pitchSweep?.enabled) {
        const sweepCurveOptions = template.pitchSweep.curveOptions ??
          (template.pitchSweep.curveType ? [template.pitchSweep.curveType] : undefined);
        if (sweepCurveOptions) {
          // Use weighted choice if curveWeights are provided
          channelParams[ch].sweepCurve = this.weightedChoice(
            sweepCurveOptions,
            template.pitchSweep.curveWeights,
            rng
          ) ?? template.pitchSweep.curveType;
        }
        if (template.pitchSweep.durationRange) {
          channelParams[ch].sweepDuration = this.sampleFloatRange(template.pitchSweep.durationRange, rng);
        }
      }
    }

    return { duration, channelParams };
  }

  private samplePitchRange(range: { min: number; max: number }, rng: () => number): number {
    return Math.floor(range.min + rng() * (range.max - range.min + 1));
  }

  private sampleFloatRange(range: [number, number], rng: () => number): number {
    return range[0] + rng() * (range[1] - range[0]);
  }

  /**
   * Select an option from an array using weighted probabilities.
   * @param options - Array of options to choose from
   * @param weights - Record mapping option string to weight (default: equal weights)
   * @param rng - Random number generator
   * @returns Selected option
   */
  private weightedChoice<T>(
    options: T[],
    weights: Record<string, number> | undefined,
    rng: () => number
  ): T {
    if (!weights) {
      // No weights specified, use uniform random selection
      return options[Math.floor(rng() * options.length)];
    }

    const totalWeight = options.reduce((sum, opt) => sum + (weights[String(opt)] || 1), 0);
    let random = rng() * totalWeight;

    for (const opt of options) {
      const weight = weights[String(opt)] || 1;
      if (random < weight) return opt;
      random -= weight;
    }

    return options[options.length - 1];
  }

  private generateEvents(
    template: SETemplate,
    params: any,
    startTime: number
  ): Event[] {
    const events: Event[] = [];

    for (const ch of template.channels) {
      const chParams = params.channelParams[ch];
      const channelEvents = this.generateChannelEvents(
        ch,
        template,
        chParams,
        params,
        startTime
      );
      events.push(...channelEvents);
    }

    // time でソート
    events.sort((a, b) => a.time - b.time);

    return events;
  }

  /**
   * チャンネル別にイベントを生成
   */
  private generateChannelEvents(
    channel: Channel,
    template: SETemplate,
    chParams: any,
    globalParams: any,
    startTime: number
  ): Event[] {
    if (channel.startsWith("square")) {
      return this.generateSquareEvents(channel, template, chParams, globalParams, startTime);
    } else if (channel === "triangle") {
      return this.generateTriangleEvents(channel, template, chParams, globalParams, startTime);
    } else if (channel === "noise") {
      return this.generateNoiseEvents(template, chParams, globalParams, startTime);
    }
    return [];
  }

  /**
   * Square チャンネルのイベント生成
   */
  private generateSquareEvents(
    channel: Channel,
    template: SETemplate,
    chParams: any,
    globalParams: any,
    startTime: number
  ): Event[] {
    const events: Event[] = [];

    // デューティサイクル設定
    if (chParams.dutyCycle !== undefined) {
      events.push({
        time: startTime,
        channel,
        command: "setParam",
        data: { param: "duty", value: chParams.dutyCycle }
      });
    }

    // ノートシーケンス（アルペジオ等）
    if (template.noteSequence) {
      events.push(...this.generateNoteSequence(channel, template, chParams, startTime));
    }
    // ピッチスイープ
    else if (template.pitchSweep?.enabled) {
      events.push(...this.generatePitchSweep(channel, template, chParams, globalParams, startTime));
    }
    // 単純なノート
    else if (chParams.pitchStart !== undefined) {
      events.push(...this.generateSimpleNote(channel, chParams, globalParams.duration, startTime));
    }

    return events;
  }

  /**
   * Triangle チャンネルのイベント生成
   */
  private generateTriangleEvents(
    channel: Channel,
    template: SETemplate,
    chParams: any,
    globalParams: any,
    startTime: number
  ): Event[] {
    const events: Event[] = [];

    // Triangle は square と同様の処理（デューティサイクル設定は不要）
    if (template.noteSequence) {
      events.push(...this.generateNoteSequence(channel, template, chParams, startTime));
    } else if (template.pitchSweep?.enabled) {
      events.push(...this.generatePitchSweep(channel, template, chParams, globalParams, startTime));
    } else if (chParams.pitchStart !== undefined) {
      events.push(...this.generateSimpleNote(channel, chParams, globalParams.duration, startTime));
    }

    return events;
  }

  /**
   * Noise チャンネルのイベント生成
   */
  private generateNoiseEvents(
    template: SETemplate,
    chParams: any,
    globalParams: any,
    startTime: number
  ): Event[] {
    const events: Event[] = [];
    const channel: Channel = "noise";

    // ノイズモード設定
    if (chParams.noiseMode) {
      events.push({
        time: startTime,
        channel,
        command: "setParam",
        data: { param: "noiseMode", value: chParams.noiseMode }
      });
    }

    const velocity = chParams.velocity ?? 110;
    const releaseSeconds = chParams.releaseSeconds ?? globalParams.duration * 0.3;
    const noiseData: any = { velocity };

    // noiseMode を設定
    if (chParams.noiseMode) {
      noiseData.noiseMode = chParams.noiseMode;
    }

    // エンベロープが percussive の場合、duration に基づいて decay/release を設定
    if (chParams.envelope === "percussive") {
      noiseData.decaySeconds = globalParams.duration * 0.7;
      noiseData.releaseSeconds = releaseSeconds;
    } else if (chParams.releaseSeconds) {
      noiseData.releaseSeconds = releaseSeconds;
    }

    events.push({
      time: startTime,
      channel,
      command: "noteOn",
      data: noiseData
    });

    events.push({
      time: startTime + globalParams.duration,
      channel,
      command: "noteOff",
      data: {}
    });

    return events;
  }

  /**
   * ノートシーケンス生成（アルペジオ等）
   */
  private generateNoteSequence(
    channel: Channel,
    template: SETemplate,
    chParams: any,
    startTime: number
  ): Event[] {
    const events: Event[] = [];

    if (!template.noteSequence) return events;

    let currentTime = startTime;
    const basePitch = chParams.pitchStart;
    const velocity = chParams.velocity ?? 110;

    for (let i = 0; i < template.noteSequence.intervals.length; i++) {
      const pitch = basePitch + template.noteSequence.intervals[i];
      const noteDur = template.noteSequence.noteDurations[i];

      events.push({
        time: currentTime,
        channel,
        command: "noteOn",
        data: { midi: pitch, velocity }
      });

      events.push({
        time: currentTime + noteDur,
        channel,
        command: "noteOff",
        data: {}
      });

      currentTime += noteDur;
    }

    return events;
  }

  /**
   * ピッチスイープ生成
   */
  private generatePitchSweep(
    channel: Channel,
    template: SETemplate,
    chParams: any,
    globalParams: any,
    startTime: number
  ): Event[] {
    const events: Event[] = [];

    if (!template.pitchSweep?.enabled) return events;

    const sweepDuration = chParams.sweepDuration ?? globalParams.duration;
    const curve = chParams.sweepCurve ?? template.pitchSweep.curveType ?? "exponential";
    const velocity = chParams.velocity ?? 110;

    events.push({
      time: startTime,
      channel,
      command: "noteOn",
      data: { midi: chParams.pitchStart, velocity }
    });

    // Note: Web Audio demo では pitchBend パラメータとして処理
    events.push({
      time: startTime,
      channel,
      command: "setParam",
      data: {
        param: "pitchBend",
        value: chParams.pitchEnd,
        rampDuration: sweepDuration,
        curve
      }
    });

    events.push({
      time: startTime + sweepDuration,
      channel,
      command: "noteOff",
      data: {}
    });

    return events;
  }

  /**
   * 単純なノート生成（エンベロープのみ）
   */
  private generateSimpleNote(
    channel: Channel,
    chParams: any,
    duration: number,
    startTime: number
  ): Event[] {
    const events: Event[] = [];
    const velocity = chParams.velocity ?? 110;
    const releaseSeconds = chParams.releaseSeconds;

    events.push({
      time: startTime,
      channel,
      command: "noteOn",
      data: { midi: chParams.pitchStart, velocity }
    });

    events.push({
      time: startTime + duration,
      channel,
      command: "noteOff",
      data: releaseSeconds ? { releaseSeconds } : {}
    });

    return events;
  }

  /**
   * Calculate pitch shift needed to align template's reference pitch with baseFrequency.
   *
   * Pattern A implementation: Uses the template's start pitch as reference and calculates
   * the semitone offset needed to shift it to the target baseFrequency.
   *
   * Strategy for finding reference pitch per SE type:
   * - pitch sweep (jump, laser): Use pitchStart as reference
   * - note sequence (coin, powerup, hit): Use first note (pitchStart) as reference
   * - single tone (select, click, synth, tone): Use pitchStart as reference
   * - multi-channel (explosion): Use triangle channel pitch (bass) as reference
   *
   * @param template SE template with pitch configuration
   * @param baseFrequency Target frequency in Hz
   * @returns Semitone shift to apply to all pitches
   */
  private calculatePitchShift(template: SETemplate, baseFrequency: number): number {
    // Find the first channel with pitch information to use as reference
    for (const ch of template.channels) {
      const chParams = template.channelParams[ch];
      if (!chParams?.pitchStart) continue;

      // Use the middle of the pitch range as reference
      // This ensures we shift from a representative pitch rather than edge cases
      const referenceMidi = (chParams.pitchStart.min + chParams.pitchStart.max) / 2;
      const referenceFreq = midiToFrequency(referenceMidi);
      const frequencyRatio = baseFrequency / referenceFreq;
      const shiftSemitones = frequencyToSemitones(frequencyRatio);

      // Round to nearest semitone for discrete pitch shifting
      return Math.round(shiftSemitones);
    }

    // No pitch information found, return 0 (no shift)
    return 0;
  }

  /**
   * Clamp MIDI note number to valid range (0-127).
   *
   * Prevents pitch shifting from producing invalid MIDI values.
   * Also ensures we don't exceed Nyquist frequency (sample rate / 2).
   *
   * @param midi MIDI note number (may be out of range)
   * @returns Clamped MIDI note number
   */
  private clampMidi(midi: number): number {
    return Math.max(0, Math.min(127, Math.round(midi)));
  }
}
