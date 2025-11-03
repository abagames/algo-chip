/**
 * Utility functions for structure planning
 */

import type { SectionDefinition } from "../../types.js";
import { HOOK_TEMPLATES, DEFAULT_PHRASE_LENGTH, TEMPLATE_PHRASE_LENGTH } from "./constants.js";

/**
 * Generate deterministic random number from seed
 */
export function randomFromSeed(seed: number | undefined, salt: number): number {
  const base = (Math.imul(seed ?? 0, 1664525) + Math.imul(salt, 1013904223)) >>> 0;
  const value = (Math.imul(base, 22695477) + 1) >>> 0;
  return value / 0xffffffff;
}

/**
 * Shuffle array deterministically based on seed
 */
export function shuffleArray<T>(items: T[], seed: number | undefined, salt: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(randomFromSeed(seed, salt + i) * (i + 1));
    const temp = copy[i];
    copy[i] = copy[randomIndex];
    copy[randomIndex] = temp;
  }
  return copy;
}

/**
 * Resolve phrase length for template ID
 */
export function resolvePhraseLength(templateId: string): number {
  return TEMPLATE_PHRASE_LENGTH[templateId] ?? DEFAULT_PHRASE_LENGTH;
}

/**
 * Get phrase length for section
 */
export function getPhraseLengthForSection(section: { templateId: string }): number {
  return resolvePhraseLength(section.templateId);
}

/**
 * Check if section establishes a hook
 */
export function establishesHook(section: { templateId: string; occurrenceIndex: number }): boolean {
  return section.occurrenceIndex === 1 && HOOK_TEMPLATES.has(section.templateId);
}

/**
 * Check if section reprises a hook
 */
export function repriseHook(section: { templateId: string; occurrenceIndex: number }): boolean {
  return section.occurrenceIndex > 1 && HOOK_TEMPLATES.has(section.templateId);
}

/**
 * Validate that total section length matches target
 */
export function validateSectionLength(target: number, sections: SectionDefinition[]) {
  const sum = sections.reduce((acc, s) => acc + s.measures, 0);
  if (sum !== target) {
    throw new Error(`Section length mismatch. expected=${target}, actual=${sum}`);
  }
}
