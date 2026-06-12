import {
  Channel,
  Event,
  StructurePlanResult,
  TheoryAuditDiagnostics,
  TheoryIssueCause,
  TheoryIssueDiagnostic,
  TheoryNoteDiagnostic,
  TheoryNoteRole,
  TheoryToneClass,
  VoiceRole
} from "../types.js";
import { BEATS_PER_MEASURE, chordRootToMidi, getChordIntervals, resolveChordAtBeat } from "../musicUtils.js";

const EPSILON = 1e-6;
const STRONG_BEAT_EPSILON = 1 / 32;
const SCALE_TENSION_INTERVALS = new Set([2, 5, 9, 10, 11]);

interface ActiveNote {
  event: Event<"noteOn">;
  startBeat: number;
}

interface AuditThresholds {
  sustainedCollisionBeats: number;
  longNonScaleBeats: number;
  boundaryWindowBeats: number;
}

export function analyzeTheory(
  phase1: StructurePlanResult,
  events: Event[],
  totalBeats: number
): TheoryAuditDiagnostics {
  const secondsPerBeat = 60 / phase1.bpm;
  const thresholds = resolveThresholds(phase1);
  const rolesByChannel = new Map<Channel, VoiceRole>(
    phase1.voiceArrangement.voices.map((voice) => [voice.channel, voice.role])
  );
  const notes = reconstructNotes(phase1, events, totalBeats, secondsPerBeat, rolesByChannel);
  const warnings: TheoryIssueDiagnostic[] = [];
  const errors: TheoryIssueDiagnostic[] = [];
  const toneCounts = emptyToneCounts();
  const roleCounts: TheoryAuditDiagnostics["roleCounts"] = {};
  const bassFunctions = { root: 0, fifth: 0, approach: 0, other: 0 };

  for (const note of notes) {
    toneCounts[note.toneClass] += 1;
    roleCounts[note.role] = (roleCounts[note.role] ?? 0) + 1;
    auditNote(note, phase1, thresholds, warnings, errors, bassFunctions);
  }

  const collisionCounts = auditSimultaneousNotes(notes, thresholds, warnings, errors);
  collisionCounts.denseUnisonRepeats = auditMelodyMotion(notes, phase1, warnings);
  const boundaryCounts = auditBoundaries(notes, events, phase1, totalBeats, secondsPerBeat, thresholds, warnings, errors);

  return {
    notes,
    toneCounts,
    roleCounts,
    bassFunctions,
    collisionCounts,
    boundaryCounts,
    warnings: sortIssues(warnings),
    errors: sortIssues(errors)
  };
}

function reconstructNotes(
  phase1: StructurePlanResult,
  events: Event[],
  totalBeats: number,
  secondsPerBeat: number,
  rolesByChannel: Map<Channel, VoiceRole>
): TheoryNoteDiagnostic[] {
  const active = new Map<Channel, ActiveNote[]>();
  const notes: TheoryNoteDiagnostic[] = [];
  for (const event of sortedForPairing(events)) {
    const beat = event.time / secondsPerBeat;
    if (event.command === "noteOn") {
      if (typeof event.data.midi !== "number" || event.channel === "noise") continue;
      const queue = active.get(event.channel) ?? [];
      queue.push({ event: event as Event<"noteOn">, startBeat: beat });
      active.set(event.channel, queue);
      continue;
    }
    if (event.command !== "noteOff") continue;
    const queue = active.get(event.channel) ?? [];
    const entry = queue.shift();
    if (!entry) continue;
    const endBeat = Math.min(totalBeats, Math.max(entry.startBeat, beat));
    if (isKickBody(entry.event, endBeat - entry.startBeat, secondsPerBeat)) continue;
    notes.push(classifyNote(phase1, entry.event, entry.startBeat, endBeat, rolesByChannel));
  }
  return notes.sort((a, b) => a.startBeat - b.startBeat || a.channel.localeCompare(b.channel));
}

