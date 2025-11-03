import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Motif Constraint Validation", () => {
  const motifsPath = join(process.cwd(), "packages", "core", "motifs");

  describe("Rhythm motif constraints (4 or 8 beats)", () => {
    it("should have all rhythm motifs with length 4 or 8 beats", () => {
      const rhythmPath = join(motifsPath, "rhythm.json");
      const rhythmData = JSON.parse(readFileSync(rhythmPath, "utf-8"));

      assert.ok(Array.isArray(rhythmData), "Rhythm data should be an array");
      assert.ok(rhythmData.length > 0, "Should have rhythm motifs");

      const validLengths = [4, 8];
      const invalidMotifs: any[] = [];

      rhythmData.forEach((motif: any) => {
        if (!validLengths.includes(motif.length)) {
          invalidMotifs.push({
            id: motif.id,
            length: motif.length
          });
        }
      });

      assert.strictEqual(
        invalidMotifs.length,
        0,
        `All rhythm motifs must have length 4 or 8 beats. Invalid motifs: ${JSON.stringify(invalidMotifs)}`
      );
    });

    it("should use positive step counts for rhythm patterns", () => {
      const rhythmPath = join(motifsPath, "rhythm.json");
      const rhythmData = JSON.parse(readFileSync(rhythmPath, "utf-8"));

      const invalidMotifs: any[] = [];

      rhythmData.forEach((motif: any) => {
        if (!Array.isArray(motif.pattern) || motif.pattern.length === 0) {
          invalidMotifs.push({ id: motif.id, reason: "missing pattern" });
          return;
        }

        const hasInvalidValue = motif.pattern.some((step: unknown) => {
          if (typeof step === "number") {
            return step <= 0 || step % 2 !== 0;
          }
          if (typeof step === "object" && step && typeof (step as any).value === "number") {
            const value = (step as any).value;
            return value <= 0 || value % 2 !== 0;
          }
          return true;
        });

        if (hasInvalidValue) {
          invalidMotifs.push({ id: motif.id, pattern: motif.pattern });
        }
      });

      assert.strictEqual(
        invalidMotifs.length,
        0,
        `Rhythm patterns must use positive even step counts. Invalid motifs: ${JSON.stringify(invalidMotifs)}`
      );
    });

    it("should declare variations as motif references or inline patterns", () => {
      const rhythmPath = join(motifsPath, "rhythm.json");
      const rhythmData = JSON.parse(readFileSync(rhythmPath, "utf-8"));

      const invalidVariations: any[] = [];

      rhythmData.forEach((motif: any) => {
        if (Array.isArray(motif.variations)) {
          motif.variations.forEach((variation: any, idx: number) => {
            const isStringRef = typeof variation === "string" && variation.trim().length > 0;
            const isInlinePattern = variation && Array.isArray(variation.pattern);
            if (!isStringRef && !isInlinePattern) {
              invalidVariations.push({ motifId: motif.id, variationIndex: idx, value: variation });
            }
          });
        }
      });

      assert.strictEqual(
        invalidVariations.length,
        0,
        `Rhythm variations must reference another motif or provide an inline pattern. Invalid variations: ${JSON.stringify(invalidVariations)}`
      );
    });
  });

  describe("Melody motif constraints (4 or 8 beats)", () => {
    it("should have non-empty melody patterns", () => {
      const melodyPath = join(motifsPath, "melody.json");
      const melodyData = JSON.parse(readFileSync(melodyPath, "utf-8"));

      assert.ok(Array.isArray(melodyData), "Melody data should be an array");
      assert.ok(melodyData.length > 0, "Should have melody motifs");

      const invalidMotifs: any[] = [];

      melodyData.forEach((motif: any) => {
        if (Array.isArray(motif.pattern)) {
          if (motif.pattern.length === 0) {
            invalidMotifs.push({
              id: motif.id,
              reason: "empty pattern"
            });
          }
        }
      });

      assert.strictEqual(
        invalidMotifs.length,
        0,
        `Melody motifs must have at least one interval step. Invalid motifs: ${JSON.stringify(invalidMotifs)}`
      );
    });

    it("should have pattern values within valid interval range", () => {
      const melodyPath = join(motifsPath, "melody.json");
      const melodyData = JSON.parse(readFileSync(melodyPath, "utf-8"));

      const invalidPatterns: any[] = [];

      melodyData.forEach((motif: any) => {
        if (Array.isArray(motif.pattern)) {
          motif.pattern.forEach((interval: number, idx: number) => {
            // Valid intervals should be reasonable scale degrees or jumps
            // Typically -12 to +12 (within octave range)
            if (typeof interval !== "number" || interval < -12 || interval > 12) {
              invalidPatterns.push({
                id: motif.id,
                position: idx,
                value: interval
              });
            }
          });
        }
      });

      assert.strictEqual(
        invalidPatterns.length,
        0,
        `Melody intervals should be within -12 to +12 range. Invalid patterns: ${JSON.stringify(invalidPatterns)}`
      );
    });
  });

  describe("Drum pattern constraints (4 or 8 beats)", () => {
    it("should have all drum patterns with length_beats 4 or 8", () => {
      const drumsPath = join(motifsPath, "drums.json");
      const drumsData = JSON.parse(readFileSync(drumsPath, "utf-8"));

      assert.ok(Array.isArray(drumsData), "Drums data should be an array");
      assert.ok(drumsData.length > 0, "Should have drum patterns");

      const validLengths = [4, 8];
      const invalidPatterns: any[] = [];

      drumsData.forEach((pattern: any) => {
        if (!validLengths.includes(pattern.length_beats)) {
          invalidPatterns.push({
            id: pattern.id,
            length_beats: pattern.length_beats
          });
        }
      });

      assert.strictEqual(
        invalidPatterns.length,
        0,
        `All drum patterns must have length_beats 4 or 8. Invalid patterns: ${JSON.stringify(invalidPatterns)}`
      );
    });

    it("should encode drum pattern steps with delimiters", () => {
      const drumsPath = join(motifsPath, "drums.json");
      const drumsData = JSON.parse(readFileSync(drumsPath, "utf-8"));

      const invalidPatterns: any[] = [];

      drumsData.forEach((pattern: any) => {
        if (typeof pattern.pattern !== "string" || pattern.pattern.length === 0) {
          invalidPatterns.push({ id: pattern.id, value: pattern.pattern });
          return;
        }

        const includesHyphen = pattern.pattern.includes("-");
        const matchesDenseLength = pattern.pattern.length === pattern.length_beats * 4;
        if (!includesHyphen && !matchesDenseLength) {
          invalidPatterns.push({ id: pattern.id, value: pattern.pattern, length_beats: pattern.length_beats });
        }
      });

      assert.strictEqual(
        invalidPatterns.length,
        0,
        `Drum patterns should use hyphen-delimited string encoding. Invalid patterns: ${JSON.stringify(invalidPatterns)}`
      );
    });

    it("should use only valid drum characters (K, S, H, -, etc.)", () => {
      const drumsPath = join(motifsPath, "drums.json");
      const drumsData = JSON.parse(readFileSync(drumsPath, "utf-8"));

      // Valid characters: K (kick), S (snare), H (hi-hat), - (rest), and possibly others
      const validChars = /^[KSHCOTNkshcotn\-]+$/;
      const invalidPatterns: any[] = [];

      drumsData.forEach((pattern: any) => {
        if (typeof pattern.pattern === "string") {
          if (!validChars.test(pattern.pattern)) {
            invalidPatterns.push({
              id: pattern.id,
              pattern: pattern.pattern
            });
          }
        }
      });

      assert.strictEqual(
        invalidPatterns.length,
        0,
        `Drum patterns should only use valid characters. Invalid patterns: ${JSON.stringify(invalidPatterns)}`
      );
    });
  });

  describe("Bass pattern constraints (8 steps)", () => {
    it("should have all bass patterns with exactly 8 steps", () => {
      const bassPath = join(motifsPath, "bass-patterns.json");
      const bassData = JSON.parse(readFileSync(bassPath, "utf-8"));

      assert.ok(bassData.patterns, "Bass data should have patterns array");
      assert.ok(Array.isArray(bassData.patterns), "Patterns should be an array");
      assert.ok(bassData.patterns.length > 0, "Should have bass patterns");

      const invalidPatterns: any[] = [];

      bassData.patterns.forEach((pattern: any) => {
        if (Array.isArray(pattern.steps)) {
          if (pattern.steps.length !== 8) {
            invalidPatterns.push({
              id: pattern.id,
              stepsLength: pattern.steps.length,
              steps: pattern.steps
            });
          }
        } else {
          invalidPatterns.push({
            id: pattern.id,
            error: "steps is not an array"
          });
        }
      });

      assert.strictEqual(
        invalidPatterns.length,
        0,
        `All bass patterns must have exactly 8 steps. Invalid patterns: ${JSON.stringify(invalidPatterns)}`
      );
    });

    it("should use valid step descriptors", () => {
      const bassPath = join(motifsPath, "bass-patterns.json");
      const bassData = JSON.parse(readFileSync(bassPath, "utf-8"));

      // Valid step descriptors from the design
      const validSteps = new Set([
        "root",
        "fifth",
        "octave",
        "octaveHigh",
        "lowFifth",
        "approach",
        "second",
        "third",
        "flatSecond",
        "sixth",
        "seventh",
        "rest"
      ]);

      const invalidSteps: any[] = [];

      bassData.patterns.forEach((pattern: any) => {
        if (Array.isArray(pattern.steps)) {
          pattern.steps.forEach((step: string, idx: number) => {
            if (!validSteps.has(step)) {
              invalidSteps.push({
                patternId: pattern.id,
                stepIndex: idx,
                stepValue: step
              });
            }
          });
        }
      });

      assert.strictEqual(
        invalidSteps.length,
        0,
        `Bass patterns should only use valid step descriptors. Invalid steps: ${JSON.stringify(invalidSteps)}`
      );
    });

    it("should have valid texture values", () => {
      const bassPath = join(motifsPath, "bass-patterns.json");
      const bassData = JSON.parse(readFileSync(bassPath, "utf-8"));

      const validTextures = new Set(["steady", "broken", "arpeggio"]);
      const invalidTextures: any[] = [];

      bassData.patterns.forEach((pattern: any) => {
        if (!validTextures.has(pattern.texture)) {
          invalidTextures.push({
            id: pattern.id,
            texture: pattern.texture
          });
        }
      });

      assert.strictEqual(
        invalidTextures.length,
        0,
        `Bass patterns should use valid texture values. Invalid textures: ${JSON.stringify(invalidTextures)}`
      );
    });
  });

  describe("Chord progression constraints", () => {
    it("should have chord progressions with 4 chords each", () => {
      const chordsPath = join(motifsPath, "chords.json");
      const chordsData = JSON.parse(readFileSync(chordsPath, "utf-8"));

      assert.ok(typeof chordsData === "object", "Chords data should be an object");

      const invalidProgressions: any[] = [];

      Object.keys(chordsData).forEach((key) => {
        const keyData = chordsData[key];
        if (typeof keyData === "object") {
          Object.keys(keyData).forEach((category) => {
            const progressions = keyData[category];
            if (Array.isArray(progressions)) {
              progressions.forEach((prog: any[], idx: number) => {
                if (!Array.isArray(prog) || prog.length !== 4) {
                  invalidProgressions.push({
                    key,
                    category,
                    progressionIndex: idx,
                    actualLength: Array.isArray(prog) ? prog.length : "not array",
                    progression: prog
                  });
                }
              });
            }
          });
        }
      });

      assert.strictEqual(
        invalidProgressions.length,
        0,
        `All chord progressions should have exactly 4 chords. Invalid progressions: ${JSON.stringify(invalidProgressions)}`
      );
    });

    it("should have valid chord names", () => {
      const chordsPath = join(motifsPath, "chords.json");
      const chordsData = JSON.parse(readFileSync(chordsPath, "utf-8"));

      // Valid chord name pattern: root note (A-G) + optional accidental (# or b) + optional quality (m, 7, M7, etc.)
      const validChordPattern = /^[A-G][#b]?(m|M|maj|min|dim|aug|sus|add)?[0-9]?$/;
      const invalidChords: any[] = [];

      Object.keys(chordsData).forEach((key) => {
        const keyData = chordsData[key];
        if (typeof keyData === "object") {
          Object.keys(keyData).forEach((category) => {
            const progressions = keyData[category];
            if (Array.isArray(progressions)) {
              progressions.forEach((prog: any[], progIdx: number) => {
                if (Array.isArray(prog)) {
                  prog.forEach((chord: string, chordIdx: number) => {
                    if (typeof chord !== "string" || !validChordPattern.test(chord)) {
                      invalidChords.push({
                        key,
                        category,
                        progressionIndex: progIdx,
                        chordIndex: chordIdx,
                        chord
                      });
                    }
                  });
                }
              });
            }
          });
        }
      });

      assert.strictEqual(
        invalidChords.length,
        0,
        `All chords should have valid names. Invalid chords: ${JSON.stringify(invalidChords)}`
      );
    });
  });

  describe("Motif catalog completeness", () => {
    it("should have all required motif files", () => {
      const requiredFiles = [
        "rhythm.json",
        "melody.json",
        "drums.json",
        "bass-patterns.json",
        "chords.json"
      ];

      requiredFiles.forEach((filename) => {
        const filePath = join(motifsPath, filename);
        let fileExists = false;
        let fileContent = "";

        try {
          fileContent = readFileSync(filePath, "utf-8");
          fileExists = true;
        } catch (err) {
          // File doesn't exist
        }

        assert.ok(fileExists, `Required motif file ${filename} should exist`);
        assert.ok(fileContent.length > 0, `Motif file ${filename} should not be empty`);
      });
    });

    it("should have substantial motif counts for diversity", () => {
      const rhythmPath = join(motifsPath, "rhythm.json");
      const melodyPath = join(motifsPath, "melody.json");
      const drumsPath = join(motifsPath, "drums.json");

      const rhythmData = JSON.parse(readFileSync(rhythmPath, "utf-8"));
      const melodyData = JSON.parse(readFileSync(melodyPath, "utf-8"));
      const drumsData = JSON.parse(readFileSync(drumsPath, "utf-8"));

      // Minimum counts for musical diversity (based on Phase 4 completion)
      assert.ok(rhythmData.length >= 70, `Should have at least 70 rhythm motifs, got ${rhythmData.length}`);
      assert.ok(melodyData.length >= 110, `Should have at least 110 melody motifs, got ${melodyData.length}`);
      assert.ok(drumsData.length >= 50, `Should have at least 50 drum patterns, got ${drumsData.length}`);
    });
  });
});
