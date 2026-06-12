import assert from "node:assert";
import { describe, it } from "node:test";
import { runPipelineExperiment } from "../pipeline.js";

const options = { lengthInMeasures: 32, seed: 1001 } as const;

describe("Phase 8 report experiments", () => {
  it("remain deterministic and preserve exact hook reuse", () => {
    for (const experiments of [
      { templateCacheScope: "section" as const },
      { varyNonInitialPhraseMelody: true }
    ]) {
      const first = runPipelineExperiment(options, experiments);
      const second = runPipelineExperiment(options, experiments);
      assert.deepStrictEqual(first, second);
      assert(first.diagnostics.motifSelection.hookReuse.exact > 0);
      assert.strictEqual(first.diagnostics.motifSelection.hookReuse.varied, 0);
    }
  });

  it("changes only weak-beat correction in the weak-beat scale experiment", () => {
    const chord = runPipelineExperiment(options, { weakBeatQuantization: "chord" });
    const scale = runPipelineExperiment(options, { weakBeatQuantization: "scale" });
    const chordPitch = chord.diagnostics.motifSelection.melodyPitch;
    const scalePitch = scale.diagnostics.motifSelection.melodyPitch;
    assert.strictEqual(chordPitch.length, scalePitch.length);
    assert(scalePitch.some((note) => !note.strongBeat && !note.changed));
    for (let index = 0; index < chordPitch.length; index++) {
      if (chordPitch[index].strongBeat) {
        assert.strictEqual(chordPitch[index].correctedMidi, scalePitch[index].correctedMidi);
      } else {
        assert.strictEqual(scalePitch[index].correctedMidi, scalePitch[index].scaleMidi);
      }
    }
  });
});
