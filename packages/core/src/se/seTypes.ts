/**
 * Sound Effect Type Definitions
 *
 * This module defines the type system for SE (sound effect) generation. Unlike BGM types
 * (which describe abstract musical structures), SE types describe parameter ranges and
 * concrete audio synthesis instructions.
 *
 * ## Design Philosophy
 *
 * SE types balance three concerns:
 * 1. **Expressiveness**: Templates can describe complex multi-channel effects (e.g., explosion)
 * 2. **Simplicity**: Simple SEs (click, tone) don't require complex configuration
 * 3. **Variety**: Parameter ranges allow infinite variations without template explosion
 *
 * ## Type Hierarchy
 *
 * - **SEType**: High-level category (jump, coin, explosion, etc.)
 * - **SETemplate**: Concrete template with parameter ranges
 * - **SEGenerationOptions**: User-facing API for SE generation
 * - **SEGenerationResult**: Output format compatible with BGM Event[]
 *
 * ## Channel Parameter Architecture
 *
 * Templates use a channel-indexed structure (channelParams[channel]) because:
 * - Multi-channel SEs (explosion = noise + triangle) need independent parameters
 * - Optional parameters allow sparse specification (only define what's needed)
 * - Type safety ensures only valid channel parameters are set
 *
 * ## Pitch Range vs Note Sequence
 *
 * Two approaches for pitch specification:
 * - **Pitch ranges** (pitchStart, pitchEnd): For sweeps and sustained tones
 * - **Note sequences** (intervals, noteDurations): For arpeggios and multi-note SEs
 *
 * This dual approach handles both "sliding" SEs (laser, jump) and "discrete" SEs (coin, powerup).
 */

import type { Event, Channel } from "../types.js";

/**
 * SE type categories representing common game sound archetypes.
 *
 * These categories were chosen based on:
 * - Frequency in retro games (jump, coin, hit are near-universal)
 * - Distinct synthesis characteristics (each requires different parameter profiles)
 * - Gameplay feedback roles (powerup = positive, hit = negative, etc.)
 */
export type SEType = "jump" | "coin" | "explosion" | "hit" | "powerup" | "select" | "laser" | "click" | "synth" | "tone";

/**
 * Pitch range specification for sweeps and sustained tones.
 *
 * Uses MIDI note numbers (0-127) for:
 * - Compatibility with BGM pitch system
 * - Precise frequency control (semitone resolution)
 * - Easy transposition (±12 = octave shift)
 */
export interface PitchRange {
  min: number; // Minimum MIDI note number (e.g., 60 = middle C)
  max: number; // Maximum MIDI note number (e.g., 84 = C6)
}

/**
 * SE template definition with parameter ranges.
 *
 * Templates are hand-authored in se-templates.json and describe:
 * - Which channels to use (square1, square2, triangle, noise)
 * - Parameter ranges to sample from (pitch, duration, velocity)
 * - Optional features (pitch sweep, note sequences, envelope)
 *
 * ## Why Templates Instead of Procedural Generation?
 *
 * Templates provide quality control:
 * - Designers can ensure each SE "sounds right" before shipping
 * - Parameter ranges are bounded to avoid degenerate cases (too short, too quiet, etc.)
 * - Specific SE types can use specialized features (pitch sweep for jump, noise for explosion)
 *
 * ## Template Variations
 *
 * Each SE type has 2+ template variations (SE_JUMP_01, SE_JUMP_02) to provide:
 * - Different "flavors" of the same SE (bright jump vs dark jump)
 * - Variety when multiple instances occur in quick succession
 * - A/B testing options for game designers
 */
export interface SETemplate {
  id: string;                    // Unique identifier: "SE_JUMP_01"
  type: SEType;                  // Category: "jump"
  description: string;           // Human-readable description (for UI/debugging)
  channels: Channel[];           // Channels to use: ["square1"] or ["noise", "triangle"]
  durationRange: [number, number]; // [min, max] in seconds (e.g., [0.10, 0.15])

