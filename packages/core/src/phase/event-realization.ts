import {
  PipelineCompositionOptions,
  StructurePlanResult,
  MotifSelectionResult,
  EventRealizationResult,
  TimedEvent,
  NoteOnEventData,
  NoteOffEventData,
  MidiNote,
  StyleIntent,
  TextureProfile,
  TempoSetting,
  SectionDefinition,
  Voice
} from "../types.js";
import {
  BEATS_PER_MEASURE,
  chordRootToMidi,
  ensureConsonantPitch,
  getChordIntervals,
  quantizeMidiToChord,
  resolveChordAtBeat
} from "../musicUtils.js";

import {
  VELOCITY_GLOBAL,
  VELOCITY_CHANNEL_SCALE,
  VELOCITY_PITCH_THRESHOLD,
  VELOCITY_ACCOMPANIMENT,
  VELOCITY_TECHNIQUE,
  VELOCITY_NOISE
} from "../constants/velocity-config.js";

const RNG_SEED = 42;
const NOISE_MAX_DURATION_BEATS = 0.5;
const NOISE_MIN_RELEASE_SECONDS = 0.015;
const NOISE_MAX_RELEASE_SECONDS = 0.12;
const NOISE_STACK_OFFSET = 1 / 16;  // Changed from 1/64 to 1/16 beat for safer collision avoidance

// ── Kick body (triangle layer) ──────────────────────────────────────────────
// Short pitch-falling triangle note layered with kick noise for NES "body" feel.
const KICK_BODY_DURATION_SECONDS = 0.012;  // 12 ms body
const KICK_BODY_START_MIDI = 43;            // G2
const KICK_BODY_END_MIDI = 36;              // C2
const KICK_BODY_VELOCITY = 75;
const BEAT_EPSILON = 1e-9;  // ensures kick body sorts after same-beat bass noteOn

// ── Period fall: mid-hit noise period shift giving pitch descent ────────────
// Per instrument, how many NOISE_PERIOD_TABLE steps to shift upward (lower freq)
// starting from the instrument's base periodIndex. Applied at 40 % of hit duration.
const NOISE_PERIOD_FALL_STEPS: Partial<Record<string, number>> = {
  S: 2,  // snare: e.g. idx 1 → 3  (~14 kHz → ~3.5 kHz)
  T: 3,  // tom:   e.g. idx 5 → 8  (~1.2 kHz → ~554 Hz)
};

// Arpeggio generation probabilities and thresholds (score.md:134)
interface ArpeggioProfile {
  reverseProbability: number;
  sustainProbability: number;
  densityThresholds: {
    sparse: number;
    normal: number;
  };
}

type NoiseModeLabel = "long" | "short";

interface NoiseInstrumentConfig {
  mode: NoiseModeLabel;
  spec: "long_period" | "short_period";
  periodIndex: number;
  releaseRange: [number, number];
  velocity: number;
  amplitude: number;
}

const NOISE_MODE_CONFIG: Record<string, NoiseInstrumentConfig> = {
  K: { mode: "long", spec: "long_period", periodIndex: 3, releaseRange: [0.045, 0.075], velocity: VELOCITY_NOISE.KICK, amplitude: 1.0 },
  T: { mode: "long", spec: "long_period", periodIndex: 5, releaseRange: [0.05, 0.09], velocity: VELOCITY_NOISE.TOM, amplitude: 0.92 },
  N: { mode: "long", spec: "long_period", periodIndex: 8, releaseRange: [0.06, 0.1], velocity: VELOCITY_NOISE.LOW_NOISE, amplitude: 0.88 },
  S: { mode: "short", spec: "short_period", periodIndex: 1, releaseRange: [0.02, 0.045], velocity: VELOCITY_NOISE.SNARE, amplitude: 0.9 },
  H: { mode: "short", spec: "short_period", periodIndex: 0, releaseRange: [0.015, 0.03], velocity: VELOCITY_NOISE.HIHAT, amplitude: 0.86 },
  O: { mode: "short", spec: "short_period", periodIndex: 2, releaseRange: [0.03, 0.055], velocity: VELOCITY_NOISE.OPEN_HAT, amplitude: 0.94 }
};;

