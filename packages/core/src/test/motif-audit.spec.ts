import { describe, it } from "node:test";
import assert from "node:assert";
import { auditMotifs } from "../../../../scripts/motif-audit.js";
import { expandRhythmPattern, rhythmById, rhythmList } from "../motif-library.js";

describe("Motif audit", () => {
  it("keeps all BGM motif IDs and rhythm references valid", () => {
    const report = auditMotifs();

    assert.deepStrictEqual(report.duplicateIds, []);
    assert.deepStrictEqual(report.rhythmLengthMismatches, []);
    assert.strictEqual(report.rhythmVariationReferences, 72);
    assert.strictEqual(report.melodyVariationReferences, 2);
    assert.deepStrictEqual(report.variationIssues, []);
    assert.deepStrictEqual(report.melodyVariationCompatibilityIssues, []);
    assert.deepStrictEqual(report.invalidRhythmPatterns, []);
  });

  it("keeps only reviewed exact-pattern groups", () => {
    const groups = auditMotifs().exactPatternGroups;
    const ids = (library: keyof typeof groups) => groups[library].map((group) =>
      group.occurrences.map((occurrence) => occurrence.id)
    );

    assert.deepStrictEqual(ids("melody"), [
      ["MF015", "MF034"],
      ["MF020", "MF142", "MF165"],
      ["MF101", "MF103"],
      ["MF102", "MF117"],
      ["MF131", "MF145"],
      ["MF134", "MF175"],
      ["MF148", "MF166"]
    ]);
    assert.deepStrictEqual(ids("melodyRhythm"), [
      ["MR007", "MR028"],
      ["MR015", "MR020"],
      ["MR039", "MR048"]
    ]);
    assert.deepStrictEqual(ids("drums"), [["DP036", "DP068"]]);
    assert.deepStrictEqual(ids("bass"), [
      ["BP_BROKEN_PICKUP_DROP", "BP_ARPEGGIO_GLIDE"],
      ["BP_FOUR_ON_FLOOR_OCTAVE_HIT", "BP_BROKEN_STEADY_GRID"]
    ]);
    assert.strictEqual(groups.chords.length, 19);
    groups.chords.forEach((group) => group.occurrences.forEach((occurrence) => {
      assert.ok(occurrence.context);
    }));
  });

  it("keeps rhythm list and map entries referentially identical", () => {
    assert.strictEqual(rhythmById.size, rhythmList.length);
    rhythmList.forEach((motif) => assert.strictEqual(rhythmById.get(motif.id), motif));
  });

  it("expands every rhythm motif to its declared length", () => {
    rhythmList.forEach((motif) => {
      const total = expandRhythmPattern(motif)
        .reduce((sum, step) => sum + step.durationBeats, 0);
      assert.ok(Math.abs(total - motif.length) <= 1e-6, motif.id);
    });
  });
});
