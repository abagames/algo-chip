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
          events: "98d4e3d76971e6fcae050b2326a9a8fd2c0066df8f98e299a0417adc101b0d50",
          diagnostics: "f36a657d153c7411561ab12f22cdabb18513be2fdb71df782bd987cc17c27149"
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
          events: "c017bf908e717182f50f069e3b6adf2fc59e481b4e6590fd501829ce6eace2ca",
          diagnostics: "42f63692be8463391b2d62afe26f435a683917f13c17522fc4a5b2c9bd6ce869"
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
