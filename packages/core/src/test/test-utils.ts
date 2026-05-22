import type { CompositionOptions, Event, StyleIntent, StyleOverrides, StylePreset, TwoAxisStyle } from "../types.js";
import { presetToTwoAxis } from "../style/preset-to-axis.js";

type IntentKey = keyof StyleIntent;
type PresetSlug = "minimal-techno" | "progressive-house" | "retro-loopwave" | "breakbeat-jungle" | "lofi-chillhop";

const PRESET_SLUG_TO_ENUM: Record<PresetSlug, StylePreset> = {
  "minimal-techno": "minimalTechno",
  "progressive-house": "progressiveHouse",
  "retro-loopwave": "retroLoopwave",
  "breakbeat-jungle": "breakbeatJungle",
  "lofi-chillhop": "lofiChillhop"
};

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
    overrides,
    preset: params.preset ? PRESET_SLUG_TO_ENUM[params.preset] : undefined
  };
}

export function isNoteOnEvent(event: Event): event is Event<"noteOn"> {
  return event.command === "noteOn";
}

export function isSetParamEvent(event: Event): event is Event<"setParam"> {
  return event.command === "setParam";
}
