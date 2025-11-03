export type TempoSetting = "slow" | "medium" | "fast";
export type MoodSetting = "upbeat" | "sad" | "tense" | "peaceful";

/**
 * Two-axis style specification for intuitive composition control
 */
export interface TwoAxisStyle {
  /**
   * Percussive ←→ Melodic axis (Y-axis conceptually)
   * -1.0 = Ultra percussive, +1.0 = Ultra melodic
   */
  percussiveMelodic: number; // -1.0 ~ +1.0

  /**
   * Calm ←→ Energetic axis (X-axis conceptually)
   * -1.0 = Ultra calm, +1.0 = Ultra energetic
   */
  calmEnergetic: number; // -1.0 ~ +1.0
}

export type Channel = "square1" | "square2" | "triangle" | "noise";
export type Command = "noteOn" | "noteOff" | "setParam";

export type StylePreset =
  | "minimalTechno"
  | "progressiveHouse"
  | "retroLoopwave"
  | "breakbeatJungle"
  | "lofiChillhop";

export interface StyleIntent {
  textureFocus: boolean;
  loopCentric: boolean;
  gradualBuild: boolean;
  harmonicStatic: boolean;
  percussiveLayering: boolean;
  breakInsertion: boolean;
  filterMotion: boolean;
  syncopationBias: boolean;
  atmosPad: boolean;
}

export type StyleTagCategory = "genre" | "mood" | "energy" | "scene";

export interface StyleTags {
  genre?: string;
  mood?: string;
  energy?: "low" | "medium" | "high";
  scene?: string;
  custom?: string[];
}

export type MelodyContour = "ascending" | "stepwise" | "mixed";
export type DrumDensity = "low" | "medium" | "high";
export type VelocityCurve = "soft" | "balanced" | "aggressive";

export interface StyleProfile {
  tempo: TempoSetting;
  bpmBias?: number;
  motifTags: {
    include: string[];
    exclude?: string[];
  };
  intent: StyleIntent;
  expression?: {
    melodyContour?: MelodyContour;
    drumDensity?: DrumDensity;
    velocityCurve?: VelocityCurve;
  };
  randomizeUnsetIntent?: boolean;
}

export interface ResolvedStyleProfile extends StyleProfile {
  tags: StyleTags;
  twoAxisStyle: TwoAxisStyle;
}

export interface StyleOverrides extends Partial<Omit<StyleProfile, "intent">> {
  intent?: Partial<StyleIntent>;
}

export interface CompositionOptions {
  lengthInMeasures?: number;
  seed?: number;
  twoAxisStyle?: TwoAxisStyle;
  overrides?: StyleOverrides;
}

export interface LegacyCompositionOptions {
  mood: MoodSetting;
  tempo: TempoSetting;
  lengthInMeasures: number;
  seed: number;
  stylePreset?: StylePreset;
  styleOverrides?: Partial<StyleIntent>;
  
  /**
   * Controls section repeatability vs variation balance
   * 0.0 = Always use variations (maximum diversity)
   * 1.0 = Always repeat exactly (maximum coherence)
   * Default: 0.3 (slight bias toward variation)
   * 
   * This affects whether A2 uses the same motifs as A1 or variations
   */
  sectionRepeatBias?: number;
}

export interface TimedEvent {
  beatTime: number;
  channel: Channel;
  command: Command;
  data: any;
}

export interface Event extends Omit<TimedEvent, "beatTime"> {
  time: number;
}

/**
 * Musical role that can be assigned to a voice
 */
export type VoiceRole =
  | "melody"           // Main melodic line
  | "melodyAlt"        // Secondary melody (counterpoint)
  | "bass"             // Primary bass line
  | "bassAlt"          // Secondary bass (octave layer or complementary)
  | "accompaniment"    // Chordal/rhythmic accompaniment
  | "pad";             // Sustained pad (sparse, long notes)

/**
 * Voice definition: which role plays on which channel
 */
export interface Voice {
  role: VoiceRole;
  channel: Channel;
  /**
   * Generation probability (0-1)
   * 1.0 = always generate
   * 0.5 = 50% chance per measure
   * Used to create sparse/dense variations
   */
  priority: number;
  /**
   * Octave offset from default range
   * 0 = default, +1 = one octave up, -1 = one octave down
   */
  octaveOffset?: number;
  /**
   * Seed offset for pattern selection
   * Used to ensure different patterns for same role
   */
  seedOffset?: number;
}

/**
 * Voice arrangement defines the complete voice allocation strategy
 */
export interface VoiceArrangement {
  id: VoiceArrangementPreset;
  voices: Voice[];
  description: string;
}

/**
 * Simplified voice arrangement presets (no new motifs required)
 */
export type VoiceArrangementPreset =
  | "standard"              // melody(sq1) + acc(sq2) + bass(tri)
  | "swapped"               // melody(sq2) + acc(sq1) + bass(tri)
  | "dualBass"              // melody(sq1) + bass(sq2) + bassAlt(tri, octave down)
  | "bassLed"               // bass(sq1) + bassAlt(sq2, octave up) + melody(tri, sparse)
  | "layeredBass"           // bass(sq1) + bassAlt(tri, octave up, varied seed) + melody(sq2)
  | "minimal"               // bass(sq1) + pad(tri, sparse) + no melody
  | "breakLayered"          // dual bass emphasis with syncopated melody support
  | "lofiPadLead"           // pad-forward lofi arrangement with sparse melody
  | "retroPulse";           // retro arpeggio focus with triangle bass foundation

export interface AbstractNote {
  channelRole: "melody" | "bass" | "accompaniment";
  startBeat: number;
  durationBeats: number;
  degree: number;
  velocity: number;
  sectionId: string;
}

