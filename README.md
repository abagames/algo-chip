# algo-chip

English | [日本語](./README_ja.md)

**High-quality automatic BGM composition engine with 4-channel chiptune synthesis**

## 🎵 Features

- **Motif-based composition**: Pre-defined musical patterns with intelligent variation
- **4-channel chiptune synthesis**: Classic 4-channel audio (2x square wave, triangle, noise)
- **Deterministic generation**: Seed-based RNG for reproducible results
- **Dual distribution**: npm package + standalone UMD bundle for CDN/`<script>` tag

## 📦 Installation

### npm

```bash
npm install @algo-chip/core
```

### CDN (UMD)

```html
<script src="https://abagames.github.io/algo-chip/lib/algo-chip.umd.js"></script>
<script>
  const { generateComposition, SEGenerator, AlgoChipSynthesizer } =
    window.AlgoChip;
</script>
```

**Important**: When using Web Audio playback (`AlgoChipSynthesizer`) via UMD, you need to specify where to load the AudioWorklet processors from.

**Option 1: Use GitHub Pages CDN (Recommended)**

```html
<script>
  const audioContext = new AudioContext();
  const synth = new AlgoChip.AlgoChipSynthesizer(audioContext, {
    workletBasePath: 'https://abagames.github.io/algo-chip/worklets/'
  });
  await synth.init();
</script>
```

**Option 2: Self-host worklets**

```html
<!-- Download and host these files on your server: -->
<!-- worklets/square-processor.js -->
<!-- worklets/triangle-processor.js -->
<!-- worklets/noise-processor.js -->

<script>
  const audioContext = new AudioContext();
  const synth = new AlgoChip.AlgoChipSynthesizer(audioContext, {
    workletBasePath: './worklets/'  // Path relative to your HTML
  });
  await synth.init();
</script>
```

## 🚀 Usage

### Basic BGM Generation

```typescript
import { generateComposition } from "@algo-chip/core";

const result = await generateComposition({
  lengthInMeasures: 16,
  seed: 12345,
  twoAxisStyle: {
    percussiveMelodic: -0.4, // Percussive-leaning
    calmEnergetic: 0.5, // Energetic
  },
});

// result.events - Playback event timeline
// result.meta - Generation metadata (BPM, key, etc.)
console.log(
  `Generated ${result.events.length} events at ${result.meta.bpm} BPM`
);
```

### Sound Effect Generation

```typescript
import { SEGenerator } from "@algo-chip/core";

const generator = new SEGenerator();
const se = generator.generateSE({
  type: "jump",
  seed: 42,
});

// se.events - SE event timeline
// se.meta - SE metadata
```

### Web Audio Playback

The core package includes `AlgoChipSynthesizer` for Web Audio-based playback with volume control:

```typescript
import {
  generateComposition,
  SEGenerator,
  AlgoChipSynthesizer,
} from "@algo-chip/core";

// Initialize synthesizer
const audioContext = new AudioContext();
const synth = new AlgoChipSynthesizer(audioContext);
// Optional: specify custom worklet path
// const synth = new AlgoChipSynthesizer(audioContext, { workletBasePath: './custom-path/' });
await synth.init();

// Play BGM with volume control
const bgm = await generateComposition({ seed: 123 });
await synth.play(bgm.events, {
  loop: true,
  volume: 0.8, // 80% volume (default: 1.0)
});

// Play SE with volume control
const seGenerator = new SEGenerator();
const jump = seGenerator.generateSE({ type: "jump" });
await synth.play(jump.events, {
  volume: 0.5, // 50% volume (default: 1.0)
});
```

**Volume option**:

- Default: `1.0` (base gain = 0.7)
- Range: `0.0+` (e.g., `0.5` = 50%, `1.5` = 150%)
- Applied at playback time, not generation time

**Note**: `AlgoChipSynthesizer` requires a browser environment (Web Audio API).
Advanced SE playback patterns (ducking, quantization, controller wiring) are
documented in [USAGE.md](./USAGE.md) alongside pointers into the demo helpers.

### Session Helpers (`@algo-chip/util`)

When you need session management (auto-looped BGM, SE ducking/quantization,
visibility pause, etc.) pull in `@algo-chip/util`.

**ESM / npm**

