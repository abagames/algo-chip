import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { runPipeline } from "../pipeline.js";
import type { PipelineResult, CompositionOptions } from "../types.js";
import { buildTwoAxisOptions } from "./test-utils.js";

interface RegressionSummary {
  meta: {
    bpm: number;
    key: string;
    voiceArrangementId: string;
    loopBeats: number;
    loopSeconds: number;
  };
  hashes: {
    events: string;
    diagnostics: string;
  };
}

function hashJson(label: string, value: unknown): string {
  const json = JSON.stringify(value);
  return createHash("sha256").update(`${label}:${json}`).digest("hex");
}

function summarize(result: PipelineResult): RegressionSummary {
  return {
    meta: {
      bpm: result.meta.bpm,
      key: result.meta.key,
      voiceArrangementId: result.meta.voiceArrangement.id,
      loopBeats: result.meta.loopInfo.totalBeats,
      loopSeconds: Number(result.meta.loopInfo.totalDuration.toFixed(6))
    },
    hashes: {
      events: hashJson("events", result.events),
      diagnostics: hashJson("diagnostics", result.diagnostics)
    }
  };
}

function runScenario(options: CompositionOptions): RegressionSummary {
  const result = runPipeline(options);
  return summarize(result);
}

async function run() {
  const scenarios: Array<{ name: string; options: CompositionOptions; expected: RegressionSummary }> = [
    {
      name: "percussive-energetic-8",
      options: buildTwoAxisOptions({
        lengthInMeasures: 8,
        seed: 12345,
        twoAxisStyle: {
          percussiveMelodic: -0.45,
          calmEnergetic: 0.25
        }
      }),
      expected: {
        meta: {
          bpm: 126,
          key: "E_Minor",
          voiceArrangementId: "swapped",
          loopBeats: 32,
          loopSeconds: 15.238095
        },
        hashes: {
          events: "1401e7af61560154d67b71cfbd494382455013978ce4026d34c8201164f116c0",
          diagnostics: "99bbdae9430211d006d79634efab4e28995e83f7508dd2a994f7474b784ae96b"
        }
      }
    },
    {
      name: "progressive-extended-16",
      options: buildTwoAxisOptions({
        lengthInMeasures: 16,
        seed: 9876,
        twoAxisStyle: {
          percussiveMelodic: -0.2,
          calmEnergetic: 0.6
        }
      }),
      expected: {
        meta: {
          bpm: 165,
          key: "G_Major",
          voiceArrangementId: "bassLed",
          loopBeats: 64,
          loopSeconds: 23.272727
        },
        hashes: {
          events: "ec422f55c2770216eeb3043d8dc6d89b0ab5a8484584ee8e51f7c8abedbf673b",
          diagnostics: "c07fe4fb4c5cda8667469992665f354e3301dab4bf4e5bc1769e7d7792f75fcd"
        }
      }
    }
  ];

  for (const scenario of scenarios) {
    const summary = runScenario(scenario.options);
    assert.deepEqual(
      summary,
      scenario.expected,
      `Pipeline regression mismatch for scenario ${scenario.name}.\nActual: ${JSON.stringify(summary, null, 2)}`
    );
  }

  console.log("Pipeline regression scenarios validated");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
