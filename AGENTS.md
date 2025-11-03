# Repository Guidelines

## Project Overview

**algo-chip** is a high-quality automatic BGM and sound effect composition engine with 4-channel chiptune synthesis. The system generates complete chiptune music using a motif-based architecture and a deterministic five-phase pipeline.

### Core Concepts

- **Five-Phase Pipeline**: Structure Planning → Motif Selection → Event Realization → Techniques Postprocess → Timeline Finalization
- **Two-Axis Style System**: Music characteristics expressed in 2D space
  - `percussiveMelodic` axis: -1.0 (percussive) ~ +1.0 (melodic)
  - `calmEnergetic` axis: -1.0 (calm) ~ +1.0 (energetic)
- **Voice Arrangement System**: Dynamic mapping of musical roles (melody, bass, accompaniment) to physical channels (square1, square2, triangle, noise)
- **Motif-Based Architecture**: High-quality pre-composed motifs with metadata tags drive all generation
- **Seed-Driven RNG**: Complete reproducibility with deterministic random number generation

### Sound Capabilities

- **BGM Generation**: Full compositions with chord progressions, melody, bass, drums, and techniques (duty cycle sweeps, arpeggios, etc.)
- **SE (Sound Effects)**: 10 types of sound effects (jump, coin, explosion, hit, powerup, laser, select, click, synth, tone) with 20 template variations
- **Channel Emulation**: Authentic retro chiptune sound using square1, square2, triangle, and noise channels

---

## Project Structure & Module Organization

### Core Implementation

#### Main Pipeline (`packages/core/src/`)
TypeScript implementation of the five-phase composition pipeline:

- **Phase 1: Structure Planning** (`phase/structure-planning/`)
  - Two-axis style interpretation and mood/tempo resolution
  - Section template selection (A-B-C-D patterns)
  - Chord progression selection with cadence/loop_safe tags
  - Voice Arrangement preset selection (standard, swapped, dualBass, bassLed, layeredBass, minimal, etc.)
  - Technique strategy definition (duty cycle sweeps, arpeggios, detune, etc.)
  - Key files: `style-intent-resolver.ts`, `voice-arrangement-selector.ts`, `section-builder.ts`, `chord-progression.ts`

- **Phase 2: Motif Selection** (`phase/motif-selection/`)
  - Melody track: phrase-level melody-rhythm motifs with rest/long-tone breath control
  - Bass track: root-based 8th note patterns with fills
  - Rhythm track: beat/fill drum motifs with tag-driven selection
  - Hook/motif caching for A-section reuse and variation
  - Tag filtering with fallback to prevent candidate exhaustion
  - Key files: `melody-rhythm-selector.ts`, `bass-generator.ts`, `drum-selector.ts`, `cache-manager.ts`

- **Phase 3: Event Realization** (`phase/event-realization.ts`)
  - Voice Role to physical channel mapping (VoiceRole → Channel)
  - Velocity adjustment per channel/role (bass: 70%, triangle: 75%, etc.)
  - Rhythm track conversion (kick/snare/hihat → noise channel with noiseMode/envelope)
  - Single-voice guard for noise channel (max 1 active note)
  - Accompaniment track dynamic generation (arpeggios, broken chords)
  - Pitch bend/portamento application

- **Phase 4: Techniques Postprocess** (`phase/techniques-postprocess.ts`)
  - Duty cycle setting (square1: 0.25, square2: 0.50)
  - Duty cycle sweep insertion for sustained notes
  - Style-linked automation (filterMotion, percussiveLayering, atmosPad, breakInsertion)
  - Gradual build dynamics control (gain ramps per section)
  - Loop tail gain reduction for seamless looping

- **Phase 5: Timeline Finalization** (`phase/timeline-finalization.ts`)
  - Note to noteOn/noteOff event decomposition
  - BPM-based measure/beat → seconds conversion
  - Event list flattening and time-ordering
  - Loop integrity diagnostics (head/tail 100ms event snapshots)

#### Supporting Modules

