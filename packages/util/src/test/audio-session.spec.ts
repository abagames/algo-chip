import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  PipelineResult,
  SEGenerationOptions,
  SEGenerationResult,
  SynthPlayOptions,
} from "../types.js";
import {
  AudioSessionImpl,
  type AudioSessionDependencies,
} from "../core.js";

function createGainNode(initialValue = 0.16) {
  const calls: Array<{ value: number; time: number }> = [];
  const gain = {
    value: initialValue,
    setValueAtTime(value: number, time: number) {
      this.value = value;
      calls.push({ value, time });
    },
  };
  return {
    node: { gain } as unknown as GainNode,
    calls,
  };
}

function createFixture() {
  const bgmGain = createGainNode();
  const seGain = createGainNode();
  const synths = [bgmGain, seGain].map(({ node }) => ({
    masterGain: node,
    initCalls: 0,
    stopCalls: 0,
    playCalls: [] as Array<{ events: unknown[]; options: SynthPlayOptions }>,
    loopCalls: [] as Array<{ events: unknown[]; options: SynthPlayOptions }>,
    async init() {
      this.initCalls += 1;
    },
    async play(events: unknown[], options: SynthPlayOptions) {
      this.playCalls.push({ events, options });
    },
    playLoop(events: unknown[], options: SynthPlayOptions) {
      this.loopCalls.push({ events, options });
    },
    stop() {
      this.stopCalls += 1;
    },
  }));
  const controller = {
    playCalls: [] as Array<{ result: SEGenerationResult; options: unknown }>,
    resetCalls: 0,
    cancelCalls: 0,
    async play(result: SEGenerationResult, options: unknown) {
      this.playCalls.push({ result, options });
    },
    resetDucking() {
      this.resetCalls += 1;
    },
    cancelPendingJobs() {
      this.cancelCalls += 1;
    },
  };
  const generationCalls: SEGenerationOptions[] = [];
  const seResult = {
    events: [],
    meta: { type: "coin", duration: 0.1, replayOptions: { type: "coin" } },
  } as unknown as SEGenerationResult;
  const contextMock = {
    currentTime: 10,
    state: "running",
    closeCalls: 0,
    resumeCalls: 0,
    suspendCalls: 0,
    async close() {
      contextMock.closeCalls += 1;
    },
    async resume() {
      contextMock.resumeCalls += 1;
    },
    async suspend() {
      contextMock.suspendCalls += 1;
    },
  };
  const context = contextMock as unknown as AudioContext & {
    closeCalls: number;
    resumeCalls: number;
    suspendCalls: number;
  };
  let synthIndex = 0;
  const dependencies: AudioSessionDependencies = {
    generateComposition: async () => result,
    createAudioContext: () => context,
    createSynthesizer: () => synths[synthIndex++],
    createSeGenerator: () => ({
      generateSE(options) {
        generationCalls.push(options);
        return seResult;
      },
    }),
    createSoundEffectController: () => controller,
  };
  const result = {
    events: [{ time: 0 }],
    meta: { loopInfo: { totalDuration: 8 } },
  } as unknown as PipelineResult;

  return {
    context,
    controller,
    dependencies,
    generationCalls,
    result,
    seGain,
    seResult,
    synths,
    bgmGain,
  };
}

describe("AudioSession", () => {
  it("plays loop and one-shot BGM with normalized timeline options", async () => {
    const fixture = createFixture();
    const session = new AudioSessionImpl(
      { audioContext: fixture.context, bgmVolume: 0.5 },
      fixture.dependencies
    );

    await session.playBgm(fixture.result, { offset: -2, leadTime: 0.4 });
    assert.equal(fixture.synths[0].loopCalls.length, 1);
    assert.deepEqual(fixture.synths[0].loopCalls[0].options, {
      startTime: 10.4,
      offset: 0,
      leadTime: 0.4,
      lookahead: 0.1,
      volume: 0.5,
      onEvent: undefined,
    });
    assert.deepEqual(session.getActiveTimeline(), {
      startTime: 10.4,
      loop: true,
      meta: fixture.result.meta,
    });

    await session.playBgm(fixture.result, {
      loop: false,
      startTime: 20,
      offset: 3,
      volume: 0.7,
    });
    assert.equal(fixture.synths[0].playCalls.length, 1);
    assert.equal(fixture.synths[0].playCalls[0].options.offset, 3);
    assert.equal(session.getActiveTimeline()?.startTime, 17);
  });

  it("captures pause offsets, resumes, stops, and rejects resume without BGM", async () => {
    const fixture = createFixture();
    const emptySession = new AudioSessionImpl(
      { audioContext: fixture.context },
      fixture.dependencies
    );
    await assert.rejects(() => emptySession.resumeBgm(), /No background music/);

    const session = new AudioSessionImpl(
      { audioContext: fixture.context },
      createFixture().dependencies
    );
    await session.playBgm(fixture.result, { startTime: 4, loop: true });
    assert.equal(session.pauseBgm(), 6);
    await session.resumeBgm({ volume: 0.25 });
    assert.ok(Math.abs((session.getActiveTimeline()?.startTime ?? 0) - 4.2) < 1e-9);
    session.stopBgm();
    assert.equal(session.getActiveTimeline(), null);
  });

  it("applies volume/default changes and forwards triggerSe options by destination", async () => {
    const fixture = createFixture();
    const session = new AudioSessionImpl(
      { audioContext: fixture.context, seDefaults: { duckingDb: -4 } },
      fixture.dependencies
    );
    await session.playBgm(fixture.result);

    session.setBgmVolume(-1);
    session.configureSeDefaults({ volume: -2, duckingDb: -9 });
    assert.deepEqual(fixture.bgmGain.calls.at(-1), { value: 0, time: 10 });
    assert.deepEqual(fixture.seGain.calls.at(-1), { value: 0, time: 10 });

    await session.triggerSe({
      type: "coin",
      seed: 7,
      templateId: "SE_COIN_01",
      baseFrequency: 440,
      quantizeToChord: "C",
      variantIntent: "bright",
      velocityScale: 0.5,
      duckingDb: -12,
      volume: 0.8,
      quantize: { quantizeTo: "beat" },
    });
    assert.deepEqual(fixture.generationCalls, [{
      type: "coin",
      seed: 7,
      templateId: "SE_COIN_01",
      baseFrequency: 440,
      quantizeToChord: "C",
      variantIntent: "bright",
      velocityScale: 0.5,
    }]);
    assert.deepEqual(fixture.controller.playCalls[0], {
      result: fixture.seResult,
      options: {
        duckingDb: -12,
        volume: 0.8,
        quantize: { quantizeTo: "beat" },
      },
    });
  });

  it("stops all audio and closes only an owned context", async () => {
    const fixture = createFixture();
    const session = new AudioSessionImpl({}, fixture.dependencies);
    await session.playBgm(fixture.result);
    session.stopAllAudio();
    assert.ok(fixture.synths[0].stopCalls > 0);
    assert.ok(fixture.synths[1].stopCalls > 0);
    assert.ok(fixture.controller.cancelCalls > 0);

    await session.close();
    assert.equal(fixture.context.closeCalls, 1);
    assert.equal(session.getAudioContext(), null);
  });
});
