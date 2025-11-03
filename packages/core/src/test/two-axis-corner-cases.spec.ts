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
      assert.strictEqual(intent.percussiveLayering, true, "percussiveLayering should be true");
      assert.strictEqual(intent.syncopationBias, true, "syncopationBias should be true");

      // Calm flags (calmStrength = 1.0)
      assert.strictEqual(intent.loopCentric, true, "loopCentric should be true");
      assert.strictEqual(intent.textureFocus, true, "textureFocus should be true");

      // Melodic flags should be false
      assert.strictEqual(intent.filterMotion, false, "filterMotion should remain disabled without melodic drive");
      assert.strictEqual(intent.harmonicStatic, true, "harmonicStatic should engage for percussive calm combinations");

      // Energy flags should be false
      assert.strictEqual(intent.gradualBuild, false, "gradualBuild should be false");

      // Tempo/BPM
      assert.strictEqual(result.meta.tempo, "slow", "tempo should be slow");
      // BPM bias should be close to -20
      const bpmBias = result.meta.profile.bpmBias || 0;
      assert.ok(bpmBias <= -19, `BPM bias should be near -20, got ${bpmBias}`);
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
      assert.strictEqual(intent.percussiveLayering, true, "percussiveLayering should be true");
      assert.strictEqual(intent.syncopationBias, true, "syncopationBias should be true");
      assert.strictEqual(intent.breakInsertion, true, "breakInsertion should be true (percussive + energetic)");

      // Energetic flags (energyStrength = 1.0)
      assert.strictEqual(intent.gradualBuild, true, "gradualBuild should be true");

      // Calm flags should be false
      assert.strictEqual(intent.loopCentric, false, "loopCentric should be false");

      // Melodic flags should be false
      assert.strictEqual(intent.filterMotion, true, "filterMotion should reflect energetic motion");
      assert.strictEqual(intent.harmonicStatic, false, "harmonicStatic should be false");

      // Tempo/BPM
      assert.strictEqual(result.meta.tempo, "fast", "tempo should be fast");
      const bpmBias = result.meta.profile.bpmBias || 0;
      assert.ok(bpmBias >= 19, `BPM bias should be near +20, got ${bpmBias}`);
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
      assert.strictEqual(intent.harmonicStatic, true, "harmonicStatic should be true (melodic + calm)");
      assert.strictEqual(intent.atmosPad, true, "atmosPad should be true");
      assert.strictEqual(intent.filterMotion, true, "filterMotion should be true");

      // Calm flags (calmStrength = 1.0)
      assert.strictEqual(intent.loopCentric, true, "loopCentric should be true");
      assert.strictEqual(intent.textureFocus, true, "textureFocus should be true");

      // Percussive flags should be false
      assert.strictEqual(intent.percussiveLayering, false, "percussiveLayering should be false");
      assert.strictEqual(intent.syncopationBias, false, "syncopationBias should be false");

      // Energy flags should be false
      assert.strictEqual(intent.gradualBuild, false, "gradualBuild should be false");
      assert.strictEqual(intent.breakInsertion, false, "breakInsertion should be false");

      // Tempo/BPM
      assert.strictEqual(result.meta.tempo, "slow", "tempo should be slow");
      const bpmBias = result.meta.profile.bpmBias || 0;
      assert.ok(bpmBias <= -19, `BPM bias should be near -20, got ${bpmBias}`);
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
      assert.strictEqual(intent.atmosPad, true, "atmosPad should be true");
      assert.strictEqual(intent.filterMotion, true, "filterMotion should be true");

      // Energetic flags (energyStrength = 1.0)
      assert.strictEqual(intent.gradualBuild, true, "gradualBuild should be true");

      // harmonicStatic requires melodic + CALM, so should be false here
      assert.strictEqual(intent.harmonicStatic, false, "harmonicStatic should be false (needs calm)");

      // Calm flags should be false
      assert.strictEqual(intent.loopCentric, false, "loopCentric should be false");
      assert.strictEqual(intent.textureFocus, false, "textureFocus should be false");

      // Percussive flags should be false
      assert.strictEqual(intent.percussiveLayering, false, "percussiveLayering should be false");
      assert.strictEqual(intent.syncopationBias, false, "syncopationBias should be false");
      assert.strictEqual(intent.breakInsertion, false, "breakInsertion should be false (needs percussive)");

      // Tempo/BPM
      assert.strictEqual(result.meta.tempo, "fast", "tempo should be fast");
      const bpmBias = result.meta.profile.bpmBias || 0;
      assert.ok(bpmBias >= 19, `BPM bias should be near +20, got ${bpmBias}`);
    });
  });

  describe("Center: Balanced (0, 0)", () => {
    it("should have mostly false flags for balanced setting", () => {
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

      // All strengths are 0, so all flags should be false
      assert.strictEqual(intent.percussiveLayering, false, "percussiveLayering should be false");
      assert.strictEqual(intent.syncopationBias, false, "syncopationBias should be false");
      assert.strictEqual(intent.breakInsertion, false, "breakInsertion should be false");
      assert.strictEqual(intent.harmonicStatic, false, "harmonicStatic should be false");
      assert.strictEqual(intent.atmosPad, false, "atmosPad should be false");
      assert.strictEqual(intent.filterMotion, false, "filterMotion should be false");
      assert.strictEqual(intent.loopCentric, false, "loopCentric should be false");
      assert.strictEqual(intent.textureFocus, false, "textureFocus should be false");
      assert.strictEqual(intent.gradualBuild, false, "gradualBuild should be false");

      // Tempo/BPM should be medium/neutral
      assert.strictEqual(result.meta.tempo, "medium", "tempo should be medium");
      const bpmBias = result.meta.profile.bpmBias || 0;
      assert.strictEqual(bpmBias, 0, `BPM bias should be 0, got ${bpmBias}`);
    });
  });
});
