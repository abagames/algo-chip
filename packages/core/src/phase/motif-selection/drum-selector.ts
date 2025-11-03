/**
 * Drum Pattern Selection and Transition Merging
 *
 * This module handles selection of drum patterns (beats and fills) and merging of
 * transition effects. Drums are critical for establishing groove and energy in
 * chiptune music, but the noise channel's monophonic limitation requires careful
 * collision avoidance.
 *
 * ## Beat vs Fill Patterns
 *
 * Drum patterns are categorized into two types:
 *
 * - **Beat patterns**: Steady rhythmic foundation (e.g., "K---S---K---S---" = 4-on-the-floor)
 *   - Used for most measures to establish consistent groove
 *   - Tagged with style descriptors: "four_on_floor", "breakbeat", "loop_safe", etc.
 *
 * - **Fill patterns**: Transitional/climactic variations (e.g., rapid snare rolls, tom fills)
 *   - Used at section boundaries or every N measures for variety
 *   - Tagged with function: "drum_fill", "build", "transition", "break"
 *
 * The selection algorithm alternates between beats (majority) and fills (periodic) to
 * create the "verse with occasional fills" structure common in game music.
 *
 * ## Fill Insertion Logic
 *
 * Fills occur:
 * - **Forced**: When forceFill=true (section boundaries, explicit transitions)
 * - **Cyclic**: Every 2 measures (breakInsertion) or 4 measures (default)
 * - **Conditional**: Only if measure index + 1 is divisible by fillEvery
 *
 * This creates predictable fill placement (e.g., every 4th measure) while allowing
 * manual override at important structural points.
 *
 * ## Gradual Build Drum Sparsity
 *
 * When styleIntent.gradualBuild is true, drums gradually fade in over the track:
 * - **Early phase** (0-35%): 75% chance of silence (minimal drums)
 * - **Mid phase** (35-70%): 35% chance of silence (partial drums)
 * - **Late phase** (70-100%): Full drums (no silence probability)
 *
 * This creates the "progressive house" buildup where drums enter gradually rather
 * than starting at full intensity. Percentages are adaptive to track length (shorter
 * tracks have faster progression).
 *
 * ## Arrangement-Specific Early Sparsity
 *
 * Some arrangements (minimal, lofiPadLead) delay drum entry for N measures to let
 * other voices establish the musical context:
 * - minimal: earlySparseMeasures=2 (first 2 measures have 70% chance of silence)
 * - lofiPadLead: earlySparseMeasures=2 (pads establish atmosphere first)
 * - bassLed: earlySparseMeasures=1 (bass establishes groove first)
 *
 * This prevents drums from dominating the intro before the arrangement's primary
 * voice is established.
 *
 * ## Style-Driven Tag Filtering
 *
 * Different combinations of StyleIntent flags create distinct drum aesthetics:
 *
 * - **Breakbeat focus** (percussiveLayering + syncopationBias + breakInsertion):
 *   Prefers "breakbeat", "grid16", "percussive_layer" tags
 *   Avoids "four_on_floor" (too straight for breakbeat aesthetic)
 *
 * - **Lo-fi groove** (atmosPad + loopCentric + harmonicStatic):
 *   Prefers "lofi", "rest_heavy", "swing_hint" tags
 *   Creates laid-back, humanized drum feel
 *
 * - **Retro pulse** (loopCentric + textureFocus + percussiveLayering):
 *   Prefers "loop_safe", "grid16", "texture_loop" tags
 *   Creates crisp, repetitive synth-wave drums
 *
 * ## Noise Channel Collision Avoidance
 *
 * The mergeTransitionHits function prevents overlapping noise events:
 * - Noise instruments (S=snare, H=hihat, O=open-hat) are monophonic
 * - Transition hits at the same beat timestamp as existing hits are skipped
 * - Uses 1e-6 epsilon for floating-point beat comparison
 *
 * This prevents "ghost notes" where transition fills would conflict with the
 * main beat pattern, causing one or both to be dropped during playback.
 */

import type { DrumPattern, StyleIntent, VoiceArrangementPreset, DrumHit } from "../../types.js";
import { BEATS_PER_MEASURE } from "../../musicUtils.js";
import { drumList, ARRANGEMENT_DRUM_RULES } from "./motif-loader.js";
import { preferTagPresence, pickWithAvoid, preferUnused } from "./utilities.js";