const PORTAMENTO_MAX_INTERVAL = 5;
const PORTAMENTO_DURATION_SECONDS = 0.06;

function createRng(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function adjustVelocityForChannel(
  channel: TimedEvent["channel"],
  role: string,
  midi: number,
  velocity: number
): number {
  let scale = 1;

  const isBassRole = role === "bass" || role === "bassAlt";
  const isMelodyRole = role === "melody" || role === "melodyAlt";
  const isSquare = channel === "square1" || channel === "square2";

  // Apply bass role scaling
  if (isBassRole) {
    scale *= VELOCITY_CHANNEL_SCALE.BASS_BASE;
    if (midi < VELOCITY_PITCH_THRESHOLD.BASS_LOW_RANGE) {
      scale *= VELOCITY_CHANNEL_SCALE.BASS_LOW_RANGE;
    }
  }

  // Apply triangle channel scaling
  if (channel === "triangle") {
    scale *= VELOCITY_CHANNEL_SCALE.TRIANGLE_BASE;
    if (!isBassRole) {
      scale *= VELOCITY_CHANNEL_SCALE.TRIANGLE_NON_BASS;
    }
  }

  // Apply square bass scaling
  if (isSquare && isBassRole) {
    scale *= VELOCITY_CHANNEL_SCALE.SQUARE_BASS;
  }

  // Apply melody channel scaling
  if (isSquare && isMelodyRole) {
    scale *= VELOCITY_CHANNEL_SCALE.MELODY_CHANNEL_SCALE;
  }

  const scaled = Math.round(velocity * scale);
  return Math.max(VELOCITY_GLOBAL.MIN, Math.min(VELOCITY_GLOBAL.MAX_ACCENT, scaled));
}

function resolveArpeggioProfile(styleIntent: StyleIntent, texture: TextureProfile | undefined): ArpeggioProfile {
  const profile: ArpeggioProfile = {
    reverseProbability: 0.5,
    sustainProbability: 0.2,
    densityThresholds: { sparse: 0.45, normal: 0.85 }
  };

  if (styleIntent.textureFocus) {
    profile.reverseProbability = 0.35;
    profile.sustainProbability = 0.12;
    profile.densityThresholds = { sparse: 0.3, normal: 0.7 };
  }
  if (styleIntent.loopCentric) {
    profile.sustainProbability = Math.min(0.35, profile.sustainProbability + 0.1);
    profile.densityThresholds = {
      sparse: Math.min(0.5, profile.densityThresholds.sparse + 0.05),
      normal: Math.min(0.95, profile.densityThresholds.normal + 0.05)
    };
  }
  if (texture === "arpeggio" && styleIntent.gradualBuild) {
    profile.densityThresholds = { sparse: 0.25, normal: 0.65 };
  }

  return profile;
}

/**
 * Determine if portamento should be applied to a note transition.
 * Uses style-based fixed probabilities instead of complex parameter-dependent calculation.
 * 
 * @param note - Current note
 * @param next - Next note in sequence
 * @param noteDuration - Duration of current note in beats
 * @param styleIntent - Style intent flags
 * @param rng - Random number generator
 * @returns true if portamento should be applied
 */
function shouldApplyPortamento(
  note: MidiNote,
  next: MidiNote,
  noteDuration: number,
  styleIntent: StyleIntent,
  rng: () => number
): boolean {
  const interval = Math.abs(next.midi - note.midi);
  const gap = next.startBeat - (note.startBeat + noteDuration);

  // Basic eligibility checks
  const eligibleInterval = interval > 0 && interval <= PORTAMENTO_MAX_INTERVAL;
  const consecutive = gap >= -1e-3 && gap <= 0.5;
  const sufficientDuration = noteDuration >= 0.5;

  if (!eligibleInterval || !consecutive || !sufficientDuration) {
    return false;
  }

  // Style-based probability
  let probability = 0.15; // default

  if (styleIntent.atmosPad) {
    probability = 0.4;
  } else if (styleIntent.loopCentric && styleIntent.textureFocus) {
    // lofi chillhop style
    probability = 0.35;
  } else if (styleIntent.gradualBuild && styleIntent.breakInsertion) {
    // progressive house style
    probability = 0.25;
  }

  return rng() < probability;
}

function computePortamentoDurationSeconds(
  baseDuration: number,
  tempo: TempoSetting,
  interval: number
): number {
  let duration = baseDuration;
  if (tempo === "slow") {
    duration += 0.02;
  } else if (tempo === "fast") {
    duration -= 0.015;
  }
  if (interval >= 4) {
    duration += 0.01;
  }
  return Math.max(0.02, Math.min(0.12, duration));
}

/**
 * Whitelist-based noise stacking permission (REFACTORING_ROADMAP.md P0-3)
 * Only explicitly safe instrument pairs are allowed to stack closely
 */
function allowsNoiseStacking(previousInstrument: string | null, currentInstrument: string): boolean {
  if (!previousInstrument) {
    return false;
  }
  const combo = `${previousInstrument}|${currentInstrument}`;
  // Whitelist: Only hi-hat family transitions are safe to stack
  return combo === "H|H" || combo === "H|O" || combo === "O|H";
}

function resolveNoiseRelease(
  config: NoiseInstrumentConfig | undefined,
  styleIntent: StyleIntent,
  rng: () => number
): number {
  const range = config?.releaseRange ?? [NOISE_MIN_RELEASE_SECONDS, NOISE_MAX_RELEASE_SECONDS];
  const base = range[0] + rng() * Math.max(0, range[1] - range[0]);
  if (styleIntent.percussiveLayering) {
    return Math.max(range[0], base * 0.85);
  }
  if (styleIntent.gradualBuild) {
    return Math.min(range[1], base * 1.05);
  }
  return base;
}

type NoteEventPayload = NoteOnEventData & {
  midi: number;
  velocity: number;
};

// ── Drum helper functions ──────────────────────────────────────────────────

/**
 * Returns true if the triangle channel has an active note at beatTime.
 * Used to gate the kick body layer so it never creates a voice-allocation overlap.
 */
function triangleIsActiveAtBeat(
  beatTime: number,
  phase1: StructurePlanResult,
  phase2: MotifSelectionResult
): boolean {
  const triVoices = phase1.voiceArrangement.voices.filter(v => v.channel === "triangle");
  for (const triVoice of triVoices) {
    const triTrack = phase2.tracks.find(t => t.role === triVoice.role);
    if (!triTrack) continue;
    if (triTrack.notes.some(n => n.startBeat <= beatTime && n.startBeat + n.durationBeats > beatTime)) {
      return true;
    }
  }
  return false;
}

/**
 * Finds the last noise-channel noteOff event in the event array (reverse scan).
 */
function findLastNoiseNoteOff(events: TimedEvent[]): TimedEvent<"noteOff"> | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.channel === "noise" && ev.command === "noteOff") {
      return ev as TimedEvent<"noteOff">;
    }
  }
  return undefined;
}