- `se/` - Sound effect engine
  - `seGenerator.ts` - SE generation engine (10 types, 20 templates)
  - `seTypes.ts` - Type definitions (SEType, SETemplate, SEGenerationOptions, SEGenerationResult)
  - `seTemplates.ts` - Template loader and validator
- `style/` - Style resolution system
  - `two-axis-mapper.ts` - 2D coordinate → mood/tempo mapping
  - `profile-resolver.ts` - Final style profile resolution
  - `preset-to-axis.ts` - Preset style → 2D axis conversion
- `musicUtils.ts` - Music theory helpers (scale degrees, MIDI conversion, harmony)
- `pipeline.ts` - Main pipeline orchestration (`generateComposition()` entry point)
- `types.ts` - Public type definitions (Event, Channel, CompositionOptions, PipelineResult, etc.)
- `test/` - Comprehensive Node test suites (pipeline, two-axis, SE, noise collision, motif constraints, etc.)

#### Motif Libraries (`packages/core/motifs/`)

JSON-based motif catalog with rich metadata tagging:

- **`chords.json`** - Chord progressions with mood tags (upbeat, sad, tense, peaceful), functional tags (start, middle, end, cadence, loop_safe), and key support
- **`melody.json`** - Scale degree sequence motifs with contour/mood tags
- **`melody-rhythm.json`** - Phrase-level note duration patterns (1-2 measures) with rest/long-tone breath control, functional tags (start, middle, end, pickup, cadence), and style tags (drive, legato, rest_heavy, staccato, syncopated)
- **`rhythm.json`** - Accompaniment rhythm patterns (obsoleted by melody-rhythm for melody, still used for accompaniment)
- **`drums.json`** - Drum patterns (beat/fill) with kick/snare/hihat definitions, mood tags, and variation links
- **`bass-patterns.json`** - Bass line templates with fill/bridge/build tags
- **`transitions.json`** - Section transition motifs (fills, pickups, breaks)
- **`techniques.json`** - Technique application patterns (duty sweeps, arpeggios, detune, echo)
- **`se-templates.json`** - Sound effect templates (20 variations across 10 types)

**Motif Design Principles**:
- Consistent ID prefixes: `RM` (rhythm), `MF` (melody), `DP` (drums), `CP` (chords), `BP` (bass), `SE_*` (sound effects)
- Rich metadata tags for context-aware selection
- Variation links to avoid repetition
- Loop-safe and cadence tags for structural integrity
- Preserve sorted keys when editing JSON

### Web Demo
- `packages/demo/` - Vite-based demo application  
  - `src/main.ts` - Entry point and scheduler wiring  
  - `src/synth.ts` - Web Audio synthesis helpers  
  - `worklets/` - AudioWorklet processors  
  - `scripts/copy-assets.mjs` - Copies build artifacts into `docs/`

### Documentation & Outputs
- Root-level references:
  - `score.md` - **Production specification** (primary reference)
  - `se.md` - Sound effect generation specification
  - `README.md` - Project overview
- `docs/` - Single source of truth for published artifacts  
  - `docs/lib/` - UMD bundles exported by `npm run build:pages` (motif JSON is embedded here)  
  - `docs/` root - Built demo assets (mirrors `packages/demo/dist/`)  

### Build Artifacts
- `packages/core/dist/` - Bundled library output
- `packages/demo/dist/` - Built demo assets (copied into `docs/` via `npm run build:pages`)
- `node_modules/` - npm dependencies (gitignored)

---

## Build, Test, and Development Commands

### Setup and Installation

```bash
npm install              # Install workspace dependencies (run after cloning or package.json changes)
```

### Build Commands

```bash
npm run build:core       # Build @algo-chip/core package only
                         # Output: packages/core/dist/

npm run build:demo       # Build demo application only
                         # Output: packages/demo/dist/

npm run build:pages      # Build both packages and refresh docs/ artifacts
                         # Equivalent to: build:core + build:demo + copy:artifacts
                         # Output: docs/ (publishable GitHub Pages artifacts)

npm run build            # Build all workspace packages
```

