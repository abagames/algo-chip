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
  G_Major: [0, 2, 4, 5, 7, 9, 11],
  E_Minor: [0, 2, 3, 5, 7, 8, 10],
  C_Major: [0, 2, 4, 5, 7, 9, 11]
};

export const HOOK_TEMPLATES = new Set(["A"]);

export const DEFAULT_TEXTURE: TextureProfile = "steady";
export const DEFAULT_PHRASE_LENGTH = 1;

export const STYLE_INTENT_BASE: StyleIntent = {
  textureFocus: false,
  loopCentric: false,
  gradualBuild: false,
  harmonicStatic: false,
  percussiveLayering: false,
  breakInsertion: false,
  filterMotion: false,
  syncopationBias: false,
  atmosPad: false
};

export const STYLE_PRESET_MAP: Record<StylePreset, Partial<StyleIntent>> = {
  minimalTechno: {
    textureFocus: true,
    loopCentric: true,
    harmonicStatic: true,
    percussiveLayering: true,
    filterMotion: true,
    syncopationBias: true
  },
  progressiveHouse: {
    textureFocus: true,
    loopCentric: true,
    gradualBuild: true,
    percussiveLayering: true,
    breakInsertion: true,
    filterMotion: true,
    syncopationBias: true
  },
  retroLoopwave: {
    loopCentric: true,
    textureFocus: true,
    harmonicStatic: false,
    percussiveLayering: true,
    filterMotion: true,
    syncopationBias: true,
    atmosPad: false
  },
  breakbeatJungle: {
    percussiveLayering: true,
    syncopationBias: true,
    breakInsertion: true,
    textureFocus: false,
    loopCentric: false,
    gradualBuild: false,
    harmonicStatic: false,
    filterMotion: true
  },
  lofiChillhop: {
    atmosPad: true,
    loopCentric: true,
    harmonicStatic: true,
    textureFocus: false,
    gradualBuild: false,
    percussiveLayering: false,
    breakInsertion: false,
    filterMotion: false,
    syncopationBias: false
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

export const TEXTURE_VARIATION_PROBABILITY = 0.1;
