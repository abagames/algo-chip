import {
  Diagnostics,
  Event,
  Phase1Result,
  Phase3Diagnostics,
  SectionMotifPlan,
  TimedEvent
} from "../types.js";

interface TimelineFinalizationResult {
  events: Event[];
  diagnostics: Diagnostics;
}

export function finalizeTimeline(
  phase1: Phase1Result,
  techniquesEvents: TimedEvent[],
  eventDiagnostics: Phase3Diagnostics,
  motifUsage: Diagnostics["motifUsage"],
  sectionMotifPlan: SectionMotifPlan[]
): TimelineFinalizationResult {
  const beatToSecond = 60 / phase1.bpm;
  const events: Event[] = techniquesEvents.map((event) => ({
    time: event.beatTime * beatToSecond,
    channel: event.channel,
    command: event.command,
    data: event.data
  }));
  events.sort((a, b) => a.time - b.time);

  const diagnostics: Diagnostics = {
    voiceAllocation: eventDiagnostics.voiceAllocation.map((entry) => ({
      time: entry.beatTime * beatToSecond,
      channel: entry.channel,
      activeCount: entry.activeCount
    })),
    loopWindow: computeLoopWindow(events),
    motifUsage,
    sectionMotifPlan
  };

  return { events, diagnostics };
}

function computeLoopWindow(events: Event[]) {
  if (!events.length) {
    return { head: [], tail: [] };
  }
  const wrapWindow = 0.1; // seconds
  const lastTime = events[events.length - 1].time;
  const tail = events.filter((event) => lastTime - event.time < wrapWindow);
  const head = events.filter((event) => event.time < wrapWindow);
  return { head, tail };
}
