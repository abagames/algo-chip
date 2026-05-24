English | [日本語](./score_ja.md)

### **Documentation: Advanced Automatic Composition Engine - Motif-Based Score Generation Logic**

#### **1. Purpose and Premises**

This document defines the core logic for automatically generating high-quality BGM. The algorithm is based on the following two elements:

1. **Motif Library (`motifLibrary`)**: Pre-generated chord progressions, rhythms, and melody motifs (created by LLM, etc.) with quality control and metadata tagging performed by humans.
2. **Target Sound Source**: Web Audio synthesis reproducing the acoustic characteristics and constraints of the classic 4-channel configuration (2 square waves, 1 triangle wave, 1 noise channel).

The final output is a time-series **`eventList`** (array of playback events) that provides complete control over the target sound source.

> **API reference**: For concrete type signatures and function-level options, see the generated TypeDoc output under `docs/api/` (`npm run docs:api`). That reference covers public exports such as `generateComposition`, `runPipeline`, and SE/BGM integration helpers. Maintain architectural intent and rationale in this specification.

#### **2. Input and Output**

- **Input**: `CompositionOptions` object
  ```typescript
  // Two-Axis Style System - Musical characteristics expressed in 2D space
  interface TwoAxisStyle {
    percussiveMelodic: number;  // -1.0 (percussive) ~ +1.0 (melodic)
    calmEnergetic: number;      // -1.0 (calm) ~ +1.0 (energetic)
  }

  // Style Intent - Controls musical texture and structure
  interface StyleIntent {
    textureFocus: boolean;        // Texture-focused
    loopCentric: boolean;         // Loop suitability priority
    gradualBuild: boolean;        // Gradual build-up
    harmonicStatic: boolean;      // Harmonic stability
    percussiveLayering: boolean;  // Percussive layering
    breakInsertion: boolean;      // Break insertion
    filterMotion: boolean;        // Filter modulation
    syncopationBias: boolean;     // Syncopation tendency
    atmosPad: boolean;            // Atmospheric pad
    lofiFeel: boolean;            // Lo-fi aesthetic (calm+melodic quadrant)
  }

  // Style Preset - Genre-specific intent bundle (must be specified explicitly)
  type StylePreset =
    | "minimalTechno"
    | "progressiveHouse"
    | "retroLoopwave"
    | "breakbeatJungle"
    | "lofiChillhop";

  // Style Profile Overrides
  type StyleOverrides = Partial<{
    tempo: "slow" | "medium" | "fast";
    intent: Partial<StyleIntent>;
    randomizeUnsetIntent: boolean;
  }>;

  // Composition Options (Main API)
  interface CompositionOptions {
    lengthInMeasures?: number;    // Number of measures (default: 32)
    seed?: number;                 // Random seed (auto-generated if unspecified)
    twoAxisStyle?: TwoAxisStyle;   // Two-axis style (default: {0, 0})
    preset?: StylePreset;          // Genre preset (must be set explicitly; not auto-inferred from axis)
    mode?: "major" | "minor";      // Tonal mode override (derived from axis if unset)
    overrides?: StyleOverrides;    // Style profile overrides
  }
  ```

- **Output**: `PipelineResult`
  ```typescript
  // Event - Time-series command for Web Audio playback
  interface Event {
    time: number;                                    // Absolute time in seconds
    channel: "square1" | "square2" | "triangle" | "noise";
    command: "noteOn" | "noteOff" | "setParam";
    data: any;                                       // Command-specific data
  }

  // Voice Arrangement - Mapping of musical roles to channels
  interface VoiceArrangement {
    id: string;                                      // Preset identifier
    voices: Array<{
      role: "melody" | "melodyAlt" | "bass" | "bassAlt" | "accompaniment" | "pad";
      channel: "square1" | "square2" | "triangle";
      priority: number;                              // Generation probability (0.0-1.0)
      octaveOffset?: number;                         // Octave shift (-1/0/+1)
      seedOffset?: number;                           // Seed offset for pattern variation
    }>;
    description: string;
  }

  // Pipeline Execution Result
  interface PipelineResult {
    events: Event[];                                 // Playback event list
    diagnostics: {
      voiceAllocation: Array<{ time: number; channel: string; activeCount: number }>;
      loopWindow: { head: Event[]; tail: Event[] };
    };
    meta: {
      bpm: number;
      key: string;
      seed: number;
      mood: "upbeat" | "sad" | "tense" | "peaceful";
      tempo: "slow" | "medium" | "fast";
      lengthInMeasures: number;
      styleIntent: StyleIntent;
      voiceArrangement: VoiceArrangement;
      profile: ResolvedStyleProfile;               // Resolved style profile
      replayOptions: CompositionOptions;           // Options for regeneration
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
  ```

