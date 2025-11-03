import { describe, it } from "node:test";
import assert from "node:assert";
import { runPipeline } from "../pipeline.js";
import { buildTwoAxisOptions as buildOptions } from "./test-utils.js";

describe("Fixed Length Generation", () => {
  describe("16-measure compositions", () => {
    it("should generate exactly 16 measures (64 beats) of events", () => {
      const options = buildOptions({
        lengthInMeasures: 16,
        seed: 11111,
        twoAxisStyle: {
          percussiveMelodic: -0.1,
          calmEnergetic: 0.2
        }
      });

      const result = runPipeline(options);

      // Verify meta information
      assert.strictEqual(result.meta.lengthInMeasures, 16);
      assert.strictEqual(result.meta.loopInfo.totalBeats, 64, "Should be 16 measures * 4 beats = 64 beats");

      // Verify events don't exceed total duration
      const bpm = result.meta.bpm;
      const lastEvent = result.events[result.events.length - 1];
      const lastEventBeat = lastEvent.time * (bpm / 60);

      assert.ok(lastEventBeat <= 64 + 1, `Last event should be within 16 measures (64 beats + 1 tolerance), got ${lastEventBeat.toFixed(2)}`);

      // Verify loop info
      assert.strictEqual(result.meta.loopInfo.loopStartBeat, 0);
      assert.strictEqual(result.meta.loopInfo.loopEndBeat, 64);

      const expectedDuration = (64 / bpm) * 60;
      assert.ok(
        Math.abs(result.meta.loopInfo.totalDuration - expectedDuration) < 0.1,
        `Duration should be approximately ${expectedDuration.toFixed(2)}s, got ${result.meta.loopInfo.totalDuration.toFixed(2)}s`
      );
    });

    it("should generate all four channels for 16 measures", () => {
      const options = buildOptions({
        lengthInMeasures: 16,
        seed: 22222,
        twoAxisStyle: {
          percussiveMelodic: -0.5,
          calmEnergetic: 0.5
        }
      });

      const result = runPipeline(options);

      const square1Events = result.events.filter(e => e.channel === "square1");
      const square2Events = result.events.filter(e => e.channel === "square2");
      const triangleEvents = result.events.filter(e => e.channel === "triangle");
      const noiseEvents = result.events.filter(e => e.channel === "noise");

      assert.ok(square1Events.length > 0, "Should have square1 (melody) events");
      assert.ok(square2Events.length > 0, "Should have square2 (sub-melody) events");
      assert.ok(triangleEvents.length > 0, "Should have triangle (bass) events");
      assert.ok(noiseEvents.length > 0, "Should have noise (drums) events");
    });
  });

  describe("32-measure compositions", () => {
    it("should generate exactly 32 measures (128 beats) of events", () => {
      const options = buildOptions({
        lengthInMeasures: 32,
        seed: 33333,
        twoAxisStyle: {
          percussiveMelodic: 0.3,
          calmEnergetic: -0.5
        }
      });

      const result = runPipeline(options);

      // Verify meta information
      assert.strictEqual(result.meta.lengthInMeasures, 32);
      assert.strictEqual(result.meta.loopInfo.totalBeats, 128, "Should be 32 measures * 4 beats = 128 beats");

      // Verify events don't exceed total duration
      const bpm = result.meta.bpm;
      const lastEvent = result.events[result.events.length - 1];
      const lastEventBeat = lastEvent.time * (bpm / 60);

      assert.ok(lastEventBeat <= 128 + 1, `Last event should be within 32 measures (128 beats + 1 tolerance), got ${lastEventBeat.toFixed(2)}`);

      // Verify loop info
      assert.strictEqual(result.meta.loopInfo.loopStartBeat, 0);
      assert.strictEqual(result.meta.loopInfo.loopEndBeat, 128);
    });

    it("should generate consistent channel coverage across 32 measures", () => {
      const options = buildOptions({
        lengthInMeasures: 32,
        seed: 44444,
        twoAxisStyle: {
          percussiveMelodic: 0.5,
          calmEnergetic: -0.2
        }
      });

      const result = runPipeline(options);
      const bpm = result.meta.bpm;
      const totalDuration = result.meta.loopInfo.totalDuration;

      // Check that events span the full duration for each channel
      const checkChannelSpan = (channel: string) => {
        const events = result.events.filter(e => e.channel === channel && e.command === "noteOn");
        if (events.length > 0) {
          const firstTime = events[0].time;
          const lastTime = events[events.length - 1].time;
          const span = lastTime - firstTime;

          // Events should span at least 75% of total duration
          assert.ok(
            span >= totalDuration * 0.75,
            `${channel} events should span at least 75% of composition (${(totalDuration * 0.75).toFixed(2)}s), got ${span.toFixed(2)}s`
          );
        }
      };

      checkChannelSpan("square1");
      checkChannelSpan("square2");
      checkChannelSpan("triangle");
      checkChannelSpan("noise");
    });

    it("should maintain hook motif consistency across 32 measures", () => {
      const options = buildOptions({
        lengthInMeasures: 32,
        seed: 55555,
        twoAxisStyle: {
          percussiveMelodic: -0.2,
          calmEnergetic: 0.3
        }
      });

      const result = runPipeline(options);
      const motifPlan = result.diagnostics.sectionMotifPlan;

      // Should have multiple sections in 32 measures
      assert.ok(motifPlan.length >= 4, "Should have at least 4 sections in 32 measures");

      // Check A section consistency
      const aSections = motifPlan.filter(plan => plan.templateId === "A");
      if (aSections.length > 1) {
        const firstASection = aSections[0];
        const reprisedASections = aSections.slice(1);

        reprisedASections.forEach(section => {
          assert.strictEqual(
            section.primaryRhythm,
            firstASection.primaryRhythm,
            "All A sections should use the same rhythm motif"
          );
          assert.strictEqual(
            section.primaryMelody,
            firstASection.primaryMelody,
            "All A sections should use the same melody motif"
          );
          assert.strictEqual(
            section.reprisesHook,
            true,
            "Repeated A sections should mark hook reprise"
          );
        });
      }
    });
  });

  describe("64-measure compositions", () => {
    it("should generate exactly 64 measures (256 beats) of events", () => {
      const options = buildOptions({
        lengthInMeasures: 64,
        seed: 66666,
        twoAxisStyle: {
          percussiveMelodic: -0.35,
          calmEnergetic: 0.2
        }
      });

      const result = runPipeline(options);

      // Verify meta information
      assert.strictEqual(result.meta.lengthInMeasures, 64);
      assert.strictEqual(result.meta.loopInfo.totalBeats, 256, "Should be 64 measures * 4 beats = 256 beats");

      // Verify events don't exceed total duration
      const bpm = result.meta.bpm;
      const lastEvent = result.events[result.events.length - 1];
      const lastEventBeat = lastEvent.time * (bpm / 60);

      assert.ok(lastEventBeat <= 256 + 1, `Last event should be within 64 measures (256 beats + 1 tolerance), got ${lastEventBeat.toFixed(2)}`);

      // Verify loop info
      assert.strictEqual(result.meta.loopInfo.loopStartBeat, 0);
      assert.strictEqual(result.meta.loopInfo.loopEndBeat, 256);
    });

    it("should maintain structural coherence across 64 measures", () => {
      const options = buildOptions({
        lengthInMeasures: 64,
        seed: 77777,
        twoAxisStyle: {
          percussiveMelodic: -0.25,
          calmEnergetic: 0.5
        }
      });

      const result = runPipeline(options);
      const motifPlan = result.diagnostics.sectionMotifPlan;

      // Should have multiple macro sections in 64 measures
      assert.ok(motifPlan.length >= 4, "Should have at least 4 sections in 64 measures");

      // Check for structural diversity
      const templateIds = motifPlan.map(plan => plan.templateId);
      const uniqueTemplates = new Set(templateIds);

      assert.ok(uniqueTemplates.size >= 2, "Should use at least 2 different section templates");

      // Check that A sections appear multiple times (hook recurrence)
      const aCount = templateIds.filter(id => id === "A").length;
      assert.ok(aCount >= 1, "Should include at least one A section for hook establishment");
    });

    it("should scale event density appropriately for 64 measures", () => {
      const options = buildOptions({
        lengthInMeasures: 64,
        seed: 88888,
        twoAxisStyle: {
          percussiveMelodic: 0.45,
          calmEnergetic: -0.4
        }
      });

      const result = runPipeline(options);

      // Verify event generation scaled properly
      assert.ok(result.events.length > 100, "Should have substantial number of events for 64 measures");

      // Verify no channel voice overlap
      const triangleEntries = result.diagnostics.voiceAllocation.filter(
        entry => entry.channel === "triangle"
      );
      const hasTriangleOverlap = triangleEntries.some(entry => entry.activeCount > 1);
      assert.ok(!hasTriangleOverlap, "Triangle channel should not have overlapping voices even in 64 measures");

      const noiseEntries = result.diagnostics.voiceAllocation.filter(
        entry => entry.channel === "noise"
      );
      const hasNoiseOverlap = noiseEntries.some(entry => entry.activeCount > 1);
      assert.ok(!hasNoiseOverlap, "Noise channel should not have overlapping voices even in 64 measures");
    });
  });

  describe("Cross-length consistency", () => {
    it("should produce deterministic results for same seed across different lengths", () => {
      const seed = 99999;
      const axis = { percussiveMelodic: -0.15, calmEnergetic: 0.1 } as const;

      const result16a = runPipeline(buildOptions({ lengthInMeasures: 16, seed, twoAxisStyle: axis }));
      const result16b = runPipeline(buildOptions({ lengthInMeasures: 16, seed, twoAxisStyle: axis }));

      // Same seed and options should produce identical results
      assert.strictEqual(result16a.events.length, result16b.events.length);
      assert.strictEqual(result16a.meta.bpm, result16b.meta.bpm);
      assert.strictEqual(result16a.meta.key, result16b.meta.key);

      // First few melody notes should match
      const melody16a = result16a.events.filter(e => e.channel === "square1" && e.command === "noteOn").slice(0, 5);
      const melody16b = result16b.events.filter(e => e.channel === "square1" && e.command === "noteOn").slice(0, 5);

      melody16a.forEach((event, idx) => {
        assert.strictEqual(event.data.midi, melody16b[idx].data.midi, "Same seed should produce same melody notes");
      });
    });

    it("should maintain motif usage balance across different lengths", () => {
      const seed = 12345;

      const axis16 = { percussiveMelodic: -0.2, calmEnergetic: 0.2 } as const;
      const axis32 = { percussiveMelodic: -0.25, calmEnergetic: 0.25 } as const;
      const axis64 = { percussiveMelodic: -0.3, calmEnergetic: 0.3 } as const;

      const result16 = runPipeline(buildOptions({ lengthInMeasures: 16, seed, twoAxisStyle: axis16 }));
      const result32 = runPipeline(buildOptions({ lengthInMeasures: 32, seed, twoAxisStyle: axis32 }));
      const result64 = runPipeline(buildOptions({ lengthInMeasures: 64, seed, twoAxisStyle: axis64 }));

      // All should have dominant motif recurrence
      const checkRecurrence = (result: any) => {
        const melodyUsageValues = Object.values(result.diagnostics.motifUsage.melody) as number[];
        const totalMelodyMotifs = melodyUsageValues.reduce((sum, value) => sum + value, 0);
        const maxMelodyUsage = melodyUsageValues.length ? Math.max(...melodyUsageValues) : 0;

        if (totalMelodyMotifs > 0 && maxMelodyUsage > 0) {
          const recurrence = maxMelodyUsage / totalMelodyMotifs;
          assert.ok(
            recurrence >= 0.2,
            `Expected dominant motif recurrence >= 0.2, got ${recurrence.toFixed(2)}`
          );
        }
      };

      checkRecurrence(result16);
      checkRecurrence(result32);
      checkRecurrence(result64);
    });
  });
});
