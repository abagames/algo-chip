import { describe, it } from "node:test";
import assert from "node:assert";
import { runPipeline } from "../pipeline.js";
import { planStructure } from "../phase/structure-planning.js";
import { selectMotifs } from "../phase/motif-selection.js";
import type { PipelineCompositionOptions } from "../types.js";
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
        assert.ok(events.length > 0, `${channel} should contain noteOn events`);
        {
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
        },
        sectionRepeatBias: 1
      });

      const result = runPipeline(options);
      const motifPlan = result.diagnostics.sectionMotifPlan;

      // Should have multiple sections in 32 measures
      assert.ok(motifPlan.length >= 4, "Should have at least 4 sections in 32 measures");

      // Check A section consistency
      const aSections = motifPlan.filter(plan => plan.templateId === "A");
      assert.ok(aSections.length > 1, "Should include a reprised A section");
      {
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
          assert.strictEqual(
            section.hookReuse,
            "exact",
            "Repeated A sections should report exact hook reuse"
          );
        });
      }
    });

    it("should vary reprised hooks when sectionRepeatBias is low", () => {
      const baseOptions: PipelineCompositionOptions = {
        mood: "tense",
        tempo: "fast",
        lengthInMeasures: 32,
        seed: 12345,
        styleOverrides: {
          textureFocus: 1.0,
          loopCentric: 0,
          gradualBuild: 1.0,
          harmonicStatic: 0,
          percussiveLayering: 1.0,
          breakInsertion: 1.0,
          filterMotion: 1.0,
          syncopationBias: 1.0,
          atmosPad: 0
        }
      };

      const exactOptions: PipelineCompositionOptions = {
        ...baseOptions,
        sectionRepeatBias: 1
      };
      const variedOptions: PipelineCompositionOptions = {
        ...baseOptions,
        sectionRepeatBias: 0
      };
      const boundaryOptions: PipelineCompositionOptions = {
        ...baseOptions,
        sectionRepeatBias: 0.25
      };

      const exactPlan = planStructure(exactOptions);
      const variedPlan = planStructure(variedOptions);
      const boundaryPlan = planStructure(boundaryOptions);
      const exactMotifs = selectMotifs(exactOptions, exactPlan);
      const variedMotifs = selectMotifs(variedOptions, variedPlan);
      const boundaryMotifs = selectMotifs(boundaryOptions, boundaryPlan);

      assert.strictEqual(
        exactMotifs.motifSelection.hookReuse.exact,
        1,
        "High repeat bias should keep reprised A hook exact"
      );
      assert.strictEqual(
        exactMotifs.motifSelection.hookReuse.varied,
        0,
        "High repeat bias should not vary reprised hooks"
      );
      assert.strictEqual(
        variedMotifs.motifSelection.hookReuse.exact,
        0,
        "Low repeat bias should not keep reprised A hook exact for this seed"
      );
      assert.strictEqual(
        variedMotifs.motifSelection.hookReuse.varied,
        1,
        "Low repeat bias should report one varied reprised hook"
      );
      assert.strictEqual(
        boundaryMotifs.motifSelection.hookReuse.exact,
        1,
        "Repeat bias at 0.25 should keep reprised A hook exact"
      );
      assert.ok(
        boundaryMotifs.motifSelection.cacheEvents.some((event) => event.source === "hook_reuse"),
        "Cache diagnostics should distinguish hook reuse"
      );

      const variedASections = variedMotifs.sectionMotifPlan.filter((section) => section.templateId === "A");
      assert.ok(variedASections.length >= 2, "Should have reprised A sections");
      assert.strictEqual(
        variedASections[1].primaryRhythm,
        variedASections[0].primaryRhythm,
        "Low-bias hook variation should keep rhythm stable"
      );
      assert.notStrictEqual(
        variedASections[1].primaryMelody,
        variedASections[0].primaryMelody,
        "Low-bias hook variation should change the pitch motif"
      );
      assert.strictEqual(
        variedASections[1].hookVariationSource,
        "melody_variation",
        "Low-bias hook variation should use a declared melody variation when available"
      );
      assert.strictEqual(
        variedASections[1].hookOriginalMelody,
        variedASections[0].primaryMelody,
        "Varied hook diagnostics should record the original melody"
      );
    });

    it("should use 0.25 as the default repeat bias and expose post-generation diagnostics", () => {
      const options = buildOptions({
        lengthInMeasures: 32,
        seed: 12345,
        twoAxisStyle: {
          percussiveMelodic: -0.2,
          calmEnergetic: 0.3
        }
      });
      const implicit = runPipeline(options);
      const explicit = runPipeline({ ...options, sectionRepeatBias: 0.25 });

      assert.strictEqual(implicit.meta.replayOptions.sectionRepeatBias, 0.25);
      assert.deepStrictEqual(
        implicit.diagnostics.sectionMotifPlan,
        explicit.diagnostics.sectionMotifPlan,
        "Omitted repeat bias should behave exactly like an explicit 0.25"
      );
      assert.strictEqual(
        implicit.diagnostics.motifSelection.motifSequence.length,
        32,
        "Motif sequence diagnostics should contain one entry per measure"
      );
      assert.ok(
        implicit.diagnostics.motifSelection.cacheEvents.some((event) => event.source === "new_selection"),
        "Cache diagnostics should distinguish new selections"
      );
      assert.ok(
        implicit.diagnostics.motifSelection.cacheEvents.some((event) => event.source === "template_cache"),
        "Cache diagnostics should distinguish template cache hits"
      );
      assert.ok(
        implicit.diagnostics.motifSelection.melodyPitch.length > 0,
        "Pitch diagnostics should include generated melody notes"
      );
      assert.ok(
        implicit.diagnostics.motifSelection.melodyPitch.every((note) =>
          Number.isFinite(note.degree) &&
          Number.isFinite(note.scaleMidi) &&
          Number.isFinite(note.correctedMidi) &&
          note.changed === (note.scaleMidi !== note.correctedMidi)
        ),
        "Pitch diagnostics should preserve degree and before/after MIDI values"
      );
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

        assert.ok(totalMelodyMotifs > 0, "Expected melody motif usage diagnostics");
        assert.ok(maxMelodyUsage > 0, "Expected a dominant melody motif");
        const recurrence = maxMelodyUsage / totalMelodyMotifs;
        assert.ok(
          recurrence >= 0.2,
          `Expected dominant motif recurrence >= 0.2, got ${recurrence.toFixed(2)}`
        );
      };

      checkRecurrence(result16);
      checkRecurrence(result32);
      checkRecurrence(result64);
    });
  });
});