#### **3. Core Algorithm: 5-Phase Pipeline Processing**

Score generation is performed by sequentially executing the following 5 independent phases in a pipeline manner.

##### **Phase 1: Structure Planning**

**Purpose**: Determine the overall structure and musical context of the composition.

**Input Processing**: The input `CompositionOptions` is processed by `resolveGenerationContext()`, which derives mood, tempo, and `StyleIntent` based on the two-axis style (`twoAxisStyle`). If `twoAxisStyle` is unspecified, `{ percussiveMelodic: 0, calmEnergetic: 0 }` is applied.

**Main Processing**:

1. **Two-Axis Style Interpretation**:
   - `percussiveMelodic` axis: -1.0 (percussive) ~ +1.0 (melodic)
   - `calmEnergetic` axis: -1.0 (calm) ~ +1.0 (energetic)
   - Derive tonal mode (`major`/`minor`) from axis via `deriveModeFromAxis()`:
     - calm+melodic quadrant (`calmEnergetic ≤ -0.3` and `percussiveMelodic ≥ 0.2`) → minor
     - strongly percussive (`percussiveMelodic ≤ -0.4`) → minor regardless of energy
     - otherwise → major
   - Override mode with `CompositionOptions.mode` if supplied
   - Infer legacy mood string (upbeat/sad/tense/peaceful) for template and technique selection
   - Derive tempo (slow/medium/fast) from `calmEnergetic`
   - Set 10 `StyleIntent` flags from axis coordinates; `lofiFeel` activates when `calmStrength > 0.5 && melodicStrength > 0.3`

2. **Musical Parameter Determination**:
   - Tempo base values: `slow=90BPM`, `medium=120BPM`, `fast=150BPM`
   - Fine-tune within ±15BPM range based on 2D coordinates and seed
   - Key selection based on derived mode — candidates per mode:
     - major: G Major, C Major, D Major, F Major
     - minor: E Minor, A Minor, D Minor, B Minor, C Minor
   - Final key selected from pool by `(seed + salt) % pool.length`

3. **Axis-Based Chord Tag Selection**:
   - Each chord tag is assigned a canonical position in (melodic, calm) 2D space via `TAG_AXIS_POSITION`
   - `selectChordTagsFromAxis()` computes Euclidean distance from the current axis to each tag's position and picks the 2 nearest tags present in the selected key's chord data
   - Fallback: when no axis is available (legacy path), use `MOOD_TAG_MAP` to map mood string to tag candidates

4. **Musical Structure Selection**:
   - Select section templates optimized for measure count (16/32/64, etc.)
   - Example: 32-measure upbeat → A(8) - B(8) - C(8) - D(8)
   - Structure considering loop integrity (`loop_safe` tagged motifs placed at endings)

5. **Chord Progression Selection**:
   - Select chord progressions matching mood tags and key for each section
   - Ensure ending integrity with `cadence` (ending) and `loop_safe` purpose tags

6. **Voice Arrangement Selection**:
   - Select voice arrangement preset based on seed and style
   - Determine physical channel assignment for melody/bass/accompaniment
   - Set octave offsets and pattern variations

7. **Technique Strategy Definition**:
   - Set technique application probabilities based on `StyleIntent` flags
   - Determine usage rates for duty cycle sweeps, arpeggios, detune, etc.

