import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runPipeline } from "../pipeline.js";
import { BEATS_PER_MEASURE } from "../musicUtils.js";
import { buildTwoAxisOptions } from "./test-utils.js";

interface MelodyRhythmPatternEntry {
  value: number;
  rest?: boolean;
}

interface MelodyRhythmMotif {
  id: string;
  length: number;
  pattern: MelodyRhythmPatternEntry[];
}

const motifsPath = join(process.cwd(), "packages", "core", "motifs", "melody-rhythm.json");
const melodyRhythmMotifs: MelodyRhythmMotif[] = JSON.parse(readFileSync(motifsPath, "utf-8"));
const melodyRhythmMap = new Map<string, MelodyRhythmMotif>(
  melodyRhythmMotifs.map((motif) => [motif.id, motif])
);

function convertToBeats(value: number): number {
  switch (value) {
    case 2:
      return 2;
    case 4:
      return 1;
    case 8:
      return 0.5;
    case 16:
      return 0.25;
    default:
      return 0.25;
  }
}

function motifPassesHumanization(motif: MelodyRhythmMotif): boolean {
  const restRequirement = motif.length >= 4 ? 0.25 : 0;
  let accumulatedRest = 0;
  let hasLongNote = false;
  let continuousShortBeats = 0;

  for (const step of motif.pattern) {
    const duration = convertToBeats(step.value);
    if (step.rest) {
      accumulatedRest += duration;
      continuousShortBeats = 0;
      continue;
    }

    if (duration >= 0.5) {
      hasLongNote = true;
      continuousShortBeats = 0;
      continue;
    }

    continuousShortBeats += duration;
    if (continuousShortBeats > 1 + 1e-6) {
      return false;
    }
  }

  if (accumulatedRest >= restRequirement) {
    return true;
  }

  return hasLongNote;
}

describe("Gradual build dynamics", () => {
  it("should ramp melody intensity and drum density for progressiveHouse presets", () => {
    const options = buildTwoAxisOptions({
      lengthInMeasures: 32,
      seed: 812345,
      preset: "progressive-house"
    });

    const result = runPipeline(options);
    const bpm = result.meta.bpm;
    const splitBeat = (result.meta.lengthInMeasures / 2) * BEATS_PER_MEASURE;
    const toBeats = (time: number) => time * (bpm / 60);

    const square1Notes = result.events.filter(
      (event) => event.channel === "square1" && event.command === "noteOn"
    );
    const earlyVelocities: number[] = [];
    const lateVelocities: number[] = [];
    for (const event of square1Notes) {
      const beat = toBeats(event.time);
      const velocity = typeof event.data?.velocity === "number" ? event.data.velocity : 0;
      if (velocity === 0) continue;
      if (beat < splitBeat) {
        earlyVelocities.push(velocity);
      } else {
        lateVelocities.push(velocity);
      }
    }

    assert.ok(earlyVelocities.length > 0, "Should collect early melody velocities");
    assert.ok(lateVelocities.length > 0, "Should collect late melody velocities");

    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const earlyAverage = average(earlyVelocities);
    const lateAverage = average(lateVelocities);

    assert.ok(
      lateAverage >= earlyAverage + 4,
      `Late melody velocity (${lateAverage.toFixed(2)}) should exceed early average (${earlyAverage.toFixed(2)}) by at least 4`
    );

    const noiseHits = result.events.filter(
      (event) => event.channel === "noise" && event.command === "noteOn"
    );
    const earlyNoise = noiseHits.filter((event) => toBeats(event.time) < splitBeat).length;
    const lateNoise = noiseHits.filter((event) => toBeats(event.time) >= splitBeat).length;

    const minimumLateNoise = Math.floor(earlyNoise * 0.5);
    assert.ok(
      lateNoise >= minimumLateNoise,
      `Drum density should remain at least 50% of early phase (early=${earlyNoise}, late=${lateNoise})`
    );
  });

  it("should only use melody rhythm motifs that satisfy humanization heuristics", () => {
    const options = buildTwoAxisOptions({
      lengthInMeasures: 32,
      seed: 712345,
      preset: "progressive-house"
    });

    const result = runPipeline(options);
    const motifUsage = result.diagnostics.motifUsage.melodyRhythm;
    const motifIds = Object.keys(motifUsage);

    assert.ok(motifIds.length > 0, "Pipeline should report melody rhythm usage");

    motifIds.forEach((motifId) => {
      const motif = melodyRhythmMap.get(motifId);
      assert.ok(motif, `Motif ${motifId} must exist in melody-rhythm library`);
      assert.ok(
        motifPassesHumanization(motif!),
        `Melody rhythm motif ${motifId} should satisfy humanization constraints`
      );
    });
  });
});