### Development Commands

```bash
npm run dev              # Launch demo dev server (http://localhost:5173)
                         # Hot-reload enabled for demo development

npm run preview          # Preview production demo build locally
                         # Serves packages/demo/dist/ for production testing
```

### Test Commands

```bash
npm test                 # Run all test suites across workspace
                         # Executes packages/core/src/test/**/*.spec.ts

npm run test:core        # Run core package tests only (if defined in packages/core)
```

### Workflow Guidelines

- **Initial setup**: `npm install` → `npm run build:pages`
- **Core development**: Edit `packages/core/src/` → `npm run build:core` → `npm test`
- **Demo development**: Edit `packages/demo/src/` → `npm run dev` (auto-reload)
- **Pre-commit**: `npm test` → `npm run build:pages` → verify demo playback
- **Publishing**: `npm run build:pages` → commit `docs/` artifacts

### SE (Sound Effect) System

The SE generation system is fully integrated with BGM generation. **Implementation status and TODOs are documented in code comments**.

#### SE Types and Templates

10 SE types with 20 template variations (2 per type):

| Type | Description | Channels | Duration | Key Features |
|------|-------------|----------|----------|--------------|
| **jump** | Jump sound | square1/square2 | 0.12-0.30s | Rising pitch sweep (exponential) |
| **coin** | Coin pickup | square1 | 0.18-0.24s | 2-3 note ascending arpeggio |
| **explosion** | Explosion | noise + triangle | 0.80-1.20s | Noise burst + descending bass sweep |
| **hit** | Damage taken | square1 | 0.08-0.12s | Short descending arpeggio |
| **powerup** | Powerup acquired | square1 | 0.50-0.70s | 4-note ascending arpeggio |
| **laser** | Laser shot | square1/square2 | 0.10-0.20s | Fast descending sweep (exponential) |
| **select** | Menu selection | square1 | 0.05-0.10s | Short single tone |
| **click** | Click | square1 | 0.02-0.04s | Very short high-pitched tone |
| **synth** | Synth tone | square1/square2/triangle | 0.15-0.40s | Sustained tone with duty cycle variation |
| **tone** | Basic tone | square1/triangle | 0.10-0.30s | Simple single tone |

#### SE Generation Parameters

All parameters are seed-driven and deterministically sampled from template ranges:

- **Pitch sweep**: Start pitch → end pitch with linear/exponential curve interpolation
- **Duty cycle**: Square wave shape (12.5%, 25%, 50%)
- **Note sequence**: Arpeggio patterns with interval definitions and note durations
- **Noise mode**: short (high-frequency) / long (low-frequency)
- **Duration**: Random sampling within template-defined range
- **Velocity**: Volume range specification

#### Usage Example

```typescript
import { SEGenerator } from "@algo-chip/core/se/seGenerator.js";

const generator = new SEGenerator();

// Basic usage
const jumpSE = generator.generateSE({ type: "jump" });

// Seed-driven reproducibility
const coinSE1 = generator.generateSE({ type: "coin", seed: 12345 });
const coinSE2 = generator.generateSE({ type: "coin", seed: 12345 });
// coinSE1.events === coinSE2.events (identical)

// Specific template selection
const explosionSE = generator.generateSE({
  type: "explosion",
  templateId: "SE_EXPLOSION_02",
  startTime: 2.5  // Start at 2.5 seconds
});

// Integration with BGM
import { generateComposition } from "@algo-chip/core";
const bgm = await generateComposition({ seed: 999 });
const jump = generator.generateSE({ type: "jump", startTime: 3.0 });
const allEvents = [...bgm.events, ...jump.events].sort((a, b) => a.time - b.time);
```

#### Integration Points

- `packages/core/src/se/` - Core SE generation logic
- `packages/demo/src/main.ts` - Demo event hooks and SE triggers
- `packages/demo/src/playback.ts` - Playback helpers
- Follow `TODO` and `IMPLEMENTED` markers when extending features

---

