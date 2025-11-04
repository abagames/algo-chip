import assert from "node:assert/strict";
import type { Event } from "../types.js";
import { generateComposition } from "../pipeline.js";
import { buildTwoAxisOptions, isNoteOnEvent } from "./test-utils.js";

async function run() {
  const result = await generateComposition(
    buildTwoAxisOptions({
      lengthInMeasures: 8,
      seed: 12345,
      twoAxisStyle: {
        percussiveMelodic: -0.4,
        calmEnergetic: 0.2
      }
    })
  );

  assert(result.events.length > 0, "Expected events to be generated");

  // Length check: ensure last event does not exceed measure length by large margin (8 measures * 4 beats)
  const bpm = result.meta.bpm;
  const beats = result.events[result.events.length - 1]?.time * (bpm / 60);
  assert(beats <= 8 * 4 + 1, "Events extend beyond expected measure length");

  // Triangle exclusivity: ensure count never exceeds 1
  const triangleEntries = result.diagnostics.voiceAllocation.filter(
    (entry) => entry.channel === "triangle"
  );
  const hasOverlap = triangleEntries.some((entry) => entry.activeCount > 1);
  assert(!hasOverlap, "Triangle channel has overlapping voices");

  const noiseEntries = result.diagnostics.voiceAllocation.filter(
    (entry) => entry.channel === "noise"
  );
  const noiseOverlap = noiseEntries.some((entry) => entry.activeCount > 1);
  assert(!noiseOverlap, "Noise channel has overlapping voices");

  // Event times should be non-decreasing
  for (let i = 1; i < result.events.length; i++) {
    assert(result.events[i].time >= result.events[i - 1].time, "Event times not sorted");
  }

  const motifPlan = result.diagnostics.sectionMotifPlan;
  assert(motifPlan.length > 0, "Section motif plan should be captured");

  const aSections = motifPlan.filter((plan) => plan.templateId === "A");
  if (aSections.length > 1) {
    const hookSignature = new Set(aSections.map((plan) => `${plan.primaryRhythm}|${plan.primaryMelody}`));
    assert.strictEqual(hookSignature.size, 1, "A sections should reuse the same hook motifs");
    const reprisesHook = aSections.filter((plan) => plan.occurrenceIndex > 1);
    assert(
      reprisesHook.every((plan) => plan.reprisesHook),
      "Repeated A sections should mark hook reprise"
    );
    const melodyRhythmSignature = new Set(aSections.map((plan) => plan.primaryMelodyRhythm));
    assert.strictEqual(
      melodyRhythmSignature.size,
      1,
      "A sections should reuse the same melody rhythm motif"
    );
  }

  const melodyUsageValues = Object.values(result.diagnostics.motifUsage.melody);
  const totalMelodyMotifs = melodyUsageValues.reduce((sum, value) => sum + value, 0);
  const maxMelodyUsage = melodyUsageValues.length ? Math.max(...melodyUsageValues) : 0;
  if (totalMelodyMotifs > 0 && maxMelodyUsage > 0) {
    const recurrence = maxMelodyUsage / totalMelodyMotifs;
    assert(
      recurrence >= 0.25,
      `Expected dominant melody motif recurrence >= 0.25, actual=${recurrence.toFixed(2)}`
    );
  }

  const melodyRhythmUsageValues = Object.values(result.diagnostics.motifUsage.melodyRhythm);
  assert(
    melodyRhythmUsageValues.some((count) => count >= 2),
    "Melody rhythm motifs should show repeated usage"
  );

  // Triangle range check for bassLed arrangement (chiptune hardware constraint)
  const triangleRangeResult = await generateComposition(
    buildTwoAxisOptions({
      lengthInMeasures: 16,
      seed: 99999,
      preset: "minimal-techno"
    })
  );

  if (triangleRangeResult.meta.voiceArrangement.id === "bassLed") {
    const triangleMidis = triangleRangeResult.events
      .filter(isNoteOnEvent)
      .filter((e: Event<"noteOn">) => e.channel === "triangle")
      .map((e: Event<"noteOn">) => e.data.midi)
      .filter((midi): midi is number => typeof midi === "number");

    const highPitchNotes = triangleMidis.filter((midi) => midi > 60);

    assert.strictEqual(
      highPitchNotes.length,
      0,
      `Triangle channel should not exceed C4 (MIDI 60) in bassLed arrangement. Found ${highPitchNotes.length} high notes.`
    );

    console.log(`Triangle range check passed for bassLed (${triangleMidis.length} notes, all <= C4)`);
  } else {
    console.log(`Triangle range check skipped (arrangement: ${triangleRangeResult.meta.voiceArrangement.id})`);
  }

  const defaultLengthResult = await generateComposition({ seed: 24680 });
  assert.strictEqual(
    defaultLengthResult.meta.lengthInMeasures,
    32,
    "Default composition length should fall back to 32 measures"
  );

  const replayResult = await generateComposition(defaultLengthResult.meta.replayOptions);
  assert.deepEqual(
    replayResult.events,
    defaultLengthResult.events,
    "Replay options should reproduce identical event timelines"
  );
  assert.deepEqual(
    replayResult.meta.profile.intent,
    defaultLengthResult.meta.profile.intent,
    "Replay composition should preserve style intent"
  );

  console.log("All pipeline assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
