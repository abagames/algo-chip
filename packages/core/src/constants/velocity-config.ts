/**
 * Velocity Configuration Constants
 *
 * This file centralizes all velocity-related magic numbers used throughout
 * the composition pipeline. These values have been tuned for chiptune synthesis
 * and Web Audio playback.
 *
 * References:
 * - REFACTORING_ROADMAP.md P1-3
 * - Chiptune hardware velocity range constraints
 */

/**
 * Global velocity constraints for chiptune synthesis
 */
export const VELOCITY_GLOBAL = {
  /** Minimum safe velocity value for all channels */
  MIN: 20,

  /** Maximum recommended velocity for chiptune hardware (avoids distortion) */
  MAX: 118,

  /** Maximum accent velocity (used for emphasized notes) */
  MAX_ACCENT: 118
} as const;

/**
 * Channel-specific velocity scaling factors
 *
 * These compensate for Web Audio synthesis characteristics and
 * chiptune channel differences.
 */
export const VELOCITY_CHANNEL_SCALE = {
  /** Triangle channel base scale (Web Audio compensation) */
  TRIANGLE_BASE: 0.75,

  /** Triangle non-bass role additional scale */
  TRIANGLE_NON_BASS: 0.9,

  /** Bass role base scale (all channels) */
  BASS_BASE: 0.7,

  /** Bass low-range additional scale (below E3) */
  BASS_LOW_RANGE: 0.85,

  /** Square channel bass role additional scale */
  SQUARE_BASS: 0.82
} as const;

/**
 * MIDI pitch thresholds for velocity adjustments
 */
export const VELOCITY_PITCH_THRESHOLD = {
  /** E3 (MIDI 52) - bass low-range boost threshold */
  BASS_LOW_RANGE: 52
} as const;

/**
 * Bass velocity by texture type
 *
 * Base velocity values for different bass textures.
 * Downbeat and strong beat boosts are added on top of these.
 */
export const VELOCITY_BASS_TEXTURE = {
  broken: 74,
  steady: 70,
  arpeggio: 76,
  /** Default fallback when texture is unknown */
  default: 72
} as const;

/**
 * Bass accent and emphasis boosts
 */
export const VELOCITY_BASS_ACCENT = {
  /** Downbeat (step 0) velocity boost */
  DOWNBEAT_BOOST: 6,

  /** Strong beat (step % 4 === 0) velocity boost */
  STRONG_BEAT_BOOST: 3
} as const;

/**
 * Melody velocity settings
 */
export const VELOCITY_MELODY = {
  /** Pickup note base velocity */
  PICKUP_BASE: 72
} as const;

/**
 * Accompaniment velocity settings
 */
export const VELOCITY_ACCOMPANIMENT = {
  /** Early-start accompaniment note velocity */
  EARLY_START: 52,

  /** Pad sustained note minimum velocity */
  PAD_MIN: 48,

  /** Base velocity scale for arpeggio texture (relative to seed) */
  ARPEGGIO_SCALE: 0.75,

  /** Minimum arpeggio velocity after scaling */
  ARPEGGIO_MIN: 35,

  /** Broken chord velocity scale (relative to seed) */
  BROKEN_SCALE: 0.9,

  /** Minimum broken chord velocity after scaling */
  BROKEN_MIN: 40,

  /** Steady chord velocity scale (relative to seed) */
  STEADY_SCALE: 0.85,

  /** Minimum steady chord velocity after scaling */
  STEADY_MIN: 38
} as const;

/**
 * Technique effect velocity multipliers
 */
export const VELOCITY_TECHNIQUE = {
  /** Echo effect velocity scale */
  ECHO_SCALE: 0.6,

  /** Detune effect velocity scale */
  DETUNE_SCALE: 0.7
} as const;

/**
 * Noise channel velocity configuration
 *
 * Each noise instrument (drum sound) has a fixed velocity optimized
 * for chiptune noise channel characteristics.
 */
export const VELOCITY_NOISE = {
  /** K - Kick drum (long period, index 3) */
  KICK: 120,

  /** T - Tom (long period, index 5) */
  TOM: 116,

  /** N - Low noise (long period, index 8) */
  LOW_NOISE: 112,

  /** S - Snare (short period, index 1) */
  SNARE: 115,

  /** H - Hi-hat (short period, index 0) */
  HIHAT: 118,

  /** O - Open hat (short period, index 2) */
  OPEN_HAT: 114
} as const;
