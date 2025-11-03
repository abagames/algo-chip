/**
 * Melody-Rhythm Motif Selection
 *
 * This module handles selection of melody-rhythm motifs, which are phrase-level patterns
 * that combine pitch (scale degrees) and rhythm (note durations) into unified musical gestures.
 *
 * ## Why Melody-Rhythm Motifs?
 *
 * Traditional approaches split melody (pitch sequence) and rhythm (duration sequence) into
 * separate motifs, then combine them. This causes problems:
 * - **Mismatched phrasing**: A 4-note melody × 8-note rhythm creates awkward repetition
 * - **Lost expressiveness**: Phrase-level gestures (pickup → climax → resolution) get
 *   fragmented into arbitrary pitch/rhythm combinations
 * - **No breath control**: Continuous 16th notes without rests sound robotic
 *
 * Melody-rhythm motifs solve this by storing complete musical "sentences" (1-2 measures)
 * with integrated pitch and duration information. Each motif represents a coherent phrase
 * with intentional phrasing, breath marks (rests), and climactic structure.
 *
 * ## Humanization Filter
 *
 * The humanization system prevents "machine-gun" patterns (continuous short notes) by
 * requiring motifs to have either:
 * - **Sufficient rests** (≥0.25 beats for phrases ≥4 beats long)
 * - **Long notes** (≥0.5 beats, i.e., half note or longer)
 *
 * This enforces musical "breathing space" and prevents the mechanical feel of
 * algorithmically-generated melodies.
 *
 * ## Selection Pipeline
 *
 * 1. **Length matching**: Filter to motifs with exact duration (within 1e-6 tolerance)
 * 2. **Functional tag filter**: Prefer "start", "middle", "end", or "pickup" tags
 * 3. **Mood tag filter**: Apply mood-specific tags (e.g., "legato" for sad)
 * 4. **Style intent filters**: Apply loopCentric, textureFocus, syncopationBias preferences
 * 5. **Required tags filter**: Hard constraint for tags like "cadence" or "loop_safe"
 * 6. **Humanization filter**: Remove mechanical patterns (unless it exhausts candidates)
 * 7. **Prefer unused**: Bias toward motifs not used recently in this composition
 * 8. **Avoid last**: Attempt to avoid repeating the immediately previous motif ID
 *
 * Each stage has fallback logic to prevent getting stuck with zero candidates.
 */

import type { LegacyCompositionOptions, StyleIntent, MelodyRhythmMotif } from "../../types.js";
import { melodyRhythmList, MELODY_RHYTHM_TAGS } from "./motif-loader.js";
import { convertToBeats } from "./pattern-expander.js";
import { preferTagPresence, pickWithAvoid, hasAllTags, preferUnused } from "./utilities.js";

/**
 * Checks if a melody-rhythm motif passes humanization criteria.
 *
 * Humanization prevents overly mechanical patterns by requiring natural phrasing:
 * - **Rest requirement**: For phrases ≥4 beats, requires ≥0.25 beats total rest
 * - **Long note requirement**: At least one note ≥0.5 beats (half note or longer)
 * - **Continuous short note limit**: No more than 1 beat of continuous short notes
 *   (prevents "machine-gun 16th notes")
 *
 * ## Why These Criteria?
 *
 * Human melodies naturally include:
 * - Breathing points (rests) for phrase separation
 * - Sustained notes for expressive emphasis
 * - Varied note lengths to avoid monotonous repetition
 *
 * These criteria were tuned empirically: patterns failing them sound robotic in practice,
 * while patterns passing them sound musically natural even with purely algorithmic selection.
 *
 * @param motif - Melody-rhythm motif to evaluate
 * @param totalBeats - Expected phrase length in beats
 * @returns true if motif passes humanization criteria
 */
function motifPassesHumanization(motif: MelodyRhythmMotif, totalBeats: number): boolean {
  const pattern = motif.pattern ?? [];
  if (!pattern.length) {
    return false;
  }

  const restRequirement = totalBeats >= 4 ? 0.25 : 0;
  let accumulatedRest = 0;
  let hasLongNote = false;
  let continuousShortBeats = 0;

  for (const step of pattern) {
    const duration = convertToBeats(step.value);
    if (step.rest) {
      accumulatedRest += duration;
      continuousShortBeats = 0;
      continue;
    }

    if (duration >= 0.5) {
      hasLongNote = true;
      continuousShortBeats = 0;
      continue;
    }

    continuousShortBeats += duration;
    if (continuousShortBeats > 1 + 1e-6) {
      return false;
    }
  }

  if (accumulatedRest >= restRequirement) {
    return true;
  }

  return hasLongNote;
}

