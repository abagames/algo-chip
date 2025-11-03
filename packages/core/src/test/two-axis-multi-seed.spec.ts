import { describe, it } from "node:test";
import assert from "node:assert";
import { runPipeline } from "../pipeline.js";

/**
 * Multi-seed test for two-axis system
 *
 * Verifies that the two-axis system produces consistent results
 * across different random seeds.
 */

describe("Two-Axis Multi-Seed Test", () => {
  const SEEDS = [12345, 67890, 11111, 99999, 54321, 10000, 20000, 30000, 40000, 50000];

  describe("Corner 3: Ultra Melodic + Ultra Calm (+1, -1) - Multiple Seeds", () => {
    it("should consistently return harmonicStatic=true across all seeds", () => {
      let failedSeeds: number[] = [];
      let wrongTempoSeeds: number[] = [];

      for (const seed of SEEDS) {
        const result = runPipeline({
          lengthInMeasures: 8,
          seed,
          twoAxisStyle: {
            percussiveMelodic: 1.0,
            calmEnergetic: -1.0
          }
        });

        const intent = result.meta.styleIntent;

        // Check harmonicStatic
        if (!intent.harmonicStatic) {
          failedSeeds.push(seed);
          console.log(`❌ Seed ${seed}: harmonicStatic=${intent.harmonicStatic}`);
        }

        // Check tempo
        if (result.meta.tempo !== "slow") {
          wrongTempoSeeds.push(seed);
          console.log(`❌ Seed ${seed}: tempo=${result.meta.tempo} (expected: slow)`);
        }
      }

      console.log(`\n✅ Tested ${SEEDS.length} seeds`);
      console.log(`✅ harmonicStatic=true: ${SEEDS.length - failedSeeds.length}/${SEEDS.length}`);
      console.log(`✅ tempo=slow: ${SEEDS.length - wrongTempoSeeds.length}/${SEEDS.length}`);

      assert.strictEqual(
        failedSeeds.length,
        0,
        `harmonicStatic should be true for all seeds. Failed seeds: ${failedSeeds.join(", ")}`
      );

      assert.strictEqual(
        wrongTempoSeeds.length,
        0,
        `tempo should be slow for all seeds. Failed seeds: ${wrongTempoSeeds.join(", ")}`
      );
    });
  });

  describe("Corner 2: Ultra Percussive + Ultra Energetic (-1, +1) - Multiple Seeds", () => {
    it("should consistently return correct flags across all seeds", () => {
      let failedPercussive: number[] = [];
      let failedEnergetic: number[] = [];
      let wrongTempoSeeds: number[] = [];

      for (const seed of SEEDS) {
        const result = runPipeline({
          lengthInMeasures: 8,
          seed,
          twoAxisStyle: {
            percussiveMelodic: -1.0,
            calmEnergetic: 1.0
          }
        });

        const intent = result.meta.styleIntent;

        // Check percussive flags
        if (!intent.percussiveLayering || !intent.syncopationBias) {
          failedPercussive.push(seed);
          console.log(`❌ Seed ${seed}: percussiveLayering=${intent.percussiveLayering}, syncopationBias=${intent.syncopationBias}`);
        }

        // Check energetic flags
        if (!intent.gradualBuild) {
          failedEnergetic.push(seed);
          console.log(`❌ Seed ${seed}: gradualBuild=${intent.gradualBuild}`);
        }

        // Check tempo
        if (result.meta.tempo !== "fast") {
          wrongTempoSeeds.push(seed);
          console.log(`❌ Seed ${seed}: tempo=${result.meta.tempo} (expected: fast)`);
        }
      }

      console.log(`\n✅ Tested ${SEEDS.length} seeds`);
      console.log(`✅ Percussive flags correct: ${SEEDS.length - failedPercussive.length}/${SEEDS.length}`);
      console.log(`✅ Energetic flags correct: ${SEEDS.length - failedEnergetic.length}/${SEEDS.length}`);
      console.log(`✅ tempo=fast: ${SEEDS.length - wrongTempoSeeds.length}/${SEEDS.length}`);

      assert.strictEqual(failedPercussive.length, 0, `Percussive flags should be consistent`);
      assert.strictEqual(failedEnergetic.length, 0, `Energetic flags should be consistent`);
      assert.strictEqual(wrongTempoSeeds.length, 0, `Tempo should be fast for all seeds`);
    });
  });

  describe("All Corners - Tempo Consistency", () => {
    it("should respect calmEnergetic axis for tempo across all seeds", () => {
      const testCases = [
        { pm: -1.0, ce: -1.0, expectedTempo: "slow", name: "Corner 1" },
        { pm: -1.0, ce: 1.0, expectedTempo: "fast", name: "Corner 2" },
        { pm: 1.0, ce: -1.0, expectedTempo: "slow", name: "Corner 3" },
        { pm: 1.0, ce: 1.0, expectedTempo: "fast", name: "Corner 4" },
        { pm: 0.0, ce: 0.0, expectedTempo: "medium", name: "Center" },
      ];

      for (const testCase of testCases) {
        let failedSeeds: number[] = [];

        for (const seed of SEEDS) {
          const result = runPipeline({
            lengthInMeasures: 8,
            seed,
            twoAxisStyle: {
              percussiveMelodic: testCase.pm,
              calmEnergetic: testCase.ce
            }
          });

          if (result.meta.tempo !== testCase.expectedTempo) {
            failedSeeds.push(seed);
          }
        }

        console.log(`${testCase.name} (${testCase.pm}, ${testCase.ce}): ${SEEDS.length - failedSeeds.length}/${SEEDS.length} correct`);

        assert.strictEqual(
          failedSeeds.length,
          0,
          `${testCase.name}: tempo should be ${testCase.expectedTempo} for all seeds. Failed: ${failedSeeds.join(", ")}`
        );
      }
    });
  });
});
