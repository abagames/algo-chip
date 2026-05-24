/**
 * Base constants for structure planning
 */

import type { PipelineCompositionOptions, TextureProfile, StyleIntent, StylePreset } from "../../types.js";
import chordsJson from "../../../motifs/chords.json" with { type: "json" };

export const chords = chordsJson as Record<string, Record<string, string[][]>>;

export const TEMPO_BASE: Record<PipelineCompositionOptions["tempo"], number> = {
  slow: 90,
  medium: 120,
  fast: 150
};

export const MOOD_TAG_MAP: Record<PipelineCompositionOptions["mood"], string[]> = {
  upbeat: ["overworld_bright", "heroic"],
  sad: ["ending_sorrowful", "dark"],
  tense: ["final_battle_tense", "castle_majestic"],
  peaceful: ["town_peaceful", "simple"]
};

export const DEFAULT_KEY_PER_MOOD: Record<PipelineCompositionOptions["mood"], string> = {
  upbeat: "G_Major",
  sad: "E_Minor",
  tense: "E_Minor",
  peaceful: "C_Major"
};

export const AVAILABLE_CHORD_KEYS = Object.keys(chords);

export const SCALE_DEGREES: Record<string, number[]> = {
  C_Major: [0, 2, 4, 5, 7, 9, 11],
  D_Major: [0, 2, 4, 5, 7, 9, 11],
  F_Major: [0, 2, 4, 5, 7, 9, 11],
  G_Major: [0, 2, 4, 5, 7, 9, 11],
  A_Minor: [0, 2, 3, 5, 7, 8, 10],
  B_Minor: [0, 2, 3, 5, 7, 8, 10],
  C_Minor: [0, 2, 3, 5, 7, 8, 10],
  D_Minor: [0, 2, 3, 5, 7, 8, 10],
  E_Minor: [0, 2, 3, 5, 7, 8, 10],
};

export const HOOK_TEMPLATES = new Set(["A"]);

export const DEFAULT_TEXTURE: TextureProfile = "steady";
export const DEFAULT_PHRASE_LENGTH = 1;

export const STYLE_INTENT_BASE: StyleIntent = {
  textureFocus: 0,
  loopCentric: 0,
  gradualBuild: 0,
  harmonicStatic: 0,
  percussiveLayering: 0,
  breakInsertion: 0,
  filterMotion: 0,
  syncopationBias: 0,
  atmosPad: 0,
  lofiFeel: 0
};

export const STYLE_PRESET_MAP: Record<StylePreset, Partial<StyleIntent>> = {
  minimalTechno: {
    textureFocus: 1.0,
    loopCentric: 1.0,
    harmonicStatic: 1.0,
    percussiveLayering: 1.0,
    filterMotion: 1.0,
    syncopationBias: 1.0
  },
  progressiveHouse: {
    textureFocus: 1.0,
    loopCentric: 1.0,
    gradualBuild: 1.0,
    percussiveLayering: 1.0,
    breakInsertion: 1.0,
    filterMotion: 1.0,
    syncopationBias: 1.0
  },
  retroLoopwave: {
    loopCentric: 1.0,
    textureFocus: 1.0,
    harmonicStatic: 0,
    percussiveLayering: 1.0,
    filterMotion: 1.0,
    syncopationBias: 1.0,
    atmosPad: 0
  },
  breakbeatJungle: {
    percussiveLayering: 1.0,
    syncopationBias: 1.0,
    breakInsertion: 1.0,
    textureFocus: 0,
    loopCentric: 0,
    gradualBuild: 0,
    harmonicStatic: 0,
    filterMotion: 1.0
  },
  lofiChillhop: {
    atmosPad: 1.0,
    loopCentric: 1.0,
    harmonicStatic: 1.0,
    lofiFeel: 1.0,
    textureFocus: 0,
    gradualBuild: 0,
    percussiveLayering: 0,
    breakInsertion: 0,
    filterMotion: 0,
    syncopationBias: 0
  }
};

export const TEMPLATE_TEXTURE_SEQUENCE: Record<string, TextureProfile[]> = {
  Intro: ["broken"],
  A: ["broken", "steady", "broken"],
  B: ["steady", "steady", "arpeggio"],
  Bridge: ["arpeggio", "steady"],
  C: ["steady", "arpeggio", "steady"]
};

export const TEMPLATE_PHRASE_LENGTH: Record<string, number> = {
  Intro: 1,
  A: 2,
  B: 2,
  Bridge: 4,
  C: 2
};

export const ARPEGGIO_KEEP_PROBABILITY = {
  firstOccurrence: 0.7,
  repeatOccurrence: 0.4
};

export const TEXTURE_VARIATION_PROBABILITY = 0.25;
