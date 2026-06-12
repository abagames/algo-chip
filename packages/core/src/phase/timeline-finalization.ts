import {
  Diagnostics,
  Event,
  StructurePlanResult,
  EventRealizationDiagnostics,
  SectionMotifPlan,
  TimedEvent,
  MotifSelectionDiagnostics
} from "../types.js";
import { analyzeTheory } from "./theory-audit.js";

interface TimelineFinalizationResult {
  events: Event[];
  diagnostics: Diagnostics;
}

export function finalizeTimeline(
  phase1: StructurePlanResult,
  techniquesEvents: TimedEvent[],
  eventDiagnostics: EventRealizationDiagnostics,
  motifUsage: Diagnostics["motifUsage"],
  sectionMotifPlan: SectionMotifPlan[],
  motifSelection: MotifSelectionDiagnostics
): TimelineFinalizationResult {
  const beatToSecond = 60 / phase1.bpm;
  const totalBeats = phase1.sections.reduce(
    (max, section) => Math.max(max, (section.startMeasure + section.measures) * 4),
    0
  );
  const totalDuration = totalBeats * beatToSecond;
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
    loopIntegrity: computeLoopIntegrity(events, totalDuration),
    theoryAudit: analyzeTheory(phase1, events, totalBeats),
    motifUsage,
    sectionMotifPlan,
    motifSelection
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

function computeLoopIntegrity(events: Event[], totalDuration: number): Diagnostics["loopIntegrity"] {
  const windows = [0.1, 0.25, 0.5].map((seconds) => ({
    seconds,
    headEvents: events.filter((event) => event.time < seconds).length,
    tailEvents: events.filter((event) => totalDuration - event.time < seconds).length,
    noiseTailEvents: events.filter(
      (event) => event.channel === "noise" && totalDuration - event.time < seconds
    ).length
  }));

  const activeByChannel = new Map<Event["channel"], Array<Event<"noteOn">>>();
  let unmatchedNoteOffCount = 0;

  for (const event of sortedForNotePairing(events)) {
    if (event.command === "noteOn") {
      const active = activeByChannel.get(event.channel) ?? [];
      active.push(event as Event<"noteOn">);
      activeByChannel.set(event.channel, active);
    } else if (event.command === "noteOff") {
      const active = activeByChannel.get(event.channel) ?? [];
      if (active.length > 0) {
        active.shift();
      } else {
        unmatchedNoteOffCount += 1;
      }
    }
  }

  const openNotes = Array.from(activeByChannel.values())
    .flat()
    .map((event) => ({
      channel: event.channel,
      time: roundSeconds(event.time),
      midi: event.data.midi
    }));

  let lateReleaseCount = 0;
  let noiseLateReleaseCount = 0;
  let maxReleaseOverhangSeconds = 0;

  for (const event of events) {
    const releaseSeconds = typeof event.data.releaseSeconds === "number" ? event.data.releaseSeconds : 0;
    if (releaseSeconds <= 0) continue;
    const overhang = event.time + releaseSeconds - totalDuration;
    if (overhang > 1e-6) {
      lateReleaseCount += 1;
      if (event.channel === "noise") {
        noiseLateReleaseCount += 1;
      }
      maxReleaseOverhangSeconds = Math.max(maxReleaseOverhangSeconds, overhang);
    }
  }

  return {
    windows,
    unmatchedNoteOnCount: openNotes.length,
    unmatchedNoteOffCount,
    openNotes: openNotes.slice(0, 12),
    lateReleaseCount,
    noiseLateReleaseCount,
    maxReleaseOverhangSeconds: roundSeconds(maxReleaseOverhangSeconds)
  };
}

function sortedForNotePairing(events: Event[]): Event[] {
  return [...events].sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    if (a.command === b.command) return 0;
    return a.command === "noteOff" ? -1 : 1;
  });
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(6));
}
