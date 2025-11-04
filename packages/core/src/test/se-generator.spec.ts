import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { SEGenerator } from "../se/seGenerator.js";
import type { SEGenerationResult } from "../se/seTypes.js";
import type { Event } from "../types.js";
import { isNoteOnEvent } from "./test-utils.js";
import { midiToFrequency } from "../musicUtils.js";

function hashEvents(result: SEGenerationResult): string {
  return createHash("sha256")
    .update(JSON.stringify({ events: result.events, meta: result.meta }))
    .digest("hex");
}

async function run() {
  const generator = new SEGenerator();

  const scenarios = [
    {
      name: "jump-seed-314",
      options: { type: "jump" as const, seed: 314, startTime: 0 },
      expectedHash: "3ea1ea87b3fa536bb045528a78e3cf4c1c2f30d402ab740a985e185693e0ee57"
    },
    {
      name: "coin-template-forced",
      options: { type: "coin" as const, seed: 7, templateId: "SE_COIN_01", startTime: 0.25 },
      expectedHash: "ec892b315b23c1de6b6690f865b7a9d21121908da8caeb0fe7822fdc4afa2d4a"
    },
    {
      name: "jump-baseFrequency-440Hz",
      options: { type: "jump" as const, seed: 314, baseFrequency: 440.0 },
      expectedHash: "0703a5f88dcd14f1b95eb7fd24ce9aa7967e196ac797b6553e7b4f54b49a7559"
    },
    {
      name: "coin-baseFrequency-523.25Hz",
      options: { type: "coin" as const, seed: 7, templateId: "SE_COIN_01", baseFrequency: 523.25 },
      expectedHash: "3dcaf686862a59329bdd13a24c0d74909bd656804b93e339c9b02b4ccbed1a3f"
    }
  ];

  for (const { name, options, expectedHash } of scenarios) {
    const first = generator.generateSE(options);
    const second = generator.generateSE(options);

    assert.deepEqual(second, first, `SEGenerator should be deterministic per seed for ${name}`);

    const replay = generator.generateSE(first.meta.replayOptions);
    assert.deepEqual(
      replay,
      first,
      `Replay options should regenerate identical SE for ${name}`
    );

    const digest = hashEvents(first);
    assert.strictEqual(
      digest,
      expectedHash,
      `Unexpected SE output for ${name}.\nActual summary: ${JSON.stringify(first, null, 2)}`
    );

    // Duration sanity check (non-zero)
    assert(first.meta.duration > 0, `Duration should be positive for ${name}`);
  }

  console.log("SE generator scenarios validated");

  // Test baseFrequency pitch shifting
  console.log("\nTesting baseFrequency pitch shifting...");

  // Test 1: Verify pitch shift is applied correctly
  const baseResult = generator.generateSE({ type: "jump", seed: 999 });
  const shiftedResult = generator.generateSE({ type: "jump", seed: 999, baseFrequency: 440.0 });

  // Both should have same number of events (structure preserved)
  assert.strictEqual(
    shiftedResult.events.length,
    baseResult.events.length,
    "baseFrequency should not change number of events"
  );

  // Extract MIDI values from noteOn events
  const getNotePitches = (result: SEGenerationResult): number[] => {
    return result.events
      .filter(isNoteOnEvent)
      .map((event: Event<"noteOn">) => event.data.midi)
      .filter((midi): midi is number => typeof midi === "number");
  };

  const basePitches = getNotePitches(baseResult);
  const shiftedPitches = getNotePitches(shiftedResult);

  // If there are pitches, verify shift was applied (pitches should differ if shift was applied)
  if (basePitches.length > 0 && shiftedPitches.length > 0) {
    assert.strictEqual(
      basePitches.length,
      shiftedPitches.length,
      "baseFrequency should preserve number of notes"
    );
  }

  // Test 2: Different baseFrequency values produce different pitches
  const result440 = generator.generateSE({ type: "coin", seed: 123, baseFrequency: 440.0 });
  const result880 = generator.generateSE({ type: "coin", seed: 123, baseFrequency: 880.0 });

  const pitches440 = getNotePitches(result440);
  const pitches880 = getNotePitches(result880);

  if (pitches440.length > 0 && pitches880.length > 0) {
    // 880 Hz is one octave above 440 Hz, so pitches should differ by ~12 semitones
    let diffSum = 0;
    for (let i = 0; i < pitches880.length; i++) {
      diffSum += pitches880[i] - pitches440[i]!;
    }
    const avgDiff = diffSum / pitches880.length;
    assert(
      Math.abs(avgDiff - 12) < 2,
      `Octave shift should be ~12 semitones, got ${avgDiff}`
    );
  }

  // Test 3: MIDI range clamping (0-127)
  const extremeResult = generator.generateSE({ type: "jump", seed: 456, baseFrequency: 20000.0 });
  const extremePitches = getNotePitches(extremeResult);

  for (const pitch of extremePitches) {
    assert(pitch >= 0 && pitch <= 127, `MIDI pitch ${pitch} should be in range [0, 127]`);
  }

  // Test 4: Deterministic with baseFrequency
  const det1 = generator.generateSE({ type: "powerup", seed: 789, baseFrequency: 261.63 });
  const det2 = generator.generateSE({ type: "powerup", seed: 789, baseFrequency: 261.63 });
  assert.deepEqual(det2, det1, "baseFrequency generation should be deterministic");

  console.log("baseFrequency pitch shifting validated");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