  /**
   * Per-channel parameter configuration.
   *
   * Each channel can have independent settings. For multi-channel SEs (explosion),
   * channels are layered (noise burst + triangle bass sweep play simultaneously).
   */
  channelParams: {
    [ch in Channel]?: {
      /** Starting pitch range (for sweeps/sustained tones) */
      pitchStart?: PitchRange;
      /** Ending pitch range (for sweeps, omitted for sustained tones) */
      pitchEnd?: PitchRange;
      /** Discrete duty cycle options (legacy, for backward compatibility) */
      dutyCycle?: number[];      // [0.25, 0.5] → randomly pick one
      /** Continuous duty cycle range (newer, more flexible) */
      dutyCycleRange?: { min: number; max: number }; // Sample from [min, max]
      /** Noise mode (only for noise channel) */
      noiseMode?: "short" | "long"; // short = high-frequency, long = low-frequency
      /** Envelope shape */
      envelope?: "percussive" | "sustained";
      /** Velocity (volume) range */
      velocityRange?: [number, number];
      /** Release time range (envelope decay duration) */
      releaseRange?: [number, number];
    };
  };

  /**
   * Note sequence for arpeggio-style SEs (coin, powerup).
   *
   * Defines discrete note intervals and durations rather than continuous sweeps.
   * Example: coin = [0, 4, 7] = root, major third, fifth (major chord arpeggio)
   */
  noteSequence?: {
    intervals: number[];         // Semitone intervals from base pitch: [0, 4, 7]
    noteDurations: number[];     // Duration per note in seconds: [0.05, 0.05, 0.08]
  };

  /**
   * Pitch sweep configuration for gliding SEs (jump, laser).
   *
   * Sweeps interpolate pitch from start to end over the SE duration.
   * Curve types affect perceptual character:
   * - linear: Constant Hz/second change (sounds mechanical)
   * - exponential: Constant semitone/second change (sounds more natural)
   */
  pitchSweep?: {
    enabled: boolean;
    /** Legacy: single curve type */
    curveType?: "linear" | "exponential";
    /** Newer: multiple curve options for variety */
    curveOptions?: Array<"linear" | "exponential">;
    /** Weighted curve selection (e.g., {exponential: 0.8, linear: 0.2}) */
    curveWeights?: Record<string, number>;
    /** Sweep duration range (can be shorter than total SE duration) */
    durationRange?: [number, number];
  };
}

/**
 * SE generation options (user-facing API).
 *
 * Minimal API surface for ease of use:
 * - Required: type (what SE to generate)
 * - Optional: seed (for reproducibility), templateId (for specific template), startTime (for timing)
 * - Optional: baseFrequency (pitch shift all notes to target frequency in Hz)
 */
export interface SEGenerationOptions {
  type: SEType;                  // Required: SE category
  seed?: number;                 // Optional: RNG seed (undefined = random)
  templateId?: string;           // Optional: Force specific template (undefined = random from type)
  startTime?: number;            // Optional: Event time offset in seconds (default: 0.0)
  baseFrequency?: number;        // Optional: Base frequency in Hz (e.g., 440.0 = A4) to shift all pitches to
}

/**
 * SE generation result (output format).
 *
 * Compatible with BGM Event[] format so SEs and BGM can be mixed/layered.
 * Includes metadata for debugging, visualization, and replay.
 */
export interface SEGenerationResult {
  /** Event list compatible with BGM playback system */
  events: Event[];
  /** SE metadata for debugging and replay */
  meta: {
    type: SEType;                // Original SE type
    templateId: string;          // Selected template ID
    seed: number;                // Seed used (for reproducibility)
    duration: number;            // Actual SE duration in seconds
    channels: Channel[];         // Channels used
    replayOptions: SEGenerationOptions; // Options to regenerate identical SE
  };
}