/**
 * Returns true when the beat falls on a strong snare position (beat 2 or 4
 * within a 4-beat measure, within ±0.1 beat tolerance).
 * These accent positions receive the "heavy" long-LFSR snare mode (Case 5).
 */
function isSnareAccentBeat(beatTime: number): boolean {
  const beatInMeasure = ((beatTime % BEATS_PER_MEASURE) + BEATS_PER_MEASURE) % BEATS_PER_MEASURE;
  return Math.abs(beatInMeasure - 1) < 0.1 || Math.abs(beatInMeasure - 3) < 0.1;
}

function deriveArpeggioPattern(chordIntervals: number[]): number[] {
  const cycle = chordIntervals.length > 0 ? chordIntervals : [0, 4, 7];
  const pattern: number[] = [];
  for (let i = 0; i < 4; i++) {
    const baseInterval = cycle[i % cycle.length];
    const octaveOffset = Math.floor(i / cycle.length) * 12;
    pattern.push(baseInterval + octaveOffset);
  }
  return pattern;
}

function maybeReversePattern(rng: () => number, pattern: number[], probability: number): number[] {
  return rng() < probability ? [...pattern].reverse() : pattern;
}

function buildFastArpeggioNotes(
  seed: MidiNote,
  chord: string,
  rng: () => number,
  styleIntent: StyleIntent,
  texture: TextureProfile | undefined
): MidiNote[] {
  const profile = resolveArpeggioProfile(styleIntent, texture);
  const baseVelocity = Math.max(VELOCITY_ACCOMPANIMENT.PAD_MIN, Math.round(seed.velocity * VELOCITY_ACCOMPANIMENT.ARPEGGIO_SCALE));
  if (rng() < profile.sustainProbability) {
    // Probabilistically sustain instead of arpeggiating
    const sustainedMidi = ensureConsonantPitch(seed.midi, chord, seed.midi);
    return [
      {
        ...seed,
        startBeat: seed.startBeat,
        durationBeats: Math.max(seed.durationBeats, 1),
        velocity: baseVelocity,
        midi: sustainedMidi
      }
    ];
  }

  const pattern = maybeReversePattern(
    rng,
    deriveArpeggioPattern(getChordIntervals(chord)),
    profile.reverseProbability
  );
  const densityRoll = rng();
  let subdivisions: number;
  if (densityRoll < profile.densityThresholds.sparse) {
    subdivisions = 2;  // 8th notes
  } else if (densityRoll < profile.densityThresholds.normal) {
    subdivisions = 4;  // 16th notes as per spec
  } else {
    subdivisions = 1;  // held note
  }

  const stepDuration = subdivisions === 4 ? 0.25 : subdivisions === 2 ? 0.5 : Math.max(seed.durationBeats, 1);

  const notes: MidiNote[] = [];
  for (let step = 0; step < subdivisions; step++) {
    const offsetBeat = seed.startBeat + stepDuration * step;
    const interval = pattern[step % pattern.length];
    const candidate = quantizeMidiToChord(seed.midi + interval, chord);
    const midi = ensureConsonantPitch(candidate, chord, seed.midi);
    notes.push({
      channelRole: "accompaniment",
      startBeat: offsetBeat,
      durationBeats: stepDuration,
      degree: seed.degree,
      velocity: baseVelocity,
      sectionId: seed.sectionId,
      midi
    });
  }
  return notes;
}

