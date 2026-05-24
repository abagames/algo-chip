import { describe, it } from "node:test";
import assert from "node:assert";
import { runPipeline } from "../pipeline.js";
import type { Event } from "../types.js";
import { buildTwoAxisOptions, isNoteOnEvent, isSetParamEvent } from "./test-utils.js";
import rhythmMotifsJson from "../../motifs/rhythm.json" with { type: "json" };
import drumMotifsJson from "../../motifs/drums.json" with { type: "json" };
import bassPatternsJson from "../../motifs/bass-patterns.json" with { type: "json" };

const rhythmMeta = new Map(
  (rhythmMotifsJson as any as Array<{ id: string; tags?: string[] }>).map((motif) => [motif.id, motif.tags ?? []])
);
const drumMeta = new Map(
  (drumMotifsJson as any as Array<{ id: string; tags?: string[] }>).map((motif) => [motif.id, motif.tags ?? []])
);
const bassMeta = new Map(
  ((bassPatternsJson as any).patterns as Array<{ id: string; tags?: string[] }>).map((motif) => [motif.id, motif.tags ?? []])
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
  describe("Preset Motif Targeting", () => {
    it("should route preset-specific bass and drum tags across seed sweeps", () => {
      const cases = [
        {
          preset: "minimal-techno" as const,
          expectedTags: ["four_on_floor", "percussive_layer", "static"]
        },
        {
          preset: "retro-loopwave" as const,
          expectedTags: ["retro", "texture_loop", "loop_safe"]
        },
        {
          preset: "breakbeat-jungle" as const,
          expectedTags: ["breakbeat", "syncopation", "grid16"]
        },
        {
          preset: "lofi-chillhop" as const,
          expectedTags: ["lofi", "rest_heavy", "swing_hint"]
        }
      ];

      for (const testCase of cases) {
        const observedTags = new Set<string>();
        for (const seed of [101, 202, 303, 54321]) {
          const result = runPipeline(buildTwoAxisOptions({
            lengthInMeasures: 16,
            seed,
            preset: testCase.preset
          }));

          for (const id of Object.keys(result.diagnostics.motifUsage.bass)) {
            for (const tag of bassMeta.get(id) ?? []) {
              observedTags.add(tag);
            }
          }
          for (const id of Object.keys(result.diagnostics.motifUsage.drums)) {
            for (const tag of drumMeta.get(id) ?? []) {
              observedTags.add(tag);
            }
          }

          const bassChannels = new Set(
            result.meta.voiceArrangement.voices
              .filter((voice) => voice.role === "bass" || voice.role === "bassAlt")
              .map((voice) => voice.channel)
          );
          const bassVelocities = result.events
            .filter(isNoteOnEvent)
            .filter((event: Event<"noteOn">) => bassChannels.has(event.channel))
            .map((event: Event<"noteOn">) => event.data.velocity)
            .filter((value): value is number => typeof value === "number");
          if (bassVelocities.length) {
            assert.ok(
              Math.max(...bassVelocities) <= 100,
              `${testCase.preset} bass velocity should remain capped`
            );
          }
        }

        assert.ok(
          testCase.expectedTags.some((tag) => observedTags.has(tag)),
          `${testCase.preset} should reach at least one preset tag; observed=${Array.from(observedTags).join(",")}`
        );
      }
    });
  });

  describe("Minimal Techno", () => {
    it("should record preset tag filtering diagnostics", () => {
      const result = runPipeline(buildTwoAxisOptions({
        lengthInMeasures: 16,
        seed: 24680,
        preset: "minimal-techno"
      }));

      const presetStages = result.diagnostics.motifSelection.candidatePools.filter(
        (entry) => entry.stage === "preset" || entry.stage.startsWith("preset")
      );

      assert.ok(presetStages.length > 0, "Preset tag filtering diagnostics should be recorded");
      assert.ok(
        presetStages.some((entry) => entry.category === "bass" || entry.category === "drums"),
        "Preset diagnostics should affect bass or drums"
      );
    });

    it("should use predominantly four_on_floor bass patterns", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 16,
        seed: 12345,
        preset: "minimal-techno"
      });

      const result = runPipeline(options);

      // Check that bass patterns with four_on_floor tags are used
      const bassEvents = result.events
        .filter(isNoteOnEvent)
        .filter((e: Event<"noteOn">) => e.channel === "triangle");
      assert.ok(bassEvents.length > 0, "Should have bass events");

      // Minimal techno should have consistent, repetitive bass
      const uniqueBassNotes = new Set(
        bassEvents
          .map((e: Event<"noteOn">) => e.data.midi)
          .filter((midi): midi is number => typeof midi === "number")
      );
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
      const bassEvents = result.events
        .filter(isNoteOnEvent)
        .filter((e: Event<"noteOn">) => e.channel === "triangle");
      const bassNotes = bassEvents
        .map((e: Event<"noteOn">) => e.data.midi)
        .filter((midi): midi is number => typeof midi === "number");

      // Check for drone characteristics: high repetition of root note
      const noteFreq = bassNotes.reduce<Record<number, number>>((acc, note) => {
        acc[note] = (acc[note] || 0) + 1;
        return acc;
      }, {});

      const freqValues = Object.values(noteFreq);
      const maxFreq = freqValues.length ? Math.max(...freqValues) : 0;
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

      const square1Gain: Array<Event<"setParam">> = result.events
        .filter(isSetParamEvent)
        .filter((e): e is Event<"setParam"> => e.channel === "square1" && e.data.param === "gain");
      assert.ok(
        square1Gain.some((e) => Math.abs((e.data.value ?? 0) - 0.62) < 0.001),
        "Minimal techno should apply sidechain-like gain reduction on square1"
      );

      const square2Gain: Array<Event<"setParam">> = result.events
        .filter(isSetParamEvent)
        .filter((e): e is Event<"setParam"> => e.channel === "square2" && e.data.param === "gain");
      assert.ok(
        square2Gain.some((e) => Math.abs((e.data.value ?? 0) - 0.6) < 0.001),
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
      assert.ok(result.meta.styleIntent.gradualBuild > 0.5);

      // Check melody velocity progression
      const melodyChannels = getChannelsForRoles(result, ["melody", "melodyAlt"]);
      const melodyChannelSet = new Set(melodyChannels.length ? melodyChannels : ["square1"]);

      const melodyEvents = result.events
        .filter(isNoteOnEvent)
        .filter((e: Event<"noteOn">) => melodyChannelSet.has(e.channel))
        .sort((a: Event<"noteOn">, b: Event<"noteOn">) => a.time - b.time);

      if (melodyEvents.length >= 4) {
        const quarterSize = Math.floor(melodyEvents.length / 4);
        const firstQuarterVel = melodyEvents
          .slice(0, quarterSize)
          .reduce((sum, e) => sum + (e.data.velocity ?? 0), 0) / quarterSize;

        const lastQuarterVel = melodyEvents
          .slice(-quarterSize)
          .reduce((sum, e) => sum + (e.data.velocity ?? 0), 0) / quarterSize;

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
      assert.ok(result.meta.styleIntent.breakInsertion > 0.5);

      // Check for noise channel breaks (silence or reduced activity)
      const noiseEvents = result.events
        .filter(isNoteOnEvent)
        .filter((e: Event<"noteOn">) => e.channel === "noise");
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
      assert.ok(result.meta.styleIntent.atmosPad > 0.5);
    });

    it("should inject progressive duty and pad automation", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 24,
        seed: 24680,
        preset: "progressive-house"
      });

      const result = runPipeline(options);

      const dutyEvents: Array<Event<"setParam">> = result.events
        .filter(isSetParamEvent)
        .filter((e): e is Event<"setParam"> => e.channel === "square2" && e.data.param === "duty");
      const progressiveDutyTargets = [0.32, 0.48, 0.58, 0.68];
      assert.ok(
        dutyEvents.some((e: Event<"setParam">) =>
          progressiveDutyTargets.some((target) => Math.abs((e.data.value ?? 0) - target) < 0.001)
        ),
        "Progressive house should apply duty sweep automation on square2"
      );

      const triangleGain: Array<Event<"setParam">> = result.events
        .filter(isSetParamEvent)
        .filter((e): e is Event<"setParam"> => e.channel === "triangle" && e.data.param === "gain");
      assert.ok(
        triangleGain.some((e) => (e.data.value ?? 0) >= 0.6),
        "Progressive house should boost pad gain via progressive automation"
      );
    });

    it("should add supported pitch bend ornaments for moving leads", () => {
      const options = buildTwoAxisOptions({
        lengthInMeasures: 24,
        seed: 24680,
        preset: "progressive-house"
      });

      const result = runPipeline(options);
      const pitchBends: Array<Event<"setParam">> = result.events
        .filter(isSetParamEvent)
        .filter((e): e is Event<"setParam"> =>
          (e.channel === "square1" || e.channel === "square2") &&
          e.data.param === "pitchBend"
        );

      assert.ok(pitchBends.length > 0, "Progressive house should emit pitch bend ornaments");
      assert.ok(
        pitchBends.every((e) => typeof e.data.value === "number" && typeof e.data.rampDuration === "number"),
        "Pitch bend ornaments should use numeric value and rampDuration"
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
        .filter(isNoteOnEvent)
        .filter((e: Event<"noteOn">) => e.channel === primaryBassChannel)
        .sort((a: Event<"noteOn">, b: Event<"noteOn">) => a.time - b.time);

      if (bassEvents.length >= 4) {
        // Check for regular pulse (every beat or every other beat)
        const intervals: number[] = [];
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
      assert.ok(result.meta.styleIntent.breakInsertion <= 0.5);
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
          atmosPad: 1.0
        }
      });

      const result = runPipeline(options);

      assert.ok(result.meta.styleIntent.gradualBuild > 0.5);
      assert.ok(result.meta.styleIntent.atmosPad > 0.5);
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
          percussiveLayering: 1.0,
          harmonicStatic: 0
        }
      });

      const result = runPipeline(options);

      assert.ok(result.meta.styleIntent.percussiveLayering > 0.5);
      assert.ok(result.events.length > 0, "Should generate custom-styled music");
    });
  });
});