function classifyNote(
  phase1: StructurePlanResult,
  event: Event<"noteOn">,
  startBeat: number,
  endBeat: number,
  rolesByChannel: Map<Channel, VoiceRole>
): TheoryNoteDiagnostic {
  const midi = event.data.midi as number;
  const chord = resolveChordAtBeat(phase1, startBeat);
  const chordRoot = mod12(chordRootToMidi(chord, 0));
  const chordInterval = mod12(midi - chordRoot);
  const chordIntervals = new Set(getChordIntervals(chord).map((interval) => mod12(interval)));
  const keyRoot = mod12(chordRootToMidi(phase1.key, 0));
  const keyIntervals = new Set(phase1.scaleDegrees.map((interval) => mod12(interval)));
  const keyInterval = mod12(midi - keyRoot);
  let toneClass: TheoryToneClass;
  if (chordIntervals.has(chordInterval)) toneClass = "chord_tone";
  else if (keyIntervals.has(keyInterval) && SCALE_TENSION_INTERVALS.has(chordInterval)) toneClass = "tension";
  else if (keyIntervals.has(keyInterval)) toneClass = "scale_tone";
  else toneClass = "non_scale_tone";
  const measureIndex = Math.floor((startBeat + EPSILON) / BEATS_PER_MEASURE);
  const beatInMeasure = mod(startBeat, BEATS_PER_MEASURE);
  const section = sectionAtMeasure(phase1, measureIndex);
  return {
    startBeat: roundBeat(startBeat),
    endBeat: roundBeat(endBeat),
    durationBeats: roundBeat(endBeat - startBeat),
    measureIndex,
    beatInMeasure: roundBeat(beatInMeasure),
    sectionId: section?.id ?? "unknown",
    channel: event.channel,
    role: rolesByChannel.get(event.channel) ?? "unknown",
    chord,
    midi,
    toneClass,
    chordInterval,
    strongBeat: near(beatInMeasure, 0, STRONG_BEAT_EPSILON) || near(beatInMeasure, 2, STRONG_BEAT_EPSILON)
  };
}

function auditNote(
  note: TheoryNoteDiagnostic,
  phase1: StructurePlanResult,
  thresholds: AuditThresholds,
  warnings: TheoryIssueDiagnostic[],
  errors: TheoryIssueDiagnostic[],
  bassFunctions: TheoryAuditDiagnostics["bassFunctions"]
): void {
  if ((note.role === "bass" || note.role === "bassAlt") && near(note.beatInMeasure, 0, STRONG_BEAT_EPSILON)) {
    if (note.chordInterval === 0) bassFunctions.root += 1;
    else if (note.chordInterval === 7) bassFunctions.fifth += 1;
    else if (isApproachToNextRoot(note, phase1)) bassFunctions.approach += 1;
    else {
      bassFunctions.other += 1;
      if (note.toneClass === "non_scale_tone") {
        errors.push(issue(note, "bass_downbeat_conflict", "bass_generation", "Bass downbeat is outside both the current chord and key."));
      } else if (note.toneClass !== "chord_tone") {
        warnings.push(issue(note, "bass_downbeat_tension", "bass_generation", "Bass downbeat is a scale tone outside the current chord."));
      }
    }
  }
  if (note.toneClass === "non_scale_tone" && note.strongBeat && note.durationBeats >= thresholds.longNonScaleBeats) {
    warnings.push(issue(note, "long_strong_non_scale_tone", causeForRole(note.role), "Long non-scale tone begins on a strong beat."));
  }
}

