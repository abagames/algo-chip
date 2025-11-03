/**
 * Internal type definitions for structure planning phase
 */

import type { SectionDefinition, TechniqueStrategy } from "../../types.js";

/**
 * Context for structure planning phase
 */
export interface Phase1Context {
  sections: SectionDefinition[];
  techniqueStrategy: TechniqueStrategy;
}
