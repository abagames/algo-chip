/**
 * Cache management for motif selection
 */

import type { CachedMotifs, HookMotifs } from "./types.js";

/**
 * Generate cache key from function tag and required tags
 */
export function cacheKey(functionTag: string, requiredTags: string[]): string {
  if (!requiredTags.length) {
    return functionTag;
  }
  const tags = [...requiredTags].sort();
  return `${functionTag}:${tags.join("|")}`;
}

/**
 * Get or create template-specific motif cache
 */
export function getOrCreateTemplateCache(
  templateCache: Map<string, Map<string, CachedMotifs>>,
  templateId: string,
  cacheKey: string
): CachedMotifs {
  if (!templateCache.has(templateId)) {
    templateCache.set(templateId, new Map());
  }
  const templateMap = templateCache.get(templateId)!;
  if (!templateMap.has(cacheKey)) {
    templateMap.set(cacheKey, {});
  }
  return templateMap.get(cacheKey)!;
}

/**
 * Get hook motifs for a specific occurrence
 * Always returns the canonical hook established at occurrence 1
 */
export function getHookForOccurrence(
  hookCache: Map<string, Map<number, HookMotifs>>,
  templateId: string,
  occurrenceIndex: number,
  rng: () => number
): HookMotifs | undefined {
  const occurrenceMap = hookCache.get(templateId);
  if (!occurrenceMap || occurrenceMap.size === 0) {
    return undefined;
  }

  // Always return the hook established at occurrence 1 (the canonical hook)
  // This maintains the core hook identity across all reprises
  return occurrenceMap.get(1);
}

/**
 * Store hook motifs for a specific occurrence
 * Only stores the canonical hook at occurrence 1
 */
export function setHookForOccurrence(
  hookCache: Map<string, Map<number, HookMotifs>>,
  templateId: string,
  occurrenceIndex: number,
  hook: HookMotifs
): void {
  if (!hookCache.has(templateId)) {
    hookCache.set(templateId, new Map());
  }
  const occurrenceMap = hookCache.get(templateId)!;

  // Only store the hook established at occurrence 1 (the canonical hook)
  // Per spec: establishesHook returns true when occurrenceIndex === 1
  if (occurrenceIndex === 1) {
    occurrenceMap.set(occurrenceIndex, hook);
  }
}