function auditSimultaneousNotes(
  notes: TheoryNoteDiagnostic[],
  thresholds: AuditThresholds,
  warnings: TheoryIssueDiagnostic[],
  errors: TheoryIssueDiagnostic[]
): TheoryAuditDiagnostics["collisionCounts"] {
  const counts = { minorSecondOrMajorSeventh: 0, sustainedMinorSecond: 0, voiceCrossing: 0, denseUnisonRepeats: 0 };
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const left = notes[i];
      const right = notes[j];
      if (right.startBeat >= left.endBeat - EPSILON) break;
      if (left.channel === right.channel || !isMelodicRole(left.role) || !isMelodicRole(right.role)) continue;
      const overlap = Math.min(left.endBeat, right.endBeat) - Math.max(left.startBeat, right.startBeat);
      if (overlap <= EPSILON) continue;
      const interval = Math.abs(left.midi - right.midi);
      const intervalClass = mod12(interval);
      if (intervalClass === 1 || intervalClass === 11) {
        counts.minorSecondOrMajorSeventh += 1;
        const primary = left.startBeat >= right.startBeat ? left : right;
        if (overlap >= thresholds.sustainedCollisionBeats && intervalClass === 1) {
          counts.sustainedMinorSecond += 1;
          errors.push(pairIssue(primary, left, right, "sustained_minor_second", "accompaniment_generation", "Minor-second collision is sustained across independent voices."));
        } else {
          warnings.push(pairIssue(primary, left, right, "brief_second_or_seventh", "accompaniment_generation", "Brief second or seventh occurs between simultaneous voices."));
        }
      }
      const melody = melodyMember(left, right);
      const accompaniment = accompanimentMember(left, right);
      if (melody && accompaniment && accompaniment.midi > melody.midi + 12) {
        counts.voiceCrossing += 1;
        warnings.push(pairIssue(accompaniment, left, right, "voice_crossing", "accompaniment_generation", "Accompaniment crosses more than an octave above the melody."));
      }
    }
  }
  return counts;
}

function auditMelodyMotion(
  notes: TheoryNoteDiagnostic[],
  phase1: StructurePlanResult,
  warnings: TheoryIssueDiagnostic[]
): number {
  let denseUnisonRepeats = 0;
  const keyRoot = mod12(chordRootToMidi(phase1.key, 0));
  const leadingTone = mod12(keyRoot + 11);
  const groups = new Map<string, TheoryNoteDiagnostic[]>();
  for (const note of notes) {
    if (!isMelodyRole(note.role)) continue;
    const key = `${note.channel}\t${note.role}`;
    const group = groups.get(key) ?? [];
    group.push(note);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => a.startBeat - b.startBeat);
    let repeated = 1;
    for (let i = 0; i < group.length; i++) {
      const current = group[i];
      const next = group[i + 1];
      if (mod12(current.midi) === leadingTone && current.strongBeat && current.durationBeats >= 0.5) {
        const resolves = next && next.startBeat - current.endBeat <= 1 + EPSILON && mod12(next.midi) === keyRoot;
        if (!resolves) {
          warnings.push(issue(current, "unresolved_leading_tone", "motif", "Strong leading tone does not resolve to the tonic within one beat."));
        }
      }
      if (next && next.midi === current.midi && next.startBeat - current.startBeat <= 0.5 + EPSILON) {
        repeated += 1;
        if (repeated === 4) {
          denseUnisonRepeats += 1;
          warnings.push(issue(next, "dense_unison_repeat", "motif", "The same melody pitch repeats four times within a dense onset sequence."));
        }
      } else {
        repeated = 1;
      }
    }
  }
  return denseUnisonRepeats;
}

