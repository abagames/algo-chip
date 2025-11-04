/**
 * Section building logic
 */

import type { PipelineCompositionOptions, StyleIntent, SectionDefinition } from "../../types.js";
import { shuffleArray, randomFromSeed } from "./utilities.js";
import { SECTION_TEMPLATES_BY_LENGTH, SECTION_TEMPLATE_POOL, TEMPLATE_INDEX_BY_MOOD } from "./templates.js";
import { buildLimitedProgression } from "./chord-progression.js";
import { resolveTexture } from "./texture-resolver.js";

/**
 * Pick template for mood from pool
 */
function pickTemplateForMood(mood: PipelineCompositionOptions["mood"], seed: number | undefined) {
  const candidates = TEMPLATE_INDEX_BY_MOOD[mood] ?? SECTION_TEMPLATE_POOL.map((_, index) => index);
  const index = candidates[Math.floor(randomFromSeed(seed, 60) * candidates.length)] ?? 0;
  return SECTION_TEMPLATE_POOL[index].map((segment) => ({ ...segment }));
}

/**
 * Build section definitions from options and chord pool
 */
export function buildSections(
  options: PipelineCompositionOptions,
  chordsPool: string[][],
  seed: number | undefined,
  precomputedIntent: Partial<StyleIntent>
): SectionDefinition[] {
  const targetMeasures = options.lengthInMeasures;

  // Use length-optimized template if available for this specific length
  let baseTemplate: Array<{ id: string; measures: number }>;

  if (targetMeasures in SECTION_TEMPLATES_BY_LENGTH) {
    // Use optimized template for 16, 32, or 64 measures
    baseTemplate = SECTION_TEMPLATES_BY_LENGTH[targetMeasures][options.mood].map(s => ({ ...s }));
  } else {
    // Fall back to existing logic for custom lengths
    baseTemplate = pickTemplateForMood(options.mood, seed);
  }

  const totalTemplateMeasures = baseTemplate.reduce((sum, section) => sum + section.measures, 0);
  let repeatedTemplate: { id: string; measures: number }[] = [];

  if (targetMeasures === totalTemplateMeasures) {
    repeatedTemplate = baseTemplate;
  } else if (targetMeasures > totalTemplateMeasures) {
    const loops = Math.floor(targetMeasures / totalTemplateMeasures);
    for (let i = 0; i < loops; i++) {
      repeatedTemplate = repeatedTemplate.concat(baseTemplate);
    }
    let remaining = targetMeasures - loops * totalTemplateMeasures;
    let idx = 0;
    while (remaining > 0) {
      const templateSection = baseTemplate[idx % baseTemplate.length];
      const clamp = Math.min(templateSection.measures, remaining);
      repeatedTemplate.push({ id: templateSection.id, measures: clamp });
      remaining -= clamp;
      idx++;
    }
  } else {
    let consumed = 0;
    for (const section of baseTemplate) {
      if (consumed + section.measures > targetMeasures) {
        const remaining = Math.max(targetMeasures - consumed, 0);
        if (remaining > 0) {
          repeatedTemplate.push({ id: section.id, measures: remaining });
        }
        break;
      }
      repeatedTemplate.push(section);
      consumed += section.measures;
    }
  }

  const sections: SectionDefinition[] = [];
  let measureCursor = 0;
  let chordIndex = 0;

  const randomizedProgressions = shuffleArray(chordsPool, seed, 200 + chordIndex);
  const occurrenceCounter = new Map<string, number>();

  const chordVariety = new Set<string>();
  for (const progression of randomizedProgressions) {
    progression.forEach((chord) => chordVariety.add(chord));
  }

  // Create RNG for limited progression generation
  const createLocalRng = (localSeed: number | undefined): (() => number) => {
    let state = (localSeed ?? 987654321) >>> 0;
    if (state === 0) state = 987654321;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
  };
  const rng = createLocalRng(seed);

  // Use limited progression for harmonicStatic styles
  const useHarmonicStatic = precomputedIntent.harmonicStatic === true;
  const useSingleChord = useHarmonicStatic && chordVariety.size <= 1;

  for (const section of repeatedTemplate) {
    let progression: string[];

    if (useSingleChord && randomizedProgressions.length > 0) {
      // Original behavior: single static chord
      progression = [randomizedProgressions[0][0]];
    } else if (useHarmonicStatic && randomizedProgressions.length > 0) {
      // New behavior: limited progression with occasional related chords
      const baseChord = randomizedProgressions[chordIndex % randomizedProgressions.length][0];
      progression = buildLimitedProgression(baseChord, rng);
    } else {
      // Normal progression
      progression = randomizedProgressions[chordIndex % randomizedProgressions.length];
    }
    const templateId = section.id;
    const occurrenceIndex = (occurrenceCounter.get(templateId) ?? 0) + 1;
    occurrenceCounter.set(templateId, occurrenceIndex);

    const texture = resolveTexture(templateId, occurrenceIndex, seed);

    sections.push({
      id: `${section.id}${sections.filter((s) => s.id.startsWith(section.id)).length + 1}`,
      startMeasure: measureCursor,
      measures: section.measures,
      chordProgression: progression,
      templateId,
      occurrenceIndex,
      texture
    });
    measureCursor += section.measures;
    // Increment chord index unless using single static chord
    if (!useSingleChord) {
      chordIndex++;
    }
  }

  return sections;
}
