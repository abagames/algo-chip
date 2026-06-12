import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runPipeline } from "../pipeline.js";
import type { PipelineResult } from "../types.js";
import { buildTwoAxisOptions } from "./test-utils.js";

const SEEDS = Array.from({ length: 16 }, (_, index) => index + 1);
const HARMONIC_STATIC_PRESETS = ["minimal-techno", "lofi-chillhop"] as const;
const MOVING_HARMONY_PRESETS = ["progressive-house", "breakbeat-jungle"] as const;

const PITCH_CLASSES: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11
};

interface ChordMetrics {
  chordCount: number;
  signature: string;
  staticRepeatRate: number;
}

function extractChordSequence(result: PipelineResult): string[] {
  return result.diagnostics.motifSelection.motifSequence.map((entry) => entry.chord);
}

function normalizeChord(chord: string, key: string): string {
  const chordMatch = chord.match(/^([A-G](?:#|b)?)(.*)$/);
  const keyRoot = key.split("_")[0];
  const chordRoot = chordMatch?.[1];

  if (!chordMatch || !chordRoot || !(chordRoot in PITCH_CLASSES)) {
    throw new Error(`Unsupported chord: ${chord}`);
  }
  assert.ok(keyRoot in PITCH_CLASSES, `Unsupported key: ${key}`);

  const interval = (PITCH_CLASSES[chordRoot] - PITCH_CLASSES[keyRoot] + 12) % 12;
  const quality = chordMatch[2] || "major";
  return `${interval}:${quality}`;
}

function collectChordMetrics(result: PipelineResult): ChordMetrics {
  const chords = extractChordSequence(result);
  assert.ok(chords.length > 1, "Chord metrics require at least two measures");

  const normalized = chords.map((chord) => normalizeChord(chord, result.meta.key));
  const collapsed = normalized.filter((chord, index) => index === 0 || chord !== normalized[index - 1]);
  const repeatedTransitions = normalized.slice(1).filter((chord, index) => chord === normalized[index]).length;

  return {
    chordCount: new Set(normalized).size,
    signature: collapsed.join(">"),
    staticRepeatRate: repeatedTransitions / (normalized.length - 1)
  };
}

function generatePresetMetrics(
  preset: Parameters<typeof buildTwoAxisOptions>[0]["preset"]
): Array<{ result: PipelineResult; metrics: ChordMetrics }> {
  return SEEDS.map((seed) => {
    const result = runPipeline(buildTwoAxisOptions({
      lengthInMeasures: 16,
      seed,
      preset
    }));
    return { result, metrics: collectChordMetrics(result) };
  });
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

describe("chord progression variety", () => {
  it("keeps harmonic-static progressions repetitive without collapsing every seed to one chord", () => {
    for (const preset of HARMONIC_STATIC_PRESETS) {
      const samples = generatePresetMetrics(preset);
      const metrics = samples.map((sample) => sample.metrics);

      assert.ok(
        samples.every((sample) => sample.result.meta.styleIntent.harmonicStatic > 0.5),
        `${preset} should remain harmonic-static across all seeds`
      );
      assert.ok(
        metrics.every((sample) => sample.chordCount <= 3),
        `${preset} should use a limited chord vocabulary`
      );
      assert.ok(
        average(metrics.map((sample) => sample.staticRepeatRate)) >= 0.75,
        `${preset} should repeat chords across most adjacent measures`
      );
      assert.ok(
        metrics.some((sample) => sample.chordCount > 1),
        `${preset} should produce occasional harmonic movement across the seed cohort`
      );
    }
  });

  it("keeps non-harmonic-static progressions varied across seeds", () => {
    for (const preset of MOVING_HARMONY_PRESETS) {
      const samples = generatePresetMetrics(preset);
      const metrics = samples.map((sample) => sample.metrics);
      const signatures = new Set(metrics.map((sample) => sample.signature));

      assert.ok(
        samples.every((sample) => sample.result.meta.styleIntent.harmonicStatic <= 0.5),
        `${preset} should remain non-harmonic-static across all seeds`
      );
      assert.ok(
        metrics.every((sample) => sample.chordCount >= 3),
        `${preset} should use at least three chords per seed`
      );
      assert.ok(
        average(metrics.map((sample) => sample.staticRepeatRate)) <= 0.25,
        `${preset} should move between chords more often than harmonic-static presets`
      );
      assert.ok(
        signatures.size > 1,
        `${preset} should not produce the same normalized progression for every seed`
      );
    }
  });
});