##### **Phase 2: Abstract Track Generation (Motif Selection)**

- **Purpose**: Generate 3 tracks ("melody", "bass", "rhythm") as pure musical information without considering channel assignment or playing techniques.

- **Processing**:
  1. **Melody Track Generation**:
      a. Select melody note-duration motifs (`melody-rhythm.json`) in phrase units (1-2 measures). Consider functional tags (`start`/`middle`/`end`) and mood-specific tags (`drive`, `legato`, `rest_heavy`, `staccato`, etc.), ensuring ending integrity with `loop_safe`/`cadence` tags. Note-duration motifs include rest information and are validated to total exactly 4 or 8 beats per phrase.
      b. Per-measure rhythm motifs (`rhythm.json`) continue to be selected for accompaniment/accent purposes, cached per template/section. Selected independently from melody note-duration motifs, phrases that first appear in A-section are saved as hooks and reused when reappearing. By default (`sectionRepeatBias` ≥ 0.25) the exact same rhythm, melody, and note-duration motifs are reused. When `sectionRepeatBias` < 0.25 a varied hook may be chosen: the rhythm and note-duration motifs are kept but the pitch-degree motif (`melody.json`) is replaced with a close alternative, producing a recognisably similar but not identical reprise.
      c. Map scale degree motifs (`melody.json`) sequentially to the note schedule expanded from note-duration motifs. Don't advance degree on rest steps; only advance when generating notes to create breathing space.
      d. Retro game BGM motif design guidelines:
         - 16th-note based + rests: Always include rests (or long tones of 2+ beats) within phrases to avoid mechanical repetition.
         - Syncopation: Manage upbeat anticipations and tied notes across 2 beats with `syncopated` tag, prioritizing when mood is `tense`/`upbeat`.
         - Repetition and variation: Reproduce `[A][A][A][A']` 2-beat motif patterns at note-duration level, applying variations like `[A' B][A'' B']` in B-section for call-and-response structure.
         - Tag-driven cache: Save motif IDs selected by section template/measure function combination to template cache. When `sectionRepeatBias` ≥ 0.25 (the default), A1 and A2 sound identical. When `sectionRepeatBias` < 0.25, A2 may use a varied pitch motif while preserving the rhythm and note-duration pattern, producing coherent but non-identical repetitions. The `hookReuse` field in `diagnostics.sectionMotifPlan` records `"exact"`, `"varied"`, or `"none"` per section.

  2. **Bass Track Generation**:
      a. Carve out 8th notes based on chord progression roots, prioritizing root holding in `loop_safe` sections and 5th→root resolution in `cadence` sections.
      b. Probabilistically add fill motif tags (e.g., `bridge`, `build`) per measure, adjusting endings to avoid unnecessary low-end reverb.

  3. **Rhythm Track Generation**:
      a. Select `beat`/`fill` drum motifs with tag priority based on measure position and mood. Endings use `loop_safe`, build-up sections reference `build`/`break`.
      b. Insert fills every 4/8 measures, using `variations` links to avoid consecutive identical fills.
      c. Since `noise` channel is purely monophonic circuitry, avoid overlapping multiple hits within the same 16th-note step. If necessary, layer with triangle or square waves, or follow clamp processing described later to offset timing.
      d. Motif selection uses seed-driven RNG, probabilistically selecting from candidates matching tag conditions. Re-sample up to 3 times if same motif as previous continues, suppressing unintended repetition.
      e. **Excessive Tag Filtering Prevention**: When `preferTagPresence` tag priority filtering reduces candidates below 40%, fall back to maintain original candidate pool. This prevents candidate exhaustion and extreme motif repetition when multiple styleIntent flags are applied simultaneously.

  4. **Harmony Consistency Processing**:
      When converting generated melody/accompaniment/bass from scale degrees to MIDI, quantize to chord tones on **strong beats** (beats 1 and 3 within a 4-beat measure; i.e., beat positions where `beat % 2 === 0`) and select smoothest connecting notes within chords on weak beats. For accompaniment, evaluate consonance with simultaneously sounding melody notes and perform octave shifts if necessary. The accompaniment base register is set a perfect 4th below the melody base to prevent voice crossing.

