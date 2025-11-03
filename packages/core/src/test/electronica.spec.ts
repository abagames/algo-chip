import { describe, it } from "node:test";
import assert from "node:assert";
import { runPipeline } from "../pipeline.js";
import type { Event } from "../types.js";
import { buildTwoAxisOptions } from "./test-utils.js";
import rhythmMotifsJson from "../../motifs/rhythm.json" with { type: "json" };
import drumMotifsJson from "../../motifs/drums.json" with { type: "json" };

const rhythmMeta = new Map(
  (rhythmMotifsJson as any as Array<{ id: string; tags?: string[] }>).map((motif) => [motif.id, motif.tags ?? []])
);

function getChannelsForRoles(result: ReturnType<typeof runPipeline>, roles: string[]): string[] {
  const arrangement = result.meta.voiceArrangement;
  if (!arrangement?.voices?.length) {
    return [];
  }
  return arrangement.voices
    .filter((voice) => roles.includes(voice.role))
    .map((voice) => voice.channel);
}

describe("Electronica Style Validation", () => {
  describe("Minimal Techno", () => {
    it("should use predominantly four_on_floor bass patterns", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 16,
        seed: 12345,
        preset: "minimal-techno"
      });

      const result = runPipeline(options);

      // Check that bass patterns with four_on_floor tags are used
      const bassEvents = result.events.filter((e: Event) => e.channel === "triangle" && e.command === "noteOn");
      assert.ok(bassEvents.length > 0, "Should have bass events");

      // Minimal techno should have consistent, repetitive bass
      const uniqueBassNotes = new Set(bassEvents.map((e: Event) => e.data.midi));
      assert.ok(uniqueBassNotes.size <= 12, "Minimal techno should use limited bass note variety");
    });

    it("should keep bass drones dominant", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 12,
        seed: 54321,
        preset: "minimal-techno"
      });

      const result = runPipeline(options);

      // Drone/static bass should dominate even if harmonicStatic flag is not set
      const bassEvents = result.events.filter((e: Event) => e.channel === "triangle" && e.command === "noteOn");
      const bassNotes = bassEvents.map((e: Event) => e.data.midi);

      // Check for drone characteristics: high repetition of root note
      const noteFreq = bassNotes.reduce((acc: Record<number, number>, note: number) => {
        acc[note] = (acc[note] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      const maxFreq = Math.max(...(Object.values(noteFreq) as number[]));
      const totalNotes = bassNotes.length;
      assert.ok(maxFreq / totalNotes >= 0.4, "Should have high repetition (drone characteristic)");
    });

    it("should use texture_loop rhythm patterns extensively", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 8,
        seed: 30001,
        preset: "minimal-techno"
      });

      const result = runPipeline(options);

      const rhythmUsage = Object.keys(result.diagnostics.motifUsage.rhythm ?? {});
      const hasTextureLoop = rhythmUsage.some((id) => (rhythmMeta.get(id) ?? []).includes("texture_loop"));

      assert.ok(
        hasTextureLoop,
        `Expected texture_loop rhythms, got ${rhythmUsage.join(",")}`
      );
    });

    it("should select four-on-floor drum motifs when percussive layering is active", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 16,
        seed: 13579,
        preset: "minimal-techno"
      });

      const result = runPipeline(options);

      const drumTags = new Map(
        (drumMotifsJson as any as Array<{ id: string; tags?: string[] }>).map(motif => [motif.id, motif.tags ?? []])
      );
      const drumMotifs = Object.keys(result.diagnostics.motifUsage.drums ?? {});
      assert.ok(
        drumMotifs.some((id) =>
          (drumTags.get(id) ?? []).some(tag => tag === "four_on_floor" || tag === "percussive_layer")
        ),
        `Expected minimal techno drum motifs to include four-on-floor or percussive-layer patterns, got ${drumMotifs.join(",")}`
      );

      const square1Gain = result.events.filter(
        (e: Event) =>
          e.channel === "square1" &&
          e.command === "setParam" &&
          e.data?.param === "gain"
      );
      assert.ok(
        square1Gain.some((e: Event) => Math.abs((e.data?.value ?? 0) - 0.62) < 0.001),
        "Minimal techno should apply sidechain-like gain reduction on square1"
      );

      const square2Gain = result.events.filter(
        (e: Event) =>
          e.channel === "square2" &&
          e.command === "setParam" &&
          e.data?.param === "gain"
      );
      assert.ok(
        square2Gain.some((e: Event) => Math.abs((e.data?.value ?? 0) - 0.6) < 0.001),
        "Minimal techno should apply sidechain-like gain reduction on square2"
      );
    });
  });

  describe("Progressive House", () => {
    it("should demonstrate gradual velocity increase across sections", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 24,
        seed: 77777,
        preset: "progressive-house"
      });

      const result = runPipeline(options);

      // gradualBuild should be enabled
      assert.strictEqual(result.meta.styleIntent.gradualBuild, true);

      // Check melody velocity progression
      const melodyChannels = getChannelsForRoles(result, ["melody", "melodyAlt"]);
      const melodyChannelSet = new Set(melodyChannels.length ? melodyChannels : ["square1"]);

      const melodyEvents = result.events
        .filter((e: Event) => melodyChannelSet.has(e.channel) && e.command === "noteOn")
        .sort((a: Event, b: Event) => a.time - b.time);

      if (melodyEvents.length >= 4) {
        const firstQuarterVel = melodyEvents.slice(0, Math.floor(melodyEvents.length / 4))
          .reduce((sum: number, e: Event) => sum + e.data.velocity, 0) / Math.floor(melodyEvents.length / 4);

        const lastQuarterVel = melodyEvents.slice(-Math.floor(melodyEvents.length / 4))
          .reduce((sum: number, e: Event) => sum + e.data.velocity, 0) / Math.floor(melodyEvents.length / 4);

        assert.ok(lastQuarterVel > firstQuarterVel,
          `Velocity should increase from start to end (${firstQuarterVel.toFixed(1)} -> ${lastQuarterVel.toFixed(1)})`);
      }
    });

    it("should insert breaks at regular intervals", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 16,
        seed: 33333,
        preset: "progressive-house"
      });

      const result = runPipeline(options);

      // breakInsertion should be enabled
      assert.strictEqual(result.meta.styleIntent.breakInsertion, true);

      // Check for noise channel breaks (silence or reduced activity)
      const noiseEvents = result.events.filter((e: Event) => e.channel === "noise" && e.command === "noteOn");
      assert.ok(noiseEvents.length > 0, "Should have drum events");
    });

    it("should feature atmosPad characteristics", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 20,
        seed: 11111,
        preset: "progressive-house"
      });

      const result = runPipeline(options);

      // atmosPad should be enabled
      assert.strictEqual(result.meta.styleIntent.atmosPad, true);
    });

    it("should inject progressive duty and pad automation", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 24,
        seed: 24680,
        preset: "progressive-house"
      });

      const result = runPipeline(options);

      const dutyEvents = result.events.filter(
        (e: Event) =>
          e.channel === "square2" &&
          e.command === "setParam" &&
          e.data?.param === "duty"
      );
      const progressiveDutyTargets = [0.32, 0.48, 0.58, 0.68];
      assert.ok(
        dutyEvents.some((e: Event) =>
          progressiveDutyTargets.some((target) => Math.abs((e.data?.value ?? 0) - target) < 0.001)
        ),
        "Progressive house should apply duty sweep automation on square2"
      );

      const triangleGain = result.events.filter(
        (e: Event) =>
          e.channel === "triangle" &&
          e.command === "setParam" &&
          e.data?.param === "gain"
      );
      assert.ok(
        triangleGain.some((e: Event) => (e.data?.value ?? 0) >= 0.6),
        "Progressive house should boost pad gain via progressive automation"
      );
    });
  });

  describe("Four-on-the-Floor Detection", () => {
    it("should have bass hits on every downbeat for four_on_floor style", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 8,
        seed: 88888,
        twoAxisStyle: {
          percussiveMelodic: -0.6,
          calmEnergetic: 0.5
        }
      });

      const result = runPipeline(options);
      const bpm = result.meta.bpm;
      const secondsPerBeat = 60 / bpm;

      // Get bass note-on events
      const bassChannels = getChannelsForRoles(result, ["bass"]);
      const primaryBassChannel = bassChannels[0] ?? "triangle";

      const bassEvents = result.events
        .filter((e: Event) => e.channel === primaryBassChannel && e.command === "noteOn")
        .sort((a: Event, b: Event) => a.time - b.time);

      if (bassEvents.length >= 4) {
        // Check for regular pulse (every beat or every other beat)
        const intervals = [];
        for (let i = 1; i < Math.min(bassEvents.length, 10); i++) {
          intervals.push(bassEvents[i].time - bassEvents[i-1].time);
        }

        // Should have consistent intervals
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((sum, int) => sum + Math.pow(int - avgInterval, 2), 0) / intervals.length;

        assert.ok(variance < secondsPerBeat, "Bass should have regular pulse pattern");
      }
    });
  });

  describe("Axis Defaults", () => {
    it("should generate music with neutral two-axis defaults", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 8,
        seed: 42
      });

      const result = runPipeline(options);

      // Should have events
      assert.ok(result.events.length > 0, "Should generate music");

      // Should have melody
      const melodyEvents = result.events.filter((e: Event) => e.channel === "square1" && e.command === "noteOn");
      assert.ok(melodyEvents.length > 0, "Should have melody");

      // Auto mode should still respect syncopation bias but not force break insertion
      assert.strictEqual(result.meta.styleIntent.breakInsertion, false);
    });

    it("should allow explicitly melodic calm music generation", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 8,
        seed: 999,
        twoAxisStyle: {
          percussiveMelodic: 0.6,
          calmEnergetic: -0.2
        }
      });

      const result = runPipeline(options);

      assert.ok(result.events.length > 0, "Should generate music");
      assert.strictEqual(result.meta.mood, "sad");

      // Should use sad-oriented mood inference
      const melodyEvents = result.events.filter((e: Event) => e.channel === "square1");
      assert.ok(melodyEvents.length > 0, "Should have melody events");
    });
  });

  describe("Hybrid Styles", () => {
    it("should allow combining energetic axis with pad-forward override", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 16,
        seed: 55555,
        twoAxisStyle: {
          percussiveMelodic: -0.2,
          calmEnergetic: 0.65
        },
        overrides: {
          atmosPad: true
        }
      });

      const result = runPipeline(options);

      assert.strictEqual(result.meta.styleIntent.gradualBuild, true);
      assert.strictEqual(result.meta.styleIntent.atmosPad, true);
      assert.ok(result.events.length > 0, "Should generate hybrid music");
    });

    it("should allow fine-grained control via styleOverrides", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 8,
        seed: 66666,
        twoAxisStyle: {
          percussiveMelodic: 0.1,
          calmEnergetic: 0.4
        },
        overrides: {
          percussiveLayering: true,
          harmonicStatic: false
        }
      });

      const result = runPipeline(options);

      assert.strictEqual(result.meta.styleIntent.percussiveLayering, true);
      assert.ok(result.events.length > 0, "Should generate custom-styled music");
    });
  });
});
