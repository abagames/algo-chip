import { describe, it } from "node:test";
import assert from "node:assert";
import { mapTwoAxisToStyleIntent } from "../style/two-axis-mapper.js";

/**
 * Direct test of mapTwoAxisToStyleIntent function
 * to isolate the harmonicStatic issue
 */

describe("mapTwoAxisToStyleIntent - Direct Test", () => {
  it("should return true for harmonicStatic with PM=+1.0, CE=-1.0", () => {
    const result = mapTwoAxisToStyleIntent({
      percussiveMelodic: 1.0,
      calmEnergetic: -1.0
    });

    console.log("Direct test result for (+1.0, -1.0):");
    console.log("  harmonicStatic:", result.harmonicStatic);
    console.log("  Full intent:", JSON.stringify(result, null, 2));

    // According to the spec:
    // melodicStrength = Max(0, +1.0) = 1.0 > 0.4 ✓
    // calmStrength = Max(0, -(-1.0)) = Max(0, +1.0) = 1.0 > 0.3 ✓
    // harmonicStatic should be true
    assert.strictEqual(result.harmonicStatic, true, "harmonicStatic should be true");
  });

  it("should show strength calculations explicitly", () => {
    const pm = 1.0;
    const ce = -1.0;

    const percussiveStrength = Math.max(0, -pm);
    const melodicStrength = Math.max(0, pm);
    const calmStrength = Math.max(0, -ce);
    const energyStrength = Math.max(0, ce);

    console.log("\nStrength calculations for (+1.0, -1.0):");
    console.log("  percussiveStrength:", percussiveStrength);
    console.log("  melodicStrength:", melodicStrength);
    console.log("  calmStrength:", calmStrength);
    console.log("  energyStrength:", energyStrength);

    console.log("\nharmonicStatic condition:");
    console.log("  melodicStrength > 0.4:", melodicStrength > 0.4);
    console.log("  calmStrength > 0.3:", calmStrength > 0.3);
    console.log("  Both:", melodicStrength > 0.4 && calmStrength > 0.3);

    // Expected results
    assert.strictEqual(percussiveStrength, 0);
    assert.strictEqual(melodicStrength, 1.0);
    assert.strictEqual(calmStrength, 1.0);
    assert.strictEqual(energyStrength, 0);

    assert.strictEqual(melodicStrength > 0.4, true);
    assert.strictEqual(calmStrength > 0.3, true);
    assert.strictEqual(melodicStrength > 0.4 && calmStrength > 0.3, true);

    // Now test the actual function
    const result = mapTwoAxisToStyleIntent({ percussiveMelodic: pm, calmEnergetic: ce });
    assert.strictEqual(result.harmonicStatic, true, "harmonicStatic should match manual calculation");
  });

  it("lofiFeel activates in calm+melodic quadrant", () => {
    // lofi-leaning: percussiveMelodic=0.45, calmEnergetic=-0.75
    // calmStrength=0.75 > 0.5, melodicStrength=0.45 > 0.3 → lofiFeel=true
    const lofi = mapTwoAxisToStyleIntent({ percussiveMelodic: 0.45, calmEnergetic: -0.75 });
    assert.strictEqual(lofi.lofiFeel, true, "lofi-leaning should activate lofiFeel");

    // percussive-energetic: no calm, no melodic → lofiFeel=false
    const perc = mapTwoAxisToStyleIntent({ percussiveMelodic: -0.65, calmEnergetic: 0.65 });
    assert.strictEqual(perc.lofiFeel, false, "percussive-energetic should not activate lofiFeel");

    // calm but not melodic: melodicStrength=0 → lofiFeel=false
    const calmPerc = mapTwoAxisToStyleIntent({ percussiveMelodic: -0.3, calmEnergetic: -0.8 });
    assert.strictEqual(calmPerc.lofiFeel, false, "calm+percussive should not activate lofiFeel");

    // neutral: both axes near 0 → lofiFeel=false
    const neutral = mapTwoAxisToStyleIntent({ percussiveMelodic: 0, calmEnergetic: 0 });
    assert.strictEqual(neutral.lofiFeel, false, "neutral should not activate lofiFeel");
  });
});