/**
 * Filters melody-rhythm motifs by humanization criteria with fallback.
 *
 * Applies motifPassesHumanization to each candidate, but returns the original pool
 * if filtering would exhaust all candidates. This prevents getting stuck with zero
 * motifs when the library has limited humanized patterns for a specific phrase length.
 *
 * @param candidates - Motif pool to filter
 * @param totalBeats - Expected phrase length
 * @returns Filtered motifs (or original pool if filter exhausts candidates)
 */
function filterHumanizedMelodyRhythms(
  candidates: MelodyRhythmMotif[],
  totalBeats: number
): MelodyRhythmMotif[] {
  const filtered = candidates.filter((motif) => motifPassesHumanization(motif, totalBeats));
  return filtered.length ? filtered : candidates;
}

/**
 * Selects a melody-rhythm motif based on mood, style, function, and required tags.
 *
 * This is the main entry point for melody-rhythm selection, used by the Phase 2 melody
 * generator to pick phrase-level patterns. The multi-stage pipeline balances:
 * - **Musical coherence**: Functional tags ensure proper phrase structure (start/middle/end)
 * - **Style consistency**: Mood and intent tags match the composition's aesthetic
 * - **Variety**: Unused preference and last-ID avoidance prevent excessive repetition
 * - **Robustness**: Fallback at each stage prevents candidate exhaustion
 *
 * ## Parameters
 *
 * @param options - Legacy composition options (contains mood, tempo, seed)
 * @param styleIntent - Style intent flags (loopCentric, textureFocus, syncopationBias, etc.)
 * @param functionTag - Functional role tag ("start", "middle", "end", "pickup")
 * @param totalBeats - Required phrase length in beats (must match motif.length exactly)
 * @param requiredTags - Hard-constraint tags (e.g., ["cadence", "loop_safe"])
 * @param rng - Seeded random number generator for deterministic selection
 * @param lastId - Previous motif ID to avoid immediate repetition (undefined if first phrase)
 * @param used - Set of motif IDs already used in this composition (for variety)
 * @returns Selected melody-rhythm motif
 * @throws Error if no motifs match the required length (library gap)
 */
export function selectMelodyRhythmMotif(
  options: LegacyCompositionOptions,
  styleIntent: StyleIntent,
  functionTag: string,
  totalBeats: number,
  requiredTags: string[],
  rng: () => number,
  lastId: string | undefined,
  used: Set<string>
): MelodyRhythmMotif {
  const tolerance = 1e-6;
  const moodTags = MELODY_RHYTHM_TAGS[options.mood] ?? [];
  let candidates = melodyRhythmList.filter(
    (motif) => Math.abs(motif.length - totalBeats) < tolerance
  );
  if (!candidates.length) {
    throw new Error(`No melody rhythm motifs of length ${totalBeats}`);
  }
  let filtered = candidates.filter((motif) => motif.tags.includes(functionTag));
  if (!filtered.length) {
    filtered = candidates;
  }
  let moodFiltered = filtered.filter((motif) => moodTags.some((tag) => motif.tags.includes(tag)));
  if (!moodFiltered.length) {
    moodFiltered = filtered;
  }

  if (styleIntent.loopCentric) {
    moodFiltered = preferTagPresence(moodFiltered, ["loop_safe", "texture_loop"]);
  }

  if (styleIntent.textureFocus) {
    moodFiltered = preferTagPresence(moodFiltered, ["texture_loop", "grid16", "simple"]);
  }

  if (styleIntent.syncopationBias) {
    moodFiltered = preferTagPresence(moodFiltered, ["syncopated", "drive"]);
  }

  if (requiredTags.length) {
    const requiredFiltered = moodFiltered.filter((motif) => hasAllTags(motif, requiredTags));
    if (requiredFiltered.length) {
      moodFiltered = requiredFiltered;
    }
  }

  moodFiltered = filterHumanizedMelodyRhythms(moodFiltered, totalBeats);

  const pool = preferUnused(moodFiltered, used);
  return pickWithAvoid(pool, rng, lastId);
}
