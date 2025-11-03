/**
 * Style intent resolution and merging
 */

import type { StyleIntent, LegacyCompositionOptions, SectionDefinition } from "../../types.js";
import { STYLE_INTENT_BASE, STYLE_PRESET_MAP } from "./constants.js";

/**
 * Create base style intent
 */
export function createStyleIntent(): StyleIntent {
  return { ...STYLE_INTENT_BASE };
}

/**
 * Merge style intent with patch
 */
export function mergeStyleIntent(
  base: StyleIntent,
  patch: Partial<StyleIntent> | undefined
): StyleIntent {
  if (!patch) {
    return base;
  }
  const merged: StyleIntent = { ...base };
  for (const key of Object.keys(base) as Array<keyof StyleIntent>) {
    if (patch[key] !== undefined) {
      merged[key] = Boolean(patch[key]);
    }
  }
  return merged;
}

/**
 * Precompute style intent from options (preset + overrides)
 */
export function precomputeStyleIntent(options: LegacyCompositionOptions): Partial<StyleIntent> {
  let intent: Partial<StyleIntent> = {};

  // Apply preset first
  if (options.stylePreset) {
    const presetPatch = STYLE_PRESET_MAP[options.stylePreset];
    if (presetPatch) {
      intent = { ...intent, ...presetPatch };
    }
  }

  // Apply user overrides
  if (options.styleOverrides) {
    intent = { ...intent, ...options.styleOverrides };
  }

  return intent;
}

/**
 * Resolve final style intent based on composition structure
 */
export function resolveStyleIntent(
  options: LegacyCompositionOptions,
  sections: SectionDefinition[]
): StyleIntent {
  let intent = createStyleIntent();
  if (options.stylePreset) {
    const presetPatch = STYLE_PRESET_MAP[options.stylePreset];
    if (presetPatch) {
      intent = mergeStyleIntent(intent, presetPatch);
    }
  }

  const totalMeasures = sections.reduce((sum, section) => sum + section.measures, 0);
  const sectionTemplateCounts = sections.reduce<Map<string, number>>((acc, section) => {
    acc.set(section.templateId, (acc.get(section.templateId) ?? 0) + 1);
    return acc;
  }, new Map());
  const hasRepeatedTemplate = Array.from(sectionTemplateCounts.values()).some(
    (count) => count >= 2
  );
  const averageSectionLength = sections.length ? totalMeasures / sections.length : totalMeasures;

  if (hasRepeatedTemplate || averageSectionLength <= 4) {
    intent.loopCentric = true;
  }

  if (options.tempo !== "slow" && totalMeasures >= 8) {
    intent.loopCentric = true;
    intent.percussiveLayering = true;
  }

  if (options.mood === "tense" || options.mood === "sad") {
    intent.textureFocus = true;
  }

  if (options.mood === "peaceful") {
    intent.atmosPad = true;
  }

  if (options.mood === "upbeat" || options.mood === "tense") {
    intent.syncopationBias = true;
  }

  if (options.tempo === "fast") {
    intent.filterMotion = true;
    intent.percussiveLayering = true;
  }

  if (totalMeasures >= 12) {
    intent.gradualBuild = true;
  }

  const uniqueChords = new Set<string>();
  const distinctProgressions = new Set<string>();
  let sectionsWithSingleChord = 0;
  for (const section of sections) {
    section.chordProgression.forEach((chord) => uniqueChords.add(chord));
    distinctProgressions.add(section.chordProgression.join("|"));
    const chordsInSection = new Set(section.chordProgression);
    if (chordsInSection.size <= 1) {
      sectionsWithSingleChord++;
    }
  }

  const allSectionsStatic = sections.length > 0 && sectionsWithSingleChord === sections.length;
  if (distinctProgressions.size <= 1 && (uniqueChords.size <= 2 || allSectionsStatic)) {
    intent.harmonicStatic = true;
  }

  if (totalMeasures >= 8 && options.tempo !== "slow") {
    intent.breakInsertion = true;
  }

  const inferredHarmonicStatic = intent.harmonicStatic;
  intent = mergeStyleIntent(intent, options.styleOverrides);
  if (!inferredHarmonicStatic) {
    intent.harmonicStatic = false;
  }

  return intent;
}
