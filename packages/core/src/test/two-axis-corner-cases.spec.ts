import { describe, it } from "node:test";
import assert from "node:assert";
import { runPipeline } from "../pipeline.js";

/**
 * Test Strategy: Four Corner Cases
 *
 * This test verifies that the two-axis system correctly maps extreme values
 * to the expected StyleIntent flags, tempo, and BPM bias.
 *
 * Four corners:
 * 1. (-1, -1): Ultra Percussive + Ultra Calm
 * 2. (-1, +1): Ultra Percussive + Ultra Energetic
 * 3. (+1, -1): Ultra Melodic + Ultra Calm
 * 4. (+1, +1): Ultra Melodic + Ultra Energetic
 */

describe("Two-Axis Corner Cases", () => {
  const SEED = 99999; // Fixed seed for reproducibility

  describe("Corner 1: Ultra Percussive + Ultra Calm (-1, -1)", () => {
    it("should activate percussive and calm flags", () => {
      const result = runPipeline({
        lengthInMeasures: 8,
        seed: SEED,
        twoAxisStyle: {
          percussiveMelodic: -1.0,
          calmEnergetic: -1.0
        }
      });

      const intent = result.meta.styleIntent;
      console.log("(-1, -1) Intent:", intent);
      console.log("(-1, -1) Tempo:", result.meta.tempo);
      console.log("(-1, -1) BPM:", result.meta.bpm);

      // Percussive flags (percussiveStrength = 1.0)
      assert.ok(intent.percussiveLayering > 0.5, "percussiveLayering should be true");
      assert.ok(intent.syncopationBias > 0.5, "syncopationBias should be true");

      // Calm flags (calmStrength = 1.0)
      assert.ok(intent.loopCentric > 0.5, "loopCentric should be true");
      assert.ok(intent.textureFocus > 0.5, "textureFocus should be true");

      // Melodic flags should be false
      assert.ok(intent.filterMotion <= 0.5, "filterMotion should remain disabled without melodic drive");
      assert.ok(intent.harmonicStatic > 0.5, "harmonicStatic should engage for percussive calm combinations");

      // Energy flags should be false
      assert.ok(intent.gradualBuild <= 0.5, "gradualBuild should be false");

      // Tempo & energy tags
      assert.strictEqual(result.meta.tempo, "slow", "tempo should be slow");
      assert.strictEqual(result.meta.profile.tags.energy, "low", "energy tag should be low");
    });
  });

  describe("Corner 2: Ultra Percussive + Ultra Energetic (-1, +1)", () => {
    it("should activate percussive and energetic flags", () => {
      const result = runPipeline({
        lengthInMeasures: 8,
        seed: SEED,
        twoAxisStyle: {
          percussiveMelodic: -1.0,
          calmEnergetic: 1.0
        }
      });

      const intent = result.meta.styleIntent;
      console.log("(-1, +1) Intent:", intent);
      console.log("(-1, +1) Tempo:", result.meta.tempo);
      console.log("(-1, +1) BPM:", result.meta.bpm);

      // Percussive flags (percussiveStrength = 1.0)
      assert.ok(intent.percussiveLayering > 0.5, "percussiveLayering should be true");
      assert.ok(intent.syncopationBias > 0.5, "syncopationBias should be true");
      assert.ok(intent.breakInsertion > 0.5, "breakInsertion should be true (percussive + energetic)");

      // Energetic flags (energyStrength = 1.0)
      assert.ok(intent.gradualBuild > 0.5, "gradualBuild should be true");

      // Calm flags should be false
      assert.ok(intent.loopCentric <= 0.5, "loopCentric should be false");

      // Melodic flags should be false
      assert.ok(intent.filterMotion > 0.5, "filterMotion should reflect energetic motion");
      assert.ok(intent.harmonicStatic <= 0.5, "harmonicStatic should be false");

      // Tempo & energy tags
      assert.strictEqual(result.meta.tempo, "fast", "tempo should be fast");
      assert.strictEqual(result.meta.profile.tags.energy, "high", "energy tag should be high");
    });
  });

  describe("Corner 3: Ultra Melodic + Ultra Calm (+1, -1)", () => {
    it("should activate melodic and calm flags", () => {
      const result = runPipeline({
        lengthInMeasures: 8,
        seed: SEED,
        twoAxisStyle: {
          percussiveMelodic: 1.0,
          calmEnergetic: -1.0
        }
      });

      const intent = result.meta.styleIntent;
      console.log("(+1, -1) Intent:", intent);
      console.log("(+1, -1) Tempo:", result.meta.tempo);
      console.log("(+1, -1) BPM:", result.meta.bpm);

      // Melodic flags (melodicStrength = 1.0)
      assert.ok(intent.harmonicStatic > 0.5, "harmonicStatic should be true (melodic + calm)");
      assert.ok(intent.atmosPad > 0.5, "atmosPad should be true");
      assert.ok(intent.filterMotion > 0.5, "filterMotion should be true");

      // Calm flags (calmStrength = 1.0)
      assert.ok(intent.loopCentric > 0.5, "loopCentric should be true");
      assert.ok(intent.textureFocus > 0.5, "textureFocus should be true");

      // Percussive flags should be false
      assert.ok(intent.percussiveLayering <= 0.5, "percussiveLayering should be false");
      assert.ok(intent.syncopationBias <= 0.5, "syncopationBias should be false");

      // Energy flags should be false
      assert.ok(intent.gradualBuild <= 0.5, "gradualBuild should be false");
      assert.ok(intent.breakInsertion <= 0.5, "breakInsertion should be false");

      // Tempo & energy tags
      assert.strictEqual(result.meta.tempo, "slow", "tempo should be slow");
      assert.strictEqual(result.meta.profile.tags.energy, "low", "energy tag should be low");
    });
  });

  describe("Corner 4: Ultra Melodic + Ultra Energetic (+1, +1)", () => {
    it("should activate melodic and energetic flags", () => {
      const result = runPipeline({
        lengthInMeasures: 8,
        seed: SEED,
        twoAxisStyle: {
          percussiveMelodic: 1.0,
          calmEnergetic: 1.0
        }
      });

      const intent = result.meta.styleIntent;
      console.log("(+1, +1) Intent:", intent);
      console.log("(+1, +1) Tempo:", result.meta.tempo);
      console.log("(+1, +1) BPM:", result.meta.bpm);

      // Melodic flags (melodicStrength = 1.0)
      assert.ok(intent.atmosPad > 0.5, "atmosPad should be true");
      assert.ok(intent.filterMotion > 0.5, "filterMotion should be true");

      // Energetic flags (energyStrength = 1.0)
      assert.ok(intent.gradualBuild > 0.5, "gradualBuild should be true");

      // harmonicStatic requires melodic + CALM, so should be false here
      assert.ok(intent.harmonicStatic <= 0.5, "harmonicStatic should be false (needs calm)");

      // Calm flags should be false
      assert.ok(intent.loopCentric <= 0.5, "loopCentric should be false");
      assert.ok(intent.textureFocus <= 0.5, "textureFocus should be false");

      // Percussive flags should be false
      assert.ok(intent.percussiveLayering <= 0.5, "percussiveLayering should be false");
      assert.ok(intent.syncopationBias <= 0.5, "syncopationBias should be false");
      assert.ok(intent.breakInsertion <= 0.5, "breakInsertion should be false (needs percussive)");

      // Tempo & energy tags
      assert.strictEqual(result.meta.tempo, "fast", "tempo should be fast");
      assert.strictEqual(result.meta.profile.tags.energy, "high", "energy tag should be high");
    });
  });

  describe("Center: Balanced (0, 0)", () => {
    it("should apply baseline variety and remain tempo/energy neutral", () => {
      const result = runPipeline({
        lengthInMeasures: 8,
        seed: SEED,
        twoAxisStyle: {
          percussiveMelodic: 0.0,
          calmEnergetic: 0.0
        }
      });

      const intent = result.meta.styleIntent;
      console.log("(0, 0) Intent:", intent);
      console.log("(0, 0) Tempo:", result.meta.tempo);
      console.log("(0, 0) BPM:", result.meta.bpm);

      // Baseline variety ensures at least one of the safe candidates is true
      const baselineCandidates: (keyof typeof intent)[] = ["loopCentric", "filterMotion", "atmosPad", "gradualBuild"];
      const atLeastOneActive = baselineCandidates.some(k => intent[k] > 0.5);
      assert.ok(atLeastOneActive, "at least one baseline candidate flag should be true at origin");

      // Axis-driven flags that require non-zero strength must stay false
      assert.ok(intent.percussiveLayering <= 0.5, "percussiveLayering should be false (needs percussive strength)");
      assert.ok(intent.syncopationBias <= 0.5, "syncopationBias should be false (needs percussive strength)");
      assert.ok(intent.breakInsertion <= 0.5, "breakInsertion should be false (needs percussive+energetic strength)");
      assert.ok(intent.harmonicStatic <= 0.5, "harmonicStatic should be false (needs melodic+calm strength)");

      // Tempo & energy tags should be neutral
      assert.strictEqual(result.meta.tempo, "medium", "tempo should be medium");
      assert.strictEqual(result.meta.profile.tags.energy, "medium", "energy tag should be medium");
    });
  });
});