##### **Phase 3: Channel Mapping & Technique Implementation (Event Realization)**

- **Purpose**: Map abstract tracks to physical channels of the 4-channel chiptune sound source and apply specific playing techniques to concretize the score.

- **Processing**:
1. **Voice Arrangement System**:
      - **Overview**: Dynamically assign each musical role (VoiceRole) such as melody/bass/accompaniment to physical channels (square1/square2/triangle) based on `seed`. This enables generation of diverse sound variations from identical style settings.
      - **VoiceRole**: 6 types: `melody`, `melodyAlt`, `bass`, `bassAlt`, `accompaniment`, `pad`. Each role has independent musical function.
      - **VoiceArrangement Presets**:
        - `standard`: melody(sq1) + acc(sq2) + bass(tri) - Standard arrangement
        - `swapped`: melody(sq2) + acc(sq1) + bass(tri) - Square swap
        - `dualBass`: melody(sq1) + bass(sq2) + bassAlt(tri, octave -1) - Heavy low-end
        - `bassLed`: bass(sq1) + bassAlt(sq2, octave +1) + melody(tri, sparse) - Bass-driven
        - `layeredBass`: bass(sq1) + bassAlt(tri, octave +1, variation seed) + melody(sq2) - Complementary layer
        - `minimal`: bass(sq1) + pad(tri, sparse) - Minimal without melody
        - `breakLayered`: breakbeat-oriented dual-bass emphasis with syncopated melody support
        - `lofiPadLead`: pad-forward lofi arrangement with sparse melody; delays drum entry 2 measures
        - `retroPulse`: retro arpeggio focus with triangle bass foundation
      - **Voice Attributes**:
        - `priority`: Generation probability 0.0-1.0. 1.0=always generate, 0.7=generate in 70% of measures (for sparse expression)
        - `octaveOffset`: Octave shift -1/0/+1. bassAlt(octave -1) generates sub-bass (D1-E2 range)
        - `seedOffset`: Seed addition value for varying patterns within same role
      - **Selection Logic**: Weighted selection in Phase 1 based on `seed` and `stylePreset`. `stylePreset` must be explicitly supplied via `CompositionOptions.preset`; it is never auto-inferred from axis coordinates. minimalTechno prioritizes minimal/bassLed, progressiveHouse prioritizes layeredBass, retroLoopwave prioritizes retroPulse, breakbeatJungle emphasizes breakLayered/dualBass, lofiChillhop prioritizes lofiPadLead/minimal, reflecting genre characteristics.
      - **Velocity Adjustment**: `adjustVelocityForChannel()` implements scaling according to role and channel. Bass-type roles reduced to 70%, with additional 0.85 multiplication for MIDI below 52 to control ultra-low range. `triangle` attenuates to 85% of base value (non-bass roles use full strength), `square` carrying bass applies ×0.66, and melody on any channel applies ×0.4 to prevent the melody from overpowering the mix.
      - **Backward Compatibility**: `standard`/`swapped` arrangements call legacy Phase 2 logic (`selectMotifsLegacy`), ensuring existing music generation behavior.