function buildBrokenChordNotes(seeds: MidiNote[]): MidiNote[] {
  const notes: MidiNote[] = [];
  for (const seed of seeds) {
    const offsets = [0, 0.5];
    for (const offset of offsets) {
      notes.push({
        ...seed,
        startBeat: seed.startBeat + offset,
        durationBeats: 0.5,
        velocity: Math.max(VELOCITY_ACCOMPANIMENT.PAD_MIN, Math.round(seed.velocity * VELOCITY_ACCOMPANIMENT.BROKEN_SCALE))
      });
    }
  }
  return notes;
}

function buildSteadyChordNotes(seeds: MidiNote[]): MidiNote[] {
  return seeds.map((seed) => ({
    ...seed,
    durationBeats: seed.durationBeats >= 1 ? seed.durationBeats : 1,
    velocity: Math.max(VELOCITY_ACCOMPANIMENT.PAD_MIN, Math.round(seed.velocity * VELOCITY_ACCOMPANIMENT.STEADY_SCALE))
  }));
}

/**
 * Context object containing shared state for event realization.
 * Groups common parameters to reduce function argument count.
 */
interface RealizationContext {
  rng: () => number;
  sectionById: Map<string, SectionDefinition>;
  totalBeats: number;
  styleIntent: StyleIntent;
  tempoSetting: TempoSetting;
  phase1: StructurePlanResult;
  phase2: MotifSelectionResult;
}

/**
 * Creates a RealizationContext from composition options and phase results.
 */