## Coding Style & Naming Conventions

- **Language**: TypeScript with ES module syntax
- **Strict mode**: Enabled (`tsconfig.json` uses `strict: true`)
- **Indentation**: 2 spaces
- **Variables/Functions**: camelCase
- **Types/Interfaces**: PascalCase (exported)
- **Filenames**: kebab-case
- **Motif JSON**: Preserve sorted keys and consistent ID prefixes (`RM`, `MF`, `DP`, etc.)

---

## Testing Guidelines

### Test Organization

- **Location**: `packages/core/src/test/`
- **Naming**: `<feature>.spec.ts` (e.g., `pipeline.spec.ts`, `two-axis-mapper.spec.ts`)
- **Execution**: `npm test` (runs all specs) or `npm run test:core` (core package only)
- Mirror feature file hierarchy when adding new test suites

### Existing Test Suites

- `pipeline.spec.ts` - End-to-end pipeline validation
- `pipeline-regression.spec.ts` - Regression tests for known issues
- `two-axis-mapper.spec.ts` - Two-axis style system tests
- `two-axis-corner-cases.spec.ts` - Edge case coverage for style mapping
- `two-axis-multi-seed.spec.ts` - Multi-seed diversity validation
- `se-generator.spec.ts` - Sound effect generation tests
- `noise-collision.spec.ts` - Noise channel single-voice guard tests
- `motif-constraint.spec.ts` - Motif selection constraint validation
- `fixed-length.spec.ts` - Fixed-length composition tests
- `gradual-build.spec.ts` - Gradual build dynamics tests
- `chord-variety.spec.ts` - Chord progression variety tests
- `electronica.spec.ts` - Electronica style tests

### Test Assertions

Keep existing assertions passing when modifying motifs/templates. Core assertions include:

- **Section alignment**: Section lengths match template definitions
- **Channel voice counts**: Each channel has appropriate note density
- **Timeline ordering**: Events are time-sorted with valid noteOn/noteOff pairs
- **Event pair integrity**: Every noteOn has a matching noteOff
- **Loop integrity**: Tail events don't overlap with head events
- **Noise collision**: Noise channel never has overlapping notes
- **Velocity ranges**: Velocity values within valid MIDI range (0-127)
- **Motif constraints**: Tag-filtered motif selection respects constraints

### Verification Workflow (from score.md)

For production-quality validation, run multi-seed verification batches:

**Recommended verification checklist**:

1. **Seed diversity**: Generate multiple seeds with same mood/tempo/length settings
   - Verify motif ID distribution spreads across candidates
   - Check technique application rates vary appropriately
   - Validate channel noteOn counts show variance

2. **Option diversity**: Rotate mood/tempo/length combinations
   - Build coverage matrix: mood × tempo × measures
   - Verify histogram distribution across `meta.mood`, `meta.tempo`, `meta.lengthInMeasures`
   - Adjust templates if any dimension is underrepresented

3. **Motif distribution**: Analyze tag selection logs
   - Confirm mood tags switch candidates appropriately
   - Check for motif ID repetition or stagnation
   - Validate `loop_safe` and `cadence` tags apply correctly

4. **Melody shape and accompaniment density**:
   - Build square1 pitch heatmaps and leap width statistics
   - Calculate square2 note counts and rest ratios per measure
   - Flag extreme silence or machine-gun repetition

5. **Bassline and drums**:
   - Measure triangle root/5th ratio distribution
   - Analyze noise beat/fill ID distribution and fill insertion frequency
   - Verify noise active voice count never exceeds 1 (automated lint)

6. **Dynamics**: Measure velocity mean/range per section
   - Validate dynamic arc matches section intentions (A=mf, B=f, Outro=mp)
   - Check seed variance produces different velocity curves

7. **Loop integrity**:
   - Concatenate final + head measures in virtual timeline
   - Verify no reverb/tail events overlap next loop
   - Validate smooth channel active-count transitions

8. **Duplicate prevention**:
   - Hash eventList content and motif ID signatures
   - Compare against existing output catalog
   - Flag threshold-exceeding similarity

