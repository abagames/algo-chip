import assert from "node:assert/strict";
import { runPipeline } from "../pipeline.js";
import { buildTwoAxisOptions } from "./test-utils.js";

async function run() {
  // High-density drum test case (breakbeat genre)
  const result = runPipeline(
    buildTwoAxisOptions({
      lengthInMeasures: 16,
      seed: 12345,
      preset: "breakbeat-jungle"
    })
  );

  const bpm = result.meta.bpm;
  const NOISE_STACK_OFFSET_BEATS = 1 / 16;  // Must match event-realization.ts
  const NOISE_STACK_OFFSET_SECONDS = (NOISE_STACK_OFFSET_BEATS * 60) / bpm;

  const noiseEvents = result.events.filter(
    (e) => e.channel === "noise" && e.command === "noteOn"
  );

  assert.ok(noiseEvents.length > 0, "Should generate noise events");

  // Verify all noise event gaps are >= NOISE_STACK_OFFSET
  for (let i = 1; i < noiseEvents.length; i++) {
    const gap = noiseEvents[i].time - noiseEvents[i - 1].time;

    assert.ok(
      gap >= NOISE_STACK_OFFSET_SECONDS - 1e-6,  // Allow floating-point tolerance
      `Noise collision detected: event ${i} at ${noiseEvents[i].time}s, gap=${(gap * 1000).toFixed(2)}ms (min=${(NOISE_STACK_OFFSET_SECONDS * 1000).toFixed(2)}ms)`
    );
  }

  // Verify no simultaneous noteOn events
  const simultaneousEvents = noiseEvents.filter((event, index) => {
    if (index === 0) return false;
    return Math.abs(event.time - noiseEvents[index - 1].time) < 1e-6;
  });

  assert.strictEqual(
    simultaneousEvents.length,
    0,
    `Found ${simultaneousEvents.length} simultaneous noise events`
  );

  console.log(`Noise collision check passed: ${noiseEvents.length} events, no overlaps (min gap=${(NOISE_STACK_OFFSET_SECONDS * 1000).toFixed(2)}ms)`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
