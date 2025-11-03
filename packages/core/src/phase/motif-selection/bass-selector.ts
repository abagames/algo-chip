/**
 * Bass pattern selection
 */

import type { BassPatternMotif, StyleIntent, TextureProfile } from "../../types.js";
import { bassPatternsByTexture } from "./motif-loader.js";
import { preferTagPresence, biasByTagPresence, pickWithAvoid, preferUnused } from "./utilities.js";

export function selectBassPattern(
  texture: TextureProfile,
  styleIntent: StyleIntent,
  rng: () => number,
  used: Set<string>,
  requiredTags: string[],
  avoidId?: string
): BassPatternMotif | undefined {
  let candidates = bassPatternsByTexture.get(texture) ?? [];
  if (!candidates.length && texture !== "steady") {
    candidates = bassPatternsByTexture.get("steady") ?? [];
  }
  if (!candidates.length) {
    return undefined;
  }
  if (styleIntent.loopCentric || styleIntent.harmonicStatic) {
    candidates = preferTagPresence(candidates, ["loop_safe"]);
  }
  if (styleIntent.syncopationBias) {
    candidates = preferTagPresence(candidates, ["syncopated"]);
  }
  if (styleIntent.textureFocus) {
    candidates = preferTagPresence(candidates, ["default"]);
  }
  if (styleIntent.percussiveLayering) {
    candidates = preferTagPresence(candidates, ["percussive_layer", "four_on_floor"]);
  }
  if (styleIntent.percussiveLayering && styleIntent.syncopationBias && styleIntent.breakInsertion) {
    candidates = preferTagPresence(candidates, ["breakbeat", "variation"], 0.2);
  }
  if (styleIntent.atmosPad && styleIntent.loopCentric) {
    candidates = preferTagPresence(candidates, ["lofi", "rest_heavy"], 0.25);
  }
  if (styleIntent.harmonicStatic) {
    candidates = biasByTagPresence(candidates, ["drone", "static"], rng, 0.65);
  }
  if (requiredTags.length) {
    const tagged = candidates.filter((motif) =>
      requiredTags.every((tag) => (motif.tags ?? []).includes(tag))
    );
    if (tagged.length) {
      candidates = tagged;
    }
  }
  if (!candidates.length) {
    return undefined;
  }
  const pool = preferUnused(candidates, used);
  return pickWithAvoid(pool, rng, avoidId);
}
