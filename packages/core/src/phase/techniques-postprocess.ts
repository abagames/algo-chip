import { EventRealizationResult, StyleIntent, TimedEvent, TechniqueLibrary } from "../types.js";
import { BEATS_PER_MEASURE } from "../musicUtils.js";
import techniqueLibraryJson from "../../motifs/techniques.json" with { type: "json" };

const techniqueLibrary = techniqueLibraryJson as TechniqueLibrary;

interface TechniquesPostprocessResult {
  events: TimedEvent[];
}

const GRADUAL_BUILD_GAIN_RAMP: Record<TimedEvent["channel"], { base: number; peak: number }> = {
  square1: { base: 0.68, peak: 0.9 },
  square2: { base: 0.66, peak: 0.88 },
  triangle: { base: 0.48, peak: 0.68 },
  noise: { base: 0.74, peak: 0.82 }
};

export function applyTechniques(phase3: EventRealizationResult, styleIntent: StyleIntent): TechniquesPostprocessResult {
  const additionalEvents: TimedEvent[] = [];
  const totalTrackBeats = phase3.events.reduce((max, event) => Math.max(max, event.beatTime), 0);
  const totalMeasures = Math.max(1, Math.ceil(totalTrackBeats / BEATS_PER_MEASURE));

  for (const preset of techniqueLibrary.initialParams ?? []) {
    additionalEvents.push({
      beatTime: 0,
      channel: preset.channel,
      command: "setParam",
      data: { param: preset.param, value: preset.value }
    });
  }

  const dutySweeps = [...(techniqueLibrary.dutySweeps ?? [])];
  const gainProfiles = [...(techniqueLibrary.gainProfiles ?? [])];

  if (styleIntent.filterMotion) {
    dutySweeps.push({
      id: "STYLE_FILTER_SWELL",
      param: "duty",
      channels: ["square1", "square2"],
      minDurationBeats: 2,
      steps: [0.2, 0.6, 0.4, 0.75]
    });
  }

  if (styleIntent.percussiveLayering) {
    gainProfiles.push({
      id: "STYLE_NOISE_PUNCH",
      channel: "noise",
      param: "gain",
      measureBoundaryValue: 0.85,
      defaultValue: 0.78
    });
  }

  if (styleIntent.percussiveLayering && !styleIntent.breakInsertion) {
    gainProfiles.push(
      {
        id: "STYLE_MINIMAL_SIDECHAIN_SQ1",
        channel: "square1",
        param: "gain",
        measureBoundaryValue: 0.74,
        defaultValue: 0.62
      },
      {
        id: "STYLE_MINIMAL_SIDECHAIN_SQ2",
        channel: "square2",
        param: "gain",
        measureBoundaryValue: 0.72,
        defaultValue: 0.6
      }
    );
  }

  if (styleIntent.atmosPad) {
    gainProfiles.push({
      id: "STYLE_TRIANGLE_PAD",
      channel: "triangle",
      param: "gain",
      measureBoundaryValue: 0.82,
      defaultValue: 0.72
    });
  }

  if (styleIntent.gradualBuild && styleIntent.breakInsertion) {
    dutySweeps.push({
      id: "STYLE_PROGRESSIVE_DUTY_SWELL",
      param: "duty",
      channels: ["square2"],
      minDurationBeats: 1,
      steps: [0.32, 0.48, 0.58, 0.68]
    });
  }

  if (styleIntent.gradualBuild && styleIntent.breakInsertion) {
    gainProfiles.push({
      id: "STYLE_PROGRESSIVE_TRI_RISE",
      channel: "triangle",
      param: "gain",
      measureBoundaryValue: 0.9,
      defaultValue: 0.76
    });
  }

  const breakMeasures = new Set<number>();
  for (const event of phase3.events) {
    if (event.command !== "noteOn") continue;
    const offEvent = findMatchingNoteOff(phase3.events, event);
    const duration = offEvent ? offEvent.beatTime - event.beatTime : 0;

    for (const sweep of dutySweeps) {
      if (!sweep.channels.includes(event.channel)) continue;
      if (!offEvent) continue;
      if (duration < sweep.minDurationBeats) continue;
      if (sweep.requireMeasureBoundary) {
        const boundary =
          isMeasureBoundary(event.beatTime) || (offEvent ? isMeasureBoundary(offEvent.beatTime) : false);
        if (!boundary) continue;
      }
      const stepSpacing = duration / (sweep.steps.length + 1);
      sweep.steps.forEach((value, index) => {
        additionalEvents.push({
          beatTime: event.beatTime + stepSpacing * (index + 1),
          channel: event.channel,
          command: "setParam",
          data: { param: sweep.param, value }
        });
      });
    }

    for (const profile of gainProfiles) {
      if (event.channel !== profile.channel) continue;
      const value = isMeasureBoundary(event.beatTime) ? profile.measureBoundaryValue : profile.defaultValue;
      additionalEvents.push({
        beatTime: event.beatTime,
        channel: event.channel,
        command: "setParam",
        data: { param: profile.param, value }
      });
    }

    if (styleIntent.breakInsertion && event.channel === "noise") {
      const measureIndex = Math.floor(event.beatTime / BEATS_PER_MEASURE);
      if (!breakMeasures.has(measureIndex) && measureIndex > 0 && (measureIndex + 1) % 8 === 0) {
        breakMeasures.add(measureIndex);
        const startBeat = measureIndex * BEATS_PER_MEASURE;
        additionalEvents.push({
          beatTime: startBeat - 0.25 >= 0 ? startBeat - 0.25 : startBeat,
          channel: "noise",
          command: "setParam",
          data: { param: "gain", value: 0.45 }
        });
        additionalEvents.push({
          beatTime: startBeat + 1,
          channel: "noise",
          command: "setParam",
          data: { param: "gain", value: 0.78 }
        });
        for (const squareChannel of ["square1", "square2"] as const) {
          additionalEvents.push({
            beatTime: startBeat - 0.25 >= 0 ? startBeat - 0.25 : startBeat,
            channel: squareChannel,
            command: "setParam",
            data: { param: "gain", value: 0.55 }
          });
          additionalEvents.push({
            beatTime: startBeat + 1,
            channel: squareChannel,
            command: "setParam",
            data: { param: "gain", value: 0.82 }
          });
        }
      }
    }
  }

  if (styleIntent.gradualBuild && totalMeasures > 1) {
    const measureStep = Math.max(1, Math.floor(totalMeasures / 8));
    for (const [channel, ramp] of Object.entries(GRADUAL_BUILD_GAIN_RAMP)) {
      const typedChannel = channel as TimedEvent["channel"];
      for (let measure = 0; measure < totalMeasures; measure += measureStep) {
        const progress = totalMeasures > 1 ? measure / (totalMeasures - 1) : 1;
        const shaped = Math.pow(progress, styleIntent.loopCentric ? 0.8 : 1.0);
        const value = ramp.base + (ramp.peak - ramp.base) * shaped;
        additionalEvents.push({
          beatTime: measure * BEATS_PER_MEASURE,
          channel: typedChannel,
          command: "setParam",
          data: { param: "gain", value: Number(value.toFixed(3)) }
        });
      }
    }
  }

  // Loop tail fade removed for seamless loop playback (game BGM requirement)
  // Previously faded out the last beat, which broke infinite looping

  const merged = [...phase3.events, ...additionalEvents];
  merged.sort((a, b) => {
    if (a.beatTime === b.beatTime) {
      if (a.command === b.command) return 0;
      if (a.command === "setParam") return -1;
      if (b.command === "setParam") return 1;
      return 0;
    }
    return a.beatTime - b.beatTime;
  });

  return { events: merged };
}

function findMatchingNoteOff(events: TimedEvent[], onEvent: TimedEvent): TimedEvent | undefined {
  if (onEvent.command !== "noteOn") return undefined;

  // For each noteOn, find the next noteOff on the same channel
  // Note: noteOff events don't carry midi information, so we match by channel and timing
  let matchingOff: TimedEvent | undefined;
  let minTimeDiff = Infinity;

  for (const event of events) {
    if (
      event.channel === onEvent.channel &&
      event.command === "noteOff" &&
      event.beatTime > onEvent.beatTime
    ) {
      const timeDiff = event.beatTime - onEvent.beatTime;
      if (timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff;
        matchingOff = event;
      }
    }
  }

  return matchingOff;
}

function isMeasureBoundary(beatTime: number): boolean {
  const epsilon = 1e-6;
  return Math.abs((beatTime % BEATS_PER_MEASURE)) < epsilon;
}