2. **Rhythm Track Special Conversion**:
     - **Kick (K)**: Emit `noteOn` on `noise` channel with long LFSR mode (`mode: "long"`) and short decay for a low-frequency rumble. Additionally, when the triangle channel is free at the hit time, emit a 12 ms triangle pitch-slide from G2→C2 (velocity 75) alongside the noise burst to add body — matching the classic NES technique of layering triangle and noise for kick weight.
     - **Snare (S)**: Emit `noteOn` on `noise` channel with short LFSR mode (`mode: "short"`) for metallic crack. On backbeat positions (beat 2 or 4 ±0.1 beat within each measure), switch to long LFSR mode + `periodIndex: 4` (~1.75 kHz) for a heavier, accent-snare thump.
     - **Hihat/Open (H/O)**: Both use short LFSR mode. When a closed hihat (H) fires while an open hihat (O) is still sounding, the O's `noteOff` is moved to the H's start time with `releaseSeconds: 0.003` (3 ms snap-close), reproducing the physical cymbal choke of the NES hardware.
     - **Tom (T)**: Emits short-LFSR noise at a lower period index. Like snares, a `setParam periodIndex` event fires at 40 % of the hit duration to shift the period downward by 3 index steps, giving the tom its characteristic mid-hit pitch descent.
     - **Mid-hit Period Fall**: S and T hits insert a `setParam { param: "periodIndex", value: idx + Δ }` at 40 % of their hit duration. S falls by 2 steps; T falls by 3 steps. This creates an authentic NES-style pitch-descend texture as the hit sustains.
     - **4-bit Envelope Quantization**: Noise envelope output is quantized to 16 discrete steps (`Math.round(env / stepSize) * stepSize`, where `stepSize = amplitude / 15`) matching the NES APU hardware volume register.
     - **LFSR Mode Mapping**: Long-period instruments (K, T in default config) use bit-1 feedback (`mode: "long"`); short-period instruments (S, H, O) use bit-6 feedback (`mode: "short"`). The worklet `noteOn` receives the actual `"long"` / `"short"` string; the descriptive label (`"long_period"` etc.) is carried separately for logging.
     - **Single-voice Guard**: Always quantize `noise` `noteOn` to 1/8 beat or less; if the next hit arrives within the previous hit's reverb window, truncate the previous `noteOff` to the new hit's start time. Uses `splice(lastNoteStartIndex)` to atomically remove all events for the previous hit (including mid-hit `setParam` events) when non-stackable instruments collide.
     - **RNG Control**: Candidate selection for rhythm/melody/drums based on `seed`-driven RNG, randomly selecting after filtering by mood tags and functional tags. Selection results remain in diagnostic logs, operating deterministically for constant reproduction with identical seed.

3. **Accompaniment Track (`square2`) Dynamic Generation**:
     a. Use RNG initialized with `seed` to group accompaniment seeds per measure. To prevent consecutive measures from sounding extremely or being silent, decide `fast_arpeggio` adoption considering previous judgment result.
     b. When arpeggio selected, reconstruct current chord tones in 16th-note increments, evaluating consonance with melody and correcting pitch. When not selected, auto-generate 8th-note broken chords for minimum fill.
     c. `detune` applies cent-unit fine pitch rather than semitone copy; `echo` defaults to quarter-note delay + attenuation. Each technique monitors simultaneous note count, skipping if limit exceeded.

4. **Pitch Bend / Portamento Application**:
     - Sound effects use: Detect events with specific tags like kick or synth bass, adding short descending slides to triangle wave (e.g., 40→32→24) for impact.
     - Musical expression: Insert smooth portamento between melody notes with low probability, coordinating with Phase 4 decoration for "crying" or "vibrato" nuances.

##### **Phase 4: Timbral Decoration (Techniques Postprocess)**

- **Purpose**: Scan entire generated score and apply final "seasoning" to give timbre expression and realism.

- **Processing**:
  1. **Duty Ratio Setting**:
      - Add `setParam: {param: 'duty', value: 0.25}` at beginning of `square1` event group.
      - Add `setParam: {param: 'duty', value: 0.50}` at beginning of `square2` event group.

  2. **Duty Cycle Sweep Application**:
      - Detect square wave channel notes with certain duration or longer.
      - Insert multiple `setParam` events periodically changing duty ratio between note's `noteOn` and `noteOff`.

  3. **Style-Linked Automation**:
      - When `filterMotion` enabled, add style-specific patterns to duty sweep presets.
      - Reinforce noise/triangle wave gain profiles according to flags like `percussiveLayering` or `atmosPad`; when `breakInsertion` applies to measures, temporarily lower noise and square gains to create breaks.

  4. **Loop Integrity and Dynamics Control**:
      - For tracks with `gradualBuild` enabled, insert gain ramps per measure to form overall musical build-up.
      - At loop ending, gradually lower gain per channel for natural connection to next loop head and reverb control.

