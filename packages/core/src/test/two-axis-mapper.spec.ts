import { describe, it } from "node:test";
import assert from "node:assert";
import {
  mapTwoAxisToStyleIntent,
  deriveTwoAxisTempo,
  inferTagsFromAxis,
  validateTwoAxisStyle
} from "../style/two-axis-mapper.js";
import { presetToTwoAxis } from "../style/preset-to-axis.js";

describe("mapTwoAxisToStyleIntent", () => {
  it("should return high percussiveLayering at -0.51", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: -0.51, calmEnergetic: 0 });
    assert.ok(intent.percussiveLayering > 0.5);
  });

  it("should return low percussiveLayering at -0.3", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: -0.3, calmEnergetic: 0 });
    assert.ok(intent.percussiveLayering <= 0.5);
  });

  it("should return high syncopationBias at -0.51", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: -0.51, calmEnergetic: 0 });
    assert.ok(intent.syncopationBias > 0.5);
  });

  it("should return low syncopationBias at -0.4", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: -0.4, calmEnergetic: 0 });
    assert.ok(intent.syncopationBias <= 0.5);
  });

  it("should return high breakInsertion with strong percussive + energetic", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: -0.51, calmEnergetic: 0.51 });
    assert.ok(intent.breakInsertion > 0.5);
  });

  it("should return low breakInsertion without enough energy", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: -0.6, calmEnergetic: 0.3 });
    assert.ok(intent.breakInsertion <= 0.5);
  });

  it("should return high harmonicStatic with melodic + calm", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: 0.51, calmEnergetic: -0.51 });
    assert.ok(intent.harmonicStatic > 0.5);
  });

  it("should return low harmonicStatic without enough calm", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: 0.5, calmEnergetic: -0.3 });
    assert.ok(intent.harmonicStatic <= 0.5);
  });

  it("should return high atmosPad with melodic", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: 0.51, calmEnergetic: 0 });
    assert.ok(intent.atmosPad > 0.5);
  });

  it("should return high atmosPad with strong calm", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: 0, calmEnergetic: -0.6 });
    assert.ok(intent.atmosPad > 0.5);
  });

  it("should return high filterMotion with melodic", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: 0.51, calmEnergetic: 0 });
    assert.ok(intent.filterMotion > 0.5);
  });

  it("should return high loopCentric with calm", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: 0, calmEnergetic: -0.51 });
    assert.ok(intent.loopCentric > 0.5);
  });

  it("should return high textureFocus with strong calm", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: 0, calmEnergetic: -0.51 });
    assert.ok(intent.textureFocus > 0.5);
  });

  it("should return high textureFocus with percussive + calm combo", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: -0.51, calmEnergetic: -0.3 });
    assert.ok(intent.textureFocus > 0.5);
  });

  it("should return high gradualBuild with energy", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: 0, calmEnergetic: 0.51 });
    assert.ok(intent.gradualBuild > 0.5);
  });

  it("should return low gradualBuild with energy <= 0.5", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: 0, calmEnergetic: 0.4 });
    assert.ok(intent.gradualBuild <= 0.5);
  });

  // Preset verification tests
  it("should match lofi-chillhop preset", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: 0.51, calmEnergetic: -0.6 });
    assert.ok(intent.harmonicStatic > 0.5);
    assert.ok(intent.atmosPad > 0.5);
    assert.ok(intent.loopCentric > 0.5);
    assert.ok(intent.textureFocus > 0.5);
  });

  it("should match minimal-techno preset (percussiveMelodic: -0.51, calmEnergetic: -0.51)", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: -0.51, calmEnergetic: -0.51 });
    assert.ok(intent.percussiveLayering > 0.5);
    assert.ok(intent.loopCentric > 0.5);
  });

  it("should match progressive-house preset", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: -0.51, calmEnergetic: 0.51 });
    assert.ok(intent.gradualBuild > 0.5);
  });

  it("should match breakbeat-jungle preset", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: -0.7, calmEnergetic: 0.7 });
    assert.ok(intent.percussiveLayering > 0.5);
    assert.ok(intent.syncopationBias > 0.5);
    assert.ok(intent.breakInsertion > 0.5);
    assert.ok(intent.gradualBuild > 0.5);
  });

  it("should match retro-loopwave preset (percussiveMelodic: 0.51, calmEnergetic: -0.51)", () => {
    const intent = mapTwoAxisToStyleIntent({ percussiveMelodic: 0.51, calmEnergetic: -0.51 });
    assert.ok(intent.filterMotion > 0.5);
    assert.ok(intent.loopCentric > 0.5);
  });
});


describe("validateTwoAxisStyle", () => {
  it("should clamp values outside the expected range", () => {
    const clamped = validateTwoAxisStyle({ percussiveMelodic: -1.4, calmEnergetic: 1.7 });
    assert.deepStrictEqual(clamped, { percussiveMelodic: -1, calmEnergetic: 1 });
  });

  it("should leave in-range values untouched", () => {
    const original = { percussiveMelodic: 0.25, calmEnergetic: -0.4 };
    assert.deepStrictEqual(validateTwoAxisStyle(original), original);
  });
});

describe("inferTagsFromAxis", () => {
  it("should map low energy to calm tags", () => {
    const tags = inferTagsFromAxis({ percussiveMelodic: 0.1, calmEnergetic: -0.8 });
    assert.deepStrictEqual(tags, { energy: "low", mood: "peaceful" });
  });

  it("should infer tense mood for percussive energetic quadrant", () => {
    const tags = inferTagsFromAxis({ percussiveMelodic: -0.7, calmEnergetic: 0.5 });
    assert.deepStrictEqual(tags, { energy: "high", mood: "tense" });
  });
});

describe("presetToTwoAxis", () => {
  it("should expose known preset coordinates", () => {
    assert.deepStrictEqual(presetToTwoAxis("minimal-techno"), {
      percussiveMelodic: -0.4,
      calmEnergetic: -0.3
    });
  });

  it("should throw for unknown presets", () => {
    assert.throws(() => presetToTwoAxis("unknown-style"));
  });
});


describe("deriveTwoAxisTempo", () => {
  it("should return slow for calm < -0.4", () => {
    const tempo = deriveTwoAxisTempo({ percussiveMelodic: 0, calmEnergetic: -0.5 });
    assert.strictEqual(tempo, "slow");
  });

  it("should return fast for energetic > 0.4", () => {
    const tempo = deriveTwoAxisTempo({ percussiveMelodic: 0, calmEnergetic: 0.6 });
    assert.strictEqual(tempo, "fast");
  });

  it("should return medium for balanced", () => {
    const tempo = deriveTwoAxisTempo({ percussiveMelodic: 0, calmEnergetic: 0 });
    assert.strictEqual(tempo, "medium");
  });

  it("should return medium for edge case (-0.4)", () => {
    const tempo = deriveTwoAxisTempo({ percussiveMelodic: 0, calmEnergetic: -0.4 });
    assert.strictEqual(tempo, "medium");
  });

  it("should return medium for edge case (0.4)", () => {
    const tempo = deriveTwoAxisTempo({ percussiveMelodic: 0, calmEnergetic: 0.4 });
    assert.strictEqual(tempo, "medium");
  });
});
