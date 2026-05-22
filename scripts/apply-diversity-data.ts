/**
 * apply-diversity-data.ts
 * Applies diversity improvement data changes:
 *   - Adds new chord keys to chords.json (improvement B)
 *   - Adds new transition entries to transitions.json (improvement F)
 *
 * Run: node --loader ts-node/esm scripts/apply-diversity-data.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const motifsDir = join(__dirname, "../packages/core/motifs");

// ─── Chord data for new keys ────────────────────────────────────────────────

const NEW_CHORD_KEYS: Record<string, Record<string, string[][]>> = {
  D_Major: {
    adventure_bright: [
      ["D", "A", "G", "A"],
      ["D", "G", "A", "D"],
      ["G", "A", "D", "D"],
      ["D", "A", "Bm", "G"],
      ["D", "Em", "A", "D"],
    ],
    upbeat_dance: [
      ["D", "G", "Bm", "A"],
      ["D", "A", "G", "Em"],
      ["Bm", "G", "D", "A"],
      ["D", "D", "G", "A"],
      ["G", "D", "A", "Bm"],
    ],
  },
  F_Major: {
    warm_bright: [
      ["F", "C", "Dm", "Bb"],
      ["F", "Bb", "C", "F"],
      ["Dm", "Bb", "F", "C"],
      ["F", "C", "Bb", "C"],
      ["Bb", "F", "C", "Dm"],
    ],
    peaceful_flow: [
      ["F", "Am", "Bb", "C"],
      ["F", "C", "Am", "Bb"],
      ["Dm", "F", "Bb", "C"],
      ["F", "Gm", "C", "F"],
      ["Am", "Bb", "F", "C"],
    ],
  },
  A_Minor: {
    melancholy: [
      ["Am", "G", "F", "E7"],
      ["Am", "F", "C", "G"],
      ["Am", "Dm", "G", "Am"],
      ["F", "G", "Am", "Am"],
      ["Am", "Em", "F", "G"],
    ],
    wistful_journey: [
      ["Am", "C", "G", "F"],
      ["Dm", "Am", "G", "C"],
      ["Am", "G", "Em", "F"],
      ["F", "C", "G", "Am"],
      ["Am", "Am", "F", "G"],
    ],
  },
  D_Minor: {
    sorrowful_deep: [
      ["Dm", "Bb", "C", "A7"],
      ["Dm", "Am", "Bb", "C"],
      ["Dm", "C", "Bb", "A7"],
      ["Bb", "F", "C", "Dm"],
      ["Dm", "Gm", "A7", "Dm"],
    ],
    minor_ballad: [
      ["Dm", "Bb", "F", "C"],
      ["Dm", "Am", "Gm", "A7"],
      ["Gm", "Dm", "Bb", "C"],
      ["Dm", "C", "Gm", "A7"],
      ["F", "C", "Dm", "Bb"],
    ],
  },
  B_Minor: {
    tense_dark: [
      ["Bm", "G", "D", "A"],
      ["Bm", "F#7", "G", "A"],
      ["Bm", "Em", "F#7", "Bm"],
      ["G", "D", "A", "Bm"],
      ["Bm", "A", "G", "F#7"],
    ],
    brooding_drama: [
      ["Bm", "G", "A", "F#7"],
      ["D", "A", "Bm", "G"],
      ["Bm", "D", "G", "A"],
      ["Em", "Bm", "A", "G"],
      ["Bm", "Bm", "G", "A"],
    ],
  },
  C_Minor: {
    dramatic_tension: [
      ["Cm", "Ab", "Bb", "G7"],
      ["Cm", "Gm", "Ab", "Bb"],
      ["Cm", "Bb", "Ab", "G7"],
      ["Ab", "Eb", "Bb", "Cm"],
      ["Cm", "Fm", "G7", "Cm"],
    ],
    dark_industrial: [
      ["Cm", "Ab", "Eb", "Bb"],
      ["Cm", "Gm", "Fm", "G7"],
      ["Gm", "Cm", "Ab", "Bb"],
      ["Cm", "Bb", "Gm", "G7"],
      ["Eb", "Bb", "Cm", "Ab"],
    ],
  },
};

// ─── New transition entries ──────────────────────────────────────────────────

const NEW_TRANSITIONS = [
  // section_end + loop_out (+5)
  { id: "TR_LOOP_FADE_HIT",      pattern: "K---H---S---K---", length_beats: 4, tags: ["transition", "section_end", "loop_out", "drum_fill"],             channel: "noise" },
  { id: "TR_LOOP_SNAP_FILL",     pattern: "S---K-S-K-S-KSK-", length_beats: 4, tags: ["transition", "section_end", "loop_out", "drum_fill"],             channel: "noise" },
  { id: "TR_LOOP_TICK_DOWN",     pattern: "H---T---H---T---", length_beats: 4, tags: ["transition", "section_end", "loop_out", "retro"],                  channel: "noise" },
  { id: "TR_LOOP_CHOP_CUT",      pattern: "S-HS-HK-HS-HKSH-", length_beats: 4, tags: ["transition", "section_end", "loop_out", "breakbeat", "drum_fill"], channel: "noise" },
  { id: "TR_LOOP_HISS_HOLD",     pattern: "N-------N---N---", length_beats: 4, tags: ["transition", "section_end", "loop_out", "noise_fx"],               channel: "noise" },
  // section_end + lofi (+4)
  { id: "TR_LOFI_VINYL_SKIP",    pattern: "N-----------H---", length_beats: 4, tags: ["transition", "section_end", "lofi", "noise_fx", "rest_heavy"],     channel: "noise" },
  { id: "TR_LOFI_CRACKLE_DIP",   pattern: "N---S---N---H---", length_beats: 4, tags: ["transition", "section_end", "lofi", "noise_fx"],                   channel: "noise" },
  { id: "TR_LOFI_TAPE_HUM",      pattern: "N-----------S---", length_beats: 4, tags: ["transition", "section_end", "lofi", "noise_fx", "loop_out"],       channel: "noise" },
  { id: "TR_LOFI_DUST_TAIL",     pattern: "S-----------S---", length_beats: 4, tags: ["transition", "section_end", "lofi", "rest_heavy"],                 channel: "noise" },
  // section_end + breakbeat (+4)
  { id: "TR_BREAKBEAT_HAT_STUTTER",  pattern: "H-HHSH-HH-HHSH--", length_beats: 4, tags: ["transition", "section_end", "breakbeat", "drum_fill"],        channel: "noise" },
  { id: "TR_BREAKBEAT_KICK_SCATTER", pattern: "K--KS-K--KS-K-S-", length_beats: 4, tags: ["transition", "section_end", "breakbeat", "drum_fill"],        channel: "noise" },
  { id: "TR_BREAKBEAT_ROLL_DOWN",    pattern: "S-S-SHSHS-S-SHSH", length_beats: 4, tags: ["transition", "section_end", "breakbeat", "drum_fill"],        channel: "noise" },
  { id: "TR_BREAKBEAT_LOOP_CUT",     pattern: "K-S-H-SK-S-H-SK-", length_beats: 4, tags: ["transition", "section_end", "breakbeat", "loop_out", "drum_fill"], channel: "noise" },
  // section_end + build (+5)
  { id: "TR_BUILD_SNARE_RAMP",   pattern: "--S----S--S-S-SS", length_beats: 4, tags: ["transition", "section_end", "build", "drum_fill"],                 channel: "noise" },
  { id: "TR_BUILD_NOISE_LIFT",   pattern: "N-------N---NNN-", length_beats: 4, tags: ["transition", "section_end", "build", "noise_fx"],                  channel: "noise" },
  { id: "TR_BUILD_KICK_SWELL",   pattern: "K-------K---K-K-", length_beats: 4, tags: ["transition", "section_end", "build", "drum_fill"],                 channel: "noise" },
  { id: "TR_BUILD_HAT_STORM",    pattern: "H---H-HHH-HHHHHH", length_beats: 4, tags: ["transition", "section_end", "build", "drum_fill"],                 channel: "noise" },
  { id: "TR_BUILD_CRASH_GATE",   pattern: "N-S-N-S-NSNSNSS-", length_beats: 4, tags: ["transition", "section_end", "build", "noise_fx"],                  channel: "noise" },
];

// ─── Apply chords ────────────────────────────────────────────────────────────

const chordsPath = join(motifsDir, "chords.json");
const chords = JSON.parse(readFileSync(chordsPath, "utf-8")) as Record<string, unknown>;

let chordsAdded = 0;
for (const [key, data] of Object.entries(NEW_CHORD_KEYS)) {
  if (key in chords) {
    console.log(`  chords.json: ${key} already exists, skipping`);
  } else {
    chords[key] = data;
    chordsAdded++;
    console.log(`  chords.json: added ${key}`);
  }
}
writeFileSync(chordsPath, JSON.stringify(chords, null, 2) + "\n");
console.log(`chords.json: ${chordsAdded} new keys written`);

// ─── Apply transitions ───────────────────────────────────────────────────────

const transPath = join(motifsDir, "transitions.json");
const transData = JSON.parse(readFileSync(transPath, "utf-8")) as { transitions: { id: string }[] };

const existingIds = new Set(transData.transitions.map(t => t.id));
let transAdded = 0;
for (const entry of NEW_TRANSITIONS) {
  if (existingIds.has(entry.id)) {
    console.log(`  transitions.json: ${entry.id} already exists, skipping`);
  } else {
    transData.transitions.push(entry);
    transAdded++;
  }
}
writeFileSync(transPath, JSON.stringify(transData, null, 2) + "\n");
console.log(`transitions.json: ${transAdded} new entries written (total: ${transData.transitions.length})`);