##### **Phase 5: Final Conversion to Event List (Timeline Finalization)**

- **Purpose**: Convert intermediate data so far to final playback `eventList`.

- **Processing**:
  1. Sort all note and parameter information in time order.
  2. Decompose each note into `noteOn` and `noteOff` events.
  3. Based on BPM, **accurately calculate** all event times from measures/beats to seconds, setting `time` property.
  4. Flatten all events into single array, outputting as final `eventList`.
  5. For loop integrity checks, include beginning/ending event window counts for 0.1/0.25/0.5 seconds plus unmatched note and release-tail counts in diagnostic info for reference in subsequent verification loops.

---

This pipeline processing allows each phase to focus on its own responsibility. Using high-quality materials, ensuring structural and musical correctness, algorithmically reproducing constraints unique to classic chiptune sound sources and creative techniques that exploit them, consistent high-quality and diverse automatic BGM generation is realized.

#### **Appendix: Motif Editing Guide**

When adding motifs, keep the JSON library deterministic, tag-searchable, and safe for 4-channel retro playback. A motif should extend a clear musical role rather than duplicate an existing pattern with only cosmetic changes.

- **General Schema Discipline**: Preserve existing field names, ID prefixes, and tag vocabulary in each file. Prefer adding one or two specific tags over broad labels, and do not introduce a new tag family unless selection logic or diagnostics will use it.
- **Melody Note-Duration Motifs (`melody-rhythm.json`)**: Each pattern must total exactly its declared `length` in beats, including rests. Use rests or long tones to create breathing space; avoid uninterrupted 16th-note streams unless the motif is explicitly a texture pattern. Use `pickup` for anticipatory phrase starts, `cadence` for phrase endings that resolve, and `loop_safe` for endings that can wrap to the next loop without a dangling long tone.
- **Melody Degree Motifs (`melody.json`)**: Keep intervals singable and reusable across keys. Prefer mostly stepwise motion with one or two intentional leaps, and link close variants through `variations` instead of copying near-identical entries. Cadence motifs should land on stable degrees, while tension motifs may delay resolution only if paired with a phrase-ending rhythm.
- **Bass Motifs (`bass-patterns.json`)**: Keep low-register motion sparse enough to avoid muddy loops. Battle and breakbeat patterns may use octave or approach motion, but `loop_safe` bass should end on or clearly approach the next root. Avoid sustained low notes with long release at the final step.
- **Drum and Transition Motifs (`drums.json`, `transitions.json`)**: Respect the monophonic `noise` channel. Short hats, kicks, snares, toms, and FX should not require simultaneous noise hits at the same 16th step. Use `fill`, `build`, `break`, `loop_out`, and preset-specific tags to describe placement rather than encoding placement in IDs only.
- **Technique Motifs (`techniques.json`)**: Emit only parameters supported by the synthesizer/worklet. New ornaments should have a narrow trigger condition (`channels`, duration threshold, `styleFlag`, or cadence/boundary use) so decoration does not become dense across all notes.
- **Variation Links**: Use `variations` for related alternatives that can replace each other in repeated sections. Variants should preserve phrase length and broad function while changing one musical dimension: rhythm, contour, register, or density.
- **Patterns to Avoid**: Avoid motifs that rely on more simultaneous voices than available hardware channels, long final releases that overlap loop head, tags that contradict their behavior, very high square-wave lead jumps repeated every beat, and duplicate IDs or near-duplicate musical content.
- **Required Verification**: After motif edits, run `npm test`, `npm run build:core`, `npm run report:seed-sweep -- --seeds=101,202,303 --assert`, and `git diff --check`. The `--assert` flag enforces automated thresholds (fallback rate ≤ 0.40 per run, melody motif kinds ≥ 2 per run, unique voice arrangements ≥ 3 across all runs, zero loop/noise-tail issues) and exits with code 1 on violation. Thresholds can be tightened with `--max-fallback-rate=`, `--min-melody-kinds=`, and `--min-arrangement-variety=`. For melody-rhythm changes, confirm the duration sanity test covers every new motif. For drums/noise changes, confirm `noise-collision` remains clean. For style-specific motifs, inspect `diagnostics.motifSelection.candidatePools` and `motifUsage` in the seed sweep to confirm the new tags are reachable without excessive fallback.

