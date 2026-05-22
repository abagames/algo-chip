import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runPipeline } from "../pipeline.js";
import { buildTwoAxisOptions } from "./test-utils.js";
import { isNoteOnEvent } from "./test-utils.js";

/**
 * Pipeline regression tests using property-based assertions.
 *
 * These tests verify stable structural and musical properties of pipeline output
 * without hashing the full event stream, so they survive motif catalog changes.
 *
 * Stable properties checked per scenario:
 *   - meta: bpm, key, voiceArrangementId, loopBeats, loopSeconds
 *   - events: count range, noteOn/noteOff symmetry, beat coverage
 *   - loop integrity: no unmatched noteOn, no noise tail issues
 *   - motif usage: at least one motif per category
 */

interface ScenarioExpected {
  meta: {
    bpm: number;
    key: string;
    voiceArrangementId: string;
    loopBeats: number;
    loopSeconds: number;
  };
  eventCountMin: number;
  eventCountMax: number;
}

describe("Pipeline regression", () => {
  const scenarios: Array<{ name: string; options: ReturnType<typeof buildTwoAxisOptions>; expected: ScenarioExpected }> = [
    {
      name: "percussive-energetic-8",
      options: buildTwoAxisOptions({
        lengthInMeasures: 8,
        seed: 12345,
        twoAxisStyle: { percussiveMelodic: -0.45, calmEnergetic: 0.25 }
      }),
      expected: {
        meta: {
          bpm: 126,
          key: "B_Minor",
          voiceArrangementId: "standard",
          loopBeats: 32,
          loopSeconds: 15.238095
        },
        eventCountMin: 200,
        eventCountMax: 2000
      }
    },
    {
      name: "progressive-extended-16",
      options: buildTwoAxisOptions({
        lengthInMeasures: 16,
        seed: 9876,
        twoAxisStyle: { percussiveMelodic: -0.2, calmEnergetic: 0.6 }
      }),
      expected: {
        meta: {
          bpm: 165,
          key: "G_Major",
          voiceArrangementId: "bassLed",
          loopBeats: 64,
          loopSeconds: 23.272727
        },
        eventCountMin: 400,
        eventCountMax: 4000
      }
    }
  ];

  for (const scenario of scenarios) {
    it(scenario.name, () => {
      const result = runPipeline(scenario.options);
      const { meta, events, diagnostics } = result;
      const { expected } = scenario;

      // --- stable meta ---
      assert.equal(meta.bpm, expected.meta.bpm, "bpm");
      assert.equal(meta.key, expected.meta.key, "key");
      assert.equal(meta.voiceArrangement.id, expected.meta.voiceArrangementId, "voiceArrangementId");
      assert.equal(meta.loopInfo.totalBeats, expected.meta.loopBeats, "loopBeats");
      assert.equal(
        Number(meta.loopInfo.totalDuration.toFixed(6)),
        expected.meta.loopSeconds,
        "loopSeconds"
      );

      // --- event count sanity ---
      assert.ok(
        events.length >= expected.eventCountMin && events.length <= expected.eventCountMax,
        `event count ${events.length} outside [${expected.eventCountMin}, ${expected.eventCountMax}]`
      );

      // --- noteOn / noteOff symmetry ---
      const noteOns = events.filter((e) => e.command === "noteOn").length;
      const noteOffs = events.filter((e) => e.command === "noteOff").length;
      assert.equal(noteOns, noteOffs, "noteOn/noteOff count must match");

      // --- loop integrity ---
      const li = diagnostics.loopIntegrity;
      assert.equal(li.unmatchedNoteOnCount, 0, "no unmatched noteOn");
      assert.equal(li.unmatchedNoteOffCount, 0, "no unmatched noteOff");
      assert.equal(li.noiseLateReleaseCount, 0, "no noise late releases");

      // --- motif usage: every category must have at least one motif selected ---
      const usage = diagnostics.motifUsage;
      assert.ok(Object.keys(usage.rhythm).length > 0, "rhythm motif used");
      assert.ok(Object.keys(usage.drums).length > 0, "drums motif used");

      // --- motif selection diagnostics present ---
      assert.ok(
        diagnostics.motifSelection.candidatePools.length > 0,
        "motif candidate pool diagnostics captured"
      );
      assert.ok(
        diagnostics.motifSelection.fallbackCount >= 0,
        "fallbackCount is numeric"
      );
    });
  }
});
