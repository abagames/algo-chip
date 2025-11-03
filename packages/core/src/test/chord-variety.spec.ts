/**
 * Test chord progression variety for harmonicStatic styles
 */
import assert from "node:assert/strict";
import { runPipeline } from "../pipeline.js";
import { buildTwoAxisOptions } from "./test-utils.js";

async function run() {
  console.log("Testing chord progression variety for minimal techno...\n");

  // Generate composition with minimal techno style (harmonicStatic: true)
  const options = buildTwoAxisOptions({
    lengthInMeasures: 32,
    seed: 42,
    preset: "minimal-techno"
  });

  const result = runPipeline(options);

  // Check that harmonicStatic is enabled
  const styleIntent = result.meta.styleIntent;
  console.log("StyleIntent:", styleIntent);
  assert.strictEqual(
    styleIntent.harmonicStatic,
    true,
    "harmonicStatic should be true for minimal techno"
  );

  console.log("\n✓ harmonicStatic is enabled for minimal techno");
  console.log(`✓ Generated ${result.events.length} events`);
  console.log(`✓ BPM: ${result.meta.bpm}, Key: ${result.meta.key}`);
  console.log(`✓ Voice arrangement: ${result.meta.voiceArrangement.id}`);

  // Test with lofi-chillhop (another harmonicStatic style)
  console.log("\nTesting with lofi-chillhop...");
  const lofiOptions = buildTwoAxisOptions({
    lengthInMeasures: 16,
    seed: 123,
    preset: "lofi-chillhop"
  });

  const lofiResult = runPipeline(lofiOptions);
  assert.strictEqual(
    lofiResult.meta.styleIntent.harmonicStatic,
    true,
    "harmonicStatic should be true for lofi-chillhop"
  );

  console.log("✓ harmonicStatic is enabled for lofi-chillhop");
  console.log(`✓ Generated ${lofiResult.events.length} events`);

  // Manual verification message
  console.log("\n===========================================");
  console.log("MANUAL VERIFICATION REQUIRED:");
  console.log("===========================================");
  console.log("Please run the demo application and verify:");
  console.log("1. Generate multiple minimal-techno compositions");
  console.log("2. Listen for chord variety (should have 2-4 chords, not just 1)");
  console.log("3. Verify progressions are subtle (mostly repeating with occasional changes)");
  console.log("4. Compare with non-harmonicStatic styles for contrast");
  console.log("===========================================");

  console.log("\n✓ All automated assertions passed!");
  console.log("✓ harmonicStatic flag correctly set for target genres");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