/**
 * Selects a drum pattern (beat or fill) based on measure position, style, and arrangement.
 *
 * This is the main entry point for drum selection, balancing multiple concerns:
 * - Beat/fill alternation for groove variety
 * - Gradual build sparsity for progressive styles
 * - Arrangement-specific early silence for voice balance
 * - Style-driven tag filtering for aesthetic consistency
 * - Variety through unused preference and last-pattern avoidance
 *
 * @param measureIndex - Current measure index (0-based)
 * @param totalMeasures - Total composition length in measures
 * @param requiredTags - Hard-constraint tags (e.g., ["breakbeat"] to force breakbeat patterns)
 * @param rng - Seeded random number generator
 * @param lastPatternId - Previous pattern ID to avoid immediate repetition
 * @param used - Set of pattern IDs already used in this composition
 * @param forceFill - If true, forces fill selection (for section boundaries)
 * @param styleIntent - Style intent flags
 * @param arrangementId - Voice arrangement preset ID
 * @returns Selected drum pattern, or undefined if silence should occur
 */
export function selectDrumPattern(
  measureIndex: number,
  totalMeasures: number,
  requiredTags: string[],
  rng: () => number,
  lastPatternId: string | undefined,
  used: Set<string>,
  forceFill: boolean,
  styleIntent: StyleIntent,
  arrangementId: VoiceArrangementPreset
): DrumPattern | undefined {
  const arrangementRule = ARRANGEMENT_DRUM_RULES[arrangementId];
  if (
    !forceFill &&
    arrangementRule?.earlySparseMeasures &&
    measureIndex < arrangementRule.earlySparseMeasures
  ) {
    if (rng() < 0.3) {
      return undefined;
    }
  }

  // gradualBuild: progressive layer control
  if (styleIntent.gradualBuild && totalMeasures >= 8) {
    const progress = measureIndex / Math.max(1, totalMeasures - 1);
    const earlyThreshold = Math.min(0.35, 6 / Math.max(1, totalMeasures));
    const midThreshold = Math.min(0.7, 14 / Math.max(1, totalMeasures));
    if (progress < earlyThreshold) {
      if (rng() < 0.75) {
        return undefined;
      }
    } else if (progress < midThreshold) {
      if (rng() < 0.35) {
        return undefined;
      }
    }
  }

  const fillEvery = styleIntent.breakInsertion ? 2 : 4;
  const cycleFill = fillEvery > 0 && totalMeasures >= fillEvery && (measureIndex + 1) % fillEvery === 0;
  const isFill = forceFill || cycleFill;
  let candidates = drumList.filter((pattern) =>
    isFill ? pattern.type === "fill" : pattern.type === "beat"
  );
  const fitsMeasure = candidates.filter((pattern) => pattern.length_beats <= BEATS_PER_MEASURE);
  if (fitsMeasure.length) {
    candidates = fitsMeasure;
  }
  if (requiredTags.length) {
    const filtered = candidates.filter((pattern) => {
      const tags = (pattern as any).tags as string[] | undefined;
      return tags ? requiredTags.every((tag) => tags.includes(tag)) : false;
    });
    if (filtered.length) {
      candidates = filtered;
    }
  }
  if (!candidates.length) {
    candidates = drumList.filter((pattern) => (isFill ? pattern.type === "fill" : pattern.type === "beat"));
  }
  if (!candidates.length) {
    candidates = drumList;
  }
  const prefersBreakbeatFocus =
    styleIntent.percussiveLayering &&
    styleIntent.syncopationBias &&
    styleIntent.breakInsertion &&
    !styleIntent.loopCentric;
  const prefersLofiGroove = styleIntent.atmosPad && styleIntent.loopCentric && styleIntent.harmonicStatic;
  const prefersRetroPulse =
    styleIntent.loopCentric && styleIntent.textureFocus && styleIntent.percussiveLayering;

  if (!isFill) {
    if (styleIntent.loopCentric) {
      candidates = preferTagPresence(candidates, ["loop_safe"]);
    }
    if (styleIntent.syncopationBias) {
      const syncTags = prefersBreakbeatFocus
        ? ["breakbeat", "syncopation", "grid16"]
        : ["syncopation"];
      candidates = preferTagPresence(candidates, syncTags);
    }
    if (styleIntent.textureFocus) {
      candidates = preferTagPresence(candidates, ["texture_loop", "straight", "grid16"]);
    }
    if (styleIntent.percussiveLayering) {
      const percussiveTags = prefersBreakbeatFocus
        ? ["breakbeat", "percussive_layer", "grid16"]
        : ["percussive_layer", "four_on_floor"];
      candidates = preferTagPresence(candidates, percussiveTags);
    }
    if (prefersLofiGroove) {
      candidates = preferTagPresence(candidates, ["lofi", "rest_heavy", "swing_hint"], 0.3);
    }
    if (prefersRetroPulse) {
      candidates = preferTagPresence(candidates, ["loop_safe", "grid16", "texture_loop"], 0.25);
    }
    if (arrangementRule?.preferBeatTags?.length) {
      candidates = preferTagPresence(candidates, arrangementRule.preferBeatTags, 0.25);
    }
  } else {
    if (arrangementRule?.preferFillTags?.length) {
      candidates = preferTagPresence(candidates, arrangementRule.preferFillTags, 0.25);
    }
  }
  if (prefersBreakbeatFocus) {
    candidates = preferTagPresence(candidates, ["breakbeat", "grid16"], 0.2);
  }
  if (arrangementRule?.avoidTags?.length) {
    const filtered = candidates.filter((pattern) => {
      const tags = (pattern as any).tags as string[] | undefined;
      if (!tags) return true;
      return !arrangementRule.avoidTags!.some((tag) => tags.includes(tag));
    });
    if (filtered.length) {
      candidates = filtered;
    }
  }
  const pool = preferUnused(candidates, used);
  return pickWithAvoid(pool, rng, lastPatternId);
}