function createRealizationContext(
  options: PipelineCompositionOptions,
  phase1: StructurePlanResult,
  phase2: MotifSelectionResult
): RealizationContext {
  return {
    rng: createRng(options.seed ?? RNG_SEED),
    sectionById: new Map(phase1.sections.map((section) => [section.id, section])),
    totalBeats: (options.lengthInMeasures ?? 32) * BEATS_PER_MEASURE,
    styleIntent: phase1.styleIntent,
    tempoSetting: options.tempo ?? "medium",
    phase1,
    phase2
  };
}

/**
 * Realizes melody track with portamento support.
 * Handles melody and melodyAlt roles.
 */
function realizeMelodyTrack(
  track: MotifSelectionResult["tracks"][number],
  voiceConfig: Voice,
  context: RealizationContext
): TimedEvent[] {
  const events: TimedEvent[] = [];
  const channel = voiceConfig.channel;

  for (let i = 0; i < track.notes.length; i++) {
    const note = track.notes[i];
    const sectionMeta = context.sectionById.get(note.sectionId);
    const measureInSection = sectionMeta
      ? Math.max(0, Math.floor(note.startBeat / BEATS_PER_MEASURE) - sectionMeta.startMeasure)
      : 0;

    const payload: NoteEventPayload = {
      midi: note.midi,
      velocity: adjustVelocityForChannel(channel, voiceConfig.role, note.midi, note.velocity)
    };

    // Apply portamento if eligible
    const next = track.notes[i + 1];
    if (next && shouldApplyPortamento(note, next, note.durationBeats, context.styleIntent, context.rng)) {
      const interval = Math.abs(next.midi - note.midi);
      payload.slide = {
        targetMidi: next.midi,
        durationSeconds: computePortamentoDurationSeconds(
          PORTAMENTO_DURATION_SECONDS,
          context.tempoSetting,
          interval
        )
      };
    }

    pushNote(events, note.startBeat, note.durationBeats, channel, payload, context.totalBeats);
  }

  return events;
}

/**
 * Realizes bass track with simple note generation.
 * Handles bass and bassAlt roles.
 */
function realizeBassTrack(
  track: MotifSelectionResult["tracks"][number],
  voiceConfig: Voice,
  context: RealizationContext
): TimedEvent[] {
  const events: TimedEvent[] = [];
  const channel = voiceConfig.channel;

  for (const note of track.notes) {
    pushNote(events, note.startBeat, note.durationBeats, channel, {
      midi: note.midi,
      velocity: adjustVelocityForChannel(channel, voiceConfig.role, note.midi, note.velocity)
    }, context.totalBeats);
  }

  return events;
}

/**
 * Realizes accompaniment track with texture techniques.
 * Handles accompaniment and pad roles.
 */
