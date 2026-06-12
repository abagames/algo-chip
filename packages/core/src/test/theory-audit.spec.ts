import assert from "node:assert/strict";
import test from "node:test";
import { runPipeline } from "../pipeline.js";
import { analyzeTheory } from "../phase/theory-audit.js";
import type { Event, StructurePlanResult } from "../types.js";

test("theory audit reconstructs deterministic musical context from the final timeline", () => {
  const options = {
    lengthInMeasures: 16,
    seed: 101,
    twoAxisStyle: { percussiveMelodic: 0.65, calmEnergetic: -0.65 }
  } as const;
  const first = runPipeline(options);
  const second = runPipeline(options);
  assert.deepEqual(first.diagnostics.theoryAudit, second.diagnostics.theoryAudit);
  assert(first.diagnostics.theoryAudit.notes.length > 0);
  assert.equal(first.diagnostics.theoryAudit.errors.length, 0);
  for (const note of first.diagnostics.theoryAudit.notes) {
    assert(note.startBeat >= 0);
    assert(note.endBeat >= note.startBeat);
    assert(note.measureIndex >= 0);
    assert.notEqual(note.sectionId, "unknown");
    assert.notEqual(note.role, "unknown");
    assert(note.chord.length > 0);
  }
});

test("theory audit reports clear bass and sustained collision errors", () => {
  const structure = createStructure();
  const events: Event[] = [
    noteOn(0, "triangle", 66),
    noteOn(0, "square1", 60),
    noteOn(0, "square2", 61),
    noteOff(1.5, "square1"),
    noteOff(1.5, "square2"),
    noteOff(2, "triangle")
  ];
  const audit = analyzeTheory(structure, events, 4);
  assert(audit.errors.some((issue) => issue.rule === "bass_downbeat_conflict"));
  assert(audit.errors.some((issue) => issue.rule === "sustained_minor_second"));
  assert.equal(audit.notes[0].measureIndex, 0);
  assert.equal(audit.notes[0].sectionId, "A");
});

test("theory audit keeps unresolved motion and dense repeats as warnings", () => {
  const structure = createStructure();
  const events: Event[] = [];
  for (const start of [0, 0.5, 1, 1.5]) {
    events.push(noteOn(start, "square1", 71), noteOff(start + 0.5, "square1"));
  }
  const audit = analyzeTheory(structure, events, 4);
  assert(audit.warnings.some((issue) => issue.rule === "unresolved_leading_tone"));
  assert(audit.warnings.some((issue) => issue.rule === "dense_unison_repeat"));
  assert.equal(audit.errors.length, 0);
});

function createStructure(): StructurePlanResult {
  return {
    bpm: 60,
    key: "C_Major",
    scaleDegrees: [0, 2, 4, 5, 7, 9, 11],
    sections: [{
      id: "A",
      startMeasure: 0,
      measures: 1,
      chordProgression: ["C"],
      templateId: "A",
      occurrenceIndex: 0,
      texture: "steady"
    }],
    techniqueStrategy: { echoProbability: 0, detuneProbability: 0, fastArpeggioProbability: 0 },
    styleIntent: {
      textureFocus: 0,
      loopCentric: 0,
      gradualBuild: 0,
      harmonicStatic: 0,
      percussiveLayering: 0,
      breakInsertion: 0,
      filterMotion: 0,
      syncopationBias: 0,
      atmosPad: 0,
      lofiFeel: 0
    },
    voiceArrangement: {
      id: "standard",
      description: "test",
      voices: [
        { role: "melody", channel: "square1", priority: 1 },
        { role: "accompaniment", channel: "square2", priority: 1 },
        { role: "bass", channel: "triangle", priority: 1 }
      ]
    }
  };
}

function noteOn(time: number, channel: Event["channel"], midi: number): Event<"noteOn"> {
  return { time, channel, command: "noteOn", data: { midi, velocity: 80 } };
}

function noteOff(time: number, channel: Event["channel"]): Event<"noteOff"> {
  return { time, channel, command: "noteOff", data: {} };
}