#### **Appendix: Post-Generation Verification Loop and Checkpoints**

In production specification, output generated music with multiple random seeds and repeat automated analysis and final audition on `node` based on following checkpoints. Save analysis results as logs/metrics to prevent regression. All verification runs explicitly record `CompositionOptions` and cross-check with `PipelineResult.meta` contents (seed/mood/tempo/length).

- **Seed Diversity**: Always run multiple seeds for identical mood/tempo/length settings, statistically confirming that diagnostic values per phase (used motif IDs, technique application rates, noteOn counts per channel, section placement) scatter sufficiently. Treat `seed` as required input; even when randomly supplemented if unspecified, save `meta.seed` in verification log.
- **Option Diversity**: Audit that mood/tempo/length combination itself isn't biased. In verification batches, circulate mood/tempo/Measures according to coverage table, checking `meta.mood`/`meta.tempo`/`meta.lengthInMeasures` histograms; if concentrated on any, adjust script/templates.
- **Motif Distribution**: Compare rhythm/melody/drum tag selection logs, confirming candidates switch according to mood and aren't fixed to same motif sequence. Design additional tags like `loop_safe` as needed.
- **Melody Shape and Accompaniment Density**: Aggregate `square1` range heatmap, leap widths, ending positions, `square2` per-measure pronunciation counts/rest ratios, checking for consecutive extreme silence or repetition. Adjust motif JSON or Phase 3 technique probabilities based on results.
- **Bassline and Drums**: Compare `triangle` root/5th ratio, `noise` beat/fill ID distribution, fill insertion period; if monotonous, review motif design.
  Simultaneously auto-test/lint that `noise` active voice count always ≤1, rejecting violating motifs or phase conversion logic.
- **Dynamics**: Quantify velocity mean/range, strength/weakness patterns per section, monitoring whether peaks/valleys exist and change with seed differences.
- **Loop Integrity**: Analyze virtual timeline concatenating final and beginning measures, confirming reverb events don't overlap next loop head and each channel's active count transitions smoothly. Introduce ending-specific motifs or tail processing if necessary.
- **Duplication Prevention**: Compare `eventList` content hashes and motif ID signatures with existing outputs, detecting duplication. Update generation logic or motifs when threshold exceeded.
- **Motif Recurrence Measurement**: Aggregate representative motif IDs selected per section, reviewing Phase 2 motif cache or variation application if reappearance rate (e.g., both melody/rhythm ≥25% of all measures) falls below baseline.
- **Phrase Integrity Check**: Verify pickup/cadence tags aren't missing or duplicated at 2-4 measure phrase boundaries; adjust Phase 2 phrase composition or section linking logic when abnormal.
- **Texture Plan Audit**: Heatmap voice_allocation to detect deviation when section-specific textures (broken chords, 8th arpeggios, etc.) defined in Phase 1 aren't reflected in actual square2/square1 event density.
- **Dynamics Profile Comparison**: Record average velocity and peak difference per section; re-adjust Phase 3 envelope generation when mismatching expected peaks/valleys (e.g., A=mf, B=f, Outro=mp).
- **Transition Diagnostics**: Verify drum fills/pickup events before section switching and Phase 4 duty/gain sweeps fire at expected timestamps; return transition design when missing.
- **Melody Note-Duration Validation**: Analyze whether `melody-rhythm` motif length totals match measure length, whether rests/long-tones overlap loop head; correct motif definition and application logic when deviated. Periodically run `npm run check:melody-rhythm` to obtain length verification and motif usage frequency heatmaps.

When analysis phase finds problems, improve corresponding phases (motif selection, harmony correction, technique application pace, etc.) and re-run seed scanning. Final outputs are auditioned with browser demo to eliminate sensory discomfort, confirming regression with same checklist. Thoroughly implement this PDCA loop throughout development cycle.