export interface DrumHit {
  startBeat: number;
  durationBeats: number;
  instrument: "K" | "S" | "H" | "O" | "T" | "N";
  sectionId: string;
}

export interface Phase1Result {
  bpm: number;
  key: string;
  scaleDegrees: number[];
  sections: SectionDefinition[];
  techniqueStrategy: TechniqueStrategy;
  styleIntent: StyleIntent;
  voiceArrangement: VoiceArrangement;
}

export type TextureProfile = "broken" | "steady" | "arpeggio";

export interface SectionDefinition {
  id: string;
  startMeasure: number;
  measures: number;
  chordProgression: string[];
  templateId: string;
  occurrenceIndex: number;
  texture: TextureProfile;
  // Note: phraseLengthMeasures, establishesHook, repriseHook removed per REFACTOR_PLAN.md Step 1-D
  // Use helper functions from phase1.ts: getPhraseLengthForSection(), establishesHook(), repriseHook()
}

export interface SectionMotifPlan {
  sectionId: string;
  templateId: string;
  occurrenceIndex: number;
  primaryRhythm: string;
  primaryMelody: string;
  primaryMelodyRhythm: string;
  reprisesHook: boolean;
}

export interface TechniqueStrategy {
  echoProbability: number;
  detuneProbability: number;
  fastArpeggioProbability: number;
}

export interface PipelineResult {
  events: Event[];
  diagnostics: Diagnostics;
  meta: {
    bpm: number;
    key: string;
    seed: number;
    mood: MoodSetting;
    tempo: TempoSetting;
    lengthInMeasures: number;
    styleIntent: StyleIntent;
    voiceArrangement: VoiceArrangement;
    profile: ResolvedStyleProfile;
    replayOptions: CompositionOptions;
    loopInfo: {
      loopStartBeat: number;
      loopEndBeat: number;
      loopStartTime: number;
      loopEndTime: number;
      totalBeats: number;
      totalDuration: number;
    };
  };
}

export interface Diagnostics {
  voiceAllocation: Array<{
    time: number;
    channel: Channel;
    activeCount: number;
  }>;
  loopWindow: {
    head: Event[];
    tail: Event[];
  };
  motifUsage: {
    rhythm: Record<string, number>;
    melody: Record<string, number>;
    drums: Record<string, number>;
    melodyRhythm: Record<string, number>;
    bass: Record<string, number>;
    transitions: Record<string, number>;
  };
  sectionMotifPlan: SectionMotifPlan[];
}

export interface Phase3Result {
  events: TimedEvent[];
  diagnostics: Phase3Diagnostics;
}

export interface Phase3Diagnostics {
  voiceAllocation: Array<{
    beatTime: number;
    channel: Channel;
    activeCount: number;
  }>;
}

export interface MidiNote extends AbstractNote {
  midi: number;
  detuneCents?: number;
}

export interface Phase2Result {
  tracks: {
    role: VoiceRole;
    notes: MidiNote[];
  }[];
  drums: DrumHit[];
  motifUsage: {
    rhythm: Record<string, number>;
    melody: Record<string, number>;
    drums: Record<string, number>;
    melodyRhythm: Record<string, number>;
    bass: Record<string, number>;
    transitions: Record<string, number>;
  };
  sectionMotifPlan: SectionMotifPlan[];
}

export interface MelodyRhythmStep {
  value: number;
  rest?: boolean;
  tie?: boolean;
  accent?: boolean;
}

export interface MelodyRhythmMotif {
  id: string;
  length: number;
  pattern: MelodyRhythmStep[];
  tags: string[];
}

export interface MotifLibraries {
  chords: Record<string, Record<string, string[][]>>;
  rhythm: RhythmMotif[];
  melody: MelodyFragment[];
  drums: DrumPattern[];
}

export interface RhythmMotif {
  id: string;
  length: number;
  pattern: number[];
  tags: string[];
  variations: string[];
}

export interface MelodyFragment {
  id: string;
  pattern: number[];
  tags: string[];
}

export interface DrumPattern {
  id: string;
  length_beats: number;
  type: "beat" | "fill";
  pattern: string;
  tags?: string[];
}

export interface TexturePlan {
  templateId: string;
  textureSequence: TextureProfile[];
  phraseLength: number;
  arpeggioKeepProbability?: {
    firstOccurrence?: number;
    repeatOccurrence?: number;
  };
}

export interface BassPatternMotif {
  id: string;
  texture: TextureProfile;
  steps: Array<"root" | "fifth" | "lowFifth" | "octave" | "octaveHigh" | "approach" | "rest">;
  tags?: string[];
}

export interface TransitionMotif {
  id: string;
  pattern: string;
  length_beats: number;
  tags: string[];
  channel: Channel;
}

export interface TechniqueLibrary {
  initialParams: Array<{
    channel: Channel;
    param: string;
    value: number;
  }>;
  dutySweeps: Array<{
    id: string;
    param: string;
    channels: Channel[];
    minDurationBeats: number;
    requireMeasureBoundary?: boolean;
    steps: number[];
  }>;
  gainProfiles: Array<{
    id: string;
    channel: Channel;
    param: string;
    measureBoundaryValue: number;
    defaultValue: number;
  }>;
}

/**
 * Validates and clamps two-axis values to valid range
 */
export function validateTwoAxisStyle(axis: TwoAxisStyle): TwoAxisStyle {
  return {
    percussiveMelodic: Math.max(-1.0, Math.min(1.0, axis.percussiveMelodic)),
    calmEnergetic: Math.max(-1.0, Math.min(1.0, axis.calmEnergetic))
  };
}