function realizeAccompanimentTrack(
  track: MotifSelectionResult["tracks"][number],
  voiceConfig: Voice,
  context: RealizationContext
): TimedEvent[] {
  const events: TimedEvent[] = [];
  const channel = voiceConfig.channel;

  // Group seeds by measure
  const seedsByMeasure = new Map<number, MidiNote[]>();
  for (const seed of track.notes) {
    const measure = Math.floor(seed.startBeat / BEATS_PER_MEASURE);
    const bucket = seedsByMeasure.get(measure) ?? [];
    bucket.push(seed);
    seedsByMeasure.set(measure, bucket);
  }

  const sortedMeasures = Array.from(seedsByMeasure.keys()).sort((a, b) => a - b);

  for (const measure of sortedMeasures) {
    const seeds = seedsByMeasure.get(measure)!;
    const sectionMeta = seeds.length ? context.sectionById.get(seeds[0].sectionId) : undefined;
    const texture = sectionMeta?.texture ?? "steady";
    const chord = resolveChordAtBeat(context.phase1, seeds[0]?.startBeat ?? measure * BEATS_PER_MEASURE);

    // Process notes based on texture
    let processedNotes: MidiNote[];
    if (texture === "arpeggio") {
      processedNotes = seeds.flatMap((seed) =>
        buildFastArpeggioNotes(seed, chord, context.rng, context.styleIntent, sectionMeta?.texture)
      );
    } else if (texture === "broken") {
      processedNotes = buildBrokenChordNotes(seeds);
    } else {
      processedNotes = buildSteadyChordNotes(seeds);
    }

    // Apply echo and detune techniques
    const echoNotes: MidiNote[] = [];
    const detuneNotes: MidiNote[] = [];
    for (const note of processedNotes) {
      if (context.rng() < context.phase1.techniqueStrategy.echoProbability) {
        echoNotes.push({
          ...note,
          startBeat: note.startBeat + 0.25,
          velocity: Math.round(note.velocity * VELOCITY_TECHNIQUE.ECHO_SCALE)
        });
      }
      if (context.rng() < context.phase1.techniqueStrategy.detuneProbability) {
        detuneNotes.push({
          ...note,
          startBeat: note.startBeat,
          velocity: Math.round(note.velocity * VELOCITY_TECHNIQUE.DETUNE_SCALE),
          midi: note.midi,
          detuneCents: 12
        });
      }
    }

    // Ensure consonance and push events
    const allNotes = [...processedNotes, ...echoNotes, ...detuneNotes].map((note) => {
      const chord = resolveChordAtBeat(context.phase1, note.startBeat);
      const melodyTrack = context.phase2.tracks.find(t => t.role === "melody");
      const reference = melodyTrack ? findMelodyOverlap(note.startBeat, melodyTrack.notes) : undefined;
      const midi = ensureConsonantPitch(note.midi, chord, reference?.midi ?? note.midi);
      return { ...note, midi };
    });

    for (const note of allNotes) {
      pushNote(events, note.startBeat, note.durationBeats, channel, {
        midi: note.midi,
        velocity: adjustVelocityForChannel(channel, voiceConfig.role, note.midi, note.velocity),
        detuneCents: note.detuneCents
      } as NoteEventPayload, context.totalBeats);
    }
  }

  return events;
}

/**
 * Realizes drum events. Outputs noise events plus optional triangle kick-body
 * layers (NES layered kick technique).
 *
 * Improvements applied:
 *  1. Triangle kick-body layer (noise + pitch-falling triangle) when triangle is free
 *  2. 4-bit envelope quantisation is handled in the worklet
 *  3. Mid-hit period fall setParam for S/T (pitch-descending snare/tom)
 *  4. O→H snap-close: open-hat gets a rapid noteOff when H follows
 *  5. Accent-beat snare uses long LFSR mode for heavier impact
 */