9. **Motif recurrence measurement**:
   - Calculate representative motif ID reuse rate per section
   - Verify melody/rhythm reappear in ≥25% of measures
   - Review Phase 2 cache/variation logic if below threshold

10. **Phrase integrity**:
    - Validate 2-4 measure phrase boundaries have proper pickup/cadence tags
    - Flag missing or duplicate functional tags
    - Adjust Phase 2 phrase composition or section linking

11. **Texture plan audit**:
    - Compare Phase 1 section texture definitions with actual square2/square1 event density
    - Generate voice_allocation heatmaps to detect discrepancies
    - Re-tune broken chord/arpeggio logic if misaligned

12. **Dynamics profile comparison**:
    - Record average velocity and peak difference per section
    - Compare against expected dynamic arc (e.g., A=mf, B=f, Outro=mp)
    - Re-adjust Phase 3 envelope generation if deviation detected

13. **Transition diagnostics**:
    - Verify drum fill/pickup events fire at section boundaries
    - Check Phase 4 duty/gain sweeps trigger at expected timestamps
    - Re-design transition logic if events missing

14. **Melody-rhythm duration validation**:
    - Verify `melody-rhythm` motif total durations match measure length
    - Check rest/long-tone placement doesn't overlap loop head
    - Run `npm run check:melody-rhythm` (if available) for automated validation

### Continuous Integration Best Practices

- Run full test suite before commits: `npm test`
- Rebuild and verify demo after motif changes: `npm run build:pages`
- Audition demo playback to catch subjective issues
- Document regression fixes with dedicated test specs
- Update test expectations when intentionally changing output

---

## Commit & Pull Request Guidelines

- **Commit messages**: Imperative mood (`Add phase6 envelope sweep`)
- **Logical grouping**: Prefer separate commits for distinct changes
- **Issue references**: Use `Closes #123` when applicable
- **Commit/PR description**: Summarize build/test/demo verification results
- **PR content**: Detail features, testing performed (Node smoke tests as applicable, `npm run build:pages`, demo verification), include artifacts/screenshots

---

## Web Audio Demo Workflow Tips

- Use "タイミング検証トラック生成" button in the demo UI to audition high-density click/bass patterns
- Confirm scheduler stability before sharing recordings
- For browser timing jitter:
  - Adjust buffer lead time (`startTime` in `src/main.ts`)
  - Modify latency hint as needed
  - Document deviations in PRs for reproducibility

---

## Reference Specifications

### Primary Documentation

1. **`score.md`** - Production specification for BGM generation
   - Five-phase pipeline architecture (Phase 1-5)
   - Two-axis style system specification
   - Voice Arrangement system design
   - Motif-based generation logic
   - Verification workflow and quality checkpoints
   - This is the **authoritative reference** for BGM implementation

2. **`se.md`** - Sound effect generation specification
   - SE type catalog (10 types, 20 templates)
   - Template-based generation architecture
   - Seed-driven RNG specification
   - BGM integration patterns
   - Web Audio integration guidelines

3. **`README.md`** - Project overview and quick start guide

### Development Focus Areas

Active development should prioritize:

1. **Implementation alignment** - Keep `packages/core/` synchronized with `score.md` and `se.md` specifications
2. **Motif catalog expansion** - Add new motifs in `packages/core/motifs/` following design principles in `score.md`
3. **Quality verification** - Run verification workflow from `score.md` § "付録: 生成後検証ループとチェックポイント"
4. **Test coverage** - Extend `packages/core/src/test/` to cover new features and edge cases
5. **Demo integration** - Verify changes via `npm run build:pages` and browser playback

### Specification Update Protocol

When updating specifications:

- **score.md**: Update when changing pipeline architecture, adding phases, or modifying core algorithms
- **se.md**: Update when adding SE types, modifying templates, or changing SE generation logic
- **CLAUDE.md**: Update when changing project structure, build process, or development guidelines
- Keep all three documents synchronized to avoid confusion
