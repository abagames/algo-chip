/**
 * Section template definitions
 */

import type { LegacyCompositionOptions } from "../../types.js";

export const SECTION_TEMPLATE_POOL: Array<Array<{ id: string; measures: number }>> = [
  [
    { id: "Intro", measures: 1 },
    { id: "A", measures: 3 },
    { id: "B", measures: 2 },
    { id: "A", measures: 2 }
  ],
  [
    { id: "A", measures: 2 },
    { id: "B", measures: 2 },
    { id: "A", measures: 2 },
    { id: "C", measures: 2 }
  ],
  [
    { id: "Intro", measures: 2 },
    { id: "A", measures: 2 },
    { id: "Bridge", measures: 2 },
    { id: "A", measures: 2 }
  ],
  [
    { id: "A", measures: 4 },
    { id: "B", measures: 2 },
    { id: "C", measures: 2 }
  ]
];

export const TEMPLATE_INDEX_BY_MOOD: Partial<
  Record<LegacyCompositionOptions["mood"], number[]>
> = {
  tense: [0, 3],
  upbeat: [1, 2],
  sad: [2, 3],
  peaceful: [1, 2]
};

/**
 * Length-optimized section templates for specific measure counts (16, 32, 64).
 * These templates provide better structure for common composition lengths.
 */
export const SECTION_TEMPLATES_BY_LENGTH: Record<
  number,
  Record<LegacyCompositionOptions["mood"], Array<{ id: string; measures: number }>>
> = {
  // 16 measures: Simple AB structure
  16: {
    upbeat: [
      { id: "A", measures: 8 }, // Intro/Verse
      { id: "B", measures: 8 } // Chorus/Outro
    ],
    peaceful: [
      { id: "A", measures: 8 },
      { id: "B", measures: 8 }
    ],
    tense: [
      { id: "A", measures: 8 },
      { id: "B", measures: 8 }
    ],
    sad: [
      { id: "A", measures: 8 },
      { id: "B", measures: 8 }
    ]
  },
  // 32 measures: Balanced ABCD or AA-BB structure
  32: {
    upbeat: [
      { id: "A", measures: 8 }, // Intro/Verse A
      { id: "B", measures: 8 }, // Chorus A
      { id: "C", measures: 8 }, // Verse B/Bridge
      { id: "D", measures: 8 } // Chorus B/Outro
    ],
    peaceful: [
      { id: "A", measures: 16 }, // Long section A
      { id: "B", measures: 16 } // Long section B
    ],
    tense: [
      { id: "A", measures: 8 },
      { id: "B", measures: 8 },
      { id: "A", measures: 8 },
      { id: "C", measures: 8 }
    ],
    sad: [
      { id: "Intro", measures: 4 },
      { id: "A", measures: 12 },
      { id: "B", measures: 8 },
      { id: "A", measures: 8 }
    ]
  },
  // 64 measures: Complex development with longer sections
  64: {
    upbeat: [
      { id: "A", measures: 16 }, // Intro/Verse A
      { id: "B", measures: 16 }, // Chorus A
      { id: "C", measures: 16 }, // Verse B/Bridge
      { id: "D", measures: 16 } // Chorus B/Outro
    ],
    peaceful: [
      { id: "A", measures: 16 },
      { id: "B", measures: 16 },
      { id: "A", measures: 16 },
      { id: "C", measures: 16 }
    ],
    tense: [
      { id: "Intro", measures: 8 },
      { id: "A", measures: 16 },
      { id: "B", measures: 16 },
      { id: "C", measures: 12 },
      { id: "A", measures: 12 }
    ],
    sad: [
      { id: "Intro", measures: 8 },
      { id: "A", measures: 20 },
      { id: "B", measures: 16 },
      { id: "A", measures: 20 }
    ]
  }
};