function realizeDrumEvents(
  drums: MotifSelectionResult["drums"],
  context: RealizationContext
): TimedEvent[] {
  const drumEvents: TimedEvent[] = [];
  // Index of the first event belonging to the last noise hit (for safe splice-based cancellation)
  let lastNoteStartIndex = -1;
  let lastNoiseOffBeat: number | null = null;
  let lastNoiseOnBeat: number | null = null;
  let lastNoiseInstrument: string | null = null;

  const sortedDrums = [...drums].sort((a, b) => a.startBeat - b.startBeat);

  for (const hit of sortedDrums) {
    let adjustedStart = hit.startBeat;

    const config = NOISE_MODE_CONFIG[hit.instrument];
    if (!config) continue;

    const canStack = allowsNoiseStacking(lastNoiseInstrument, hit.instrument);
    const stackOffset = canStack ? 0 : NOISE_STACK_OFFSET;

    // Use <= to catch exact collisions even when stackOffset=0 (stackable instruments)
    if (lastNoiseOnBeat !== null && adjustedStart - lastNoiseOnBeat <= stackOffset) {
      adjustedStart = lastNoiseOnBeat + Math.max(stackOffset, NOISE_STACK_OFFSET);
    }

    const releaseSec = resolveNoiseRelease(config, context.styleIntent, context.rng);
    const decaySec = Math.max(0.01, Math.min(releaseSec * 0.7, releaseSec));
    const clampedDuration = Math.min(hit.durationBeats, NOISE_MAX_DURATION_BEATS);

    if (adjustedStart >= context.totalBeats) continue;

    // ── Collision handling ──────────────────────────────────────────────────
    if (lastNoiseOffBeat !== null && adjustedStart < lastNoiseOffBeat) {
      if (canStack && lastNoteStartIndex >= 0) {
        // Move the open-hat noteOff up; for O→H apply snap-close (Case 4)
        const lastNoteOff = findLastNoiseNoteOff(drumEvents);
        if (lastNoteOff) {
          lastNoteOff.beatTime = adjustedStart;
          if (hit.instrument === "H" && lastNoiseInstrument === "O") {
            (lastNoteOff.data as NoteOffEventData).releaseSeconds = 0.003;
          }
        }
        lastNoiseOffBeat = adjustedStart;
      } else if (lastNoteStartIndex >= 0) {
        // Remove ALL events added for the previous noise hit (including any
        // setParam period-fall events that sit between noteOn and noteOff)
        drumEvents.splice(lastNoteStartIndex);
        lastNoteStartIndex = -1;
        lastNoiseOffBeat = null;
        lastNoiseOnBeat = null;
      }
    }

    // Record where this hit's events begin (for safe cancellation above)
    lastNoteStartIndex = drumEvents.length;

    // ── Case 5: Accent-beat snare uses long LFSR for heavier impact ─────────
    let effectiveMode: NoiseModeLabel = config.mode;
    let effectivePeriodIndex = config.periodIndex;
    let effectiveAmplitude = config.amplitude;
    if (hit.instrument === "S" && isSnareAccentBeat(adjustedStart)) {
      effectiveMode = "long";
      effectivePeriodIndex = 4;  // ~1.75 kHz – deep snare body
      effectiveAmplitude = Math.min(1.0, config.amplitude * 1.05);
    }

    // ── Main noise noteOn (LFSR mode fixed: use config.mode, not config.spec) ─
    drumEvents.push({
      beatTime: adjustedStart,
      channel: "noise",
      command: "noteOn",
      data: {
        noiseMode: config.spec,          // descriptive label (kept for compat)
        mode: effectiveMode,             // actual "long"|"short" LFSR selector
        velocity: config.velocity,
        amplitude: effectiveAmplitude,
        releaseSeconds: releaseSec,
        decaySeconds: decaySec,
        periodIndex: effectivePeriodIndex,
        clockDivider: effectivePeriodIndex
      }
    });

    const offBeat = Math.min(adjustedStart + clampedDuration, context.totalBeats);

    // ── Case 3: Mid-hit period fall (snare / tom pitch descent) ─────────────
    const fallSteps = NOISE_PERIOD_FALL_STEPS[hit.instrument];
    if (fallSteps !== undefined) {
      const fallIndex = Math.min(15, effectivePeriodIndex + fallSteps);
      const fallBeat = adjustedStart + (offBeat - adjustedStart) * 0.4;
      if (fallBeat < offBeat) {
        drumEvents.push({
          beatTime: fallBeat,
          channel: "noise",
          command: "setParam",
          data: { param: "periodIndex", value: fallIndex }
        });
      }
    }

    // ── Noise noteOff ────────────────────────────────────────────────────────
    // Keep data: {} so the loop-integrity checker does not count this as a
    // late-release event.  releaseSeconds is added to the O→H snap-close via
    // mutation in the collision-handling block above.
    drumEvents.push({
      beatTime: offBeat,
      channel: "noise",
      command: "noteOff",
      data: {}
    });

    // ── Case 1: Kick body — short pitch-falling triangle note ────────────────
    // Only when triangle is genuinely free (no voice-allocation overlap)
    if (hit.instrument === "K" && !triangleIsActiveAtBeat(adjustedStart, context.phase1, context.phase2)) {
      const kickBodyBeats = KICK_BODY_DURATION_SECONDS * context.phase1.bpm / 60;
      const kickBodyOff = Math.min(adjustedStart + kickBodyBeats, context.totalBeats);
      if (kickBodyOff > adjustedStart) {
        drumEvents.push({
          beatTime: adjustedStart + BEAT_EPSILON,  // fires after same-beat bass noteOn
          channel: "triangle",
          command: "noteOn",
          data: {
            midi: KICK_BODY_START_MIDI,
            velocity: KICK_BODY_VELOCITY,
            slide: {
              targetMidi: KICK_BODY_END_MIDI,
              durationSeconds: KICK_BODY_DURATION_SECONDS * 0.75
            }
          }
        });
        drumEvents.push({
          beatTime: kickBodyOff + BEAT_EPSILON,
          channel: "triangle",
          command: "noteOff",
          data: {}
        });
      }
    }

    lastNoiseOffBeat = offBeat;
    lastNoiseOnBeat = adjustedStart;
    lastNoiseInstrument = hit.instrument;
  }

  return drumEvents;
}