/**
 * Merges transition drum hits into existing pattern, avoiding noise channel conflicts.
 *
 * Transition fills (pickups, build effects, section boundary fills) need to be added
 * to the main drum pattern without creating overlapping noise events. Since the noise
 * channel is monophonic, simultaneous hits would cause one to be dropped or create
 * audio glitches.
 *
 * ## Collision Detection Strategy
 *
 * - **Non-noise instruments** (K=kick, T=tom, N=low-noise): Always merged
 *   (These use different noise periods/modes and can theoretically overlap, though
 *   Phase 3's single-voice guard will handle conflicts if they occur)
 *
 * - **Noise instruments** (S=snare, H=hihat, O=open-hat): Collision-checked
 *   If a transition hit lands at the same beat (within 1e-6 epsilon) as an existing
 *   noise hit, the transition hit is skipped to preserve the main pattern's integrity
 *
 * ## Design Rationale
 *
 * Skipping conflicting transition hits (rather than replacing main pattern hits) ensures:
 * - Main beat pattern maintains its groove (more important than transition fill)
 * - Transition fills act as "optional decorations" rather than disruptions
 * - Silent failures (skipped hits) are better than audio glitches or timing errors
 *
 * ## Beat Adjustment
 *
 * Transition hits are time-adjusted by adding targetBeat to their relative startBeat.
 * This allows transition motifs to be authored with beats relative to their insertion
 * point (e.g., a pickup starting at beat -0.5 becomes beat 3.5 when targetBeat=4.0).
 *
 * @param existing - Main drum pattern hits for the measure
 * @param transition - Transition fill hits (with relative timing)
 * @param targetBeat - Absolute beat time where transition should be inserted
 * @returns Merged hit array with conflicts resolved
 */
export function mergeTransitionHits(
  existing: DrumHit[],
  transition: DrumHit[],
  targetBeat: number
): DrumHit[] {
  const result = [...existing];
  for (const hit of transition) {
    const adjustedBeat = targetBeat + hit.startBeat;
    const isNoise = hit.instrument === "S" || hit.instrument === "H" || hit.instrument === "O";
    if (isNoise) {
      const hasConflict = existing.some((ex) => {
        const exIsNoise = ex.instrument === "S" || ex.instrument === "H" || ex.instrument === "O";
        if (!exIsNoise) return false;
        const epsilon = 1e-6;
        return Math.abs(ex.startBeat - adjustedBeat) < epsilon;
      });
      if (hasConflict) {
        continue;
      }
    }
    result.push({
      ...hit,
      startBeat: adjustedBeat
    });
  }
  return result;
}