```typescript
import {
  createAudioSession,
  createVisibilityController,
} from "@algo-chip/util";

const session = createAudioSession({
  workletBasePath: "./worklets/",
});

await session.resumeAudioContext();
const bgm = await session.generateBgm({ seed: 9001 });
await session.playBgm(bgm, { loop: true });

const detachVisibility = createVisibilityController(session);
// Later: detachVisibility(); await session.close();
```

**CDN / UMD**

Both the core engine and util helpers ship prebuilt bundles on GitHub Pages:

```html
<script src="https://abagames.github.io/algo-chip/lib/algo-chip.umd.js"></script>
<script src="https://abagames.github.io/algo-chip/lib/algo-chip-util.umd.js"></script>
<script>
  const { createAudioSession } = window.AlgoChipUtil;
  const session = createAudioSession({
    workletBasePath: "https://abagames.github.io/algo-chip/worklets/",
  });
  await session.resumeAudioContext();
  const bgm = await session.generateBgm({ seed: 12 });
  await session.playBgm(bgm, { loop: true });
</script>
```

See [USAGE.md](./USAGE.md) for deeper API coverage (SE ducking, quantization,
default overrides, timeline inspection, etc.).

## 🛠️ Development

### Setup

```bash
npm install
```

### Build Commands

```bash
npm run build              # Build all packages
npm run build:core         # Build core library only
npm run build:demo         # Build demo app only
npm run build:pages        # Build and deploy to docs/ (GitHub Pages)
```

### Development Server

```bash
npm run dev                # Start demo dev server (http://localhost:5173)
npm run preview            # Preview production build
```

## 📁 Project Structure

```
algo-chip/
├── packages/
│   ├── core/              # @algo-chip/core npm package
│   │   ├── src/           # TypeScript source (5-phase pipeline)
│   │   ├── motifs/        # Motif JSON libraries (chords, melody, rhythm, etc.)
│   │   └── dist/          # Build output
│   │       ├── index.js           # ESM bundle
│   │       ├── index.d.ts         # TypeScript definitions
│   │       └── algo-chip.umd.js   # UMD bundle
│   ├── util/              # @algo-chip/util npm package (AudioSession helpers)
│   │   ├── src/           # Session orchestration, ducking, quantization
│   │   └── dist/
│   │       ├── index.js           # ESM bundle
│   │       └── algo-chip-util.umd.js
│   └── demo/              # Demo web application
│       ├── src/           # Demo UI code (Web Audio playback)
│       ├── index.html     # Main demo page
│       └── dist/          # Demo build output
└── docs/                  # GitHub Pages artifacts (auto-generated)
    ├── index.html         # Demo page (from packages/demo/dist)
    ├── assets/            # Vite build output (from packages/demo/dist)
    ├── lib/               # UMD bundles (copied from packages/*/dist)
    │   ├── algo-chip.umd.js
    │   └── algo-chip-util.umd.js
    └── worklets/          # Web Audio Worklet processors (from packages/demo/dist)
```

## 🎼 Pipeline Architecture

The composition engine follows a **five-phase pipeline**:

1. **Structure Planning** - BPM, key, sections, chord progressions
2. **Motif Selection** - Rhythm, melody, bass, drum pattern assignment
3. **Event Realization** - Convert abstract motifs to concrete note events
4. **Techniques** - Apply echo, detune, arpeggios
5. **Timeline Finalization** - Sort events, convert beat→time, generate diagnostics

## 📖 Documentation

- `score.md` ([日本語](./score_ja.md)) - Production specification (primary reference)
- `se.md` ([日本語](./se_ja.md)) - Sound effect generation specification
- `AGENTS.md` - Development guidelines and coding conventions
- `docs/` - GitHub Pages deployment target (kept in sync via `npm run build:pages`)

## 🔗 Links

- [Live Demo](https://abagames.github.io/algo-chip/)
- [UMD Bundle](https://abagames.github.io/algo-chip/lib/algo-chip.umd.js)
- [Util UMD Bundle](https://abagames.github.io/algo-chip/lib/algo-chip-util.umd.js)
- [@algo-chip/core on npm](https://www.npmjs.com/package/@algo-chip/core) _(After publishing)_
- [@algo-chip/util on npm](https://www.npmjs.com/package/@algo-chip/util) _(After publishing)_
