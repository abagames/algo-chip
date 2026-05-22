import { runPipeline } from "../packages/core/src/pipeline.js";
import type { Channel, CompositionOptions, Event } from "../packages/core/src/types.js";

interface Scenario {
  name: string;
  options: CompositionOptions;
}

interface AssertThresholds {
  maxFallbackRate: number;
  minMelodyKinds: number;
  minArrangementVariety: number;
  minKeyVarietyPerScenario: number;
  minTransitionKindsPerRun: number;
  minSectionPatternVarietyPerScenario: number;
  minMelodyIdSpreadPerScenario: number;
}

interface AssertViolation {
  rule: string;
  detail: string;
}

interface SweepSummary {
  name: string;
  seed: number;
  bpm: number;
  key: string;
  mood: string;
  tempo: string;
  voiceArrangement: string;
  sectionPattern: string;
  eventCount: number;
  noteOnCount: number;
  notesPerMeasure: number;
  noiseHitsPerMeasure: number;
  midiRange: string;
  motifKinds: Record<string, number>;
  motifIds: { melody: string[]; rhythm: string[] };
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

function parseNumericArg(argv: string[], name: string, defaultValue: number): number {
  const arg = argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return defaultValue;
  const parsed = Number.parseFloat(arg.slice(`--${name}=`.length));
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseThresholds(argv: string[]): AssertThresholds {
  return {
    maxFallbackRate: parseNumericArg(argv, "max-fallback-rate", 0.40),
    minMelodyKinds: parseNumericArg(argv, "min-melody-kinds", 2),
    minArrangementVariety: parseNumericArg(argv, "min-arrangement-variety", 3),
    minKeyVarietyPerScenario: parseNumericArg(argv, "min-key-variety", 2),
    minTransitionKindsPerRun: parseNumericArg(argv, "min-transition-kinds", 2),
    minSectionPatternVarietyPerScenario: parseNumericArg(argv, "min-section-variety", 2),
    minMelodyIdSpreadPerScenario: parseNumericArg(argv, "min-melody-id-spread", 8)
  };
}

function assertSweep(summaries: SweepSummary[], thresholds: AssertThresholds): AssertViolation[] {
  const violations: AssertViolation[] = [];

  for (const s of summaries) {
    const fallbackRate = s.candidatePoolChecks > 0 ? s.fallbackCount / s.candidatePoolChecks : 0;
    if (fallbackRate > thresholds.maxFallbackRate) {
      violations.push({
        rule: "maxFallbackRate",
        detail: `${s.name} seed=${s.seed}: fallbackRate=${fallbackRate.toFixed(3)} > ${thresholds.maxFallbackRate}`
      });
    }

    if (s.motifKinds.melody < thresholds.minMelodyKinds) {
      violations.push({
        rule: "minMelodyKinds",
        detail: `${s.name} seed=${s.seed}: melodyKinds=${s.motifKinds.melody} < ${thresholds.minMelodyKinds}`
      });
    }

    if (s.loopIssues > 0) {
      violations.push({
        rule: "maxLoopIssues",
        detail: `${s.name} seed=${s.seed}: loopIssues=${s.loopIssues}`
      });
    }

    if (s.noiseTailIssues > 0) {
      violations.push({
        rule: "maxNoiseTailIssues",
        detail: `${s.name} seed=${s.seed}: noiseTailIssues=${s.noiseTailIssues}`
      });
    }
  }

  const uniqueArrangements = new Set(summaries.map((s) => s.voiceArrangement)).size;
  if (uniqueArrangements < thresholds.minArrangementVariety) {
    violations.push({
      rule: "minArrangementVariety",
      detail: `uniqueArrangements=${uniqueArrangements} < ${thresholds.minArrangementVariety} across ${summaries.length} runs`
    });
  }

  // Key variety: each scenario must use ≥N distinct keys across its seeds
  const byScenario = new Map<string, SweepSummary[]>();
  for (const s of summaries) {
    const group = byScenario.get(s.name) ?? [];
    group.push(s);
    byScenario.set(s.name, group);
  }
  for (const [scenarioName, group] of byScenario) {
    const uniqueKeys = new Set(group.map((s) => s.key)).size;
    if (uniqueKeys < thresholds.minKeyVarietyPerScenario) {
      violations.push({
        rule: "minKeyVarietyPerScenario",
        detail: `${scenarioName}: uniqueKeys=${uniqueKeys} < ${thresholds.minKeyVarietyPerScenario} across ${group.length} seeds`
      });
    }
  }

  // Transition variety: each run must use ≥N distinct transition motif IDs
  for (const s of summaries) {
    if (s.motifKinds.transitions < thresholds.minTransitionKindsPerRun) {
      violations.push({
        rule: "minTransitionKindsPerRun",
        detail: `${s.name} seed=${s.seed}: transitionKinds=${s.motifKinds.transitions} < ${thresholds.minTransitionKindsPerRun}`
      });
    }
  }

  // Section pattern variety: each scenario must show ≥N distinct structures across seeds
  for (const [scenarioName, group] of byScenario) {
    const uniquePatterns = new Set(group.map((s) => s.sectionPattern)).size;
    if (uniquePatterns < thresholds.minSectionPatternVarietyPerScenario) {
      violations.push({
        rule: "minSectionPatternVarietyPerScenario",
        detail: `${scenarioName}: sectionPatterns=${uniquePatterns} < ${thresholds.minSectionPatternVarietyPerScenario} across ${group.length} seeds`
      });
    }
  }

  // Melody ID spread: each scenario must use ≥N distinct melody motif IDs across seeds
  for (const [scenarioName, group] of byScenario) {
    const uniqueMelodyIds = new Set(group.flatMap((s) => s.motifIds.melody)).size;
    if (uniqueMelodyIds < thresholds.minMelodyIdSpreadPerScenario) {
      violations.push({
        rule: "minMelodyIdSpreadPerScenario",
        detail: `${scenarioName}: uniqueMelodyIds=${uniqueMelodyIds} < ${thresholds.minMelodyIdSpreadPerScenario} across ${group.length} seeds`
      });
    }
  }

  return violations;
}

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
    sectionPattern: result.meta.sectionPattern,
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
    motifIds: {
      melody: Object.keys(result.diagnostics.motifUsage.melody),
      rhythm: Object.keys(result.diagnostics.motifUsage.rhythm)
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
    "| Scenario | Seed | BPM | Key | Mood | Tempo | Arrangement | Section Pattern | Notes/Measure | Noise/Measure | MIDI | Motif Kinds | Fallbacks | Candidate Checks | Loop Issues | Noise Tail Issues |",
    "| --- | ---: | ---: | --- | --- | --- | --- | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: |"
  ];

  for (const summary of summaries) {
    const motifKinds = Object.entries(summary.motifKinds)
      .map(([key, value]) => `${key}:${value}`)
      .join(" ");
    lines.push(
      `| ${summary.name} | ${summary.seed} | ${summary.bpm} | ${summary.key} | ${summary.mood} | ${summary.tempo} | ${summary.voiceArrangement} | ${summary.sectionPattern} | ${summary.notesPerMeasure} | ${summary.noiseHitsPerMeasure} | ${summary.midiRange} | ${motifKinds} | ${summary.fallbackCount} | ${summary.candidatePoolChecks} | ${summary.loopIssues} | ${summary.noiseTailIssues} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

const argv = process.argv.slice(2);
const seeds = parseSeeds(argv);
const assertMode = argv.includes("--assert");
const summaries = SCENARIOS.flatMap((scenario) => seeds.map((seed) => summarizeScenario(scenario, seed)));

if (argv.includes("--json")) {
  console.log(JSON.stringify(summaries, null, 2));
} else {
  console.log(renderMarkdown(summaries));
}

if (assertMode) {
  const thresholds = parseThresholds(argv);
  const violations = assertSweep(summaries, thresholds);
  if (violations.length === 0) {
    console.error(`\nAssert: all checks passed (${summaries.length} runs).`);
  } else {
    console.error(`\nAssert: ${violations.length} violation(s) found:`);
    for (const v of violations) {
      console.error(`  [${v.rule}] ${v.detail}`);
    }
    process.exit(1);
  }
}
