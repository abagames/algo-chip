import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "../pipeline.js";

describe("Peaceful melody-rhythm coverage", () => {
  it("reaches both 8-beat peaceful roles without exceeding baseline concentration", () => {
    const usage: Record<string, number> = {};

    for (const seed of [101, 202, 303, 404, 505]) {
      const result = runPipeline({
        seed,
        lengthInMeasures: 16,
        twoAxisStyle: { percussiveMelodic: 0.65, calmEnergetic: -0.65 }
      });

      for (const [id, count] of Object.entries(result.diagnostics.motifUsage.melodyRhythm)) {
        usage[id] = (usage[id] ?? 0) + count;
      }
    }

    assert.ok((usage.MR088 ?? 0) > 0, "Peaceful texture motif MR088 should be reachable");
    assert.ok((usage.MR089 ?? 0) > 0, "Peaceful cadence motif MR089 should be reachable");

    const counts = Object.values(usage);
    const total = counts.reduce((sum, count) => sum + count, 0);
    const concentration = Math.max(...counts) / total;
    assert.ok(
      concentration < 0.523,
      `Peaceful melody-rhythm concentration should improve on baseline, actual=${concentration.toFixed(3)}`
    );
  });
});
