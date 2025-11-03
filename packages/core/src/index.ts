export { generateComposition, runPipeline } from "./pipeline.js";
export { SEGenerator } from "./se/seGenerator.js";
export { AlgoChipSynthesizer } from "./playback/synthesizer.js";
export type { SynthPlayOptions } from "./playback/synthesizer.js";
export type {
  CompositionOptions,
  PipelineResult,
  Event,
  Channel,
  Command
} from "./types.js";
export type {
  SEGenerationOptions,
  SEGenerationResult,
  SEType
} from "./se/seTypes.js";
