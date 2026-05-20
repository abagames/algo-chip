import { runPipeline } from "../packages/core/src/pipeline.js";
import type { Channel, CompositionOptions, Event } from "../packages/core/src/types.js";

interface Scenario {
  name: string;
  options: CompositionOptions;
}

interface SweepSummary {
  name: string;
  seed: number;
  bpm: number;
  key: string;
  mood: string;
  tempo: string;
  voiceArrangement: string;
  eventCount: number;
  noteOnCount: number;
  notesPerMeasure: number;
  noiseHitsPerMeasure: number;
  midiRange: string;
  motifKinds: Record<string, number>;
  fallbackCount: number;
  candidatePoolChecks: number;
  loopIssues: number;
  noiseTailIssues: number;
}

const DEFAULT_SEEDS = [101, 202, 303, 404, 505];

const SCENARIOS: Scenario[] = [
  {
    name: "percussive-energetic",
    options: {
      lengthInMeasures: 16,
      twoAxisStyle: { percussiveMelodic: -0.65, calmEnergetic: 0.65 }
    }
  },
  {
    name: "melodic-calm",
    options: {
      lengthInMeasures: 16,
      twoAxisStyle: { percussiveMelodic: 0.65, calmEnergetic: -0.65 }
    }
  },
  {
    name: "neutral",
    options: {
      lengthInMeasures: 16,
      twoAxisStyle: { percussiveMelodic: 0, calmEnergetic: 0 }
    }
  },
  {
    name: "breakbeat-leaning",
    options: {
      lengthInMeasures: 16,
      twoAxisStyle: { percussiveMelodic: -0.8, calmEnergetic: 0.8 }
    }
  },
  {
    name: "lofi-leaning",
    options: {
      lengthInMeasures: 16,
      twoAxisStyle: { percussiveMelodic: 0.45, calmEnergetic: -0.75 }
    }
  }
];

function parseSeeds(argv: string[]): number[] {
  const seedArg = argv.find((arg) => arg.startsWith("--seeds="));
  if (!seedArg) {
    return DEFAULT_SEEDS;
  }
  const seeds = seedArg
    .slice("--seeds=".length)
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value));
  return seeds.length ? seeds : DEFAULT_SEEDS;
}

function isNoteOn(event: Event): event is Event<"noteOn"> {
  return event.command === "noteOn";
}

function countRecordKeys(record: Record<string, number>): number {
  return Object.keys(record).length;
}

function summarizeScenario(scenario: Scenario, seed: number): SweepSummary {
  const options: CompositionOptions = {
    ...scenario.options,
    seed
  };
  const result = runPipeline(options);
  const noteOns = result.events.filter(isNoteOn);
  const channelCounts = noteOns.reduce<Record<Channel, number>>(
    (acc, event) => {
      acc[event.channel] += 1;
      return acc;
    },
    { square1: 0, square2: 0, triangle: 0, noise: 0 }
  );
  const midis = noteOns
    .map((event) => event.data.midi)
    .filter((midi): midi is number => typeof midi === "number");
  const minMidi = midis.length ? Math.min(...midis) : undefined;
  const maxMidi = midis.length ? Math.max(...midis) : undefined;
  const length = result.meta.lengthInMeasures;

  return {
    name: scenario.name,
    seed,
    bpm: result.meta.bpm,
    key: result.meta.key,
    mood: result.meta.mood,
    tempo: result.meta.tempo,
    voiceArrangement: result.meta.voiceArrangement.id,
    eventCount: result.events.length,
    noteOnCount: noteOns.length,
    notesPerMeasure: Number((noteOns.length / length).toFixed(2)),
    noiseHitsPerMeasure: Number((channelCounts.noise / length).toFixed(2)),
    midiRange: minMidi === undefined || maxMidi === undefined ? "n/a" : `${minMidi}-${maxMidi}`,
    motifKinds: {
      rhythm: countRecordKeys(result.diagnostics.motifUsage.rhythm),
      melody: countRecordKeys(result.diagnostics.motifUsage.melody),
      melodyRhythm: countRecordKeys(result.diagnostics.motifUsage.melodyRhythm),
      bass: countRecordKeys(result.diagnostics.motifUsage.bass),
      drums: countRecordKeys(result.diagnostics.motifUsage.drums),
      transitions: countRecordKeys(result.diagnostics.motifUsage.transitions)
    },
    fallbackCount: result.diagnostics.motifSelection.fallbackCount,
    candidatePoolChecks: result.diagnostics.motifSelection.candidatePools.length,
    loopIssues:
      result.diagnostics.loopIntegrity.unmatchedNoteOnCount +
      result.diagnostics.loopIntegrity.unmatchedNoteOffCount +
      result.diagnostics.loopIntegrity.lateReleaseCount,
    noiseTailIssues: result.diagnostics.loopIntegrity.noiseLateReleaseCount
  };
}

function renderMarkdown(summaries: SweepSummary[]): string {
  const lines = [
    "# Seed Sweep Report",
    "",
    "| Scenario | Seed | BPM | Key | Mood | Tempo | Arrangement | Notes/Measure | Noise/Measure | MIDI | Motif Kinds | Fallbacks | Candidate Checks | Loop Issues | Noise Tail Issues |",
    "| --- | ---: | ---: | --- | --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |"
  ];

  for (const summary of summaries) {
    const motifKinds = Object.entries(summary.motifKinds)
      .map(([key, value]) => `${key}:${value}`)
      .join(" ");
    lines.push(
      `| ${summary.name} | ${summary.seed} | ${summary.bpm} | ${summary.key} | ${summary.mood} | ${summary.tempo} | ${summary.voiceArrangement} | ${summary.notesPerMeasure} | ${summary.noiseHitsPerMeasure} | ${summary.midiRange} | ${motifKinds} | ${summary.fallbackCount} | ${summary.candidatePoolChecks} | ${summary.loopIssues} | ${summary.noiseTailIssues} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

const seeds = parseSeeds(process.argv.slice(2));
const summaries = SCENARIOS.flatMap((scenario) => seeds.map((seed) => summarizeScenario(scenario, seed)));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(summaries, null, 2));
} else {
  console.log(renderMarkdown(summaries));
}
