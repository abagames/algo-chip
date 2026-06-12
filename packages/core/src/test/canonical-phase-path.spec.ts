import assert from "node:assert/strict";
import test from "node:test";
import { runPipeline } from "../pipeline.js";
import { planStructure } from "../phase/structure-planning.js";
import type { PipelineCompositionOptions, TextureProfile } from "../types.js";

const BASE_OPTIONS: PipelineCompositionOptions = {
  mood: "upbeat",
  tempo: "medium",
  lengthInMeasures: 16,
  seed: 73
};

test("canonical structure planning keeps the fixed section-template contract", () => {
  const snapshots = new Map<number, string>([
    [73, "Intro4-A8-Outro4"],
    [419, "Intro4-A8-Outro4"],
    [887, "A8-B8"],
    [1001, "A6-B6-A4"]
  ]);

  for (const [seed, expected] of snapshots) {
    const plan = planStructure({ ...BASE_OPTIONS, seed });
    const pattern = plan.sections.map((section) => `${section.templateId}${section.measures}`).join("-");
    assert.equal(pattern, expected, `unexpected section template for seed ${seed}`);
    assert.equal(
      plan.sections.reduce((sum, section) => sum + section.measures, 0),
      BASE_OPTIONS.lengthInMeasures
    );
  }
});

test("canonical motif selection marks only beats 1 and 3 as strong", () => {
  const result = runPipeline({ lengthInMeasures: 16, seed: 1001 });
  assert(result.diagnostics.motifSelection.melodyPitch.length > 0);
  for (const note of result.diagnostics.motifSelection.melodyPitch) {
    const beatInMeasure = ((note.startBeat % 4) + 4) % 4;
    const expected = Math.abs(beatInMeasure) < 1e-6 || Math.abs(beatInMeasure - 2) < 1e-6;
    assert.equal(note.strongBeat, expected, `strong-beat mismatch at beat ${note.startBeat}`);
  }
});

test("canonical texture variation remains deterministic and reaches every texture", () => {
  const firstPass: TextureProfile[] = [];
  const secondPass: TextureProfile[] = [];
  for (let seed = 1; seed <= 400; seed++) {
    firstPass.push(...planStructure({ ...BASE_OPTIONS, seed }).sections.map((section) => section.texture));
    secondPass.push(...planStructure({ ...BASE_OPTIONS, seed }).sections.map((section) => section.texture));
  }

  assert.deepEqual(secondPass, firstPass);
  const counts = Object.fromEntries(
    (["steady", "broken", "arpeggio"] as const).map((texture) => [
      texture,
      firstPass.filter((value) => value === texture).length
    ])
  );
  assert(counts.steady > 0);
  assert(counts.broken > 0);
  assert(counts.arpeggio > 0);
});
