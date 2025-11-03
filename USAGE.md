# Usage Guide

This guide collects practical examples for integrating `@algo-chip/core` into a
Web Audio application. The high-level architecture and specifications remain in
`score.md` and `se.md`; here we focus on code that you can copy into your own
project.

## 1. BGM Generation

```typescript
import { generateComposition } from "@algo-chip/core";

const bgm = await generateComposition({
  lengthInMeasures: 16,
  seed: 12345,
  twoAxisStyle: {
    percussiveMelodic: -0.2,
    calmEnergetic: 0.6
  }
});

console.log(`BPM: ${bgm.meta.bpm}, events: ${bgm.events.length}`);
```

- `seed` keeps generation deterministic.
- `twoAxisStyle` sketches the musical feel along the percussive/melodic and
  calm/energetic axes.

## 2. Sound Effect Generation

```typescript
import { SEGenerator } from "@algo-chip/core";

const generator = new SEGenerator();
const jumpEffect = generator.generateSE({
  type: "jump",
  seed: 4242
});

console.log(`Template used: ${jumpEffect.meta.templateId}`);
```

Sound effect events share the same `Event[]` structure as BGM, so they can be
mixed or scheduled together.

## 3. Minimal Playback with AlgoChipSynthesizer

```typescript
import { AlgoChipSynthesizer } from "@algo-chip/core";

const audioContext = new AudioContext();
const synth = new AlgoChipSynthesizer(audioContext, {
  workletBasePath: "./worklets/"
});
await synth.init();

await synth.play(bgm.events, {
  loop: true,
  volume: 0.8
});

await synth.play(jumpEffect.events, {
  startTime: audioContext.currentTime + 0.2,
  volume: 0.6
});
```

`SynthPlayOptions` (documented in the generated TypeDoc under `docs/api/`) lets
you control `startTime`, `loop`, `lookahead`, `leadTime`, `onEvent`, and
`volume`.

## 4. Advanced SE Playback with SoundEffectController

For BGM-synchronised sound effects, the demo package provides
`SoundEffectController` (`packages/demo/src/playback.ts`). It wraps
`AlgoChipSynthesizer` with ducking, queueing, and beat-quantisation logic.

### 4.1 Complete Setup

```typescript
import {
  AlgoChipSynthesizer,
  SEGenerator,
  generateComposition
} from "@algo-chip/core";
import type { PipelineResult } from "@algo-chip/core";
import { SoundEffectController } from "./packages/demo/src/playback.js";
import type { ActiveTimeline } from "./packages/demo/src/types.js";

// --- Initialize core components -------------------------------------------

const audioContext = new AudioContext();
const synth = new AlgoChipSynthesizer(audioContext, {
  workletBasePath: "./worklets/"
});
await synth.init();

const generator = new SEGenerator();

// --- Track active BGM timeline for quantisation ---------------------------

let activeTimeline: ActiveTimeline | null = null;

function setActiveTimeline(bgm: PipelineResult, startTime: number) {
  activeTimeline = {
    startTime,
    loop: true,
    meta: {
      bpm: bgm.meta.bpm,
      loopInfo: bgm.meta.loopInfo
    }
  };
}

const seController = new SoundEffectController(
  audioContext,
  synth,
  () => activeTimeline,
  synth.masterGain
);

// --- Generate and start looping BGM --------------------------------------

const bgm = await generateComposition({ seed: 9001, lengthInMeasures: 16 });
const bgmStartTime = audioContext.currentTime + 0.3; // matches synth lead time

await synth.play(bgm.events, {
  loop: true,
  startTime: bgmStartTime
});

setActiveTimeline(bgm, bgmStartTime);
```

### 4.2 Quantise SE to BGM Ticks

```typescript
const coin = generator.generateSE({ type: "coin" });

await seController.play(coin, {
  duckingDb: -4,
  quantize: {
    quantizeTo: { subdivision: 8 }, // 1/8-note grid (ticks)
    phase: "next",
    offsetBeats: 0,
    loopAware: true
  },
  minIntervalMs: 80,
  volume: 0.9
});
```

- `quantizeTo` accepts `"beat"`, `"half"`, `"measure"`, or a custom
  `{ subdivision }` for finer tick alignment.
- `phase: "next"` snaps to the next tick; set to `"current"` for immediate
  alignment or provide `{ measure, beat }` for absolute positioning.
- When `loopAware` is `true`, quantisation respects the BGM loop window defined
  by `PipelineResult.meta.loopInfo`.

**Note**: `SoundEffectController` lives in the demo package to keep the core
library lightweight. You can copy or adapt the controller if your runtime needs
the same behaviour outside the demo environment.

## 5. Regenerating API Reference

Run TypeDoc whenever you change the public API:

```bash
npm run docs:api
```

The HTML output is written to `docs/api/`, and a short entry page lives in
`docs/api-reference.md`.
