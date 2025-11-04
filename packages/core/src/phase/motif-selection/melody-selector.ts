/**
 * Melody fragment selection
 */

import type { PipelineCompositionOptions, StyleIntent, MelodyFragment } from "../../types.js";
import { melodyList, MELODY_MOOD_TAGS } from "./motif-loader.js";
import {
  preferTagPresence,
  biasByTagPresence,
  pickWithAvoid,
  hasAllTags,
  preferUnused
} from "./utilities.js";

export function selectMelodyFragment(
  options: PipelineCompositionOptions,
  styleIntent: StyleIntent,
  requiredTags: string[],
  rng: () => number,
  lastFragment: MelodyFragment | undefined,
  used: Set<string>
): MelodyFragment {
  const moodTags = MELODY_MOOD_TAGS[options.mood] ?? [];
  let candidates = melodyList.filter((fragment) =>
    moodTags.some((tag) => fragment.tags.includes(tag))
  );
  if (requiredTags.length) {
    const requiredFiltered = candidates.filter((fragment) => hasAllTags(fragment, requiredTags));
    if (requiredFiltered.length) {
      candidates = requiredFiltered;
    } else {
      const globalFallback = melodyList.filter((fragment) => hasAllTags(fragment, requiredTags));
      if (globalFallback.length) {
        candidates = globalFallback;
      }
    }
  }
  if (!candidates.length) {
    candidates = melodyList;
  }

  if (styleIntent.textureFocus) {
    candidates = preferTagPresence(candidates, [
      "texture_loop",
      "ostinato",
      "loop_safe",
      "short",
      "static"
    ]);
  }

  if (styleIntent.harmonicStatic) {
    candidates = biasByTagPresence(candidates, ["scalar", "stepwise", "static"], rng, 0.6);
  }

  if (styleIntent.gradualBuild) {
    candidates = preferTagPresence(candidates, ["ascending"]);
  }

  const pool = preferUnused(candidates, used);
  return pickWithAvoid(pool, rng, lastFragment?.id);
}