function auditBoundaries(
  notes: TheoryNoteDiagnostic[],
  events: Event[],
  phase1: StructurePlanResult,
  totalBeats: number,
  secondsPerBeat: number,
  thresholds: AuditThresholds,
  warnings: TheoryIssueDiagnostic[],
  errors: TheoryIssueDiagnostic[]
): TheoryAuditDiagnostics["boundaryCounts"] {
  let sectionWarnings = 0;
  let loopWarnings = 0;
  let loopErrors = 0;
  const boundaries = phase1.sections.slice(1).map((section) => section.startMeasure * BEATS_PER_MEASURE);
  for (const boundary of boundaries) {
    const previous = latestMelodyEndingBefore(notes, boundary);
    if (previous && boundary - previous.endBeat <= thresholds.boundaryWindowBeats && previous.toneClass === "non_scale_tone") {
      sectionWarnings += 1;
      warnings.push(issue(previous, "section_boundary_non_scale_tone", "motif", "Section closes on a non-scale tone."));
    }
    const pair = latestTwoMelodyNotes(notes, boundary);
    if (pair && boundary - pair[1].endBeat <= thresholds.boundaryWindowBeats) {
      const leap = Math.abs(pair[1].midi - pair[0].midi);
      if (leap > 12 && pair[1].toneClass !== "chord_tone") {
        sectionWarnings += 1;
        warnings.push(pairIssue(pair[1], pair[0], pair[1], "cadence_unresolved_leap", "motif", "Section cadence approaches an unstable tone through a leap larger than an octave."));
      }
    }
  }
  const tail = latestMelodyEndingBefore(notes, totalBeats + EPSILON);
  const head = notes.find((note) => isMelodyRole(note.role));
  if (tail && totalBeats - tail.endBeat <= thresholds.boundaryWindowBeats && tail.toneClass === "non_scale_tone") {
    loopWarnings += 1;
    warnings.push(issue(tail, "loop_tail_non_scale_tone", "motif", "Loop tail closes on a non-scale tone."));
  }
  if (tail && head && totalBeats - tail.endBeat <= thresholds.boundaryWindowBeats) {
    const wrapInterval = Math.abs(tail.midi - head.midi);
    if (wrapInterval > 19 && tail.toneClass !== "chord_tone") {
      loopErrors += 1;
      errors.push(pairIssue(tail, tail, head, "unresolved_loop_leap", "timeline_finalization", "Loop wraps from an unresolved tone through an extreme leap."));
    } else if (wrapInterval > 12) {
      loopWarnings += 1;
      warnings.push(pairIssue(tail, tail, head, "large_loop_leap", "motif", "Loop melody wraps through a leap larger than an octave."));
    }
  }
  const totalDuration = totalBeats * secondsPerBeat;
  for (const event of events) {
    if (event.command !== "noteOff") continue;
    const release = typeof event.data.releaseSeconds === "number" ? event.data.releaseSeconds : 0;
    if (release <= 0 || event.time + release <= totalDuration + EPSILON) continue;
    loopErrors += 1;
    errors.push({
      severity: "error",
      rule: "loop_release_tail",
      cause: "timeline_finalization",
      message: "Release tail extends beyond the loop boundary.",
      beat: roundBeat(event.time / secondsPerBeat),
      measureIndex: Math.floor(totalBeats / BEATS_PER_MEASURE),
      sectionId: phase1.sections.at(-1)?.id ?? "unknown",
      channels: [event.channel],
      roles: [phase1.voiceArrangement.voices.find((voice) => voice.channel === event.channel)?.role ?? "unknown"],
      midi: []
    });
  }
  return { sectionWarnings, loopWarnings, loopErrors };
}

function resolveThresholds(phase1: StructurePlanResult): AuditThresholds {
  const tense = phase1.styleIntent.breakInsertion > 0.5 || phase1.styleIntent.syncopationBias > 0.6;
  const atmospheric = phase1.styleIntent.atmosPad > 0.5 || phase1.styleIntent.lofiFeel > 0.5;
  return {
    sustainedCollisionBeats: tense ? 2 : 1,
    longNonScaleBeats: atmospheric ? 2 : 1,
    boundaryWindowBeats: atmospheric ? 1 : 0.5
  };
}

function isApproachToNextRoot(note: TheoryNoteDiagnostic, phase1: StructurePlanResult): boolean {
  const nextChord = resolveChordAtBeat(phase1, note.startBeat + BEATS_PER_MEASURE);
  const nextRoot = mod12(chordRootToMidi(nextChord, 0));
  const currentRoot = mod12(chordRootToMidi(note.chord, 0));
  if (nextRoot === currentRoot) return false;
  const distance = mod12(note.midi - nextRoot);
  return distance === 1 || distance === 11;
}

function issue(note: TheoryNoteDiagnostic, rule: string, cause: TheoryIssueCause, message: string): TheoryIssueDiagnostic {
  return {
    severity: rule === "bass_downbeat_conflict" ? "error" : "warning",
    rule,
    cause,
    message,
    beat: note.startBeat,
    measureIndex: note.measureIndex,
    sectionId: note.sectionId,
    channels: [note.channel],
    roles: [note.role],
    midi: [note.midi]
  };
}

