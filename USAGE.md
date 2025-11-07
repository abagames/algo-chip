# Usage Guide

English | [日本語](./USAGE_ja.md)

This guide collects practical examples for integrating the published
`algo-chip` npm package into a Web Audio application. The high-level
architecture and specifications remain in
`score.md` and `se.md`; here we focus on code that you can copy into your own
project.

## 1. BGM Generation

```typescript
import { generateComposition } from "algo-chip";

const bgm = await generateComposition({
  lengthInMeasures: 16,
  seed: 12345,
  twoAxisStyle: {
    percussiveMelodic: -0.2,
    calmEnergetic: 0.6,
  },
});

console.log(`BPM: ${bgm.meta.bpm}, events: ${bgm.events.length}`);
```

- `seed` keeps generation deterministic.
- `twoAxisStyle` sketches the musical feel along the percussive/melodic and
  calm/energetic axes.

## 2. Sound Effect Generation

```typescript
import { SEGenerator } from "algo-chip";

const generator = new SEGenerator();
const jumpEffect = generator.generateSE({
  type: "jump",
  seed: 4242,
});

console.log(`Template used: ${jumpEffect.meta.templateId}`);
```

Sound effect events share the same `Event[]` structure as BGM, so they can be
mixed or scheduled together.

## 3. Minimal Playback with AlgoChipSynthesizer

```typescript
import { AlgoChipSynthesizer } from "algo-chip";

const audioContext = new AudioContext();
const synth = new AlgoChipSynthesizer(audioContext, {
  workletBasePath: "./worklets/",
});
await synth.init();

await synth.play(bgm.events, {
  loop: true,
  volume: 0.8,
});

await synth.play(jumpEffect.events, {
  startTime: audioContext.currentTime + 0.2,
  volume: 0.6,
});
```

`SynthPlayOptions` (documented in the generated TypeDoc under `docs/api/`) lets
you control `startTime`, `loop`, `lookahead`, `leadTime`, `onEvent`, and
`volume`.

## 4. Session-Oriented Playback (shared helpers)

The util helpers included in `algo-chip` expose a higher-level `AudioSession` that
bundles BGM generation, looping playback, and SE quantization/ducking into a
single object. This is what the web demo UI uses internally, so downstream apps
can depend on the published package rather than copying demo code.

```typescript
import { createAudioSession } from "algo-chip";

const session = createAudioSession({
  workletBasePath: "./worklets/",
});

// Must be invoked from a user-initiated event handler (click/touch) due to browser autoplay policy.
await session.resumeAudioContext();

// Generate and start looping BGM (stores active timeline for SE quantitation)
const bgm = await session.generateBgm({
  lengthInMeasures: 16,
  seed: 9001,
  twoAxisStyle: { percussiveMelodic: -0.3, calmEnergetic: 0.7 },
});

await session.playBgm(bgm, {
  loop: true,
  onEvent: (event, when) => {
    // Optional: hook for visualization
  },
});

// Generate then play a beat-quantized, ducked SE with a fixed seed
const coinSe = session.generateSe({
  type: "coin",
  seed: 4242,
});

await session.playSe(coinSe, {
  duckingDb: -4,
  quantize: {
    quantizeTo: "beat",
    phase: "next",
    loopAware: true,
  },
});
```

- `configureSeDefaults({ duckingDb, volume, quantize })` adjusts the defaults
  used by subsequent `triggerSe` calls.
- `setBgmVolume(value)` rescales the looped BGM without rebuilding the synth.
- `cancelScheduledSe()` clears any queued-but-not-yet-fired SEs (useful when
  pausing or stopping playback).
- `triggerSe(options)` remains available as a convenience wrapper that calls
  `generateSe` + `playSe` in a single step.

Under the hood the session wraps `AlgoChipSynthesizer` and the
`SoundEffectController`; if you need deeper customization you can import and
wire those pieces manually from the util exports provided by `algo-chip` (or
the optional subpath `algo-chip/util`).

### 4.1 Tab Visibility Pause / Resume

`algo-chip` also ships `createVisibilityController`, which wires browser
visibility changes to the session’s pause/resume flow. It captures the current
loop offset, suspends the audio context while the tab is hidden, then resumes
playback seamlessly when focus returns.

```typescript
import { createAudioSession, createVisibilityController } from "algo-chip";

const session = createAudioSession();

const detachVisibility = createVisibilityController(session, {
  // Optional: limit auto-pausing to when BGM is active; omit to pause unconditionally.
  shouldPause: () => session.getActiveTimeline() !== null,
  onPause: ({ offsetSeconds }) => {
    console.log("Paused at", offsetSeconds);
  },
  onResume: ({ resumed }) => {
    console.log(resumed ? "Resumed playback" : "Resume failed");
  },
});

// Later, when cleaning up:
detachVisibility();
await session.close();
```

Callbacks are optional—omit them if you only need the default behavior. Always
call the disposer (and `session.close()`) when tearing down your app.

## 5. Regenerating API Reference

Run TypeDoc whenever you change the public API:

```bash
npm run docs:api
```

The HTML output is written to `docs/api/`, and a short entry page lives in
`docs/api-reference.md`.
