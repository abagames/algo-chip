/**
 * Transition generation for section boundaries
 */

import type { SectionDefinition, DrumHit, StyleIntent } from "../../types.js";
import { BEATS_PER_MEASURE, generateDrumHitsFromPattern } from "../../musicUtils.js";
import { transitionList } from "./motif-loader.js";
import { preferTagPresence, hasAllTags, pickWithAvoid, preferUnused } from "./utilities.js";

export function maybeGenerateTransition(
  section: SectionDefinition,
  measureStartBeat: number,
  isLastSection: boolean,
  rng: () => number,
  lastTransitionId: string | undefined,
  used: Set<string>,
  styleIntent: StyleIntent,
  globalMeasureIndex: number,
  totalMeasures: number
): { motifId: string; hits: DrumHit[] } | undefined {
  if (!transitionList.length) {
    return undefined;
  }

  const requiredTags = ["transition", "section_end"];
  if (isLastSection) {
    requiredTags.push("loop_out");
  }

  let candidates = transitionList.filter((motif) => motif.length_beats <= BEATS_PER_MEASURE);
  if (!candidates.length) {
    candidates = transitionList;
  }

  const progress = totalMeasures > 1 ? globalMeasureIndex / Math.max(1, totalMeasures - 1) : 0;
  const priorityTags: string[] = [];
  if (styleIntent.gradualBuild) {
    if (progress < 0.4) {
      priorityTags.push("build");
    } else if (progress < 0.8) {
      priorityTags.push("drum_fill");
    } else {
      priorityTags.push("loop_out");
    }
  }
  if (styleIntent.breakInsertion && progress >= 0.5) {
    priorityTags.push("noise_fx");
  }
  if (styleIntent.percussiveLayering) {
    priorityTags.push("drum_fill");
  }

  if (priorityTags.length) {
    candidates = preferTagPresence(candidates, priorityTags, 0.2);
  }

  if (requiredTags.length) {
    const filtered = candidates.filter((motif) => hasAllTags(motif, requiredTags));
    if (filtered.length) {
      candidates = filtered;
    }
  }

  if (!candidates.length) {
    return undefined;
  }

  const pool = preferUnused(candidates, used);
  const motif = pickWithAvoid(pool, rng, lastTransitionId);
  if (!motif) {
    return undefined;
  }

  const offset =
    motif.length_beats >= BEATS_PER_MEASURE
      ? measureStartBeat
      : measureStartBeat + Math.max(0, BEATS_PER_MEASURE - motif.length_beats);
  const hits = generateDrumHitsFromPattern(motif.pattern, offset, section.id);
  return { motifId: motif.id, hits };
}