/**
 * Routes track realization based on voice role.
 */
function realizeTrack(
  track: MotifSelectionResult["tracks"][number],
  voiceConfig: Voice,
  context: RealizationContext
): TimedEvent[] {
  const role = voiceConfig.role;

  if (role === "melody" || role === "melodyAlt") {
    return realizeMelodyTrack(track, voiceConfig, context);
  } else if (role === "bass" || role === "bassAlt") {
    return realizeBassTrack(track, voiceConfig, context);
  } else if (role === "accompaniment" || role === "pad") {
    return realizeAccompanimentTrack(track, voiceConfig, context);
  }

  return [];
}

export function realizeEvents(
  options: PipelineCompositionOptions,
  phase1: StructurePlanResult,
  phase2: MotifSelectionResult
): EventRealizationResult {
  const context = createRealizationContext(options, phase1, phase2);
  const events: TimedEvent[] = [];

  // Process each track based on its role
  for (const track of phase2.tracks) {
    const voiceConfig = phase1.voiceArrangement.voices.find(v => v.role === track.role);
    if (!voiceConfig) {
      continue; // Skip tracks without voice config
    }

    const trackEvents = realizeTrack(track, voiceConfig, context);
    events.push(...trackEvents);
  }

  // Generate drum events
  const drumEvents = realizeDrumEvents(phase2.drums, context);
  events.push(...drumEvents);

  // Sort all events by beat time
  events.sort((a, b) => a.beatTime - b.beatTime);

  const diagnostics = computeVoiceAllocation(events);
  return { events, diagnostics };
}

function pushNote(
  events: TimedEvent[],
  startBeat: number,
  durationBeats: number,
  channel: TimedEvent["channel"],
  data: NoteEventPayload,
  totalBeats: number,
  noteOffData: NoteOffEventData = {}
) {
  // Boundary check: skip notes that start at or beyond totalBeats
  if (startBeat >= totalBeats) {
    return;
  }

  events.push({
    beatTime: startBeat,
    channel,
    command: "noteOn",
    data
  });

  // Clamp noteOff to totalBeats boundary
  const endBeat = Math.min(startBeat + durationBeats, totalBeats);
  events.push({
    beatTime: endBeat,
    channel,
    command: "noteOff",
    data: noteOffData
  });
}

function computeVoiceAllocation(events: TimedEvent[]): EventRealizationResult["diagnostics"] {
  const channelCounts = new Map<TimedEvent["channel"], number>();
  const diagnostics: EventRealizationResult["diagnostics"] = { voiceAllocation: [] };

  for (const event of events) {
    if (!channelCounts.has(event.channel)) {
      channelCounts.set(event.channel, 0);
    }
    const current = channelCounts.get(event.channel)!;
    if (event.command === "noteOn") {
      channelCounts.set(event.channel, current + 1);
    } else if (event.command === "noteOff" && current > 0) {
      channelCounts.set(event.channel, current - 1);
    }
    diagnostics.voiceAllocation.push({
      beatTime: event.beatTime,
      channel: event.channel,
      activeCount: channelCounts.get(event.channel)!
    });
  }

  return diagnostics;
}

function findMelodyOverlap(beat: number, melody: MidiNote[]): MidiNote | undefined {
  return melody.find((note) => beat >= note.startBeat && beat < note.startBeat + note.durationBeats);
}
