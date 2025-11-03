/**
 * Voice arrangement configurations
 */

import type { VoiceArrangement, VoiceArrangementPreset, StylePreset } from "../../types.js";

export const VOICE_ARRANGEMENTS: Record<VoiceArrangementPreset, VoiceArrangement> = {
  standard: {
    id: "standard",
    description: "Classic melody + accompaniment + bass",
    voices: [
      { role: "melody", channel: "square1", priority: 1.0, octaveOffset: 0 },
      { role: "accompaniment", channel: "square2", priority: 1.0, octaveOffset: 0 },
      { role: "bass", channel: "triangle", priority: 1.0, octaveOffset: 0 }
    ]
  },

  swapped: {
    id: "swapped",
    description: "Swapped square channels for tonal variety",
    voices: [
      { role: "melody", channel: "square2", priority: 1.0, octaveOffset: 0 },
      { role: "accompaniment", channel: "square1", priority: 1.0, octaveOffset: 0 },
      { role: "bass", channel: "triangle", priority: 1.0, octaveOffset: 0 }
    ]
  },

  dualBass: {
    id: "dualBass",
    description: "Melody with dual bass (thick low end)",
    voices: [
      { role: "melody", channel: "square1", priority: 1.0, octaveOffset: 0 },
      { role: "bass", channel: "square2", priority: 1.0, octaveOffset: 0, seedOffset: 0 },
      { role: "bassAlt", channel: "triangle", priority: 0.7, octaveOffset: -1, seedOffset: 100 }
    ]
  },

  bassLed: {
    id: "bassLed",
    description: "Bass-focused with sparse melodic decoration",
    voices: [
      { role: "bass", channel: "triangle", priority: 1.0, octaveOffset: -1, seedOffset: 0 },
      { role: "bassAlt", channel: "square2", priority: 0.8, octaveOffset: 0, seedOffset: 200 },
      { role: "melody", channel: "square1", priority: 0.3, octaveOffset: 0 }
    ]
  },

  layeredBass: {
    id: "layeredBass",
    description: "Layered bass with complementary square/triangle movement",
    voices: [
      { role: "bass", channel: "square1", priority: 1.0, octaveOffset: 0, seedOffset: 0 },
      { role: "bassAlt", channel: "triangle", priority: 0.85, octaveOffset: 0, seedOffset: 160 },
      { role: "melody", channel: "square2", priority: 1.0, octaveOffset: 0 }
    ]
  },

  minimal: {
    id: "minimal",
    description: "Minimal techno: bass + sparse pad only",
    voices: [
      { role: "bass", channel: "square1", priority: 1.0, octaveOffset: 0 },
      { role: "pad", channel: "triangle", priority: 0.4, octaveOffset: 0 }
    ]
  },

  breakLayered: {
    id: "breakLayered",
    description: "Breakbeat layering: dual bass pressure with agile lead",
    voices: [
      { role: "bass", channel: "square1", priority: 1.0, octaveOffset: 0, seedOffset: 0 },
      { role: "bassAlt", channel: "triangle", priority: 0.95, octaveOffset: -1, seedOffset: 140 },
      { role: "melody", channel: "square2", priority: 0.85, octaveOffset: 0, seedOffset: 240 }
    ]
  },

  lofiPadLead: {
    id: "lofiPadLead",
    description: "Lo-fi pad-first texture with gentle lead flourishes",
    voices: [
      { role: "pad", channel: "triangle", priority: 0.9, octaveOffset: -1 },
      { role: "accompaniment", channel: "square2", priority: 1.0, octaveOffset: -1, seedOffset: 60 },
      { role: "melody", channel: "square1", priority: 0.45, octaveOffset: 0, seedOffset: 180 }
    ]
  },

  retroPulse: {
    id: "retroPulse",
    description: "Retro loopwave pulse arpeggios with anchored bass",
    voices: [
      { role: "melody", channel: "square1", priority: 1.0, octaveOffset: 0, seedOffset: 80 },
      { role: "accompaniment", channel: "square2", priority: 0.85, octaveOffset: 0, seedOffset: 140 },
      { role: "bass", channel: "triangle", priority: 0.9, octaveOffset: -1, seedOffset: 40 }
    ]
  }
};

export const ARRANGEMENT_WEIGHTS_BY_STYLE: Record<
  StylePreset,
  Partial<Record<VoiceArrangementPreset, number>>
> = {
  minimalTechno: {
    standard: 2,
    minimal: 5,
    bassLed: 3,
    dualBass: 2,
    swapped: 1,
    layeredBass: 1
  },
  progressiveHouse: {
    standard: 4,
    swapped: 3,
    layeredBass: 3,
    dualBass: 2,
    bassLed: 1,
    minimal: 0
  },
  retroLoopwave: {
    standard: 2,
    swapped: 3,
    retroPulse: 5,
    layeredBass: 1,
    minimal: 0,
    bassLed: 1
  },
  breakbeatJungle: {
    breakLayered: 5,
    dualBass: 3,
    layeredBass: 2,
    bassLed: 2,
    standard: 1,
    swapped: 1,
    minimal: 0
  },
  lofiChillhop: {
    lofiPadLead: 5,
    minimal: 3,
    standard: 2,
    swapped: 1,
    bassLed: 1,
    layeredBass: 0,
    dualBass: 1
  }
};

export const DEFAULT_ARRANGEMENT_WEIGHTS: Record<VoiceArrangementPreset, number> = {
  standard: 5,
  swapped: 4,
  dualBass: 2,
  bassLed: 2,
  layeredBass: 2,
  minimal: 1,
  breakLayered: 1,
  lofiPadLead: 1,
  retroPulse: 2
};
