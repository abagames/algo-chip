/**
 * Rhythm motif selection
 */

import type { PipelineCompositionOptions, StyleIntent, RhythmMotif } from "../../types.js";
import {
  rhythmList,
  rhythmById,
  RHYTHM_PROPERTY_TAGS
} from "./motif-loader.js";
import {
  preferTagPresence,
  pickWithAvoid,
  hasAllTags,
  isRhythmMotifConsistent,
  preferUnused
} from "./utilities.js";

export function selectRhythmMotif(
  options: PipelineCompositionOptions,
  styleIntent: StyleIntent,
  functionTag: string,
  last: RhythmMotif | undefined,
  requiredTags: string[],
  rng: () => number,
  used: Set<string>
): RhythmMotif {
  const safeRhythms = rhythmList.filter(isRhythmMotifConsistent);
  const propertyTags = RHYTHM_PROPERTY_TAGS[options.mood] ?? [];
  const filterByTags = (source: RhythmMotif[], tags: string[]) =>
    source.filter((motif) => tags.some((tag) => motif.tags.includes(tag)));

  const lofiTags = ["lofi", "swing_hint", "rest_heavy"];
  const effectivePropertyTags = styleIntent.lofiFeel ? [...propertyTags, ...lofiTags] : propertyTags;
  const requiredPool = safeRhythms.filter((motif) => hasAllTags(motif, requiredTags));
  let candidates = safeRhythms.filter((motif) => motif.tags.includes(functionTag));
  const propertyFiltered = filterByTags(candidates, effectivePropertyTags);
  if (propertyFiltered.length) {
    candidates = propertyFiltered;
  } else {
    const fallback = filterByTags(safeRhythms, effectivePropertyTags);
    if (fallback.length) {
      candidates = fallback;
    }
  }

  if (styleIntent.loopCentric > 0.5) {
    candidates = preferTagPresence(candidates, ["loop_safe", "texture_loop"]);
  }

  if (styleIntent.textureFocus > 0.5) {
    candidates = preferTagPresence(candidates, ["texture_loop", "straight", "simple", "grid16"]);
  }

  if (styleIntent.percussiveLayering > 0.5) {
    candidates = preferTagPresence(candidates, ["grid16", "percussive_layer"]);
  }

  if (styleIntent.syncopationBias > 0.5) {
    candidates = preferTagPresence(candidates, ["syncopation"]);
  }

  if (styleIntent.lofiFeel > 0.5) {
    candidates = preferTagPresence(candidates, ["lofi", "swing_hint", "rest_heavy"], 0.25);
  }

  if (!candidates.length) {
    candidates = safeRhythms;
  }

  if (requiredTags.length) {
    const requiredFiltered = candidates.filter((motif) => hasAllTags(motif, requiredTags));
    if (requiredFiltered.length) {
      candidates = requiredFiltered;
    } else if (requiredPool.length) {
      candidates = requiredPool;
    }
  }

  if (last?.variations?.length) {
    const variationCandidates = last.variations
      .map((id) => rhythmById.get(id))
      .filter((motif): motif is RhythmMotif => Boolean(motif));
    if (variationCandidates.length && rng() < 0.5) {
      const variationPool = preferUnused(variationCandidates, used);
      return pickWithAvoid(variationPool, rng, last.id);
    }
  }
  const pool = preferUnused(candidates, used);
  return pickWithAvoid(pool, rng, last?.id);
}
