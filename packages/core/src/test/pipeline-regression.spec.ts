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
          events: "c20d8905e274f15e507b7961a02c2908342c2170d9023079a4d2df4a13ac3567",
          diagnostics: "fd81119a449486e5a271098a667c3f1fffca2bad5fd24e2bf4c3204e669b9bbd"
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
          events: "aa3268ce2d68fb15a76ed2300ffa577b02e35ae6a1ddfc3880902c1e12e0c141",
          diagnostics: "ad832b43987a1e2a3b0625146b770a8ec74975136412877f0fc2c235de863fa7"
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
