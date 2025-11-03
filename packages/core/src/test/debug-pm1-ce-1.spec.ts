import { describe, it } from "node:test";
import { runPipeline } from "../pipeline.js";

/**
 * Debug test for PM=1, CE=-1 producing fast tempo
 */

describe("Debug: PM=1, CE=-1", () => {
  it("should debug the issue step by step", () => {
    console.log("\n🔍 Testing PM=1, CE=-1 with multiple seeds:");

    const seeds = [12345, 99999, 11111, 54321, 10000];

    for (const seed of seeds) {
      const result = runPipeline({
        lengthInMeasures: 8,
        seed,
        twoAxisStyle: {
          percussiveMelodic: 1.0,
          calmEnergetic: -1.0
        }
      });

      console.log(`\nSeed ${seed}:`);
      console.log(`  tempo: ${result.meta.tempo}`);
      console.log(`  bpm: ${result.meta.bpm}`);
      console.log(`  bpmBias: ${result.meta.profile.bpmBias}`);
      console.log(`  harmonicStatic: ${result.meta.styleIntent.harmonicStatic}`);

      // Check if tempo is wrong
      if (result.meta.tempo !== "slow") {
        console.log(`  ❌ WRONG TEMPO! Expected: slow, Got: ${result.meta.tempo}`);
      } else {
        console.log(`  ✅ Correct tempo`);
      }
    }
  });
});
