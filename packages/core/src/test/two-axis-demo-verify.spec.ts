import { describe, it } from "node:test";
import assert from "node:assert";
import { runPipeline } from "../pipeline.js";

/**
 * Demo verification test
 *
 * Simulates the exact behavior of the demo UI to verify that
 * calmEnergetic = -1 always produces tempo: slow
 */

describe("Demo UI Verification", () => {
  it("should produce tempo=slow when CE=-1.0 regardless of PM value", () => {
    const testCases = [
      { pm: -1.0, ce: -1.0, name: "PM=-1, CE=-1" },
      { pm: -0.5, ce: -1.0, name: "PM=-0.5, CE=-1" },
      { pm: 0.0, ce: -1.0, name: "PM=0, CE=-1" },
      { pm: 0.5, ce: -1.0, name: "PM=0.5, CE=-1" },
      { pm: 1.0, ce: -1.0, name: "PM=1, CE=-1" },
    ];

    console.log("\n📊 Testing CE=-1.0 with various PM values:");

    for (const testCase of testCases) {
      const result = runPipeline({
        lengthInMeasures: 8,
        seed: 99999,
        twoAxisStyle: {
          percussiveMelodic: testCase.pm,
          calmEnergetic: testCase.ce
        }
      });

      console.log(`  ${testCase.name}: tempo=${result.meta.tempo}, bpm=${result.meta.bpm}`);

      assert.strictEqual(
        result.meta.tempo,
        "slow",
        `${testCase.name}: Expected tempo=slow, got ${result.meta.tempo}`
      );

      // BPM should be around 80-95 for slow tempo
      assert.ok(
        result.meta.bpm >= 65 && result.meta.bpm <= 95,
        `${testCase.name}: BPM should be in slow range (65-95), got ${result.meta.bpm}`
      );
    }

    console.log("  ✅ All CE=-1.0 cases produced tempo=slow");
  });

  it("should produce tempo=fast when CE=+1.0 regardless of PM value", () => {
    const testCases = [
      { pm: -1.0, ce: 1.0, name: "PM=-1, CE=+1" },
      { pm: -0.5, ce: 1.0, name: "PM=-0.5, CE=+1" },
      { pm: 0.0, ce: 1.0, name: "PM=0, CE=+1" },
      { pm: 0.5, ce: 1.0, name: "PM=0.5, CE=+1" },
      { pm: 1.0, ce: 1.0, name: "PM=1, CE=+1" },
    ];

    console.log("\n📊 Testing CE=+1.0 with various PM values:");

    for (const testCase of testCases) {
      const result = runPipeline({
        lengthInMeasures: 8,
        seed: 99999,
        twoAxisStyle: {
          percussiveMelodic: testCase.pm,
          calmEnergetic: testCase.ce
        }
      });

      console.log(`  ${testCase.name}: tempo=${result.meta.tempo}, bpm=${result.meta.bpm}`);

      assert.strictEqual(
        result.meta.tempo,
        "fast",
        `${testCase.name}: Expected tempo=fast, got ${result.meta.tempo}`
      );

      // BPM should be around 125-155 for fast tempo
      assert.ok(
        result.meta.bpm >= 125 && result.meta.bpm <= 155,
        `${testCase.name}: BPM should be in fast range (125-155), got ${result.meta.bpm}`
      );
    }

    console.log("  ✅ All CE=+1.0 cases produced tempo=fast");
  });

  it("should produce tempo=medium when CE=0.0", () => {
    const testCases = [
      { pm: -1.0, ce: 0.0, name: "PM=-1, CE=0" },
      { pm: 0.0, ce: 0.0, name: "PM=0, CE=0" },
      { pm: 1.0, ce: 0.0, name: "PM=1, CE=0" },
    ];

    console.log("\n📊 Testing CE=0.0 with various PM values:");

    for (const testCase of testCases) {
      const result = runPipeline({
        lengthInMeasures: 8,
        seed: 99999,
        twoAxisStyle: {
          percussiveMelodic: testCase.pm,
          calmEnergetic: testCase.ce
        }
      });

      console.log(`  ${testCase.name}: tempo=${result.meta.tempo}, bpm=${result.meta.bpm}`);

      assert.strictEqual(
        result.meta.tempo,
        "medium",
        `${testCase.name}: Expected tempo=medium, got ${result.meta.tempo}`
      );

      // BPM should be around 95-125 for medium tempo
      assert.ok(
        result.meta.bpm >= 95 && result.meta.bpm <= 125,
        `${testCase.name}: BPM should be in medium range (95-125), got ${result.meta.bpm}`
      );
    }

    console.log("  ✅ All CE=0.0 cases produced tempo=medium");
  });

  it("should default to neutral axis behavior when twoAxisStyle is omitted", () => {
    const explicitNeutral = runPipeline({
      lengthInMeasures: 8,
      seed: 54321,
      twoAxisStyle: { percussiveMelodic: 0.0, calmEnergetic: 0.0 }
    });

    const implicitNeutral = runPipeline({
      lengthInMeasures: 8,
      seed: 54321
    });

    console.log("\n📊 Testing default axis behavior:");
    console.log(`  Explicit neutral tempo=${explicitNeutral.meta.tempo}, bpm=${explicitNeutral.meta.bpm}`);
    console.log(`  Implicit neutral tempo=${implicitNeutral.meta.tempo}, bpm=${implicitNeutral.meta.bpm}`);

    assert.strictEqual(
      implicitNeutral.meta.tempo,
      explicitNeutral.meta.tempo,
      "Default options should match explicit neutral two-axis configuration"
    );

    assert.strictEqual(
      implicitNeutral.meta.tempo,
      "medium",
      "Neutral axis should resolve to medium tempo"
    );

    assert.strictEqual(
      implicitNeutral.meta.bpm,
      explicitNeutral.meta.bpm,
      "Default axis should yield the same BPM as explicit neutral axis"
    );

    console.log("  ✅ Default neutral axis verified");
  });
});