function pairIssue(
  primary: TheoryNoteDiagnostic,
  left: TheoryNoteDiagnostic,
  right: TheoryNoteDiagnostic,
  rule: string,
  cause: TheoryIssueCause,
  message: string
): TheoryIssueDiagnostic {
  return {
    severity: rule === "sustained_minor_second" || rule === "unresolved_loop_leap" ? "error" : "warning",
    rule,
    cause,
    message,
    beat: Math.max(left.startBeat, right.startBeat),
    measureIndex: primary.measureIndex,
    sectionId: primary.sectionId,
    channels: [left.channel, right.channel],
    roles: [left.role, right.role],
    midi: [left.midi, right.midi]
  };
}

function causeForRole(role: TheoryNoteRole): TheoryIssueCause {
  if (role === "bass" || role === "bassAlt") return "bass_generation";
  if (role === "accompaniment" || role === "pad") return "accompaniment_generation";
  return "quantization";
}

function emptyToneCounts(): Record<TheoryToneClass, number> {
  return { chord_tone: 0, tension: 0, scale_tone: 0, non_scale_tone: 0 };
}

function sortedForPairing(events: Event[]): Event[] {
  return [...events].sort((a, b) => a.time - b.time || commandOrder(a) - commandOrder(b));
}

function commandOrder(event: Event): number {
  return event.command === "noteOff" ? 0 : event.command === "noteOn" ? 1 : 2;
}

function isKickBody(event: Event<"noteOn">, durationBeats: number, secondsPerBeat: number): boolean {
  return event.channel === "triangle" && event.data.midi === 43 && durationBeats * secondsPerBeat <= 0.02 && !!event.data.slide;
}

function sectionAtMeasure(phase1: StructurePlanResult, measureIndex: number) {
  return phase1.sections.find((section) => measureIndex >= section.startMeasure && measureIndex < section.startMeasure + section.measures);
}

function latestMelodyEndingBefore(notes: TheoryNoteDiagnostic[], beat: number): TheoryNoteDiagnostic | undefined {
  return notes.filter((note) => isMelodyRole(note.role) && note.endBeat <= beat + EPSILON).sort((a, b) => b.endBeat - a.endBeat)[0];
}

function latestTwoMelodyNotes(notes: TheoryNoteDiagnostic[], beat: number): [TheoryNoteDiagnostic, TheoryNoteDiagnostic] | undefined {
  const latest = notes
    .filter((note) => isMelodyRole(note.role) && note.endBeat <= beat + EPSILON)
    .sort((a, b) => b.endBeat - a.endBeat || b.startBeat - a.startBeat)
    .slice(0, 2)
    .reverse();
  return latest.length === 2 ? [latest[0], latest[1]] : undefined;
}

function melodyMember(left: TheoryNoteDiagnostic, right: TheoryNoteDiagnostic): TheoryNoteDiagnostic | undefined {
  return isMelodyRole(left.role) ? left : isMelodyRole(right.role) ? right : undefined;
}

function accompanimentMember(left: TheoryNoteDiagnostic, right: TheoryNoteDiagnostic): TheoryNoteDiagnostic | undefined {
  return isAccompanimentRole(left.role) ? left : isAccompanimentRole(right.role) ? right : undefined;
}

function isMelodyRole(role: TheoryNoteRole): boolean {
  return role === "melody" || role === "melodyAlt";
}

function isAccompanimentRole(role: TheoryNoteRole): boolean {
  return role === "accompaniment" || role === "pad";
}

function isMelodicRole(role: TheoryNoteRole): boolean {
  return role !== "drums" && role !== "unknown";
}

function sortIssues(issues: TheoryIssueDiagnostic[]): TheoryIssueDiagnostic[] {
  return issues.sort((a, b) => a.beat - b.beat || a.rule.localeCompare(b.rule) || a.channels.join().localeCompare(b.channels.join()));
}

function near(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= tolerance;
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function mod12(value: number): number {
  return mod(value, 12);
}

function roundBeat(value: number): number {
  return Number(value.toFixed(6));
}
