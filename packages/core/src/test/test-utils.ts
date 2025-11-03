import type { CompositionOptions, StyleIntent, StyleOverrides, TwoAxisStyle } from "../types.js";
import { presetToTwoAxis } from "../style/preset-to-axis.js";

type IntentKey = keyof StyleIntent;
type PresetSlug = "minimal-techno" | "progressive-house" | "retro-loopwave" | "breakbeat-jungle" | "lofi-chillhop";

export function buildTwoAxisOptions(params: {
  lengthInMeasures: number;
  seed?: number;
  twoAxisStyle?: TwoAxisStyle;
  preset?: PresetSlug;
  overrides?: Partial<Pick<StyleIntent, IntentKey>>;
}): CompositionOptions {
  let axis = params.twoAxisStyle;

  if (!axis && params.preset) {
    axis = presetToTwoAxis(params.preset);
  }

  if (!axis) {
    axis = { percussiveMelodic: 0, calmEnergetic: 0 };
  }

  const overrides: StyleOverrides | undefined = params.overrides
    ? { intent: { ...params.overrides } }
    : undefined;

  return {
    lengthInMeasures: params.lengthInMeasures,
    seed: params.seed,
    twoAxisStyle: axis,
    overrides
  };
}
